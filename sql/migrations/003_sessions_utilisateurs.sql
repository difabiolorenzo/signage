-- Numéro de session d'un compte : incrémenté à chaque changement de mot de passe, il ferme
-- les sessions ouvertes avant le changement (voir Auth::utilisateur).
ALTER TABLE utilisateurs
    ADD COLUMN version_session INT UNSIGNED NOT NULL DEFAULT 1 AFTER actif;
