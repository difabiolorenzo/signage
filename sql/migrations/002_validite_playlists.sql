-- Période de validité d'une playlist (NULL = sans limite) : hors de cette période, elle n'est
-- jamais diffusée, même comme playlist par défaut.
ALTER TABLE playlists
    ADD COLUMN valide_du DATE NULL AFTER pages,
    ADD COLUMN valide_au DATE NULL AFTER valide_du;
