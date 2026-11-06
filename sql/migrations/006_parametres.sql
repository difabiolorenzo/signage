-- Réglages globaux du panneau d'administration (clé / valeur). Une clé absente prend la valeur
-- par défaut définie dans app/Parametres.php (ou dans config/config.php).
CREATE TABLE IF NOT EXISTS parametres (
    cle VARCHAR(64) NOT NULL,
    valeur TEXT NOT NULL,
    PRIMARY KEY (cle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE version_schema SET version = 6;
