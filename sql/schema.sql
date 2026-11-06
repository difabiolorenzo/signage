-- Schéma de Signage Studio. Compatible MySQL 5.7+ et MariaDB 10.3+.
-- Relançable : chaque table n'est créée que si elle n'existe pas.
-- Les vérifications de clés étrangères sont suspendues le temps de la création,
-- car chaines et playlists se référencent mutuellement.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS utilisateurs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    identifiant VARCHAR(64) NOT NULL,
    mot_de_passe VARCHAR(255) NOT NULL,
    nom VARCHAR(100) NOT NULL DEFAULT '',
    role ENUM('admin', 'editeur') NOT NULL DEFAULT 'editeur',
    actif TINYINT(1) NOT NULL DEFAULT 1,
    version_session INT UNSIGNED NOT NULL DEFAULT 1,
    cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_utilisateurs_identifiant (identifiant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chaines (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(64) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    orientation ENUM('paysage', 'portrait') NOT NULL DEFAULT 'paysage',
    playlist_defaut_id INT UNSIGNED NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_chaines_slug (slug),
    KEY ix_chaines_playlist_defaut (playlist_defaut_id),
    CONSTRAINT fk_chaines_playlist_defaut FOREIGN KEY (playlist_defaut_id)
        REFERENCES playlists (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS droits (
    utilisateur_id INT UNSIGNED NOT NULL,
    chaine_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (utilisateur_id, chaine_id),
    KEY ix_droits_chaine (chaine_id),
    CONSTRAINT fk_droits_utilisateur FOREIGN KEY (utilisateur_id)
        REFERENCES utilisateurs (id) ON DELETE CASCADE,
    CONSTRAINT fk_droits_chaine FOREIGN KEY (chaine_id)
        REFERENCES chaines (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- regions : liste de [x, y, largeur, hauteur] en fractions de l'écran.
-- pages : document { "format": 1, "pages": [...] }, lu et écrit en bloc par PHP.
-- valide_du / valide_au : période de diffusion (NULL = sans limite).
-- auteur_id : seul à pouvoir la modifier avec les administrateurs. portee : « globale », ou
-- « restreinte » aux chaînes et utilisateurs de playlist_acces (aucune entrée : privée).
-- Une playlist passe sur une chaîne par la programmation de celle-ci (migration 005).
CREATE TABLE IF NOT EXISTS playlists (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    nom VARCHAR(100) NOT NULL,
    disposition VARCHAR(64) NOT NULL,
    regions JSON NOT NULL CHECK (JSON_VALID(regions)),
    pages JSON NOT NULL CHECK (JSON_VALID(pages)),
    valide_du DATE NULL,
    valide_au DATE NULL,
    modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    modifie_par INT UNSIGNED NULL,
    auteur_id INT UNSIGNED NULL,
    portee ENUM('globale', 'restreinte') NOT NULL DEFAULT 'restreinte',
    PRIMARY KEY (id),
    KEY ix_playlists_modifie_par (modifie_par),
    KEY ix_playlists_auteur (auteur_id),
    CONSTRAINT fk_playlists_modifie_par FOREIGN KEY (modifie_par)
        REFERENCES utilisateurs (id) ON DELETE SET NULL,
    CONSTRAINT fk_playlists_auteur FOREIGN KEY (auteur_id)
        REFERENCES utilisateurs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dates NULL : sans limite. jours : masque 7 bits, lundi = bit 0 (127 = tous les jours).
CREATE TABLE IF NOT EXISTS programmations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    chaine_id INT UNSIGNED NOT NULL,
    playlist_id INT UNSIGNED NOT NULL,
    date_debut DATE NULL,
    date_fin DATE NULL,
    heure_debut TIME NOT NULL DEFAULT '00:00:00',
    heure_fin TIME NOT NULL DEFAULT '24:00:00',
    jours TINYINT UNSIGNED NOT NULL DEFAULT 127,
    priorite SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY ix_programmations_chaine (chaine_id),
    KEY ix_programmations_playlist (playlist_id),
    CONSTRAINT fk_programmations_chaine FOREIGN KEY (chaine_id)
        REFERENCES chaines (id) ON DELETE CASCADE,
    CONSTRAINT fk_programmations_playlist FOREIGN KEY (playlist_id)
        REFERENCES playlists (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- duree en secondes (vidéos) ; largeur et hauteur en pixels. envoye_par : qui a envoyé le
-- fichier ; auteur_id : responsable actuel (transférable). portee : comme pour les playlists,
-- mais elle dit qui peut insérer le média dans une playlist, pas où il s'affiche. vignette
-- (migration 007) : fichier de public/uploads/vignettes/, NULL tant qu'elle n'est pas générée.
CREATE TABLE IF NOT EXISTS medias (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    fichier VARCHAR(64) NOT NULL,
    vignette VARCHAR(64) NULL,
    nom_origine VARCHAR(255) NOT NULL,
    type VARCHAR(64) NOT NULL,
    taille BIGINT UNSIGNED NOT NULL,
    largeur INT UNSIGNED NULL,
    hauteur INT UNSIGNED NULL,
    duree DECIMAL(10,3) NULL,
    envoye_par INT UNSIGNED NULL,
    envoye_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    auteur_id INT UNSIGNED NULL,
    portee ENUM('globale', 'restreinte') NOT NULL DEFAULT 'restreinte',
    PRIMARY KEY (id),
    UNIQUE KEY uq_medias_fichier (fichier),
    KEY ix_medias_envoye_par (envoye_par),
    KEY ix_medias_auteur (auteur_id),
    CONSTRAINT fk_medias_envoye_par FOREIGN KEY (envoye_par)
        REFERENCES utilisateurs (id) ON DELETE SET NULL,
    CONSTRAINT fk_medias_auteur FOREIGN KEY (auteur_id)
        REFERENCES utilisateurs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Portée restreinte d'une playlist ou d'un média (migration 005) : chaque entrée vise soit une
-- chaîne, soit un utilisateur, l'autre colonne restant NULL (vérifié par PHP : MySQL refuse un
-- CHECK sur une colonne de clé étrangère à action ON DELETE).
CREATE TABLE IF NOT EXISTS playlist_acces (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    playlist_id INT UNSIGNED NOT NULL,
    chaine_id INT UNSIGNED NULL,
    utilisateur_id INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_playlist_acces_chaine (playlist_id, chaine_id),
    UNIQUE KEY uq_playlist_acces_utilisateur (playlist_id, utilisateur_id),
    KEY ix_playlist_acces_chaine (chaine_id),
    KEY ix_playlist_acces_utilisateur (utilisateur_id),
    CONSTRAINT fk_playlist_acces_playlist FOREIGN KEY (playlist_id)
        REFERENCES playlists (id) ON DELETE CASCADE,
    CONSTRAINT fk_playlist_acces_chaine FOREIGN KEY (chaine_id)
        REFERENCES chaines (id) ON DELETE CASCADE,
    CONSTRAINT fk_playlist_acces_utilisateur FOREIGN KEY (utilisateur_id)
        REFERENCES utilisateurs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS media_acces (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    media_id INT UNSIGNED NOT NULL,
    chaine_id INT UNSIGNED NULL,
    utilisateur_id INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_media_acces_chaine (media_id, chaine_id),
    UNIQUE KEY uq_media_acces_utilisateur (media_id, utilisateur_id),
    KEY ix_media_acces_chaine (chaine_id),
    KEY ix_media_acces_utilisateur (utilisateur_id),
    CONSTRAINT fk_media_acces_media FOREIGN KEY (media_id)
        REFERENCES medias (id) ON DELETE CASCADE,
    CONSTRAINT fk_media_acces_chaine FOREIGN KEY (chaine_id)
        REFERENCES chaines (id) ON DELETE CASCADE,
    CONSTRAINT fk_media_acces_utilisateur FOREIGN KEY (utilisateur_id)
        REFERENCES utilisateurs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Échecs de connexion récents (migration 001), purgés après un jour.
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

-- Réglages globaux du panneau d'administration (migration 006) : clé / valeur, une clé absente
-- prend sa valeur par défaut (app/Parametres.php).
CREATE TABLE IF NOT EXISTS parametres (
    cle VARCHAR(64) NOT NULL,
    valeur TEXT NOT NULL,
    PRIMARY KEY (cle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Numéro de la dernière migration de sql/migrations/ intégrée à ce schéma (migration 004).
-- À mettre à jour à chaque nouvelle migration.
CREATE TABLE IF NOT EXISTS version_schema (
    version INT UNSIGNED NOT NULL,
    PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO version_schema (version) SELECT 7 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM version_schema);

SET FOREIGN_KEY_CHECKS = 1;
