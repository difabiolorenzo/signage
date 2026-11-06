<?php
// Éditeur : page unique ; les écrans sont construits par assets/js/admin/app.js à partir de l'API.
// La connexion et les droits sont vérifiés par l'API à chaque requête.
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/demarrage.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
// L'aperçu de l'éditeur utilise le code du lecteur : météo (Open-Meteo), Page web et YouTube en iframe.
// media-src blob: : une vidéo choisie est lue sur place avant l'envoi (dimensions, durée, vignette).
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; "
    . "connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com; frame-src http: https:; "
    . "frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'");

if (!Config::existe()) {
    http_response_code(503);
    echo '<!doctype html><meta charset="utf-8"><title>Signage Studio</title><p>Application non installée : ouvrez installer.php.</p>';
    exit;
}
$base = htmlspecialchars((string) Config::get('url_base'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?>
<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Signage Studio — Éditeur</title>
    <link rel="stylesheet" href="<?= $base ?>/assets/css/lecteur.css">
    <link rel="stylesheet" href="<?= $base ?>/assets/css/admin.css">
    <script type="module" src="<?= $base ?>/assets/js/admin/app.js"></script>
</head>
<body data-api="<?= $base ?>/api/index.php">
    <div id="app"><p class="chargement">Chargement…</p></div>
    <div id="notification" class="notification" role="status" aria-live="polite" hidden></div>
</body>
</html>
