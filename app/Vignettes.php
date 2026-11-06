<?php
declare(strict_types=1);

/**
 * Vignettes des médias : 320 px de large au plus, réduites par GD, enregistrées sous un nom
 * aléatoire dans public/uploads/vignettes/ (sous-dossier : Sauvegarde::controleMedias ne les
 * compte pas comme des médias orphelins).
 *
 * Image : à partir du fichier lui-même (GIF animé : première image). Vidéo : à partir d'une image
 * capturée par le navigateur, le serveur ne sachant pas lire les vidéos (ffmpeg non garanti).
 * Sans GD, ou si l'image est illisible ou trop grande pour la mémoire, aucune vignette n'est faite
 * (null) : l'éditeur affiche alors le fichier d'origine.
 */
final class Vignettes
{
    public const LARGEUR = 320;
    /** Images capturées acceptées pour une vidéo. */
    public const TYPES_CAPTURE = ['image/jpeg', 'image/png', 'image/webp'];
    /** Au-delà, décompresser l'image demanderait trop de mémoire à GD (4 octets par pixel). */
    private const PIXELS_MAX = 50_000_000;

    public static function dossier(): string
    {
        return dirname(__DIR__) . '/public/uploads/vignettes/';
    }

    public static function url(?string $fichier): ?string
    {
        return $fichier === null ? null : Config::get('url_base') . '/uploads/vignettes/' . rawurlencode($fichier);
    }

    /** Crée la vignette de l'image $chemin (de type $type) ; renvoie le nom du fichier, ou null. */
    public static function creer(string $chemin, string $type): ?string
    {
        if (!function_exists('imagecreatetruecolor')) {
            return null;
        }
        $infos = @getimagesize($chemin);
        if ($infos === false || $infos[0] < 1 || $infos[1] < 1 || $infos[0] * $infos[1] > self::PIXELS_MAX) {
            return null;
        }
        $source = match ($type) {
            'image/jpeg' => @imagecreatefromjpeg($chemin),
            'image/png' => @imagecreatefrompng($chemin),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($chemin) : false,
            'image/gif' => @imagecreatefromgif($chemin),
            default => false,
        };
        if ($source === false) {
            return null;
        }
        if ($type === 'image/jpeg') {
            $source = self::redresser($source, $chemin);
        }

        $l = imagesx($source);
        $h = imagesy($source);
        $largeur = min(self::LARGEUR, $l);
        $hauteur = max(1, (int) round($h * $largeur / $l));
        $vignette = imagecreatetruecolor($largeur, $hauteur);
        imagealphablending($vignette, false);
        imagesavealpha($vignette, true);
        imagefill($vignette, 0, 0, imagecolorallocatealpha($vignette, 0, 0, 0, 127));
        imagecopyresampled($vignette, $source, 0, 0, 0, 0, $largeur, $hauteur, $l, $h);

        if (!is_dir(self::dossier()) && !@mkdir(self::dossier(), 0775, true) && !is_dir(self::dossier())) {
            return null;
        }
        // WebP garde la transparence (PNG, GIF) pour un poids réduit ; à défaut, PNG.
        $webp = function_exists('imagewebp');
        $fichier = bin2hex(random_bytes(16)) . ($webp ? '.webp' : '.png');
        $ok = $webp ? imagewebp($vignette, self::dossier() . $fichier, 80) : imagepng($vignette, self::dossier() . $fichier, 9);
        if (!$ok) {
            @unlink(self::dossier() . $fichier);
            return null;
        }
        @chmod(self::dossier() . $fichier, 0644);
        return $fichier;
    }

    /**
     * Vignette d'une vidéo à partir de l'image capturée envoyée dans le champ $champ, ou null si
     * le champ est absent ou invalide (type vérifié par finfo).
     */
    public static function depuisEnvoi(string $champ): ?string
    {
        $f = $_FILES[$champ] ?? null;
        if (!is_array($f) || ($f['error'] ?? null) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name']) || $f['size'] > 10 * 1024 * 1024) {
            return null;
        }
        $type = (string) (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
        return in_array($type, self::TYPES_CAPTURE, true) ? self::creer($f['tmp_name'], $type) : null;
    }

    public static function supprimer(?string $fichier): void
    {
        if ($fichier !== null && preg_match('/^[A-Za-z0-9._-]+$/', $fichier) && is_file(self::dossier() . $fichier)) {
            @unlink(self::dossier() . $fichier);
        }
    }

    /** Applique l'orientation EXIF d'une photo (sinon la vignette d'une photo de téléphone est couchée). */
    private static function redresser(GdImage $image, string $chemin): GdImage
    {
        $exif = function_exists('exif_read_data') ? @exif_read_data($chemin) : false;
        $angle = match ((int) (is_array($exif) ? ($exif['Orientation'] ?? 1) : 1)) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };
        if ($angle === 0) {
            return $image;
        }
        $tournee = imagerotate($image, $angle, 0);
        if ($tournee === false) {
            return $image;
        }
        return $tournee;
    }
}
