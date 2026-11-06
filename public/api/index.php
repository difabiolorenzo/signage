<?php
// API JSON, point d'entrée unique (routeur).
// Les routes s'écrivent /api/public/slug (réécriture par .htaccess) ou, sans mod_rewrite,
// /api/index.php/public/slug.
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/demarrage.php';
Reponse::capturerErreurs();

if (!Config::existe()) {
    Reponse::erreur('Application non installée.', 503);
}

/** Chemin de la route, sans le dossier de l'API : « /public/restaurant ». */
function cheminRoute(): string
{
    $chemin = $_SERVER['PATH_INFO'] ?? null;
    if ($chemin === null) {
        $chemin = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        $dossier = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        if ($dossier !== '' && str_starts_with($chemin, $dossier)) {
            $chemin = substr($chemin, strlen($dossier));
        }
        $chemin = (string) preg_replace('#^/index\.php#', '', $chemin);
    }
    return '/' . trim(rawurldecode($chemin), '/');
}

const SLUG = '([A-Za-z0-9_-]{1,64})';
const ID = '([1-9][0-9]{0,9})';

// [méthode, motif du chemin, action]. Les groupes du motif sont passés à l'action.
$routes = [
    ['GET', '#^/public/' . SLUG . '$#', [ControleurPublic::class, 'chaine']],
    ['GET', '#^/public/' . SLUG . '/rss$#', [ControleurPublic::class, 'rss']],
    ['POST', '#^/connexion$#', [ControleurSession::class, 'connexion']],
    ['POST', '#^/deconnexion$#', [ControleurSession::class, 'deconnexion']],
    ['GET', '#^/moi$#', [ControleurSession::class, 'moi']],
    ['GET', '#^/chaines$#', [ControleurChaines::class, 'liste']],
    ['POST', '#^/chaines$#', [ControleurChaines::class, 'creer']],
    ['GET', '#^/chaines/' . ID . '$#', fn (string $id) => ControleurChaines::detail((int) $id)],
    ['PUT', '#^/chaines/' . ID . '$#', fn (string $id) => ControleurChaines::modifier((int) $id)],
    ['DELETE', '#^/chaines/' . ID . '$#', fn (string $id) => ControleurChaines::supprimer((int) $id)],
    ['GET', '#^/chaines/' . ID . '/playlists$#', fn (string $c) => ControleurPlaylists::liste((int) $c)],
    ['POST', '#^/chaines/' . ID . '/playlists$#', fn (string $c) => ControleurPlaylists::creer((int) $c)],
    ['POST', '#^/chaines/' . ID . '/playlists/' . ID . '/duplication$#',
        fn (string $c, string $p) => ControleurPlaylists::dupliquer((int) $c, (int) $p)],
    ['GET', '#^/chaines/' . ID . '/playlists/' . ID . '$#',
        fn (string $c, string $p) => ControleurPlaylists::lire((int) $c, (int) $p)],
    ['PUT', '#^/chaines/' . ID . '/playlists/' . ID . '$#',
        fn (string $c, string $p) => ControleurPlaylists::enregistrer((int) $c, (int) $p)],
    ['GET', '#^/chaines/' . ID . '/medias$#', fn (string $c) => ControleurMedias::liste((int) $c)],
    ['POST', '#^/chaines/' . ID . '/medias$#', fn (string $c) => ControleurMedias::envoyer((int) $c)],
    ['DELETE', '#^/chaines/' . ID . '/medias/' . ID . '$#',
        fn (string $c, string $m) => ControleurMedias::supprimer((int) $c, (int) $m)],
    ['GET', '#^/chaines/' . ID . '/programmation$#', fn (string $c) => ControleurProgrammation::lire((int) $c)],
    ['PUT', '#^/chaines/' . ID . '/programmation$#', fn (string $c) => ControleurProgrammation::remplacer((int) $c)],
    ['GET', '#^/utilisateurs$#', [ControleurUtilisateurs::class, 'liste']],
    ['POST', '#^/utilisateurs$#', [ControleurUtilisateurs::class, 'creer']],
    ['PUT', '#^/utilisateurs/' . ID . '$#', fn (string $u) => ControleurUtilisateurs::modifier((int) $u)],
    ['PUT', '#^/utilisateurs/' . ID . '/droits$#', fn (string $u) => ControleurUtilisateurs::droits((int) $u)],
    ['DELETE', '#^/chaines/' . ID . '/playlists/' . ID . '$#',
        fn (string $c, string $p) => ControleurPlaylists::supprimer((int) $c, (int) $p)],
];

// Routes d'écriture accessibles sans session (et donc sans jeton CSRF).
const ECRITURES_SANS_SESSION = ['/connexion'];

$chemin = cheminRoute();
$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$autorisees = [];

foreach ($routes as [$methodeRoute, $motif, $action]) {
    if (!preg_match($motif, $chemin, $m)) {
        continue;
    }
    if ($methodeRoute !== $methode) {
        $autorisees[] = $methodeRoute;
        continue;
    }
    // Toute écriture exige une session et le jeton CSRF de cette session.
    if ($methode !== 'GET' && !in_array($chemin, ECRITURES_SANS_SESSION, true)) {
        Auth::exigerConnexion();
        Auth::verifierJeton();
    }
    $action(...array_slice($m, 1));
    Reponse::erreur('Route sans réponse.', 500);
}

if ($autorisees !== []) {
    header('Allow: ' . implode(', ', array_unique($autorisees)));
    Reponse::erreur('Méthode non autorisée.', 405);
}
Reponse::erreur('Route inconnue.', 404);
