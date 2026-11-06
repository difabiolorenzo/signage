<?php
declare(strict_types=1);

/**
 * Document `playlists.pages` : { "format": 1, "pages": [ { duree, fond, widgets: [...] } ] }.
 * Structure détaillée dans public/assets/js/commun/widgets.js. Un futur format 2 convertira
 * ici les documents de format 1 à la lecture.
 */
final class Pages
{
    public const FORMAT = 1;
    public const TYPES = ['vide', 'media', 'texte', 'rss', 'page_web', 'youtube', 'horloge', 'date_heure', 'compte_rebours', 'meteo', 'qr'];
    public const MODES_TEXTE = ['simple', 'markdown', 'riche'];
    private const PAGES_MAX = 200;
    private const OCTETS_MAX = 512 * 1024;
    private const DUREE_MAX = 86400;
    private const MOTIF_COULEUR = '/^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|transparent)$/';

    /** Pages d'un document enregistré ; document illisible : aucune page, et une trace dans le journal. */
    public static function lire(string $json, int $playlistId): array
    {
        $document = json_decode($json, true);
        if (!is_array($document) || ($document['format'] ?? null) !== self::FORMAT || !is_array($document['pages'] ?? null)) {
            error_log("Playlist $playlistId : document pages illisible ou de format inconnu.");
            return [];
        }
        return array_values(array_filter($document['pages'], 'is_array'));
    }

    /** Document JSON à enregistrer. */
    public static function document(array $pages): string
    {
        return json_encode(['format' => self::FORMAT, 'pages' => $pages], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /**
     * Vérifie les pages envoyées par l'éditeur ; réponse 400 avec un message clair sinon.
     * Règles de lecture : au moins une page, un widget par région, un seul widget YouTube par page.
     *
     * @param list<int> $mediasChaine identifiants des médias de la chaîne
     */
    public static function verifier(mixed $pages, int $nombreRegions, array $mediasChaine): array
    {
        if (!is_array($pages) || !array_is_list($pages)) {
            Reponse::erreur('Pages : liste attendue.', 400);
        }
        if ($pages === []) {
            Reponse::erreur('La playlist ne peut pas être vide, elle doit contenir au moins une page.', 400);
        }
        if (count($pages) > self::PAGES_MAX) {
            Reponse::erreur('Une playlist contient au plus ' . self::PAGES_MAX . ' pages.', 400);
        }
        if (strlen((string) json_encode($pages)) > self::OCTETS_MAX) {
            Reponse::erreur('Playlist trop volumineuse.', 400);
        }

        $propres = [];
        foreach ($pages as $i => $page) {
            $n = $i + 1;
            if (!is_array($page) || array_is_list($page)) {
                Reponse::erreur("Page $n : format invalide.", 400);
            }
            $duree = $page['duree'] ?? null;
            if (!is_int($duree) || $duree < 1 || $duree > self::DUREE_MAX) {
                Reponse::erreur("Page $n : la durée doit être un nombre entier de secondes entre 1 et " . self::DUREE_MAX . '.', 400);
            }
            $fond = $page['fond'] ?? '#000000';
            if (!is_string($fond) || !preg_match(self::MOTIF_COULEUR, $fond)) {
                Reponse::erreur("Page $n : couleur de fond invalide.", 400);
            }
            $widgets = $page['widgets'] ?? null;
            if (!is_array($widgets) || !array_is_list($widgets) || count($widgets) !== $nombreRegions) {
                Reponse::erreur("Page $n : un widget par région est attendu ($nombreRegions).", 400);
            }

            $youtube = [];
            foreach ($widgets as $j => &$widget) {
                $type = is_array($widget) ? ($widget['type'] ?? null) : null;
                if (!in_array($type, self::TYPES, true)) {
                    Reponse::erreur("Page $n, région " . ($j + 1) . ' : type de widget inconnu.', 400);
                }
                foreach (['couleur', 'fond'] as $cle) {
                    if (isset($widget[$cle]) && (!is_string($widget[$cle]) || !preg_match(self::MOTIF_COULEUR, $widget[$cle]))) {
                        Reponse::erreur("Page $n, région " . ($j + 1) . ' : couleur invalide.', 400);
                    }
                }
                if ($type === 'texte') {
                    // Le HTML (mode riche) est nettoyé par le lecteur à l'affichage (DOMPurify).
                    if (isset($widget['mode']) && !in_array($widget['mode'], self::MODES_TEXTE, true)) {
                        Reponse::erreur("Page $n, région " . ($j + 1) . ' : mode de texte inconnu.', 400);
                    }
                    foreach (['texte', 'html'] as $cle) {
                        if (isset($widget[$cle]) && !is_string($widget[$cle])) {
                            Reponse::erreur("Page $n, région " . ($j + 1) . ' : texte invalide.', 400);
                        }
                    }
                }
                if ($type === 'youtube') {
                    $youtube[] = $j + 1;
                }
                if ($type === 'media') {
                    $widget['elements'] = self::elementsMedia($widget['elements'] ?? [], $mediasChaine, $n, $j + 1);
                }
            }
            unset($widget);
            if (count($youtube) > 1) {
                Reponse::erreur("Un seul widget YouTube est pris en charge par page (page $n : régions " . implode(' et ', $youtube) . ').', 400);
            }
            $propres[] = ['duree' => $duree, 'fond' => $fond, 'widgets' => $widgets];
        }
        return $propres;
    }

    private static function elementsMedia(mixed $elements, array $mediasChaine, int $page, int $region): array
    {
        if (!is_array($elements) || !array_is_list($elements)) {
            Reponse::erreur("Page $page, région $region : liste de médias invalide.", 400);
        }
        $propres = [];
        foreach ($elements as $e) {
            $media = is_array($e) ? ($e['media'] ?? null) : null;
            $duree = is_array($e) ? ($e['duree'] ?? null) : null;
            if (!is_int($media) || !in_array($media, $mediasChaine, true)) {
                Reponse::erreur("Page $page, région $region : média introuvable dans cette chaîne.", 400);
            }
            if (!is_int($duree) || $duree < 1 || $duree > self::DUREE_MAX) {
                Reponse::erreur("Page $page, région $region : durée de média invalide.", 400);
            }
            $propres[] = ['media' => $media, 'duree' => $duree];
        }
        return $propres;
    }
}
