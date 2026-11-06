// Fonctions communes aux widgets du lecteur.

/** Taille de police en pixels de l'écran de référence, mise à l'échelle par --echelle. */
export function taillePolice(taille, parDefaut) {
    const n = Number(taille);
    const t = Number.isFinite(n) && n >= 4 && n <= 1000 ? n : parDefaut;
    return `calc(var(--echelle, 1) * ${t}px)`;
}

/** Applique couleur de texte, fond et taille communs aux widgets textuels. */
export function styleTexte(element, reglages, tailleParDefaut) {
    element.style.fontSize = taillePolice(reglages.taille, tailleParDefaut);
    if (typeof reglages.couleur === 'string') {
        element.style.color = reglages.couleur;
    }
    if (typeof reglages.fond === 'string') {
        element.style.backgroundColor = reglages.fond;
    }
}

/** URL http(s) valide, ou null. */
export function urlWeb(texte) {
    try {
        const url = new URL(String(texte));
        return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch {
        return null;
    }
}
