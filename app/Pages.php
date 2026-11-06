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
    /** Code QR : formes des modules (voir lecteur/widgets/qr.js). */
    public const FORMES_QR = ['carres', 'arrondis', 'points'];
    /** Météo : modèles d'affichage (voir lecteur/widgets/meteo.js). */
    public const MODELES_METEO = ['actuelle', 'actuelle_journee', 'bandeau', 'carte'];

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

    /**
     * Identifiants des médias utilisés par des pages : images et vidéos des widgets média, logo
     * des codes QR.
     *
     * @return list<int>
     */
    public static function medias(array $pages): array
    {
        $ids = [];
        foreach ($pages as $page) {
            foreach (is_array($page['widgets'] ?? null) ? $page['widgets'] : [] as $w) {
                if (!is_array($w)) {
                    continue;
                }
                if (($w['type'] ?? null) === 'qr' && is_int($w['logo'] ?? null)) {
                    $ids[$w['logo']] = true;
                }
                if (($w['type'] ?? null) === 'media' && is_array($w['elements'] ?? null)) {
                    foreach ($w['elements'] as $e) {
                        if (is_array($e) && is_int($e['media'] ?? null)) {
                            $ids[$e['media']] = true;
                        }
                    }
                }
            }
        }
        return array_keys($ids);
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
     * @param list<int> $mediasChaine identifiants des médias autorisés : ceux que l'utilisateur voit,
     *     et ceux que la playlist utilisait déjà
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
                if ($type === 'qr') {
                    $widget = self::reglagesQr($widget, $mediasChaine, "Page $n, région " . ($j + 1));
                }
                if ($type === 'meteo') {
                    self::reglagesMeteo($widget, "Page $n, région " . ($j + 1));
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

    /** Code QR : couleurs #rrggbb, marge de 0 à 10 modules, forme connue, logo parmi les médias de la chaîne. */
    private static function reglagesQr(array $widget, array $mediasChaine, string $ou): array
    {
        foreach (['qr_couleur', 'qr_fond'] as $cle) {
            if (isset($widget[$cle]) && (!is_string($widget[$cle]) || !preg_match('/^#[0-9a-fA-F]{6}$/', $widget[$cle]))) {
                Reponse::erreur("$ou : couleur du code QR invalide.", 400);
            }
        }
        if (isset($widget['qr_marge']) && (!is_int($widget['qr_marge']) || $widget['qr_marge'] < 0 || $widget['qr_marge'] > 10)) {
            Reponse::erreur("$ou : marge du code QR entre 0 et 10.", 400);
        }
        if (isset($widget['qr_forme']) && !in_array($widget['qr_forme'], self::FORMES_QR, true)) {
            Reponse::erreur("$ou : forme des modules inconnue.", 400);
        }
        if (isset($widget['logo']) && (!is_int($widget['logo']) || !in_array($widget['logo'], $mediasChaine, true))) {
            Reponse::erreur("$ou : logo introuvable dans les médias de cette chaîne.", 400);
        }
        unset($widget['logo_url']); // calculée à la lecture, jamais enregistrée
        return $widget;
    }

    private static function reglagesMeteo(array $widget, string $ou): void
    {
        if (isset($widget['modele']) && !in_array($widget['modele'], self::MODELES_METEO, true)) {
            Reponse::erreur("$ou : modèle d'affichage météo inconnu.", 400);
        }
        if (isset($widget['jours']) && (!is_int($widget['jours']) || $widget['jours'] < 1 || $widget['jours'] > 7)) {
            Reponse::erreur("$ou : nombre de jours de prévision entre 1 et 7.", 400);
        }
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
