<?php
declare(strict_types=1);

/** Chaînes vues depuis l'éditeur (connexion requise ; écriture réservée aux administrateurs). */
final class ControleurChaines
{
    /** nb_playlists : playlists programmées (plages et playlist par défaut). */
    private const COLONNES = 'c.id, c.slug, c.nom, c.orientation, c.playlist_defaut_id, c.version, c.modifie_le,
        (SELECT COUNT(DISTINCT pr.playlist_id) FROM programmations pr
         WHERE pr.chaine_id = c.id AND pr.playlist_id <> COALESCE(c.playlist_defaut_id, 0))
        + (c.playlist_defaut_id IS NOT NULL) AS nb_playlists';

    /** GET /api/chaines : toutes pour un administrateur, celles de ses droits pour un éditeur. */
    public static function liste(): never
    {
        $u = Auth::exigerConnexion();
        $lignes = Droits::estAdmin($u)
            ? Db::lignes('SELECT ' . self::COLONNES . ' FROM chaines c ORDER BY c.nom')
            : Db::lignes(
                'SELECT ' . self::COLONNES . ' FROM chaines c JOIN droits d ON d.chaine_id = c.id
                 WHERE d.utilisateur_id = ? ORDER BY c.nom',
                [$u['id']]
            );
        Reponse::json(['chaines' => array_map([self::class, 'publier'], $lignes)]);
    }

    /** GET /api/chaines/{id} */
    public static function detail(int $id): never
    {
        $u = Auth::exigerConnexion();
        Droits::exigerChaine($u, $id);
        Reponse::json(['chaine' => self::lire($id)]);
    }

    /** POST /api/chaines { nom, slug, orientation } (admin) */
    public static function creer(): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        $c = self::valider(Requete::json(), null);
        Db::executer('INSERT INTO chaines (nom, slug, orientation) VALUES (?, ?, ?)', [$c['nom'], $c['slug'], $c['orientation']]);
        Reponse::json(['chaine' => self::lire(Db::dernierId())], 201);
    }

    /**
     * PUT /api/chaines/{id} { nom?, slug?, orientation? } (admin) ; changer d'orientation est refusé
     * (409) tant que des playlists de l'ancienne orientation y sont programmées.
     */
    public static function modifier(int $id): never
    {
        $u = Auth::exigerConnexion();
        Droits::exigerAdmin($u);
        Droits::exigerChaine($u, $id);
        $actuelle = Db::ligne('SELECT nom, slug, orientation FROM chaines WHERE id = ?', [$id]);
        $c = self::valider(Requete::json(), $actuelle + ['id' => $id]);
        if ($c['orientation'] !== $actuelle['orientation']) {
            $ids = Bibliotheque::playlistsProgrammees($id);
            $autres = [];
            if ($ids !== []) {
                $marques = implode(', ', array_fill(0, count($ids), '?'));
                foreach (Db::lignes("SELECT nom, disposition FROM playlists WHERE id IN ($marques) ORDER BY nom", $ids) as $p) {
                    if (ControleurPlaylists::orientation($p['disposition']) !== $c['orientation']) {
                        $autres[] = $p['nom'];
                    }
                }
            }
            if ($autres !== []) {
                Reponse::erreur('Ces playlists programmées sur la chaîne sont en ' . $actuelle['orientation'] . ' : '
                    . implode(', ', $autres) . '. Retirez-les de la programmation avant de changer d\'orientation.', 409);
            }
        }
        Db::executer(
            'UPDATE chaines SET nom = ?, slug = ?, orientation = ?, version = version + 1 WHERE id = ?',
            [$c['nom'], $c['slug'], $c['orientation'], $id]
        );
        Reponse::json(['chaine' => self::lire($id)]);
    }

    /**
     * DELETE /api/chaines/{id} (admin) : supprime sa programmation et ses droits. Ses playlists et
     * médias restent dans la bibliothèque ; ceux qui n'étaient ouverts qu'à elle deviennent privés.
     */
    public static function supprimer(int $id): never
    {
        $u = Auth::exigerConnexion();
        Droits::exigerAdmin($u);
        Droits::exigerChaine($u, $id);
        Db::executer('DELETE FROM chaines WHERE id = ?', [$id]);
        Reponse::json(['ok' => true]);
    }

    /**
     * Champs d'une chaîne, complétés par $actuelle pour une modification ; réponse 400 ou 409
     * en cas de valeur refusée.
     */
    private static function valider(array $corps, ?array $actuelle): array
    {
        $nom = array_key_exists('nom', $corps) ? trim((string) $corps['nom']) : ($actuelle['nom'] ?? '');
        $slug = array_key_exists('slug', $corps) ? trim((string) $corps['slug']) : ($actuelle['slug'] ?? '');
        $orientation = array_key_exists('orientation', $corps) ? (string) $corps['orientation'] : ($actuelle['orientation'] ?? 'paysage');

        $erreurs = [];
        if ($nom === '' || mb_strlen($nom) > 100) {
            $erreurs['nom'] = 'Nom : 1 à 100 caractères.';
        }
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug) || strlen($slug) > 64) {
            $erreurs['slug'] = 'Adresse : 1 à 64 caractères parmi minuscules sans accent, chiffres et tirets (ex. « hall-accueil »).';
        }
        if (!in_array($orientation, ['paysage', 'portrait'], true)) {
            $erreurs['orientation'] = 'Orientation : paysage ou portrait.';
        }
        if ($erreurs !== []) {
            Reponse::erreur(implode(' ', $erreurs), 400, $erreurs);
        }
        $doublon = Db::valeur('SELECT id FROM chaines WHERE slug = ? AND id <> ?', [$slug, $actuelle['id'] ?? 0]);
        if ($doublon !== null) {
            Reponse::erreur("L'adresse « $slug » est déjà utilisée par une autre chaîne.", 409, ['slug' => 'Adresse déjà utilisée.']);
        }
        return ['nom' => $nom, 'slug' => $slug, 'orientation' => $orientation];
    }

    private static function lire(int $id): array
    {
        return self::publier(Db::ligne('SELECT ' . self::COLONNES . ' FROM chaines c WHERE c.id = ?', [$id]));
    }

    private static function publier(array $c): array
    {
        $base = (string) Config::get('url_base');
        return [
            'id' => (int) $c['id'],
            'slug' => $c['slug'],
            'nom' => $c['nom'],
            'orientation' => $c['orientation'],
            'playlist_defaut_id' => $c['playlist_defaut_id'] === null ? null : (int) $c['playlist_defaut_id'],
            'version' => (int) $c['version'],
            'modifie_le' => $c['modifie_le'],
            'nb_playlists' => (int) $c['nb_playlists'],
            'lien_public' => $base . '/?chaine=' . rawurlencode($c['slug']),
        ];
    }
}
