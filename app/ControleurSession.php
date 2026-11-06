<?php
declare(strict_types=1);

/** Connexion, déconnexion, utilisateur courant de l'éditeur et « Mon compte ». */
final class ControleurSession
{
    /** Échecs tolérés sur la fenêtre, par identifiant puis par adresse IP. */
    private const ECHECS_IDENTIFIANT = 5;
    private const ECHECS_IP = 20;
    private const FENETRE_MINUTES = 15;

    /** POST /api/connexion { identifiant, mot_de_passe } */
    public static function connexion(): never
    {
        $corps = Requete::json();
        $identifiant = trim((string) ($corps['identifiant'] ?? ''));
        $motDePasse = (string) ($corps['mot_de_passe'] ?? '');
        if ($identifiant === '' || $motDePasse === '' || mb_strlen($identifiant) > 64 || strlen($motDePasse) > 4096) {
            Reponse::erreur('Identifiant et mot de passe requis.', 400);
        }
        $ip = Requete::ip();

        $depuis = (new DateTimeImmutable('-' . self::FENETRE_MINUTES . ' minutes'))->format('Y-m-d H:i:s');
        $echecsIdentifiant = (int) Db::valeur('SELECT COUNT(*) FROM tentatives_connexion WHERE identifiant = ? AND quand > ?', [$identifiant, $depuis]);
        $echecsIp = (int) Db::valeur('SELECT COUNT(*) FROM tentatives_connexion WHERE ip = ? AND quand > ?', [$ip, $depuis]);
        if ($echecsIdentifiant >= self::ECHECS_IDENTIFIANT || $echecsIp >= self::ECHECS_IP) {
            header('Retry-After: ' . self::FENETRE_MINUTES * 60);
            Reponse::erreur('Trop de tentatives : réessayez dans ' . self::FENETRE_MINUTES . ' minutes.', 429);
        }

        $u = Db::ligne('SELECT id, mot_de_passe, actif FROM utilisateurs WHERE identifiant = ?', [$identifiant]);
        // Identifiant inconnu : on vérifie quand même un mot de passe, pour que la durée de la
        // réponse ne révèle pas quels identifiants existent.
        $empreinte = $u['mot_de_passe'] ?? password_hash(random_bytes(16), PASSWORD_DEFAULT);
        $valide = password_verify($motDePasse, $empreinte) && $u !== null && (int) $u['actif'] === 1;

        if (!$valide) {
            Db::executer('INSERT INTO tentatives_connexion (ip, identifiant) VALUES (?, ?)', [$ip, $identifiant]);
            Db::executer('DELETE FROM tentatives_connexion WHERE quand < ?', [(new DateTimeImmutable('-1 day'))->format('Y-m-d H:i:s')]);
            Reponse::erreur('Identifiant ou mot de passe incorrect.', 401);
        }

        Db::executer('DELETE FROM tentatives_connexion WHERE identifiant = ? AND ip = ?', [$identifiant, $ip]);
        if (password_needs_rehash($u['mot_de_passe'], PASSWORD_DEFAULT)) {
            Db::executer('UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?', [password_hash($motDePasse, PASSWORD_DEFAULT), $u['id']]);
        }
        Auth::connecter((int) $u['id']);
        self::moi();
    }

    /** POST /api/deconnexion (jeton CSRF vérifié par le routeur). */
    public static function deconnexion(): never
    {
        Auth::deconnecter();
        Reponse::json(['ok' => true]);
    }

    /** PUT /api/moi { nom } : chaque utilisateur peut changer son nom affiché. */
    public static function modifierMoi(): never
    {
        $u = Auth::exigerConnexion();
        $nom = ControleurUtilisateurs::nom(Requete::json()['nom'] ?? '');
        Db::executer('UPDATE utilisateurs SET nom = ? WHERE id = ?', [$nom, $u['id']]);
        Reponse::json(['utilisateur' => ['nom' => $nom] + $u]);
    }

