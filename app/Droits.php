<?php
declare(strict_types=1);

/**
 * Droits d'un utilisateur connecté. Un administrateur peut tout ; un éditeur ne lit et ne
 * modifie que les chaînes listées pour lui dans la table `droits`.
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
}
