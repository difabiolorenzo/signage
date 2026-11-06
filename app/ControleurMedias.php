<?php
declare(strict_types=1);

/**
 * Médias d'une chaîne (droit sur la chaîne requis). Le type réel du fichier est vérifié avec
 * finfo, le fichier est enregistré sous un nom aléatoire dans public/uploads/ (où PHP ne
 * s'exécute pas), et un média utilisé par une playlist ne peut pas être supprimé.
 */
final class ControleurMedias
{
    /** Types acceptés → extension du fichier enregistré. */
    private const TYPES = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'video/mp4' => 'mp4',
        'video/webm' => 'webm',
    ];

    /** GET /api/chaines/{id}/medias */
    public static function liste(int $chaineId): never
    {
        Droits::exigerChaine(Auth::exigerConnexion(), $chaineId);
        $utilises = self::utilisations($chaineId);
        $lignes = Db::lignes(
            "SELECT m.id, m.fichier, m.nom_origine, m.type, m.taille, m.largeur, m.hauteur, m.duree, m.envoye_le,
                    COALESCE(NULLIF(u.nom, ''), u.identifiant) AS envoye_par
             FROM medias m LEFT JOIN utilisateurs u ON u.id = m.envoye_par
             WHERE m.chaine_id = ? ORDER BY m.envoye_le DESC, m.id DESC",
            [$chaineId]
        );
        Reponse::json([
            'medias' => array_map(static fn (array $m): array => self::publier($m, $utilises[(int) $m['id']] ?? []), $lignes),
            'taille_max' => self::tailleMax(),
            'types' => array_keys(self::TYPES),
        ]);
    }

    /** POST /api/chaines/{id}/medias (multipart : fichier ; pour une vidéo, largeur, hauteur, duree mesurées par le navigateur) */
    public static function envoyer(int $chaineId): never
    {
        $u = Auth::exigerConnexion();
        Droits::exigerChaine($u, $chaineId);
        $max = self::tailleMax();
        $limite = 'La limite est de ' . self::mo($max) . '.';

        $f = $_FILES['fichier'] ?? null;
        if (!is_array($f) || !is_int($f['error'] ?? null)) {
            // Corps plus gros que post_max_size : PHP ne transmet alors aucun fichier.
            if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
                Reponse::erreur("Fichier trop volumineux. $limite", 413);
            }
            Reponse::erreur('Aucun fichier reçu.', 400);
        }
        if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE || $f['size'] > $max) {
            Reponse::erreur("Fichier trop volumineux. $limite", 413);
        }
        if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
            Reponse::erreur("L'envoi du fichier a échoué (code {$f['error']}).", 400);
        }

        $type = (string) (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
        $extension = self::TYPES[$type] ?? null;
        if ($extension === null) {
            Reponse::erreur('Type de fichier non accepté : JPEG, PNG, WebP, GIF, MP4 ou WebM.', 415);
        }

        $largeur = $hauteur = $duree = null;
        if (str_starts_with($type, 'image/')) {
            $infos = @getimagesize($f['tmp_name']);
            if ($infos === false) {
                Reponse::erreur('Image illisible.', 415);
            }
            [$largeur, $hauteur] = $infos;
        } else {
            $largeur = self::nombre($_POST['largeur'] ?? null, 1, 20000, true);
            $hauteur = self::nombre($_POST['hauteur'] ?? null, 1, 20000, true);
            $duree = self::nombre($_POST['duree'] ?? null, 0, 86400 * 7, false);
        }

        // Nom affiché seulement : octets invalides remplacés, caractères de contrôle retirés.
        $nomOrigine = preg_replace('/[\x00-\x1F\x7F]/u', '', mb_scrub(basename(str_replace('\\', '/', (string) $f['name'])), 'UTF-8')) ?: 'media';
        $nomOrigine = mb_substr($nomOrigine, 0, 255);
        $fichier = bin2hex(random_bytes(16)) . '.' . $extension;
        $chemin = self::dossier() . $fichier;
        if (!move_uploaded_file($f['tmp_name'], $chemin)) {
            throw new RuntimeException("Impossible d'écrire $chemin.");
        }
        @chmod($chemin, 0644);

        try {
            Db::executer(
                'INSERT INTO medias (chaine_id, fichier, nom_origine, type, taille, largeur, hauteur, duree, envoye_par)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$chaineId, $fichier, $nomOrigine, $type, (int) $f['size'], $largeur, $hauteur, $duree, $u['id']]
            );
        } catch (Throwable $e) {
            @unlink($chemin);
            throw $e;
        }
        $m = Db::ligne(
            "SELECT m.*, COALESCE(NULLIF(u.nom, ''), u.identifiant) AS envoye_par
             FROM medias m LEFT JOIN utilisateurs u ON u.id = m.envoye_par WHERE m.id = ?",
            [Db::dernierId()]
        );
        Reponse::json(['media' => self::publier($m, [])], 201);
    }

    /** DELETE /api/chaines/{id}/medias/{mid} : refusé (409) si une playlist l'utilise. */
    public static function supprimer(int $chaineId, int $mediaId): never
    {
        Droits::exigerChaine(Auth::exigerConnexion(), $chaineId);
        $fichier = Db::valeur('SELECT fichier FROM medias WHERE id = ? AND chaine_id = ?', [$mediaId, $chaineId])
            ?? Reponse::erreur('Média introuvable.', 404);
        $playlists = self::utilisations($chaineId)[$mediaId] ?? [];
        if ($playlists !== []) {
            Reponse::erreur('Ce média est utilisé par : ' . implode(', ', $playlists) . '. Retirez-le de ces playlists avant de le supprimer.', 409);
        }
        Db::executer('DELETE FROM medias WHERE id = ? AND chaine_id = ?', [$mediaId, $chaineId]);
        if (preg_match('/^[A-Za-z0-9._-]+$/', (string) $fichier) && is_file(self::dossier() . $fichier)) {
            unlink(self::dossier() . $fichier);
        }
        Reponse::json(['ok' => true]);
    }

    /**
     * Playlists qui utilisent chaque média de la chaîne.
     *
     * @return array<int, list<string>> identifiant du média → noms des playlists
     */
    private static function utilisations(int $chaineId): array
    {
        $resultat = [];
        foreach (Db::lignes('SELECT id, nom, pages FROM playlists WHERE chaine_id = ?', [$chaineId]) as $p) {
            foreach (Pages::lire((string) $p['pages'], (int) $p['id']) as $page) {
                foreach (is_array($page['widgets'] ?? null) ? $page['widgets'] : [] as $w) {
                    if (!is_array($w) || ($w['type'] ?? null) !== 'media' || !is_array($w['elements'] ?? null)) {
                        continue;
                    }
                    foreach ($w['elements'] as $e) {
                        $id = is_array($e) ? ($e['media'] ?? null) : null;
                        if (is_int($id) && !in_array($p['nom'], $resultat[$id] ?? [], true)) {
                            $resultat[$id][] = $p['nom'];
                        }
                    }
                }
            }
        }
        return $resultat;
    }

    private static function publier(array $m, array $playlists): array
    {
        return [
            'id' => (int) $m['id'],
            'nom' => $m['nom_origine'],
            'type' => $m['type'],
            'taille' => (int) $m['taille'],
            'largeur' => $m['largeur'] === null ? null : (int) $m['largeur'],
            'hauteur' => $m['hauteur'] === null ? null : (int) $m['hauteur'],
            'duree' => $m['duree'] === null ? null : (float) $m['duree'],
            'url' => Config::get('url_base') . '/uploads/' . rawurlencode($m['fichier']),
            'envoye_le' => $m['envoye_le'],
            'envoye_par' => $m['envoye_par'],
            'utilise_par' => $playlists,
        ];
    }

    private static function dossier(): string
    {
        return dirname(__DIR__) . '/public/uploads/';
    }

    /** Taille maximale réellement acceptée : config.php, upload_max_filesize et post_max_size. */
    private static function tailleMax(): int
    {
        $octets = static function (string $valeur): int {
            $n = (int) $valeur;
            return match (strtolower(substr(trim($valeur), -1))) {
                'g' => $n * 1024 ** 3,
                'm' => $n * 1024 ** 2,
                'k' => $n * 1024,
                default => $n,
            };
        };
        $limites = array_filter([
            (int) Config::get('envoi_max_octets'),
            $octets((string) ini_get('upload_max_filesize')),
            $octets((string) ini_get('post_max_size')),
        ], static fn (int $v): bool => $v > 0);
        return $limites === [] ? 0 : min($limites);
    }

    private static function mo(int $octets): string
    {
        return rtrim(rtrim(number_format($octets / 1024 / 1024, 1, ',', ''), '0'), ',') . ' Mo';
    }

    private static function nombre(mixed $valeur, float $min, float $max, bool $entier): int|float|null
    {
        if (!is_numeric($valeur)) {
            return null;
        }
        $n = $entier ? (int) round((float) $valeur) : round((float) $valeur, 3);
        return $n >= $min && $n <= $max ? $n : null;
    }
}
