<?php
// Lecteur public : sans paramètre, liste des chaînes ; avec ?chaine=slug, affichage plein écran.
// Aucune connexion n'est jamais demandée ici.
declare(strict_types=1);

require dirname(__DIR__) . '/app/demarrage.php';

function e(string $texte): string
{
    return htmlspecialchars($texte, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function page(string $titre, string $corps, string $classe = '', string $tete = '', int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    // Lecteur : scripts et styles du site uniquement ; la météo interroge Open-Meteo ;
    // les widgets Page web et YouTube affichent des sites tiers en iframe.
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
        . "media-src 'self'; connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com; "
        . "frame-src http: https:; object-src 'none'; base-uri 'none'; form-action 'none'");
    $base = Config::existe() ? Config::get('url_base') : '.';
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . e($titre) . '</title>'
        . '<link rel="stylesheet" href="' . e($base) . '/assets/css/lecteur.css">' . $tete
        . '</head><body class="' . e($classe) . '">' . $corps . '</body></html>';
    exit;
}

if (!Config::existe()) {
    page('Signage Studio', '<main class="liste"><h1>Signage Studio</h1><p>Application non installée.</p></main>', 'page-liste', '', 503);
}
$base = Config::get('url_base');
$slug = $_GET['chaine'] ?? null;

// Sans paramètre : liste des chaînes et lien de chacune.
if (!is_string($slug) || $slug === '') {
    $chaines = Db::lignes('SELECT slug, nom FROM chaines ORDER BY nom');
    $items = '';
    foreach ($chaines as $c) {
        $lien = $base . '/?chaine=' . rawurlencode($c['slug']);
        $items .= '<li><a href="' . e($lien) . '">' . e($c['nom']) . '</a> <code>?chaine=' . e($c['slug']) . '</code></li>';
    }
    $contenu = $items === '' ? '<p>Aucune chaîne pour le moment.</p>' : '<ul>' . $items . '</ul>';
    page('Chaînes — Signage Studio', '<main class="liste"><h1>Chaînes</h1>'
        . '<p>Ouvrez le lien d\'une chaîne sur l\'afficheur, en plein écran.</p>' . $contenu . '</main>', 'page-liste');
}

// Avec ?chaine=slug : le lecteur, piloté par assets/js/lecteur/lecteur.js.
$nom = Db::valeur('SELECT nom FROM chaines WHERE slug = ?', [$slug]);
if ($nom === null) {
    page('Chaîne introuvable', '<div class="message">Chaîne introuvable : « ' . e($slug) . ' ».</div>', 'page-lecteur', '', 404);
}
page((string) $nom, '<div id="scene" data-api="' . e($base . '/api/index.php/public/' . rawurlencode($slug)) . '"></div>'
    . '<div id="message" class="message" hidden></div>',
    'page-lecteur', '<script type="module" src="' . e($base) . '/assets/js/lecteur/lecteur.js"></script>');
