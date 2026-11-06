<?php
declare(strict_types=1);

/**
 * Session de l'éditeur et jeton CSRF.
 *
 * La session n'est ouverte qu'à la demande : les routes publiques (lecteur) n'envoient jamais
 * de cookie. Cookie HttpOnly, SameSite=Lax, Secure en HTTPS, limité au dossier de l'application.
 */
final class Auth
{
    private const NOM_SESSION = 'signage_session';
    private const CLE_UTILISATEUR = 'utilisateur_id';
    private const CLE_JETON = 'jeton_csrf';

    private static ?array $utilisateur = null;

    public static function demarrer(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $https = ($_SERVER['HTTPS'] ?? '') !== '' && strtolower((string) $_SERVER['HTTPS']) !== 'off';
        session_name(self::NOM_SESSION);
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => rtrim((string) Config::get('url_base'), '/') . '/',
            'secure' => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_start();
    }

    /** Utilisateur connecté et actif, ou null. Un compte désactivé est déconnecté aussitôt. */
    public static function utilisateur(): ?array
    {
        if (self::$utilisateur !== null) {
            return self::$utilisateur;
        }
        self::demarrer();
        $id = $_SESSION[self::CLE_UTILISATEUR] ?? null;
        if (!is_int($id)) {
            return null;
        }
        $u = Db::ligne('SELECT id, identifiant, nom, role, actif FROM utilisateurs WHERE id = ?', [$id]);
        if ($u === null || (int) $u['actif'] !== 1) {
            self::deconnecter();
            return null;
        }
        unset($u['actif']);
        $u['id'] = (int) $u['id'];
        return self::$utilisateur = $u;
    }

    /** Utilisateur connecté ; sinon réponse 401. */
    public static function exigerConnexion(): array
    {
        return self::utilisateur() ?? Reponse::erreur('Connexion requise.', 401);
    }

    /** Ouvre la session de l'utilisateur : nouvel identifiant de session et nouveau jeton CSRF. */
    public static function connecter(int $utilisateurId): void
    {
        self::demarrer();
        session_regenerate_id(true);
        $_SESSION = [self::CLE_UTILISATEUR => $utilisateurId, self::CLE_JETON => bin2hex(random_bytes(32))];
        self::$utilisateur = null;
    }

    public static function deconnecter(): void
    {
        self::demarrer();
        $_SESSION = [];
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'],
            'httponly' => true, 'samesite' => 'Lax',
        ]);
        session_destroy();
        self::$utilisateur = null;
    }

    /** Jeton CSRF de la session, à renvoyer dans l'en-tête X-CSRF-Token de chaque écriture. */
    public static function jeton(): string
    {
        self::demarrer();
        if (!is_string($_SESSION[self::CLE_JETON] ?? null)) {
            $_SESSION[self::CLE_JETON] = bin2hex(random_bytes(32));
        }
        return $_SESSION[self::CLE_JETON];
    }

    /** Réponse 403 si l'en-tête X-CSRF-Token ne correspond pas au jeton de la session. */
    public static function verifierJeton(): void
    {
        $recu = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($recu) || $recu === '' || !hash_equals(self::jeton(), $recu)) {
            Reponse::erreur('Jeton de sécurité absent ou expiré : rechargez la page.', 403);
        }
    }
}
