<?php
declare(strict_types=1);

/** Lecture de la requête HTTP. */
final class Requete
{
    /** Corps JSON (objet) de la requête ; réponse 400 s'il est absent ou invalide. */
    public static function json(): array
    {
        $type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
        if (!str_starts_with($type, 'application/json')) {
            Reponse::erreur('Corps attendu au format JSON (Content-Type: application/json).', 400);
        }
        $donnees = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($donnees)) {
            Reponse::erreur('Corps JSON invalide.', 400);
        }
        return $donnees;
    }

    /** Adresse IP du client (celle vue par Apache : pas d'en-tête de proxy, falsifiable). */
    public static function ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    }
}
