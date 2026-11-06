<?php
declare(strict_types=1);

/**
 * Outils communs aux playlists et médias de la bibliothèque partagée : accès (portée restreinte),
 * chaînes qui programment une playlist, playlists qui utilisent un média.
 *
 * Invariant de diffusion : une playlist programmée sur une chaîne (plage ou playlist par défaut)
 * est globale, ou a cette chaîne dans ses accès. ControleurProgrammation ajoute la chaîne aux
 * accès au besoin, et ControleurBibliotheque refuse une portée qui le romprait.
 */
final class Bibliotheque
{
    /** Nom affiché d'un utilisateur, pour une jointure `utilisateurs` d'alias $alias. */
    public static function sqlNom(string $alias): string
    {
        return "COALESCE(NULLIF($alias.nom, ''), $alias.identifiant)";
    }

    /** @return array{table: string, acces: string, cle: string} noms fixes, jamais saisis */
    public static function table(string $type): array
    {
        return match ($type) {
            'playlist' => ['table' => 'playlists', 'acces' => 'playlist_acces', 'cle' => 'playlist_id'],
            'media' => ['table' => 'medias', 'acces' => 'media_acces', 'cle' => 'media_id'],
        };
    }

    /** Ligne de la playlist ou du média, avec `acces` ; réponse 404 s'il n'existe pas. */
    public static function trouver(string $type, int $id): array
    {
        ['table' => $table] = self::table($type);
        $objet = Db::ligne("SELECT * FROM $table WHERE id = ?", [$id])
            ?? Reponse::erreur($type === 'playlist' ? 'Playlist introuvable.' : 'Média introuvable.', 404);
        $objet['acces'] = self::acces($type, [$id])[$id];
        return $objet;
    }

    /**
     * Accès de plusieurs objets.
     *
     * @param list<int> $ids
     * @return array<int, array{chaines: list<int>, utilisateurs: list<int>}>
     */
    public static function acces(string $type, array $ids): array
    {
        ['acces' => $acces, 'cle' => $cle] = self::table($type);
        $resultat = [];
        foreach ($ids as $id) {
            $resultat[$id] = ['chaines' => [], 'utilisateurs' => []];
        }
        if ($ids === []) {
            return $resultat;
        }
        $marques = implode(', ', array_fill(0, count($ids), '?'));
        foreach (Db::lignes("SELECT $cle AS objet, chaine_id, utilisateur_id FROM $acces WHERE $cle IN ($marques) ORDER BY id", $ids) as $a) {
            if ($a['chaine_id'] !== null) {
                $resultat[(int) $a['objet']]['chaines'][] = (int) $a['chaine_id'];
            } elseif ($a['utilisateur_id'] !== null) {
                $resultat[(int) $a['objet']]['utilisateurs'][] = (int) $a['utilisateur_id'];
            }
        }
        return $resultat;
    }

    /** Remplace les accès d'un objet (à appeler dans une transaction). */
    public static function ecrireAcces(string $type, int $id, array $chaines, array $utilisateurs): void
    {
        ['acces' => $acces, 'cle' => $cle] = self::table($type);
        Db::executer("DELETE FROM $acces WHERE $cle = ?", [$id]);
        foreach (array_unique($chaines) as $c) {
            Db::executer("INSERT INTO $acces ($cle, chaine_id) VALUES (?, ?)", [$id, $c]);
        }
        foreach (array_unique($utilisateurs) as $u) {
            Db::executer("INSERT INTO $acces ($cle, utilisateur_id) VALUES (?, ?)", [$id, $u]);
        }
    }

    /** Identifiants des playlists ou médias visibles par l'utilisateur. */
    public static function idsVisibles(string $type, array $utilisateur): array
    {
        ['table' => $table] = self::table($type);
        [$visible, $params] = Droits::sqlVisible($type, $utilisateur);
        return array_map('intval', array_column(Db::lignes("SELECT o.id FROM $table o WHERE $visible", $params), 'id'));
    }

