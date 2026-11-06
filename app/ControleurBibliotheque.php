<?php
declare(strict_types=1);

/**
 * Portée et auteur des playlists et des médias ($type 'playlist' ou 'media', fixé par le routeur).
 * La portée se change par l'auteur ou un administrateur, l'auteur par un administrateur.
 */
final class ControleurBibliotheque
{
    /** GET /api/{playlists|medias}/{id}/portee */
    public static function lirePortee(string $type, int $id): never
    {
        $u = Auth::exigerConnexion();
        $objet = Droits::exigerObjet($u, $type, $id, 'voir');
        Reponse::json(self::portee($objet));
    }

    /**
     * PUT /api/{playlists|medias}/{id}/portee { portee, chaines: [id], utilisateurs: [id] }.
     * Playlist : refusé (409) si elle est programmée sur une chaîne que la nouvelle portée exclut.
     * Média : accepté ; avertissement si des playlists l'utilisent (elles continuent de l'afficher).
     */
    public static function modifierPortee(string $type, int $id): never
    {
        $u = Auth::exigerConnexion();
        $objet = Droits::exigerObjet($u, $type, $id, 'modifier');
        $portee = Bibliotheque::porteeEnvoyee(Requete::json(), $u, $objet['acces']);

        $avertissement = null;
        if ($type === 'playlist' && $portee['portee'] === 'restreinte') {
            $exclues = array_diff_key(
                Bibliotheque::chainesProgrammant([$id])[$id] ?? [],
                array_flip($portee['chaines'])
            );
            if ($exclues !== []) {
                Reponse::erreur(
                    'Cette playlist est programmée sur : ' . implode(', ', $exclues)
                    . '. Gardez ces chaînes dans sa portée, ou retirez-la d\'abord de leur programmation.',
                    409
                );
            }
        }
        if ($type === 'media' && $portee['portee'] === 'restreinte') {
            $playlists = Bibliotheque::utilisationsMedias()[$id] ?? [];
            if ($playlists !== []) {
                $lisibles = Bibliotheque::utilisationsLisibles($playlists, Bibliotheque::idsVisibles('playlist', $u));
                $avertissement = 'Ce média reste affiché par les playlists qui l\'utilisent déjà : '
                    . ControleurMedias::listeUtilisations($lisibles) . '.';
            }
        }

        ['table' => $table] = Bibliotheque::table($type);
        Db::transaction(static function () use ($table, $type, $id, $portee): void {
            Db::executer("UPDATE $table SET portee = ? WHERE id = ?", [$portee['portee'], $id]);
            Bibliotheque::ecrireAcces($type, $id, $portee['chaines'], $portee['utilisateurs']);
        });
        Reponse::json(self::portee(Bibliotheque::trouver($type, $id)) + ['avertissement' => $avertissement]);
    }

    /** PUT /api/{playlists|medias}/{id}/auteur { auteur_id } (admin) */
    public static function modifierAuteur(string $type, int $id): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        Bibliotheque::trouver($type, $id);
        $auteur = self::auteurActif(Requete::json()['auteur_id'] ?? null);
        ['table' => $table] = Bibliotheque::table($type);
        Db::executer("UPDATE $table SET auteur_id = ? WHERE id = ?", [$auteur, $id]);
        Reponse::json(['ok' => true]);
    }

    /**
     * POST /api/utilisateurs/{id}/transfert { vers } (admin) : toutes les playlists et tous les
     * médias dont l'utilisateur est l'auteur passent à un autre (ex. avant ou après désactivation).
     */
    public static function transferer(int $utilisateurId): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        if (Db::valeur('SELECT 1 FROM utilisateurs WHERE id = ?', [$utilisateurId]) === null) {
            Reponse::erreur('Utilisateur introuvable.', 404);
        }
        $vers = self::auteurActif(Requete::json()['vers'] ?? null);
        if ($vers === $utilisateurId) {
            Reponse::erreur('Choisissez un autre utilisateur.', 400);
        }
        $nombres = Db::transaction(static fn (): array => [
            'playlists' => Db::executer('UPDATE playlists SET auteur_id = ? WHERE auteur_id = ?', [$vers, $utilisateurId]),
            'medias' => Db::executer('UPDATE medias SET auteur_id = ? WHERE auteur_id = ?', [$vers, $utilisateurId]),
        ]);
        Reponse::json($nombres);
    }

    private static function auteurActif(mixed $id): int
    {
        if (!is_int($id) || Db::valeur('SELECT 1 FROM utilisateurs WHERE id = ? AND actif = 1', [$id]) === null) {
            Reponse::erreur('Auteur : utilisateur actif attendu.', 400);
        }
        return $id;
    }

    private static function portee(array $objet): array
    {
        return [
            'portee' => ControleurPlaylists::porteeAffichee($objet['portee'], $objet['acces']),
            'acces' => Bibliotheque::accesPublies($objet['acces'], Bibliotheque::noms([$objet['acces']])),
        ];
    }
}
