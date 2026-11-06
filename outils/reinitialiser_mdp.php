<?php
// Secours pour un compte bloqué (administrateur qui a oublié son mot de passe), en ligne de commande :
//   php outils/reinitialiser_mdp.php identifiant
// Donne au compte un nouveau mot de passe aléatoire, affiché une seule fois, le réactive s'il était
// désactivé, efface ses échecs de connexion récents et ferme ses sessions ouvertes.
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Ce script s'utilise uniquement en ligne de commande.\n");
}

require dirname(__DIR__) . '/app/demarrage.php';

function arreter(string $message): never
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

if (!Config::existe()) {
    arreter('Configuration absente : copiez config/config.example.php en config/config.php.');
}
$identifiant = $argv[1] ?? '';
if ($identifiant === '' || count($argv) !== 2) {
    arreter('Usage : php outils/reinitialiser_mdp.php identifiant');
}

try {
    $u = Db::ligne('SELECT id, identifiant, role, actif FROM utilisateurs WHERE identifiant = ?', [$identifiant]);
} catch (PDOException $e) {
    arreter('Base de données injoignable : ' . $e->getMessage());
}
if ($u === null) {
    $comptes = array_column(Db::lignes('SELECT identifiant FROM utilisateurs ORDER BY identifiant'), 'identifiant');
    arreter("Aucun compte « $identifiant ». Comptes existants : " . ($comptes === [] ? 'aucun' : implode(', ', $comptes)) . '.');
}

// 16 caractères sans ambiguïté de lecture (ni 0/O, ni 1/l/I).
$alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
$motDePasse = '';
for ($i = 0; $i < 16; $i++) {
    $motDePasse .= $alphabet[random_int(0, strlen($alphabet) - 1)];
}

Db::transaction(static function () use ($u, $motDePasse): void {
    Db::executer(
        'UPDATE utilisateurs SET mot_de_passe = ?, actif = 1, version_session = version_session + 1 WHERE id = ?',
        [password_hash($motDePasse, PASSWORD_DEFAULT), $u['id']]
    );
    Db::executer('DELETE FROM tentatives_connexion WHERE identifiant = ?', [$u['identifiant']]);
});

echo "Compte « {$u['identifiant']} » ({$u['role']}) : nouveau mot de passe\n\n    $motDePasse\n\n";
if ((int) $u['actif'] !== 1) {
    echo "Le compte, qui était désactivé, est réactivé.\n";
}
echo "Ses sessions ouvertes sont fermées. Connectez-vous puis changez ce mot de passe dans « Mon compte ».\n";
