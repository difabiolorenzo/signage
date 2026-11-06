<?php
declare(strict_types=1);

/**
 * Accès à la base. Toutes les requêtes passent par des requêtes préparées :
 * les valeurs ne sont jamais concaténées dans le SQL, elles vont dans $params.
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $c = Config::get('db');
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['hote'], $c['port'], $c['base']);
            $pdo = new PDO($dsn, $c['utilisateur'], $c['mot_de_passe'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
            // Fuseau du panneau d'administration, à défaut celui de config.php (déjà appliqué par
            // demarrage.php). La table manque avant la migration 006 : on garde alors config.php.
            try {
                $fuseau = $pdo->query("SELECT valeur FROM parametres WHERE cle = 'fuseau'")->fetchColumn();
                if (is_string($fuseau) && Parametres::fuseauValide($fuseau)) {
                    date_default_timezone_set($fuseau);
                }
            } catch (PDOException) {
            }
            // Même fuseau que PHP pour CURRENT_TIMESTAMP (décalage numérique : ne demande pas
            // les tables de fuseaux de MySQL, souvent absentes sous Windows).
            $pdo->prepare('SET time_zone = ?')->execute([date('P')]);
            self::$pdo = $pdo;
        }
        return self::$pdo;
    }

    /** Exécute une requête préparée et renvoie l'instruction. */
    public static function requete(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /** Toutes les lignes. */
    public static function lignes(string $sql, array $params = []): array
    {
        return self::requete($sql, $params)->fetchAll();
    }

    /** La première ligne, ou null. */
    public static function ligne(string $sql, array $params = []): ?array
    {
        $ligne = self::requete($sql, $params)->fetch();
        return $ligne === false ? null : $ligne;
    }

    /** La première colonne de la première ligne, ou null. */
    public static function valeur(string $sql, array $params = []): mixed
    {
        $valeur = self::requete($sql, $params)->fetchColumn();
        return $valeur === false ? null : $valeur;
    }

    /** INSERT / UPDATE / DELETE : renvoie le nombre de lignes touchées. */
    public static function executer(string $sql, array $params = []): int
    {
        return self::requete($sql, $params)->rowCount();
    }

    public static function dernierId(): int
    {
        return (int) self::pdo()->lastInsertId();
    }

    /** Exécute $fonction dans une transaction, annulée si une exception survient. */
    public static function transaction(callable $fonction): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $resultat = $fonction();
            $pdo->commit();
            return $resultat;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
