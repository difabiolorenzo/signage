<?php
declare(strict_types=1);

/**
 * Playlists d'une chaîne (droit sur la chaîne requis). Toute modification incrémente la
 * version de la chaîne, ce qui fait recharger l'affichage des lecteurs.
 */
final class ControleurPlaylists
{
    /** Nom de disposition accepté : celles de dispositions.js, ou la grille personnalisée. */
    private const MOTIF_DISPOSITION = '/^(Landscape [1-9][0-9]?|Portrait [1-9][0-9]?|Personnalisé|Personnalisé portrait)$/u';
    private const REGIONS_MAX = 64;

    /** Même règle que estDispositionPortrait() de dispositions.js. */
    public static function estPortrait(string $disposition): bool
    {
        return str_starts_with($disposition, 'Portrait') || $disposition === 'Personnalisé portrait';
    }

    /**
     * GET /api/chaines/{id}/playlists/{pid} : la playlist complète pour l'éditeur de pages,
     * avec les médias de la chaîne (nom, type, URL) pour l'aperçu et le choix des médias.
     */
    public static function lire(int $chaineId, int $playlistId): never
    {
        Droits::exigerChaine(Auth::exigerConnexion(), $chaineId);
        $p = Db::ligne(
            "SELECT p.id, p.nom, p.disposition, p.regions, p.pages, p.modifie_le,
                    COALESCE(NULLIF(u.nom, ''), u.identifiant) AS modifie_par
             FROM playlists p LEFT JOIN utilisateurs u ON u.id = p.modifie_par
             WHERE p.id = ? AND p.chaine_id = ?",
            [$playlistId, $chaineId]
        ) ?? Reponse::erreur('Playlist introuvable.', 404);

        $base = (string) Config::get('url_base') . '/uploads/';
        $medias = array_map(static fn (array $m): array => [
            'id' => (int) $m['id'],
            'nom' => $m['nom_origine'],
            'type' => $m['type'],
            'url' => $base . rawurlencode($m['fichier']),
        ], Db::lignes('SELECT id, nom_origine, type, fichier FROM medias WHERE chaine_id = ? ORDER BY nom_origine', [$chaineId]));

        Reponse::json([
            'playlist' => [
                'id' => (int) $p['id'],
                'nom' => $p['nom'],
                'disposition' => $p['disposition'],
                'portrait' => self::estPortrait($p['disposition']),
                'regions' => json_decode((string) $p['regions'], true) ?: [],
                'pages' => Pages::lire((string) $p['pages'], (int) $p['id']),
                'modifie_le' => $p['modifie_le'],
                'modifie_par' => $p['modifie_par'],
            ],
            'medias' => $medias,
        ]);
    }

    /**
     * PUT /api/chaines/{id}/playlists/{pid} { nom, pages, disposition?, regions? } : disposition
     * et régions sont envoyées ensemble quand la grille change ; les pages ont alors un widget
     * par nouvelle région. Règles vérifiées par Pages::verifier (au moins une page, un YouTube par page…).
     */
    public static function enregistrer(int $chaineId, int $playlistId): never
    {
        $u = Auth::exigerConnexion();
        Droits::exigerChaine($u, $chaineId);
        $p = self::trouver($chaineId, $playlistId);
        $corps = Requete::json();
        $nom = self::nom($corps['nom'] ?? null);
        $disposition = $p['disposition'];
        $regions = json_decode((string) $p['regions'], true) ?: [];
        if (isset($corps['disposition']) || isset($corps['regions'])) {
            $disposition = self::disposition($corps['disposition'] ?? null);
            $regions = self::regions($corps['regions'] ?? null);
        }
        $medias = array_map('intval', array_column(Db::lignes('SELECT id FROM medias WHERE chaine_id = ?', [$chaineId]), 'id'));
        $pages = Pages::verifier($corps['pages'] ?? null, count($regions), $medias);

        Db::transaction(static function () use ($chaineId, $playlistId, $nom, $disposition, $regions, $pages, $u): void {
            Db::executer(
                'UPDATE playlists SET nom = ?, disposition = ?, regions = ?, pages = ?, modifie_par = ? WHERE id = ? AND chaine_id = ?',
                [$nom, $disposition, json_encode($regions), Pages::document($pages), $u['id'], $playlistId, $chaineId]
            );
            self::chaineModifiee($chaineId);
        });
        Reponse::json(['ok' => true]);
    }

    /** GET /api/chaines/{id}/playlists */
    public static function liste(int $chaineId): never
    {
        Droits::exigerChaine(Auth::exigerConnexion(), $chaineId);
        $defaut = Db::valeur('SELECT playlist_defaut_id FROM chaines WHERE id = ?', [$chaineId]);
        $lignes = Db::lignes(
            "SELECT p.id, p.nom, p.disposition, p.regions, p.pages, p.modifie_le,
                    COALESCE(NULLIF(u.nom, ''), u.identifiant) AS modifie_par
             FROM playlists p LEFT JOIN utilisateurs u ON u.id = p.modifie_par
             WHERE p.chaine_id = ? ORDER BY p.nom, p.id",
            [$chaineId]
        );
        $playlists = array_map(static function (array $p) use ($defaut): array {
            $pages = Pages::lire((string) $p['pages'], (int) $p['id']);
            return [
                'id' => (int) $p['id'],
                'nom' => $p['nom'],
                'disposition' => $p['disposition'],
                'regions' => json_decode((string) $p['regions'], true) ?: [],
                'nb_pages' => count($pages),
                'duree' => array_sum(array_map(static fn ($pg): int => (int) ($pg['duree'] ?? 0), $pages)),
                'par_defaut' => $defaut !== null && (int) $defaut === (int) $p['id'],
                'modifie_le' => $p['modifie_le'],
                'modifie_par' => $p['modifie_par'],
            ];
        }, $lignes);
        Reponse::json(['playlists' => $playlists]);
    }

