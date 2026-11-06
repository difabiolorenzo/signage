<?php
// Installation : crée les tables (sql/schema.sql) et le premier administrateur.
// Refuse de se relancer dès qu'un administrateur existe.
declare(strict_types=1);

require dirname(__DIR__) . '/app/demarrage.php';

session_start(['cookie_httponly' => true, 'cookie_samesite' => 'Lax', 'use_strict_mode' => true]);

function e(string $texte): string
{
    return htmlspecialchars($texte, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function page(string $titre, string $contenu, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>Installation — Signage Studio</title><style>'
        . 'body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1d2327}'
        . 'label{display:block;margin-top:1rem;font-weight:600}'
        . 'input{width:100%;box-sizing:border-box;padding:.5rem;font:inherit}'
        . 'button{margin-top:1.5rem;padding:.6rem 1.2rem;font:inherit;cursor:pointer}'
        . '.erreur{background:#fde8e8;border-left:4px solid #c03030;padding:.5rem 1rem}'
        . '.ok{background:#e6f4ea;border-left:4px solid #2e7d32;padding:.5rem 1rem}'
        . 'small{color:#5f6b72}'
        . '.champ-secret{display:flex}.champ-secret input{flex:1}'
        . '.bascule-mdp{margin:0;padding:0 .7rem;display:inline-flex;align-items:center}</style></head><body>'
        . '<h1>' . e($titre) . '</h1>' . $contenu
        . '<script type="module">import { ajouterBascules } from "./assets/js/commun/mot_de_passe.js"; ajouterBascules();</script>'
        . '</body></html>';
    exit;
}

// 1. Configuration et connexion.
if (!Config::existe()) {
    page('Configuration absente', '<p class="erreur">Copiez <code>config/config.example.php</code> en <code>config/config.php</code>, renseignez la connexion à la base, puis rechargez cette page.</p>', 500);
}
try {
    Db::pdo();
} catch (PDOException $ex) {
    error_log((string) $ex);
    page('Connexion impossible', '<p class="erreur">La base de données ne répond pas : vérifiez l\'hôte, le port, le nom de la base, l\'utilisateur et le mot de passe dans <code>config/config.php</code>, et que la base existe.</p><p><small>' . e($ex->getMessage()) . '</small></p>', 500);
}

// 2. Déjà installé ?
function adminExiste(): bool
{
    $table = Db::valeur("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'utilisateurs'");
    return (int) $table > 0
        && (int) Db::valeur("SELECT COUNT(*) FROM utilisateurs WHERE role = 'admin'") > 0;
}

$urlAdmin = Config::get('url_base') . '/admin/';
if (adminExiste()) {
    page('Installation déjà faite', '<p>Un administrateur existe déjà : ce script est désactivé.</p><p><a href="' . e($urlAdmin) . '">Aller à l\'éditeur</a></p>', 403);
}

// 3. Formulaire et création.
if (empty($_SESSION['jeton_installation'])) {
    $_SESSION['jeton_installation'] = bin2hex(random_bytes(32));
}
$jeton = $_SESSION['jeton_installation'];
$erreurs = [];
$saisie = ['identifiant' => '', 'nom' => ''];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $saisie['identifiant'] = trim((string) ($_POST['identifiant'] ?? ''));
    $saisie['nom'] = trim((string) ($_POST['nom'] ?? ''));
    $motDePasse = (string) ($_POST['mot_de_passe'] ?? '');
    $confirmation = (string) ($_POST['confirmation'] ?? '');

    if (!hash_equals($jeton, (string) ($_POST['jeton'] ?? ''))) {
        $erreurs[] = 'Formulaire expiré : rechargez la page et recommencez.';
    }
    if (!preg_match('/^[A-Za-z0-9._-]{3,64}$/', $saisie['identifiant'])) {
        $erreurs[] = 'Identifiant : 3 à 64 caractères parmi lettres sans accent, chiffres, point, tiret et tiret bas.';
    }
    if (mb_strlen($saisie['nom']) > 100) {
        $erreurs[] = 'Nom : 100 caractères au plus.';
    }
    if (mb_strlen($motDePasse) < 10) {
        $erreurs[] = 'Mot de passe : 10 caractères au moins.';
    } elseif ($motDePasse !== $confirmation) {
        $erreurs[] = 'Les deux mots de passe ne sont pas identiques.';
    }

    if ($erreurs === []) {
        // Tables (le schéma est relançable). Commentaires retirés, puis une instruction par « ; » de fin de ligne.
        $sql = preg_replace('/^\s*--.*$/m', '', (string) file_get_contents(dirname(__DIR__) . '/sql/schema.sql'));
        foreach (preg_split('/;\s*$/m', $sql) as $instruction) {
            if (trim($instruction) !== '') {
                Db::executer($instruction);
            }
        }
        if (adminExiste()) {
            page('Installation déjà faite', '<p>Un administrateur a été créé entre-temps : ce script est désactivé.</p>', 403);
        }
        Db::executer(
            "INSERT INTO utilisateurs (identifiant, mot_de_passe, nom, role) VALUES (?, ?, ?, 'admin')",
            [$saisie['identifiant'], password_hash($motDePasse, PASSWORD_DEFAULT), $saisie['nom']]
        );
        unset($_SESSION['jeton_installation']);
        page('Installation terminée', '<p class="ok">Les tables sont créées et le compte administrateur <strong>' . e($saisie['identifiant']) . '</strong> est prêt. Ce script est maintenant désactivé.</p><p><a href="' . e($urlAdmin) . '">Aller à l\'éditeur</a></p>');
    }
}

$messages = '';
foreach ($erreurs as $erreur) {
    $messages .= '<p class="erreur">' . e($erreur) . '</p>';
}
page('Installation', $messages
    . '<p>Création des tables dans la base <strong>' . e((string) Config::get('db')['base']) . '</strong> et du premier compte administrateur.</p>'
    . '<form method="post" autocomplete="off">'
    . '<input type="hidden" name="jeton" value="' . e($jeton) . '">'
    . '<label for="identifiant">Identifiant</label><input id="identifiant" name="identifiant" required maxlength="64" value="' . e($saisie['identifiant']) . '">'
    . '<label for="nom">Nom affiché <small>(facultatif)</small></label><input id="nom" name="nom" maxlength="100" value="' . e($saisie['nom']) . '">'
    . '<label for="mot_de_passe">Mot de passe <small>(10 caractères au moins)</small></label><input id="mot_de_passe" name="mot_de_passe" type="password" required minlength="10" autocomplete="new-password">'
    . '<label for="confirmation">Confirmation</label><input id="confirmation" name="confirmation" type="password" required minlength="10" autocomplete="new-password">'
    . '<button type="submit">Installer</button></form>', $erreurs === [] ? 200 : 400);