    /**
     * Noms des playlists qui utilisent un média, lisibles par l'utilisateur : celles qu'il ne voit
     * pas sont seulement comptées.
     *
     * @param array<int, string> $playlists playlist → nom
     * @return array{noms: list<string>, autres: int}
     */
    public static function utilisationsLisibles(array $playlists, array $visibles): array
    {
        $noms = array_values(array_intersect_key($playlists, array_flip($visibles)));
        return ['noms' => $noms, 'autres' => count($playlists) - count($noms)];
    }

    /** Ajoute une chaîne aux accès d'un objet si elle n'y est pas déjà. */
    public static function ajouterChaine(string $type, int $id, int $chaineId): void
    {
        ['acces' => $acces, 'cle' => $cle] = self::table($type);
        if (Db::valeur("SELECT 1 FROM $acces WHERE $cle = ? AND chaine_id = ?", [$id, $chaineId]) === null) {
            Db::executer("INSERT INTO $acces ($cle, chaine_id) VALUES (?, ?)", [$id, $chaineId]);
        }
    }

    /** Noms des chaînes et utilisateurs d'un ou plusieurs accès : [id => nom]. */
    public static function noms(array $accesParObjet): array
    {
        $chaines = $utilisateurs = [];
        foreach ($accesParObjet as $a) {
            $chaines = array_merge($chaines, $a['chaines']);
            $utilisateurs = array_merge($utilisateurs, $a['utilisateurs']);
        }
        $lire = static function (string $sql, array $ids): array {
            $ids = array_values(array_unique($ids));
            if ($ids === []) {
                return [];
            }
            $marques = implode(', ', array_fill(0, count($ids), '?'));
            return array_column(Db::lignes(sprintf($sql, $marques), $ids), 'nom', 'id');
        };
        return [
            'chaines' => $lire('SELECT id, nom FROM chaines WHERE id IN (%s)', $chaines),
            'utilisateurs' => $lire('SELECT u.id, ' . self::sqlNom('u') . ' AS nom FROM utilisateurs u WHERE u.id IN (%s)', $utilisateurs),
        ];
    }

    /** Accès pour l'éditeur : chaînes et utilisateurs avec leur nom. */
    public static function accesPublies(array $acces, array $noms): array
    {
        $liste = static fn (array $ids, array $parId): array => array_map(
            static fn (int $id): array => ['id' => $id, 'nom' => (string) ($parId[$id] ?? '?')],
            $ids
        );
        return [
            'chaines' => $liste($acces['chaines'], $noms['chaines']),
            'utilisateurs' => $liste($acces['utilisateurs'], $noms['utilisateurs']),
        ];
    }

