<?php
declare(strict_types=1);

/**
 * Sauvegarde et restauration de la base (sans les fichiers de public/uploads/).
 *
 * Document JSON : { application, format, version_schema, cree_le, tables: { nom: [ligne, …] } }.
 * Les mots de passe y restent sous forme d'empreintes. La restauration remplace tout le contenu
 * des tables, dans une transaction. Une sauvegarde d'une version de schéma plus ancienne est
 * acceptée : les colonnes ajoutées depuis prennent leur valeur par défaut (les migrations doivent
 * donc rester additives, ou cette classe doit convertir les anciennes sauvegardes).
 */
final class Sauvegarde
{
    public const APPLICATION = 'signage-studio-sauvegarde';
    public const FORMAT = 1;
    /** Tables sauvegardées, dans l'ordre d'insertion (tentatives_connexion, passagère, est exclue). */
    public const TABLES = ['utilisateurs', 'chaines', 'droits', 'playlists', 'playlist_acces', 'programmations', 'medias', 'media_acces'];
    /** Sauvegardes automatiques faites avant chaque restauration (hors de public/). */
    private const DOSSIER = __DIR__ . '/../sauvegardes';

    /** Version attendue par le code : numéro de la dernière migration de sql/migrations/. */
    public static function versionApplication(): int
    {
        $version = 0;
        foreach (glob(__DIR__ . '/../sql/migrations/*.sql') ?: [] as $fichier) {
            if (preg_match('/^(\d+)_/', basename($fichier), $m)) {
                $version = max($version, (int) $m[1]);
            }
        }
        return $version;
    }

    /** Version du schéma de la base (0 si la migration 004 n'est pas appliquée). */
    public static function versionBase(): int
    {
        $table = Db::valeur(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'version_schema'"
        );
        return (int) $table === 0 ? 0 : (int) Db::valeur('SELECT MAX(version) FROM version_schema');
    }

    /** Erreur si la base n'est pas à la version du code (migrations non appliquées). */
    public static function exigerBaseAJour(): void
    {
        $base = self::versionBase();
        $application = self::versionApplication();
        if ($base !== $application) {
            throw new RuntimeException(
                "La base est à la version $base du schéma et l'application à la version $application : "
                . 'appliquez d\'abord les migrations de sql/migrations/ (voir le README).'
            );
        }
    }

    public static function exporter(): array
    {
        $tables = [];
        foreach (self::TABLES as $table) {
            $tables[$table] = Db::lignes("SELECT * FROM `$table` ORDER BY 1");
        }
        return [
            'application' => self::APPLICATION,
            'format' => self::FORMAT,
            'version_schema' => self::versionBase(),
            'cree_le' => (new DateTimeImmutable())->format(DATE_ATOM),
            'tables' => $tables,
        ];
    }

