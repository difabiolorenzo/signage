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
        $programmation = new Programmation($plages, $defaut, Programmation::validitesChaine($chaineId));

        $maintenant = new DateTimeImmutable();
        $playlistId = $programmation->playlistA($maintenant);
        $playlist = $playlistId === null ? null : Db::ligne(
            'SELECT id, disposition, regions, pages, portee FROM playlists WHERE id = ?',
            [$playlistId]
        );
        // Invariant de diffusion (voir Bibliotheque) : vérification défensive.
        if ($playlist !== null && $playlist['portee'] !== 'globale'
            && !in_array($chaineId, Bibliotheque::acces('playlist', [$playlistId])[$playlistId]['chaines'], true)) {
            error_log("Chaîne $chaineId : la playlist $playlistId est programmée sans y être ouverte ; rien n'est affiché.");
            $playlist = null;
        }
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
            'playlist' => $playlist === null ? null : self::playlistPublique($playlist),
        ]);
    }

    /**
     * GET /api/public/{slug}/rss?url= : titres d'un flux RSS, via le serveur.
     * Seuls les flux utilisés par un widget RSS d'une playlist programmée sur la chaîne sont relayés : l'API n'est pas un
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
            Reponse::erreur("Ce flux n'est utilisé par aucune playlist programmée sur la chaîne.", 403);
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
        $ids = Bibliotheque::playlistsProgrammees($chaineId);
        if ($ids === []) {
            return false;
        }
        $marques = implode(', ', array_fill(0, count($ids), '?'));
        foreach (Db::lignes("SELECT id, pages FROM playlists WHERE id IN ($marques)", $ids) as $playlist) {
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

    private static function playlistPublique(array $playlist): array
    {
        $regions = json_decode((string) $playlist['regions'], true);
        return [
            'disposition' => $playlist['disposition'],
            'portrait' => ControleurPlaylists::estPortrait($playlist['disposition']),
            'regions' => is_array($regions) ? $regions : [],
            'pages' => self::avecUrlsMedias(Pages::lire((string) $playlist['pages'], (int) $playlist['id'])),
        ];
    }

    /**
     * Remplace dans les widgets média l'identifiant de chaque média par son URL et son type, et
     * ajoute aux codes QR l'URL de leur logo (logo_url, image seulement). Un média supprimé est
     * retiré. La portée d'un média ne limite pas son affichage : seulement qui peut l'insérer.
     */
    private static function avecUrlsMedias(array $pages): array
    {
        $ids = Pages::medias($pages);
        $medias = [];
        if ($ids !== []) {
            $marques = implode(', ', array_fill(0, count($ids), '?'));
            $lignes = Db::lignes("SELECT id, fichier, type FROM medias WHERE id IN ($marques)", $ids);
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
                if (is_array($widget) && ($widget['type'] ?? null) === 'qr') {
                    $logo = is_int($widget['logo'] ?? null) ? ($medias[$widget['logo']] ?? null) : null;
                    unset($widget['logo'], $widget['logo_url']);
                    if ($logo !== null && str_starts_with($logo['type'], 'image/')) {
                        $widget['logo_url'] = $logo['url'];
                    }
                    continue;
                }
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