    /**
     * Chaînes qui programment chaque playlist (plage ou playlist par défaut).
     *
     * @return array<int, array<int, string>> playlist → [chaîne → nom]
     */
    public static function chainesProgrammant(?array $playlistIds = null): array
    {
        $filtre = '';
        if ($playlistIds !== null) {
            if ($playlistIds === []) {
                return [];
            }
            $marques = implode(', ', array_fill(0, count($playlistIds), '?'));
            $filtre = "WHERE x.playlist_id IN ($marques)";
        }
        $lignes = Db::lignes(
            "SELECT x.playlist_id, c.id, c.nom FROM (
                SELECT playlist_id, chaine_id FROM programmations
                UNION SELECT playlist_defaut_id, id FROM chaines WHERE playlist_defaut_id IS NOT NULL
             ) x JOIN chaines c ON c.id = x.chaine_id
             $filtre ORDER BY c.nom",
            $playlistIds === null ? [] : $playlistIds
        );
        $resultat = [];
        foreach ($lignes as $l) {
            $resultat[(int) $l['playlist_id']][(int) $l['id']] = $l['nom'];
        }
        return $resultat;
    }

    /** Identifiants des playlists programmées sur une chaîne (plages et playlist par défaut). */
    public static function playlistsProgrammees(int $chaineId): array
    {
        return array_map('intval', array_column(Db::lignes(
            'SELECT playlist_id AS id FROM programmations WHERE chaine_id = ?
             UNION SELECT playlist_defaut_id FROM chaines WHERE id = ? AND playlist_defaut_id IS NOT NULL',
            [$chaineId, $chaineId]
        ), 'id'));
    }

    /** Fait recharger l'affichage des chaînes qui programment cette playlist. */
    public static function chainesModifiees(int $playlistId): void
    {
        $chaines = array_keys(self::chainesProgrammant([$playlistId])[$playlistId] ?? []);
        if ($chaines !== []) {
            $marques = implode(', ', array_fill(0, count($chaines), '?'));
            Db::executer("UPDATE chaines SET version = version + 1 WHERE id IN ($marques)", $chaines);
        }
    }

    /**
     * Playlists qui utilisent chaque média (images et vidéos d'un widget média, logo d'un code QR).
     *
     * @return array<int, array<int, string>> média → [playlist → nom]
     */
    public static function utilisationsMedias(): array
    {
        $resultat = [];
        foreach (Db::lignes('SELECT id, nom, pages FROM playlists ORDER BY nom') as $p) {
            foreach (Pages::medias(Pages::lire((string) $p['pages'], (int) $p['id'])) as $mediaId) {
                $resultat[$mediaId][(int) $p['id']] = $p['nom'];
            }
        }
        return $resultat;
    }

    /**
     * Portée envoyée par l'éditeur { portee, chaines: [id], utilisateurs: [id] }, vérifiée.
     * Un éditeur ne peut ajouter que ses propres chaînes, mais garde ou retire les autres.
     *
     * @return array{portee: string, chaines: list<int>, utilisateurs: list<int>}
     */
    public static function porteeEnvoyee(array $corps, array $utilisateur, array $accesActuels): array
    {
        $portee = $corps['portee'] ?? null;
        if (!in_array($portee, ['globale', 'restreinte'], true)) {
            Reponse::erreur('Portée : « globale » ou « restreinte ».', 400);
        }
        $liste = static function (mixed $valeur, string $nom): array {
            if ($valeur === null) {
                return [];
            }
            if (!is_array($valeur) || !array_is_list($valeur) || count($valeur) > 500) {
                Reponse::erreur("$nom : liste d'identifiants attendue.", 400);
            }
            foreach ($valeur as $id) {
                if (!is_int($id) || $id < 1) {
                    Reponse::erreur("$nom : liste d'identifiants attendue.", 400);
                }
            }
            return array_values(array_unique($valeur));
        };
        $chaines = $liste($corps['chaines'] ?? null, 'Chaînes');
        $utilisateurs = $liste($corps['utilisateurs'] ?? null, 'Utilisateurs');

        foreach ($chaines as $c) {
            if (in_array($c, $accesActuels['chaines'], true)) {
                continue;
            }
            if (Db::valeur('SELECT 1 FROM chaines WHERE id = ?', [$c]) === null) {
                Reponse::erreur('Chaîne introuvable.', 400);
            }
            if (!Droits::peutModifier($utilisateur, $c)) {
                Reponse::erreur("Vous ne pouvez ouvrir l'accès qu'à vos propres chaînes.", 403);
            }
        }
        foreach ($utilisateurs as $u) {
            if (!in_array($u, $accesActuels['utilisateurs'], true)
                && Db::valeur('SELECT 1 FROM utilisateurs WHERE id = ? AND actif = 1', [$u]) === null) {
                Reponse::erreur('Utilisateur introuvable ou désactivé.', 400);
            }
        }
        return ['portee' => $portee, 'chaines' => $chaines, 'utilisateurs' => $utilisateurs];
    }
}