    public static function json(array $document): string
    {
        return json_encode($document, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    public static function nomFichier(string $prefixe = 'signage_sauvegarde'): string
    {
        return $prefixe . '_' . date('Y-m-d_Hi') . '.json';
    }

    /** Écrit le document dans le dossier des sauvegardes automatiques ; renvoie le nom du fichier. */
    public static function enregistrerSurDisque(array $document, string $prefixe): string
    {
        if (!is_dir(self::DOSSIER) && !mkdir(self::DOSSIER, 0770, true) && !is_dir(self::DOSSIER)) {
            throw new RuntimeException('Impossible de créer le dossier sauvegardes/.');
        }
        $nom = self::nomFichier($prefixe);
        $chemin = self::DOSSIER . '/' . $nom;
        for ($i = 2; is_file($chemin); $i++) {
            $nom = preg_replace('/\.json$/', "_$i.json", self::nomFichier($prefixe));
            $chemin = self::DOSSIER . '/' . $nom;
        }
        if (file_put_contents($chemin, self::json($document), LOCK_EX) === false) {
            throw new RuntimeException('Impossible d\'écrire la sauvegarde automatique dans sauvegardes/.');
        }
        return $nom;
    }

    /**
     * Adapte une sauvegarde faite avant la migration 005 (bibliothèque partagée), seule migration
     * non additive : chaque playlist et chaque média deviennent restreints à leur ancienne chaîne
     * (playlist_acces, media_acces), avec pour auteur leur dernier modificateur ou leur expéditeur,
     * à défaut le premier administrateur. Tout autre document est renvoyé tel quel.
     */
    public static function convertir(mixed $document): mixed
    {
        $version = is_array($document) ? ($document['version_schema'] ?? null) : null;
        $tables = is_array($document) ? ($document['tables'] ?? null) : null;
        if (!is_int($version) || $version < 1 || $version >= 5 || !is_array($tables)
            || isset($tables['playlist_acces']) || isset($tables['media_acces'])) {
            return $document;
        }
        $admins = [];
        foreach (is_array($tables['utilisateurs'] ?? null) ? $tables['utilisateurs'] : [] as $u) {
            if (is_array($u) && ($u['role'] ?? null) === 'admin' && is_numeric($u['id'] ?? null)) {
                $admins[] = (int) $u['id'];
            }
        }
        $premierAdmin = $admins === [] ? null : min($admins);

        foreach ([['playlists', 'playlist_acces', 'playlist_id', 'modifie_par'], ['medias', 'media_acces', 'media_id', 'envoye_par']] as [$table, $acces, $cle, $auteur]) {
            $lignes = is_array($tables[$table] ?? null) ? $tables[$table] : [];
            $tables[$acces] = [];
            foreach ($lignes as $i => $ligne) {
                if (!is_array($ligne) || !array_key_exists('chaine_id', $ligne)) {
                    continue; // laissé tel quel : verifier() le refusera
                }
                $tables[$acces][] = ['id' => count($tables[$acces]) + 1, $cle => $ligne['id'] ?? null, 'chaine_id' => $ligne['chaine_id'], 'utilisateur_id' => null];
                unset($ligne['chaine_id']);
                $ligne['auteur_id'] = $ligne[$auteur] ?? $premierAdmin;
                $ligne['portee'] = 'restreinte';
                $lignes[$i] = $ligne;
            }
            $tables[$table] = $lignes;
        }
        $document['tables'] = $tables;
        $document['version_schema'] = 5;
        return $document;
    }

    /**
     * Vérifie qu'un document vient bien du bouton « Télécharger une sauvegarde » et peut être
     * restauré ; lève une RuntimeException avec un message lisible sinon.
     */
    public static function verifier(mixed $document): void
    {
        if (!is_array($document) || ($document['application'] ?? null) !== self::APPLICATION) {
            throw new RuntimeException('Ce fichier n\'est pas une sauvegarde de Signage Studio.');
        }
        if (($document['format'] ?? null) !== self::FORMAT) {
            throw new RuntimeException('Format de sauvegarde inconnu.');
        }
        $version = $document['version_schema'] ?? null;
        $application = self::versionApplication();
        if (!is_int($version) || $version < 1) {
            throw new RuntimeException('Version de schéma absente de la sauvegarde.');
        }
        if ($version > $application) {
            throw new RuntimeException(
                "Cette sauvegarde vient d'une version plus récente de l'application (schéma $version, ici $application) : "
                . 'mettez d\'abord l\'application à jour.'
            );
        }
        $tables = $document['tables'] ?? null;
        if (!is_array($tables) || array_diff(array_keys($tables), self::TABLES) !== [] || array_diff(self::TABLES, array_keys($tables)) !== []) {
            throw new RuntimeException('Sauvegarde incomplète ou altérée : liste des tables inattendue.');
        }
        foreach ($tables as $table => $lignes) {
            if (!is_array($lignes) || !array_is_list($lignes)) {
                throw new RuntimeException("Sauvegarde altérée : table $table illisible.");
            }
            $colonnes = self::colonnes($table);
            foreach ($lignes as $ligne) {
                if (!is_array($ligne) || $ligne === [] || array_diff(array_keys($ligne), $colonnes) !== []) {
                    throw new RuntimeException("Sauvegarde altérée : colonne inconnue dans la table $table.");
                }
                foreach ($ligne as $valeur) {
                    if (!is_scalar($valeur) && $valeur !== null) {
                        throw new RuntimeException("Sauvegarde altérée : valeur invalide dans la table $table.");
                    }
                }
            }
        }
        $admins = array_filter($tables['utilisateurs'], static fn (array $u): bool => ($u['role'] ?? null) === 'admin' && (int) ($u['actif'] ?? 1) === 1);
        if ($admins === []) {
            throw new RuntimeException('Cette sauvegarde ne contient aucun administrateur actif : plus personne ne pourrait gérer l\'application.');
        }
    }

    /** Remplace tout le contenu des tables par celui du document (déjà vérifié), en tout ou rien. */
    public static function restaurer(array $document): void
    {
        $pdo = Db::pdo();
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0'); // chaines et playlists se référencent mutuellement
        try {
            Db::transaction(static function () use ($document): void {
                foreach (array_reverse(self::TABLES) as $table) {
                    Db::executer("DELETE FROM `$table`");
                }
                foreach (self::TABLES as $table) {
                    foreach ($document['tables'][$table] as $ligne) {
                        // Noms de colonnes vérifiés contre information_schema par verifier().
                        $colonnes = implode(', ', array_map(static fn (string $c): string => "`$c`", array_keys($ligne)));
                        $marques = implode(', ', array_fill(0, count($ligne), '?'));
                        Db::executer("INSERT INTO `$table` ($colonnes) VALUES ($marques)", array_values($ligne));
                    }
                }
            });
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        }
    }

    /**
     * Cohérence entre la table medias et le dossier public/uploads/ :
     * médias dont le fichier manque, et fichiers présents qu'aucun média ne référence.
     */
    public static function controleMedias(): array
    {
        $dossier = dirname(__DIR__) . '/public/uploads/';
        $enBase = [];
        foreach (Db::lignes('SELECT m.fichier, m.nom_origine, ' . Bibliotheque::sqlNom('u') . ' AS auteur FROM medias m LEFT JOIN utilisateurs u ON u.id = m.auteur_id') as $m) {
            $enBase[$m['fichier']] = $m;
        }
        $surDisque = array_values(array_filter(
            scandir($dossier) ?: [],
            static fn (string $f): bool => $f[0] !== '.' && is_file($dossier . $f)
        ));
        $manquants = [];
        foreach ($enBase as $fichier => $m) {
            if (!in_array($fichier, $surDisque, true)) {
                $manquants[] = $m['auteur'] === null ? $m['nom_origine'] : "{$m['nom_origine']} (auteur : {$m['auteur']})";
            }
        }
        $orphelins = array_values(array_filter($surDisque, static fn (string $f): bool => !isset($enBase[$f])));
        return ['manquants' => $manquants, 'orphelins' => $orphelins];
    }

    /** @return list<string> */
    private static function colonnes(string $table): array
    {
        return array_column(Db::lignes(
            'SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
            [$table]
        ), 'c');
    }
}
