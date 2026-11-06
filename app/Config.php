<?php
declare(strict_types=1);

/** Lecture de config/config.php. */
final class Config
{
    private static ?array $valeurs = null;

    /** Charge le fichier ; renvoie false s'il n'existe pas encore (avant l'installation). */
    public static function charger(string $fichier): bool
    {
        if (!is_file($fichier)) {
            return false;
        }
        $valeurs = require $fichier;
        if (!is_array($valeurs)) {
            throw new RuntimeException('config/config.php doit renvoyer un tableau.');
        }
        self::$valeurs = $valeurs;
        return true;
    }

    public static function existe(): bool
    {
        return self::$valeurs !== null;
    }

    public static function get(string $cle): mixed
    {
        if (self::$valeurs === null) {
            throw new RuntimeException('Configuration absente : copiez config/config.example.php en config/config.php.');
        }
        if (!array_key_exists($cle, self::$valeurs)) {
            throw new RuntimeException("Clé de configuration manquante : $cle.");
        }
        return self::$valeurs[$cle];
    }
}
