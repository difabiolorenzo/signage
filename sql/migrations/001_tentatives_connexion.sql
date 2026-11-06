-- Échecs de connexion récents, pour limiter les essais de mots de passe
-- (par identifiant et par adresse IP). Les lignes de plus d'un jour sont purgées par l'API.
CREATE TABLE IF NOT EXISTS tentatives_connexion (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip VARCHAR(45) NOT NULL,
    identifiant VARCHAR(64) NOT NULL,
    quand DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_tentatives_ip (ip, quand),
    KEY ix_tentatives_identifiant (identifiant, quand),
    KEY ix_tentatives_quand (quand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
