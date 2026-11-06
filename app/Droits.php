<?php
declare(strict_types=1);

/**
 * Droits d'un utilisateur connecté. Un administrateur peut tout ; un éditeur ne gère que les
 * chaînes listées pour lui dans la table `droits`.
 *
 * Playlists et médias (bibliothèque partagée) : visibles par leur auteur, les administrateurs,
 * tout le monde si leur portée est globale, sinon par les utilisateurs listés et les éditeurs
 * des chaînes listées (table playlist_acces / media_acces) ; modifiables par leur auteur et les
 * administrateurs seulement.
 * Chaque route de l'éditeur appelle ces vérifications : masquer un bouton ne protège rien.
 */
final class Droits
{
    public static function estAdmin(array $utilisateur): bool
    {
        return ($utilisateur['role'] ?? null) === 'admin';
    }

    public static function peutModifier(array $utilisateur, int $chaineId): bool
    {
        if (self::estAdmin($utilisateur)) {
            return true;
        }
        return Db::valeur(
            'SELECT 1 FROM droits WHERE utilisateur_id = ? AND chaine_id = ?',
            [(int) $utilisateur['id'], $chaineId]
        ) !== null;
    }

    /** Réponse 403 si l'utilisateur n'est pas administrateur. */
    public static function exigerAdmin(array $utilisateur): void
    {
        if (!self::estAdmin($utilisateur)) {
            Reponse::erreur('Réservé aux administrateurs.', 403);
        }
    }

    /** Réponse 404 si la chaîne n'existe pas, 403 si l'utilisateur n'a pas de droit sur elle. */
    public static function exigerChaine(array $utilisateur, int $chaineId): void
    {
        if (Db::valeur('SELECT 1 FROM chaines WHERE id = ?', [$chaineId]) === null) {
            Reponse::erreur('Chaîne introuvable.', 404);
        }
        if (!self::peutModifier($utilisateur, $chaineId)) {
            Reponse::erreur("Vous n'avez pas de droit sur cette chaîne.", 403);
        }
    }

    /**
     * Condition SQL « l'objet o est visible par l'utilisateur », pour une requête
     * `FROM playlists o` ou `FROM medias o`.
     *
     * @return array{0: string, 1: list<int>} fragment SQL et ses paramètres
     */
    public static function sqlVisible(string $type, array $utilisateur): array
    {
        ['acces' => $acces, 'cle' => $cle] = Bibliotheque::table($type);
        $id = (int) $utilisateur['id'];
        return [
            "(? = 1 OR o.auteur_id = ? OR o.portee = 'globale' OR EXISTS (
                SELECT 1 FROM $acces a WHERE a.$cle = o.id
                AND (a.utilisateur_id = ? OR a.chaine_id IN (SELECT d.chaine_id FROM droits d WHERE d.utilisateur_id = ?))))",
            [self::estAdmin($utilisateur) ? 1 : 0, $id, $id, $id],
        ];
    }

    /**
     * @param array $objet ligne de playlists ou medias (auteur_id, portee)
     * @param array{chaines: list<int>, utilisateurs: list<int>} $acces
     */
    public static function voir(array $utilisateur, array $objet, array $acces): bool
    {
        if (self::peutModifierObjet($utilisateur, $objet) || $objet['portee'] === 'globale'
            || in_array((int) $utilisateur['id'], $acces['utilisateurs'], true)) {
            return true;
        }
        foreach ($acces['chaines'] as $chaineId) {
            if (self::peutModifier($utilisateur, $chaineId)) {
                return true;
            }
        }
        return false;
    }

    /** Modifier le contenu, la portée, ou supprimer : auteur et administrateurs. */
    public static function peutModifierObjet(array $utilisateur, array $objet): bool
    {
        return self::estAdmin($utilisateur)
            || ($objet['auteur_id'] !== null && (int) $objet['auteur_id'] === (int) $utilisateur['id']);
    }

    /**
     * Ajouter la playlist à la programmation de la chaîne : droit sur la chaîne, et playlist
     * ouverte à cette chaîne ou à cet utilisateur (l'auteur et les administrateurs le peuvent
     * toujours).
     */
    public static function peutProgrammer(array $utilisateur, array $playlist, array $acces, int $chaineId): bool
    {
        return self::peutModifier($utilisateur, $chaineId)
            && (self::peutModifierObjet($utilisateur, $playlist)
                || $playlist['portee'] === 'globale'
                || in_array($chaineId, $acces['chaines'], true)
                || in_array((int) $utilisateur['id'], $acces['utilisateurs'], true));
    }

    /**
     * Playlist ou média, avec ses accès (clé `acces`) ; réponse 404 s'il n'existe pas, 403 si
     * l'utilisateur ne peut pas le voir ($niveau 'voir') ou le modifier ($niveau 'modifier').
     */
    public static function exigerObjet(array $utilisateur, string $type, int $id, string $niveau): array
    {
        $objet = Bibliotheque::trouver($type, $id);
        $libelle = $type === 'playlist' ? 'cette playlist' : 'ce média';
        if ($niveau === 'modifier' && !self::peutModifierObjet($utilisateur, $objet)) {
            Reponse::erreur("Seuls l'auteur et les administrateurs peuvent modifier $libelle.", 403);
        }
        if (!self::voir($utilisateur, $objet, $objet['acces'])) {
            Reponse::erreur("Vous n'avez pas accès à $libelle.", 403);
        }
        return $objet;
    }
}
