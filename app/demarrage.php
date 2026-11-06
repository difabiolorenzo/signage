<?php
// Inclus en premier par chaque point d'entrée de public/ : chargement des classes et de la configuration.
declare(strict_types=1);

spl_autoload_register(static function (string $classe): void {
    $fichier = __DIR__ . '/' . $classe . '.php';
    if (preg_match('/^[A-Za-z][A-Za-z0-9]*$/', $classe) && is_file($fichier)) {
        require $fichier;
    }
});

if (Config::charger(dirname(__DIR__) . '/config/config.php')) {
    date_default_timezone_set(Config::get('fuseau'));
}