    /** POST /api/chaines/{id}/playlists { nom, disposition, regions } : une page de widgets vides. */
    public static function creer(int $chaineId): never
    {
        $u = Auth::exigerConnexion();
        Droits::exigerChaine($u, $chaineId);
        $corps = Requete::json();
        $nom = self::nom($corps['nom'] ?? null);
        $disposition = self::disposition($corps['disposition'] ?? null);
        $regions = self::regions($corps['regions'] ?? null);
        $pages = [[
            'duree' => 30,
            'fond' => '#000000',
            'widgets' => array_fill(0, count($regions), ['type' => 'vide']),
        ]];
        $id = Db::transaction(static function () use ($chaineId, $nom, $disposition, $regions, $pages, $u): int {
            Db::executer(
                'INSERT INTO playlists (chaine_id, nom, disposition, regions, pages, modifie_par) VALUES (?, ?, ?, ?, ?, ?)',
                [$chaineId, $nom, $disposition, json_encode($regions), Pages::document($pages), $u['id']]
            );
            $id = Db::dernierId();
            self::chaineModifiee($chaineId);
            return $id;
        });
        Reponse::json(['id' => $id], 201);
    }

    /** POST /api/chaines/{id}/playlists/{pid}/duplication { nom? } */
    public static function dupliquer(int $chaineId, int $playlistId): never
    {
        $u = Auth::exigerConnexion();
        Droits::exigerChaine($u, $chaineId);
        $p = self::trouver($chaineId, $playlistId);
        $corps = Requete::json();
        $nom = isset($corps['nom']) ? self::nom($corps['nom']) : mb_substr($p['nom'], 0, 92) . ' (copie)';
        $id = Db::transaction(static function () use ($chaineId, $nom, $p, $u): int {
            Db::executer(
                'INSERT INTO playlists (chaine_id, nom, disposition, regions, pages, modifie_par) VALUES (?, ?, ?, ?, ?, ?)',
                [$chaineId, $nom, $p['disposition'], $p['regions'], $p['pages'], $u['id']]
            );
            $id = Db::dernierId();
            self::chaineModifiee($chaineId);
            return $id;
        });
        Reponse::json(['id' => $id], 201);
    }

    /** DELETE /api/chaines/{id}/playlists/{pid} : ses plages de programmation partent avec elle. */
    public static function supprimer(int $chaineId, int $playlistId): never
    {
        Droits::exigerChaine(Auth::exigerConnexion(), $chaineId);
        self::trouver($chaineId, $playlistId);
        Db::transaction(static function () use ($chaineId, $playlistId): void {
            Db::executer('DELETE FROM playlists WHERE id = ? AND chaine_id = ?', [$playlistId, $chaineId]);
            self::chaineModifiee($chaineId);
        });
        Reponse::json(['ok' => true]);
    }

    private static function trouver(int $chaineId, int $playlistId): array
    {
        return Db::ligne('SELECT nom, disposition, regions, pages FROM playlists WHERE id = ? AND chaine_id = ?', [$playlistId, $chaineId])
            ?? Reponse::erreur('Playlist introuvable.', 404);
    }

    private static function chaineModifiee(int $chaineId): void
    {
        Db::executer('UPDATE chaines SET version = version + 1 WHERE id = ?', [$chaineId]);
    }

    private static function nom(mixed $valeur): string
    {
        $nom = trim((string) $valeur);
        if ($nom === '' || mb_strlen($nom) > 100) {
            Reponse::erreur('Nom de la playlist : 1 à 100 caractères.', 400);
        }
        return $nom;
    }

    private static function disposition(mixed $valeur): string
    {
        $disposition = (string) $valeur;
        if (!preg_match(self::MOTIF_DISPOSITION, $disposition)) {
            Reponse::erreur('Disposition inconnue.', 400);
        }
        return $disposition;
    }

    /** Régions [x, y, largeur, hauteur] en fractions de l'écran, contenues dans l'écran. */
    private static function regions(mixed $regions): array
    {
        if (!is_array($regions) || !array_is_list($regions) || $regions === [] || count($regions) > self::REGIONS_MAX) {
            Reponse::erreur('Régions : 1 à ' . self::REGIONS_MAX . ' régions attendues.', 400);
        }
        $propres = [];
        foreach ($regions as $r) {
            $valide = is_array($r) && array_is_list($r) && count($r) === 4
                && array_reduce($r, static fn (bool $ok, $v): bool => $ok && (is_int($v) || is_float($v)), true);
            if ($valide) {
                [$x, $y, $l, $h] = array_map(static fn ($v): float => round((float) $v, 6), $r);
                $valide = $x >= 0 && $y >= 0 && $l > 0 && $h > 0 && $x + $l <= 1.000001 && $y + $h <= 1.000001;
            }
            if (!$valide) {
                Reponse::erreur('Régions : chaque région est [x, y, largeur, hauteur], comprise dans l\'écran.', 400);
            }
            $propres[] = [$x, $y, $l, $h];
        }
        return $propres;
    }
}
