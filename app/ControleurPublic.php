<?php
declare(strict_types=1);

/**
 * Routes publiques, sans connexion : ce que le lecteur d'une chaîne doit afficher.
 * Ne renvoie que le contenu de la chaîne : aucun identifiant de base, aucun utilisateur.
 */
final class ControleurPublic
{
    /** GET /api/public/{slug} */
    public static function chaine(string $slug): never
    {
        $chaine = Db::ligne(
            'SELECT id, slug, nom, orientation, playlist_defaut_id, version FROM chaines WHERE slug = ?',
            [$slug]
        );
        if ($chaine === null) {
            Reponse::erreur('Chaîne introuvable.', 404);
        }
        $chaineId = (int) $chaine['id'];

        $plages = Db::lignes(
            'SELECT playlist_id, date_debut, date_fin, heure_debut, heure_fin, jours, priorite
             FROM programmations WHERE chaine_id = ? ORDER BY priorite DESC, id',
            [$chaineId]
        );
        $defaut = $chaine['playlist_defaut_id'] === null ? null : (int) $chaine['playlist_defaut_id'];
        $programmation = new Programmation($plages, $defaut);

        $maintenant = new DateTimeImmutable();
        $playlistId = $programmation->playlistA($maintenant);
        $playlist = $playlistId === null ? null : Db::ligne(
            'SELECT id, disposition, regions, pages FROM playlists WHERE id = ? AND chaine_id = ?',
            [$playlistId, $chaineId]
        );
        $prochain = $programmation->prochainChangement($maintenant);

        Reponse::json([
            'chaine' => [
                'slug' => $chaine['slug'],
                'nom' => $chaine['nom'],
                'orientation' => $chaine['orientation'],
            ],
            'version' => (int) $chaine['version'],
            // Change dès que la chaîne est modifiée ou qu'une autre playlist passe :
            // le lecteur ne recharge l'affichage que dans ce cas.
            'etat' => substr(sha1($chaine['version'] . '-' . ($playlist['id'] ?? 0)), 0, 16),
            'maintenant' => $maintenant->format(DATE_ATOM),
            'prochain_changement' => $prochain?->format(DATE_ATOM),
            'playlist' => $playlist === null ? null : self::playlistPublique($playlist, $chaineId),
        ]);
    }

    /**
     * GET /api/public/{slug}/rss?url= : titres d'un flux RSS, via le serveur.
     * Seuls les flux utilisés par un widget RSS de la chaîne sont relayés : l'API n'est pas un
     * relais ouvert. Cache de 5 minutes ; si le flux ne répond plus, le dernier résultat est servi.
     */
    public static function rss(string $slug): never
    {
        $url = $_GET['url'] ?? '';
        if (!is_string($url) || $url === '' || strlen($url) > 2048) {
            Reponse::erreur('Paramètre url manquant ou invalide.', 400);
        }
        $chaineId = Db::valeur('SELECT id FROM chaines WHERE slug = ?', [$slug]);
        if ($chaineId === null) {
            Reponse::erreur('Chaîne introuvable.', 404);
        }
        if (!self::fluxUtilise((int) $chaineId, $url)) {
            Reponse::erreur("Ce flux n'est utilisé par aucune playlist de la chaîne.", 403);
        }

        $cache = sys_get_temp_dir() . '/signage-rss-' . sha1($url) . '.json';
        if (is_file($cache) && filemtime($cache) > time() - 300) {
            Reponse::json(json_decode((string) file_get_contents($cache), true));
        }
        try {
            $resultat = ['elements' => RelaisRss::titres(RelaisRss::telecharger($url))];
            file_put_contents($cache, json_encode($resultat, JSON_UNESCAPED_UNICODE), LOCK_EX);
            Reponse::json($resultat);
        } catch (RuntimeException $e) {
            error_log("Flux RSS $url : " . $e->getMessage());
            if (is_file($cache)) {
                Reponse::json(json_decode((string) file_get_contents($cache), true));
            }
            Reponse::erreur('Flux RSS indisponible.', 502);
        }
    }

    private static function fluxUtilise(int $chaineId, string $url): bool
    {
        foreach (Db::lignes('SELECT id, pages FROM playlists WHERE chaine_id = ?', [$chaineId]) as $playlist) {
            foreach (Pages::lire((string) $playlist['pages'], (int) $playlist['id']) as $page) {
                foreach (is_array($page['widgets'] ?? null) ? $page['widgets'] : [] as $widget) {
                    if (is_array($widget) && ($widget['type'] ?? null) === 'rss' && ($widget['url'] ?? null) === $url) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static function playlistPublique(array $playlist, int $chaineId): array
    {
        $regions = json_decode((string) $playlist['regions'], true);
        return [
            'disposition' => $playlist['disposition'],
            'portrait' => ControleurPlaylists::estPortrait($playlist['disposition']),
            'regions' => is_array($regions) ? $regions : [],
            'pages' => self::avecUrlsMedias(Pages::lire((string) $playlist['pages'], (int) $playlist['id']), $chaineId),
        ];
    }

    /**
     * Remplace dans les widgets média l'identifiant de chaque média par son URL et son type.
     * Un média supprimé ou appartenant à une autre chaîne est retiré.
     */
    private static function avecUrlsMedias(array $pages, int $chaineId): array
    {
        $ids = [];
        foreach ($pages as $page) {
            foreach (is_array($page['widgets'] ?? null) ? $page['widgets'] : [] as $widget) {
                if (is_array($widget) && ($widget['type'] ?? null) === 'media' && is_array($widget['elements'] ?? null)) {
                    foreach ($widget['elements'] as $element) {
                        if (is_array($element) && is_int($element['media'] ?? null)) {
                            $ids[$element['media']] = true;
                        }
                    }
                }
            }
        }

        $medias = [];
        if ($ids !== []) {
            $marques = implode(', ', array_fill(0, count($ids), '?'));
            $lignes = Db::lignes(
                "SELECT id, fichier, type FROM medias WHERE chaine_id = ? AND id IN ($marques)",
                [$chaineId, ...array_keys($ids)]
            );
            $base = Config::get('url_base') . '/uploads/';
            foreach ($lignes as $m) {
                $medias[(int) $m['id']] = ['url' => $base . rawurlencode($m['fichier']), 'type' => $m['type']];
            }
        }

        foreach ($pages as &$page) {
            if (!is_array($page['widgets'] ?? null)) {
                $page['widgets'] = [];
                continue;
            }
            foreach ($page['widgets'] as &$widget) {
                if (!is_array($widget) || ($widget['type'] ?? null) !== 'media') {
                    continue;
                }
                $elements = [];
                foreach (is_array($widget['elements'] ?? null) ? $widget['elements'] : [] as $element) {
                    $cle = is_array($element) ? ($element['media'] ?? null) : null;
                    $media = is_int($cle) ? ($medias[$cle] ?? null) : null;
                    if ($media !== null) {
                        $elements[] = $media + ['duree' => $element['duree'] ?? null];
                    }
                }
                $widget['elements'] = $elements;
            }
            unset($widget);
        }
        unset($page);
        return $pages;
    }
}
