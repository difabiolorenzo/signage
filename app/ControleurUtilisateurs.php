<?php
declare(strict_types=1);

/**
 * Comptes et droits (administrateurs uniquement). Un compte n'est jamais supprimé : il est
 * désactivé (ses sessions sont refusées à la requête suivante, voir Auth::utilisateur).
 * Il reste toujours au moins un administrateur actif.
 */
final class ControleurUtilisateurs
{
    public const MOT_DE_PASSE_MIN = 10;

    /** GET /api/utilisateurs */
    public static function liste(): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        $droits = [];
        foreach (Db::lignes('SELECT utilisateur_id, chaine_id FROM droits ORDER BY chaine_id') as $d) {
            $droits[(int) $d['utilisateur_id']][] = (int) $d['chaine_id'];
        }
        $lignes = Db::lignes('SELECT id, identifiant, nom, role, actif, cree_le FROM utilisateurs ORDER BY actif DESC, identifiant');
        Reponse::json(['utilisateurs' => array_map(static fn (array $u): array => [
            'id' => (int) $u['id'],
            'identifiant' => $u['identifiant'],
            'nom' => $u['nom'],
            'role' => $u['role'],
            'actif' => (int) $u['actif'] === 1,
            'cree_le' => $u['cree_le'],
            'chaines' => $droits[(int) $u['id']] ?? [],
        ], $lignes)]);
    }

    /** POST /api/utilisateurs { identifiant, nom, role, mot_de_passe } */
    public static function creer(): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        $corps = Requete::json();
        $identifiant = self::identifiant($corps['identifiant'] ?? '', null);
        $nom = self::nom($corps['nom'] ?? '');
        $role = self::role($corps['role'] ?? 'editeur');
        $empreinte = self::empreinte($corps['mot_de_passe'] ?? null);
        Db::executer(
            'INSERT INTO utilisateurs (identifiant, mot_de_passe, nom, role) VALUES (?, ?, ?, ?)',
            [$identifiant, $empreinte, $nom, $role]
        );
        Reponse::json(['id' => Db::dernierId()], 201);
    }

    /** PUT /api/utilisateurs/{id} { identifiant?, nom?, role?, actif?, mot_de_passe? } */
    public static function modifier(int $id): never
    {
        $moi = Auth::exigerConnexion();
        Droits::exigerAdmin($moi);
        $u = Db::ligne('SELECT id, identifiant, nom, role, actif FROM utilisateurs WHERE id = ?', [$id])
            ?? Reponse::erreur('Utilisateur introuvable.', 404);
        $corps = Requete::json();
        $identifiant = array_key_exists('identifiant', $corps) ? self::identifiant($corps['identifiant'], $id) : $u['identifiant'];

        $nom = array_key_exists('nom', $corps) ? self::nom($corps['nom']) : $u['nom'];
        $role = array_key_exists('role', $corps) ? self::role($corps['role']) : $u['role'];
        $actif = array_key_exists('actif', $corps) ? $corps['actif'] : (int) $u['actif'] === 1;
        if (!is_bool($actif)) {
            Reponse::erreur('actif : vrai ou faux attendu.', 400);
        }
        $estMoi = $id === (int) $moi['id'];
        if ($estMoi && (!$actif || $role !== 'admin')) {
            Reponse::erreur('Vous ne pouvez ni désactiver votre propre compte ni retirer votre rôle d\'administrateur.', 409);
        }
        // Retirer le dernier administrateur actif bloquerait toute gestion des comptes.
        $etaitAdminActif = $u['role'] === 'admin' && (int) $u['actif'] === 1;
        if ($etaitAdminActif && ($role !== 'admin' || !$actif)) {
            $autres = (int) Db::valeur("SELECT COUNT(*) FROM utilisateurs WHERE role = 'admin' AND actif = 1 AND id <> ?", [$id]);
            if ($autres === 0) {
                Reponse::erreur('Il doit rester au moins un administrateur actif.', 409);
            }
        }

        Db::executer('UPDATE utilisateurs SET nom = ?, role = ?, actif = ? WHERE id = ?', [$nom, $role, $actif ? 1 : 0, $id]);
        self::changerIdentifiant($id, $u['identifiant'], $identifiant);
        if (array_key_exists('mot_de_passe', $corps)) {
            Db::executer('UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?', [self::empreinte($corps['mot_de_passe']), $id]);
            Auth::fermerSessions($id);
        }
        Reponse::json(['ok' => true]);
    }

    /**
     * GET /api/annuaire (connecté) : identifiant numérique et nom des utilisateurs actifs, pour
     * choisir la portée d'une playlist ou d'un média. Rien d'autre (ni identifiant de connexion, ni rôle).
     */
    public static function annuaire(): never
    {
        Auth::exigerConnexion();
        $lignes = Db::lignes('SELECT u.id, ' . Bibliotheque::sqlNom('u') . ' AS nom FROM utilisateurs u WHERE u.actif = 1 ORDER BY nom');
        Reponse::json(['utilisateurs' => array_map(static fn (array $u): array => ['id' => (int) $u['id'], 'nom' => $u['nom']], $lignes)]);
    }

    /**
     * PUT /api/utilisateurs/{id}/droits { chaines: [id, …] } : remplace la liste des chaînes.
     * avertissement : playlists dont il est l'auteur et qui restent programmées sur une chaîne
     * qu'il perd (il peut toujours les modifier).
     */
    public static function droits(int $id): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        if (Db::valeur('SELECT 1 FROM utilisateurs WHERE id = ?', [$id]) === null) {
            Reponse::erreur('Utilisateur introuvable.', 404);
        }
        $chaines = Requete::json()['chaines'] ?? null;
        if (!is_array($chaines) || !array_is_list($chaines)) {
            Reponse::erreur('chaines : liste attendue.', 400);
        }
        $existantes = array_map('intval', array_column(Db::lignes('SELECT id FROM chaines'), 'id'));
        foreach ($chaines as $c) {
            if (!is_int($c) || !in_array($c, $existantes, true)) {
                Reponse::erreur('Chaîne introuvable.', 400);
            }
        }
        $perdues = array_diff(
            array_map('intval', array_column(Db::lignes('SELECT chaine_id FROM droits WHERE utilisateur_id = ?', [$id]), 'chaine_id')),
            $chaines
        );
        Db::transaction(static function () use ($id, $chaines): void {
            Db::executer('DELETE FROM droits WHERE utilisateur_id = ?', [$id]);
            foreach (array_unique($chaines) as $c) {
                Db::executer('INSERT INTO droits (utilisateur_id, chaine_id) VALUES (?, ?)', [$id, $c]);
            }
        });

        $concernees = [];
        if ($perdues !== []) {
            $siennes = array_column(Db::lignes('SELECT id, nom FROM playlists WHERE auteur_id = ?', [$id]), 'nom', 'id');
            foreach (Bibliotheque::chainesProgrammant(array_map('intval', array_keys($siennes))) as $playlistId => $chainesPlaylist) {
                foreach (array_intersect_key($chainesPlaylist, array_flip($perdues)) as $nomChaine) {
                    $concernees[] = "« {$siennes[$playlistId]} » ($nomChaine)";
                }
            }
        }
        Reponse::json(['ok' => true, 'avertissement' => $concernees === [] ? null
            : 'Cet utilisateur reste auteur de playlists diffusées sur des chaînes qu\'il ne gère plus, et peut toujours les modifier : '
                . implode(', ', $concernees) . '. Transférez-les ou retirez-les de la programmation si besoin.']);
    }

    /**
     * Identifiant de connexion valide et libre (en dehors du compte $id) ; sinon 400 ou 409.
     * La comparaison suit la collation de la table : « Marie » et « marie » sont le même identifiant.
     */
    public static function identifiant(mixed $valeur, ?int $id): string
    {
        $identifiant = trim((string) $valeur);
        if (!preg_match('/^[A-Za-z0-9._-]{3,64}$/', $identifiant)) {
            Reponse::erreur('Identifiant : 3 à 64 caractères parmi lettres sans accent, chiffres, point, tiret et tiret bas.', 400);
        }
        if (Db::valeur('SELECT 1 FROM utilisateurs WHERE identifiant = ? AND id <> ?', [$identifiant, $id ?? 0]) !== null) {
            Reponse::erreur("L'identifiant « $identifiant » est déjà utilisé.", 409);
        }
        return $identifiant;
    }

    /**
     * Remplace l'identifiant de connexion. Les sessions ouvertes restent valides (elles reposent
     * sur l'id) ; les échecs de connexion notés sous l'ancien identifiant sont effacés.
     */
    public static function changerIdentifiant(int $id, string $ancien, string $nouveau): void
    {
        if ($nouveau === $ancien) {
            return;
        }
        Db::transaction(static function () use ($id, $ancien, $nouveau): void {
            Db::executer('UPDATE utilisateurs SET identifiant = ? WHERE id = ?', [$nouveau, $id]);
            Db::executer('DELETE FROM tentatives_connexion WHERE identifiant = ?', [$ancien]);
        });
    }

    public static function nom(mixed $nom): string
    {
        $nom = trim((string) $nom);
        if (mb_strlen($nom) > 100) {
            Reponse::erreur('Nom : 100 caractères au plus.', 400);
        }
        return $nom;
    }

    private static function role(mixed $role): string
    {
        if (!in_array($role, ['admin', 'editeur'], true)) {
            Reponse::erreur('Rôle : admin ou editeur.', 400);
        }
        return $role;
    }

    public static function empreinte(mixed $motDePasse): string
    {
        if (!is_string($motDePasse) || mb_strlen($motDePasse) < self::MOT_DE_PASSE_MIN || strlen($motDePasse) > 4096) {
            Reponse::erreur('Mot de passe : ' . self::MOT_DE_PASSE_MIN . ' caractères au moins.', 400);
        }
        return password_hash($motDePasse, PASSWORD_DEFAULT);
    }
}
