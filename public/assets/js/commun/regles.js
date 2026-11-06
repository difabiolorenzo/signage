// Règles vérifiées avant d'enregistrer une playlist. Le serveur applique les mêmes
// (app/Pages.php::verifier) : cette copie ne sert qu'à prévenir l'utilisateur plus tôt.

/** Premier problème trouvé dans les pages, ou null. */
export function problemePlaylist(pages) {
    if (!Array.isArray(pages) || pages.length === 0) {
        return 'La playlist ne peut pas être vide, elle doit contenir au moins une page.';
    }
    for (const [i, page] of pages.entries()) {
        const youtube = (page.widgets ?? [])
            .map((w, j) => (w?.type === 'youtube' ? j + 1 : null))
            .filter((j) => j !== null);
        if (youtube.length > 1) {
            return `Un seul widget YouTube est pris en charge par page (page ${i + 1} : régions ${youtube.join(' et ')}).`;
        }
        const duree = page.duree;
        if (!Number.isInteger(duree) || duree < 1 || duree > 86400) {
            return `Page ${i + 1} : la durée doit être un nombre entier de secondes entre 1 et 86400.`;
        }
    }
    return null;
}
