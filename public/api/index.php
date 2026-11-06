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
// Connexion dès maintenant : elle applique le fuseau du panneau d'administration avant tout calcul de date.
Db::pdo();

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
    ['GET', '#^/public/' . SLUG . '/meteo$#', [ControleurPublic::class, 'meteo']],
    ['GET', '#^/parametres$#', [ControleurParametres::class, 'lire']],
    ['PUT', '#^/parametres$#', [ControleurParametres::class, 'modifier']],
    ['POST', '#^/connexion$#', [ControleurSession::class, 'connexion']],
    ['POST', '#^/deconnexion$#', [ControleurSession::class, 'deconnexion']],
    ['GET', '#^/moi$#', [ControleurSession::class, 'moi']],
    ['PUT', '#^/moi$#', [ControleurSession::class, 'modifierMoi']],
    ['PUT', '#^/moi/mot_de_passe$#', [ControleurSession::class, 'changerMotDePasse']],
    ['PUT', '#^/moi/identifiant$#', [ControleurSession::class, 'changerIdentifiant']],
    ['GET', '#^/chaines$#', [ControleurChaines::class, 'liste']],
    ['POST', '#^/chaines$#', [ControleurChaines::class, 'creer']],
    ['GET', '#^/chaines/' . ID . '$#', fn (string $id) => ControleurChaines::detail((int) $id)],
    ['PUT', '#^/chaines/' . ID . '$#', fn (string $id) => ControleurChaines::modifier((int) $id)],
    ['DELETE', '#^/chaines/' . ID . '$#', fn (string $id) => ControleurChaines::supprimer((int) $id)],
    ['GET', '#^/playlists$#', [ControleurPlaylists::class, 'liste']],
    ['POST', '#^/playlists$#', [ControleurPlaylists::class, 'creer']],
    ['GET', '#^/playlists/' . ID . '$#', fn (string $p) => ControleurPlaylists::lire((int) $p)],
    ['PUT', '#^/playlists/' . ID . '$#', fn (string $p) => ControleurPlaylists::enregistrer((int) $p)],
    ['DELETE', '#^/playlists/' . ID . '$#', fn (string $p) => ControleurPlaylists::supprimer((int) $p)],
    ['POST', '#^/playlists/' . ID . '/duplication$#', fn (string $p) => ControleurPlaylists::dupliquer((int) $p)],
    ['GET', '#^/medias$#', [ControleurMedias::class, 'liste']],
    ['POST', '#^/medias$#', [ControleurMedias::class, 'envoyer']],
    ['DELETE', '#^/medias/' . ID . '$#', fn (string $m) => ControleurMedias::supprimer((int) $m)],
    ['POST', '#^/medias/' . ID . '/vignette$#', fn (string $m) => ControleurMedias::regenererVignette((int) $m)],
    ['GET', '#^/(playlist|media)s/' . ID . '/portee$#', fn (string $t, string $id) => ControleurBibliotheque::lirePortee($t, (int) $id)],
    ['PUT', '#^/(playlist|media)s/' . ID . '/portee$#', fn (string $t, string $id) => ControleurBibliotheque::modifierPortee($t, (int) $id)],
    ['PUT', '#^/(playlist|media)s/' . ID . '/auteur$#', fn (string $t, string $id) => ControleurBibliotheque::modifierAuteur($t, (int) $id)],
    ['GET', '#^/annuaire$#', [ControleurUtilisateurs::class, 'annuaire']],
    ['GET', '#^/chaines/' . ID . '/programmation$#', fn (string $c) => ControleurProgrammation::lire((int) $c)],
    ['PUT', '#^/chaines/' . ID . '/programmation$#', fn (string $c) => ControleurProgrammation::remplacer((int) $c)],
    ['GET', '#^/utilisateurs$#', [ControleurUtilisateurs::class, 'liste']],
    ['POST', '#^/utilisateurs$#', [ControleurUtilisateurs::class, 'creer']],
    ['PUT', '#^/utilisateurs/' . ID . '$#', fn (string $u) => ControleurUtilisateurs::modifier((int) $u)],
    ['PUT', '#^/utilisateurs/' . ID . '/droits$#', fn (string $u) => ControleurUtilisateurs::droits((int) $u)],
    ['POST', '#^/utilisateurs/' . ID . '/transfert$#', fn (string $u) => ControleurBibliotheque::transferer((int) $u)],
    ['GET', '#^/sauvegarde$#', [ControleurSauvegarde::class, 'etat']],
    ['GET', '#^/sauvegarde/telechargement$#', [ControleurSauvegarde::class, 'telecharger']],
    ['POST', '#^/sauvegarde/restauration$#', [ControleurSauvegarde::class, 'restaurer']],
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
