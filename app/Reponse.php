<?php
declare(strict_types=1);

/** Réponses JSON de l'API. Une erreur a toujours la forme { "erreur": "message lisible" }. */
final class Reponse
{
    public static function json(mixed $donnees, int $code = 200): never
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($donnees, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        exit;
    }

    /** 400 requête invalide, 401 non connecté, 403 interdit, 404 introuvable, 409 conflit, 500 erreur serveur. */
    public static function erreur(string $message, int $code = 400, array $details = []): never
    {
        $corps = ['erreur' => $message];
        if ($details !== []) {
            $corps['details'] = $details;
        }
        self::json($corps, $code);
    }

    /**
     * Toute exception non attrapée devient une erreur 500 en JSON. Le détail technique part
     * dans le journal d'erreurs de PHP, jamais vers le navigateur.
     */
    public static function capturerErreurs(): void
    {
        set_exception_handler(static function (Throwable $e): void {
            error_log((string) $e);
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
            }
            echo json_encode(['erreur' => 'Erreur interne du serveur.'], JSON_UNESCAPED_UNICODE);
        });
    }
}