    /**
     * PUT /api/moi/mot_de_passe { ancien, nouveau, confirmation } : l'ancien mot de passe est exigé
     * (ses échecs comptent comme des échecs de connexion) ; les autres sessions sont fermées.
     */
    public static function changerMotDePasse(): never
    {
        $u = Auth::exigerConnexion();
        $corps = Requete::json();
        $ancien = $corps['ancien'] ?? null;
        $nouveau = $corps['nouveau'] ?? null;
        if (!is_string($ancien) || $ancien === '' || strlen($ancien) > 4096) {
            Reponse::erreur('Saisissez votre mot de passe actuel.', 400);
        }
        if (!is_string($nouveau) || $nouveau !== ($corps['confirmation'] ?? null)) {
            Reponse::erreur('Les deux saisies du nouveau mot de passe ne sont pas identiques.', 400);
        }
        self::verifierMotDePasseActuel($u, $ancien);
        if ($nouveau === $ancien) {
            Reponse::erreur("Le nouveau mot de passe doit être différent de l'actuel.", 400);
        }
        Db::executer('UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?', [ControleurUtilisateurs::empreinte($nouveau), $u['id']]);
        Auth::fermerSessions($u['id']);
        Reponse::json(['ok' => true]);
    }

    /**
     * PUT /api/moi/identifiant { identifiant, mot_de_passe } : changer son identifiant de connexion,
     * mot de passe actuel exigé. Les sessions ouvertes restent valides.
     */
    public static function changerIdentifiant(): never
    {
        $u = Auth::exigerConnexion();
        $corps = Requete::json();
        $motDePasse = $corps['mot_de_passe'] ?? null;
        if (!is_string($motDePasse) || $motDePasse === '' || strlen($motDePasse) > 4096) {
            Reponse::erreur('Saisissez votre mot de passe actuel.', 400);
        }
        // Mot de passe d'abord : un « déjà utilisé » ne doit pas renseigner sur les comptes existants.
        self::verifierMotDePasseActuel($u, $motDePasse);
        $identifiant = ControleurUtilisateurs::identifiant($corps['identifiant'] ?? '', $u['id']);
        ControleurUtilisateurs::changerIdentifiant($u['id'], $u['identifiant'], $identifiant);
        Reponse::json(['utilisateur' => ['identifiant' => $identifiant] + $u]);
    }

    /** 429 après trop d'échecs, 403 si le mot de passe ne correspond pas (échec noté comme à la connexion). */
    private static function verifierMotDePasseActuel(array $u, string $motDePasse): void
    {
        $depuis = (new DateTimeImmutable('-' . self::FENETRE_MINUTES . ' minutes'))->format('Y-m-d H:i:s');
        $echecs = (int) Db::valeur('SELECT COUNT(*) FROM tentatives_connexion WHERE identifiant = ? AND quand > ?', [$u['identifiant'], $depuis]);
        if ($echecs >= self::ECHECS_IDENTIFIANT) {
            header('Retry-After: ' . self::FENETRE_MINUTES * 60);
            Reponse::erreur('Trop de tentatives : réessayez dans ' . self::FENETRE_MINUTES . ' minutes.', 429);
        }
        $empreinte = (string) Db::valeur('SELECT mot_de_passe FROM utilisateurs WHERE id = ?', [$u['id']]);
        if (!password_verify($motDePasse, $empreinte)) {
            Db::executer('INSERT INTO tentatives_connexion (ip, identifiant) VALUES (?, ?)', [Requete::ip(), $u['identifiant']]);
            Reponse::erreur('Mot de passe actuel incorrect.', 403);
        }
    }

    /**
     * GET /api/moi : utilisateur connecté et jeton CSRF, ou { utilisateur: null } sans session
     * (200 dans les deux cas : l'éditeur l'appelle à chaque chargement pour savoir où il en est).
     */
    public static function moi(): never
    {
        $u = Auth::utilisateur();
        Reponse::json($u === null ? ['utilisateur' => null] : ['utilisateur' => $u, 'jeton' => Auth::jeton()]);
    }
}
