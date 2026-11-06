-- Vignette d'un média (320 px de large), fichier de public/uploads/vignettes/. NULL : pas encore
-- générée (média envoyé avant cette migration, sauvegarde ancienne restaurée, échec de GD) ;
-- l'écran Médias la régénère.
ALTER TABLE medias ADD COLUMN vignette VARCHAR(64) NULL AFTER fichier;

UPDATE version_schema SET version = 7;
