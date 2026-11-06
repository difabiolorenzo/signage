<?php
declare(strict_types=1);

/**
 * Médias de la bibliothèque partagée. Leur portée dit qui peut les insérer dans une playlist, pas
 * où ils s'affichent : un média inséré passe partout où passe la playlist. Le type réel du fichier
 * est vérifié avec finfo, le fichier est enregistré sous un nom aléatoire dans public/uploads/ (où
 * PHP ne s'exécute pas), et un média utilisé par une playlist ne peut pas être supprimé.
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

    private const COLONNES = 'o.id, o.fichier, o.vignette, o.nom_origine, o.type, o.taille, o.largeur, o.hauteur, o.duree, o.envoye_le, o.auteur_id, o.portee';

    /**
     * Médias que l'utilisateur peut insérer dans une playlist, pour l'éditeur de pages.
     *
     * @return array<int, array{id: int, nom: string, type: string, url: string, vignette: ?string}>
     */
    public static function visibles(array $u): array
    {
        [$visible, $params] = Droits::sqlVisible('media', $u);
        $resultat = [];
        foreach (Db::lignes('SELECT ' . self::COLONNES_RESUME . " FROM medias o WHERE $visible ORDER BY o.nom_origine", $params) as $m) {
            $resultat[(int) $m['id']] = self::resume($m);
        }
        return $resultat;
    }

    /** Colonnes lues par resume(). */
    public const COLONNES_RESUME = 'o.id, o.nom_origine, o.type, o.fichier, o.vignette, o.largeur, o.hauteur, o.duree';

    /** Nom, type, URL, vignette (null si pas encore générée), dimensions et durée d'un média. */
    public static function resume(array $m): array
    {
        return [
            'id' => (int) $m['id'],
            'nom' => $m['nom_origine'],
            'type' => $m['type'],
            'url' => Config::get('url_base') . '/uploads/' . rawurlencode($m['fichier']),
            'vignette' => Vignettes::url($m['vignette']),
            'largeur' => $m['largeur'] === null ? null : (int) $m['largeur'],
            'hauteur' => $m['hauteur'] === null ? null : (int) $m['hauteur'],
            'duree' => $m['duree'] === null ? null : (float) $m['duree'],
        ];
    }

    /**
     * GET /api/medias?chaine=&auteur=&portee= : médias visibles. chaine : ceux ouverts à cette
     * chaîne ; portee : globale, restreinte ou privee.
     */
    public static function liste(): never
    {
        $u = Auth::exigerConnexion();
        $chaine = self::filtreId('chaine');
        $auteur = self::filtreId('auteur');
        $portee = $_GET['portee'] ?? null;
        if ($chaine !== null) {
            Droits::exigerChaine($u, $chaine);
        }
        [$visible, $params] = Droits::sqlVisible('media', $u);
        $lignes = Db::lignes(
            'SELECT ' . self::COLONNES . ', ' . Bibliotheque::sqlNom('e') . ' AS envoye_par, ' . Bibliotheque::sqlNom('a') . " AS auteur
             FROM medias o
             LEFT JOIN utilisateurs e ON e.id = o.envoye_par
             LEFT JOIN utilisateurs a ON a.id = o.auteur_id
             WHERE $visible ORDER BY o.envoye_le DESC, o.id DESC",
            $params
        );
        $acces = Bibliotheque::acces('media', array_map(static fn (array $m): int => (int) $m['id'], $lignes));
        $noms = Bibliotheque::noms($acces);
        $utilisations = Bibliotheque::utilisationsMedias();
        $playlistsVisibles = Bibliotheque::idsVisibles('playlist', $u);

        $medias = [];
        foreach ($lignes as $m) {
            $a = $acces[(int) $m['id']];
            if (($chaine !== null && !in_array($chaine, $a['chaines'], true))
                || ($auteur !== null && (int) $m['auteur_id'] !== $auteur)
                || ($portee !== null && $portee !== ControleurPlaylists::porteeAffichee($m['portee'], $a))) {
                continue;
            }
            $medias[] = self::publier($m, $a, $noms, Bibliotheque::utilisationsLisibles($utilisations[(int) $m['id']] ?? [], $playlistsVisibles), $u);
        }
        Reponse::json([
            'medias' => $medias,
            'taille_max' => self::tailleMax(),
            'types' => array_keys(self::TYPES),
        ]);
    }

    /**
     * POST /api/medias (multipart : fichier ; chaine facultative ; pour une vidéo, largeur, hauteur,
     * duree mesurées par le navigateur et vignette, image capturée vers 1 s). Avec chaine (où l'utilisateur a un droit) : restreint à
     * cette chaîne ; sinon privé.
     */
    public static function envoyer(): never
    {
        $u = Auth::exigerConnexion();
        $chaine = null;
        if (($_POST['chaine'] ?? '') !== '') {
            if (!is_string($_POST['chaine']) || !preg_match('/^[1-9][0-9]{0,9}$/', $_POST['chaine'])) {
                Reponse::erreur('chaine : identifiant attendu.', 400);
            }
            $chaine = (int) $_POST['chaine'];
            Droits::exigerChaine($u, $chaine);
        }
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
        // Vignette : facultative, son échec n'empêche pas l'envoi (l'écran Médias la refera).
        $vignette = str_starts_with($type, 'image/') ? Vignettes::creer($chemin, $type) : Vignettes::depuisEnvoi('vignette');

        try {
            $id = Db::transaction(static function () use ($fichier, $vignette, $nomOrigine, $type, $f, $largeur, $hauteur, $duree, $u, $chaine): int {
                Db::executer(
                    'INSERT INTO medias (fichier, vignette, nom_origine, type, taille, largeur, hauteur, duree, envoye_par, auteur_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$fichier, $vignette, $nomOrigine, $type, (int) $f['size'], $largeur, $hauteur, $duree, $u['id'], $u['id']]
                );
                $id = Db::dernierId();
                Bibliotheque::ecrireAcces('media', $id, $chaine === null ? [] : [$chaine], []);
                return $id;
            });
        } catch (Throwable $e) {
            @unlink($chemin);
            Vignettes::supprimer($vignette);
            throw $e;
        }
        $m = Db::ligne(
            'SELECT ' . self::COLONNES . ', ' . Bibliotheque::sqlNom('e') . ' AS envoye_par, ' . Bibliotheque::sqlNom('a') . ' AS auteur
             FROM medias o LEFT JOIN utilisateurs e ON e.id = o.envoye_par LEFT JOIN utilisateurs a ON a.id = o.auteur_id WHERE o.id = ?',
            [$id]
        );
        $acces = Bibliotheque::acces('media', [$id])[$id];
        Reponse::json(['media' => self::publier($m, $acces, Bibliotheque::noms([$acces]), ['noms' => [], 'autres' => 0], $u)], 201);
    }

    /** DELETE /api/medias/{id} : auteur ou administrateur ; refusé (409) si une playlist l'utilise. */
    public static function supprimer(int $mediaId): never
    {
        $u = Auth::exigerConnexion();
        $m = Droits::exigerObjet($u, 'media', $mediaId, 'modifier');
        $playlists = Bibliotheque::utilisationsMedias()[$mediaId] ?? [];
        if ($playlists !== []) {
            $lisibles = Bibliotheque::utilisationsLisibles($playlists, Bibliotheque::idsVisibles('playlist', $u));
            Reponse::erreur('Ce média est utilisé par : ' . self::listeUtilisations($lisibles) . '. Retirez-le de ces playlists avant de le supprimer.', 409);
        }
        Db::executer('DELETE FROM medias WHERE id = ?', [$mediaId]);
        $fichier = (string) $m['fichier'];
        if (preg_match('/^[A-Za-z0-9._-]+$/', $fichier) && is_file(self::dossier() . $fichier)) {
            unlink(self::dossier() . $fichier);
        }
        Vignettes::supprimer($m['vignette']);
        Reponse::json(['ok' => true]);
    }

    /**
     * POST /api/medias/{id}/vignette (droit de modifier le média) : refait la vignette. Image : par
     * le serveur, à partir du fichier ; vidéo : à partir de l'image capturée envoyée dans le champ
     * vignette (multipart). Renvoie { vignette: url }.
     */
    public static function regenererVignette(int $mediaId): never
    {
        $u = Auth::exigerConnexion();
        $m = Droits::exigerObjet($u, 'media', $mediaId, 'modifier');
        $chemin = self::dossier() . $m['fichier'];
        if (str_starts_with((string) $m['type'], 'image/')) {
            if (!is_file($chemin)) {
                Reponse::erreur('Fichier du média introuvable dans public/uploads/.', 404);
            }
            $vignette = Vignettes::creer($chemin, (string) $m['type']);
        } else {
            if (!isset($_FILES['vignette'])) {
                Reponse::erreur('vignette : image capturée de la vidéo attendue.', 400);
            }
            $vignette = Vignettes::depuisEnvoi('vignette');
        }
        if ($vignette === null) {
            Reponse::erreur('Vignette impossible à créer (image illisible ou extension GD de PHP absente).', 422);
        }
        Db::executer('UPDATE medias SET vignette = ? WHERE id = ?', [$vignette, $mediaId]);
        Vignettes::supprimer($m['vignette']);
        Reponse::json(['vignette' => Vignettes::url($vignette)]);
    }

    /** « Accueil, Menu, 2 autre(s) playlist(s) » */
    public static function listeUtilisations(array $lisibles): string
    {
        $morceaux = $lisibles['noms'];
        if ($lisibles['autres'] > 0) {
            $morceaux[] = $lisibles['autres'] . ' autre(s) playlist(s)';
        }
        return implode(', ', $morceaux);
    }

    private static function publier(array $m, array $acces, array $noms, array $utilisations, array $u): array
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
            'vignette' => Vignettes::url($m['vignette']),
            'envoye_le' => $m['envoye_le'],
            'envoye_par' => $m['envoye_par'],
            'auteur' => $m['auteur_id'] === null ? null : ['id' => (int) $m['auteur_id'], 'nom' => $m['auteur']],
            'portee' => ControleurPlaylists::porteeAffichee($m['portee'], $acces),
            'acces' => Bibliotheque::accesPublies($acces, $noms),
            'utilise_par' => $utilisations['noms'],
            'utilise_par_autres' => $utilisations['autres'],
            'modifiable' => Droits::peutModifierObjet($u, $m),
        ];
    }

    private static function filtreId(string $nom): ?int
    {
        $valeur = $_GET[$nom] ?? null;
        if ($valeur === null || $valeur === '') {
            return null;
        }
        if (!is_string($valeur) || !preg_match('/^[1-9][0-9]{0,9}$/', $valeur)) {
            Reponse::erreur("Filtre $nom : identifiant attendu.", 400);
        }
        return (int) $valeur;
    }

    private static function dossier(): string
    {
        return dirname(__DIR__) . '/public/uploads/';
    }

    /** Taille maximale réellement acceptée : panneau d'administration, upload_max_filesize et post_max_size. */
    private static function tailleMax(): int
    {
        $limites = array_filter([Parametres::envoiMaxOctets(), Parametres::limitePhpOctets()], static fn (int $v): bool => $v > 0);
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
