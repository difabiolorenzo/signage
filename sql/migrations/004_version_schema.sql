-- Version du schéma (numéro de la dernière migration appliquée), utilisée par la sauvegarde et la
-- restauration. Chaque migration suivante se termine par : UPDATE version_schema SET version = N;
CREATE TABLE IF NOT EXISTS version_schema (
    version INT UNSIGNED NOT NULL,
    PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
DELETE FROM version_schema;
INSERT INTO version_schema (version) VALUES (4);
