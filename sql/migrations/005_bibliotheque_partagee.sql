-- Bibliothèque partagée : une playlist ou un média n'appartient plus à une chaîne. Il a un auteur
-- (seul à pouvoir le modifier, avec les administrateurs) et une portée : « globale », ou
-- « restreinte » aux chaînes et utilisateurs listés dans playlist_acces / media_acces (aucune
-- entrée : privé). Une playlist est diffusée sur une chaîne par sa programmation.
-- Chaque playlist et chaque média existants deviennent restreints à leur chaîne actuelle.
-- Migration non additive (chaine_id supprimée) : Sauvegarde::convertir() adapte les anciennes
-- sauvegardes.

ALTER TABLE playlists
    ADD COLUMN auteur_id INT UNSIGNED NULL AFTER modifie_par,
    ADD COLUMN portee ENUM('globale', 'restreinte') NOT NULL DEFAULT 'restreinte' AFTER auteur_id,
    ADD KEY ix_playlists_auteur (auteur_id),
    ADD CONSTRAINT fk_playlists_auteur FOREIGN KEY (auteur_id)
        REFERENCES utilisateurs (id) ON DELETE SET NULL;

ALTER TABLE medias
    ADD COLUMN auteur_id INT UNSIGNED NULL AFTER envoye_le,
    ADD COLUMN portee ENUM('globale', 'restreinte') NOT NULL DEFAULT 'restreinte' AFTER auteur_id,
    ADD KEY ix_medias_auteur (auteur_id),
    ADD CONSTRAINT fk_medias_auteur FOREIGN KEY (auteur_id)
        REFERENCES utilisateurs (id) ON DELETE SET NULL;

UPDATE playlists SET auteur_id = COALESCE(modifie_par, (SELECT MIN(id) FROM utilisateurs WHERE role = 'admin'));
UPDATE medias SET auteur_id = COALESCE(envoye_par, (SELECT MIN(id) FROM utilisateurs WHERE role = 'admin'));

-- Une entrée vise soit une chaîne, soit un utilisateur (l'autre colonne est NULL). Pas de CHECK :
-- MySQL refuse un CHECK sur une colonne de clé étrangère à action ON DELETE ; PHP le vérifie.
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

INSERT INTO playlist_acces (playlist_id, chaine_id) SELECT id, chaine_id FROM playlists;
INSERT INTO media_acces (media_id, chaine_id) SELECT id, chaine_id FROM medias;

ALTER TABLE playlists DROP FOREIGN KEY fk_playlists_chaine;
ALTER TABLE playlists DROP KEY ix_playlists_chaine, DROP COLUMN chaine_id;
ALTER TABLE medias DROP FOREIGN KEY fk_medias_chaine;
ALTER TABLE medias DROP KEY ix_medias_chaine, DROP COLUMN chaine_id;

UPDATE version_schema SET version = 5;
