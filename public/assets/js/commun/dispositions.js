// Dispositions d'écran, partagées par l'éditeur et le lecteur.
//
// Une disposition décrit une grille et ses cellules [ligne, colonne, hauteur, largeur].
// Les grilles portrait sont décrites sur les axes paysage (colonnes = sens de la longueur)
// et transposées pour l'écran vertical : voir regionsDe().
// Une région est [x, y, largeur, hauteur] en fractions de l'écran (0 à 1).
//
// Le nom (`nom`) est enregistré dans chaque playlist : ne jamais le renommer
// sans garder l'ancien nom reconnu par trouverDisposition().

/** Noms enregistrés pour une grille dessinée à la main, en paysage et en portrait. */
export const PERSONNALISEE = 'Personnalisé';
export const PERSONNALISEE_PORTRAIT = 'Personnalisé portrait';

/** Taille de la grille personnalisée (16 × 16 cases). */
export const TAILLE_GRILLE = 16;

/** Couleurs des régions dans l'éditeur, dans l'ordre des régions (cycle au-delà de 12). */
export const COULEURS_REGIONS = Object.freeze([
    '#F6921E', '#47ADFF', '#73CC24', '#EB82D9', '#8F63FF', '#AB6E14',
    '#0D70FF', '#149414', '#6D6E70', '#FF0000', '#FF7F00', '#FFFF00',
]);

/** Couleur de la région d'indice `i` (à partir de 0). */
export function couleurRegion(i) {
    return COULEURS_REGIONS[i % COULEURS_REGIONS.length];
}

const d = (nom, portrait, colonnes, lignes, cellules) =>
    Object.freeze({ nom, portrait, colonnes, lignes, cellules: Object.freeze(cellules) });

/** Les 20 dispositions paysage puis les 18 portrait. */
export const DISPOSITIONS = Object.freeze([
    d('Landscape 1', false, 1, 1, [[0,0,1,1]]),
    d('Landscape 2', false, 1, 2, [[0,0,1,1], [1,0,1,1]]),
    d('Landscape 3', false, 1, 3, [[0,0,2,1], [2,0,1,1]]),
    d('Landscape 4', false, 1, 3, [[0,0,1,1], [1,0,2,1]]),
    d('Landscape 5', false, 2, 1, [[0,0,1,1], [0,1,1,1]]),
    d('Landscape 6', false, 1, 3, [[0,0,1,1], [1,0,1,1], [2,0,1,1]]),
    d('Landscape 7', false, 2, 6, [[0,0,1,1], [0,1,1,1], [1,0,5,2]]),
    d('Landscape 8', false, 4, 4, [[0,0,1,3], [1,0,3,3], [0,3,4,1]]),
    d('Landscape 9', false, 4, 4, [[0,0,3,3], [3,0,1,3], [0,3,4,1]]),
    d('Landscape 10', false, 3, 3, [[0,0,1,2], [0,2,1,1], [1,0,2,3]]),
    d('Landscape 11', false, 3, 4, [[0,0,3,3], [3,0,1,1], [3,1,1,1], [3,2,1,1]]),
    d('Landscape 12', false, 2, 2, [[0,0,1,1], [0,1,1,1], [1,0,1,1], [1,1,1,1]]),
    d('Landscape 13', false, 4, 4, [[0,0,4,3], [0,3,1,1], [1,3,1,1], [2,3,1,1], [3,3,1,1]]),
    d('Landscape 14', false, 4, 4, [[0,0,1,1], [1,0,1,1], [2,0,1,1], [3,0,1,1], [0,1,4,3]]),
    d('Landscape 15', false, 2, 3, [[0,0,1,1], [0,1,1,1], [1,0,1,1], [1,1,1,1], [2,0,1,1], [2,1,1,1]]),
    d('Landscape 16', false, 3, 4, [[0,0,3,2], [0,2,1,1], [1,2,1,1], [2,2,1,1], [3,0,1,1], [3,1,1,2]]),
    d('Landscape 17', false, 3, 4, [[0,0,2,2], [2,0,2,2], [0,2,1,1], [1,2,1,1], [2,2,1,1], [3,2,1,1]]),
    d('Landscape 18', false, 4, 4, [[0,0,1,1], [0,1,1,1], [0,2,1,1], [0,3,1,1], [1,3,1,1], [2,3,1,1], [3,3,1,1], [1,0,3,3]]),
    d('Landscape 19', false, 4, 4, [[0,0,3,3], [3,0,1,1], [3,1,1,1], [3,2,1,1], [3,3,1,1], [0,3,1,1], [1,3,1,1], [2,3,1,1]]),
    d('Landscape 20', false, 3, 3, [[0,0,1,1], [0,1,1,1], [0,2,1,1], [1,0,1,1], [1,1,1,1], [1,2,1,1], [2,0,1,1], [2,1,1,1], [2,2,1,1]]),
    d('Portrait 1', true, 1, 1, [[0,0,1,1]]),
    d('Portrait 2', true, 2, 1, [[0,0,1,1], [0,1,1,1]]),
    d('Portrait 3', true, 3, 1, [[0,0,1,1], [0,1,1,2]]),
    d('Portrait 4', true, 3, 1, [[0,0,1,2], [0,2,1,1]]),
    d('Portrait 5', true, 3, 1, [[0,0,1,1], [0,1,1,1], [0,2,1,1]]),
    d('Portrait 6', true, 6, 2, [[0,0,2,4], [0,4,1,2], [1,4,1,2]]),
    d('Portrait 7', true, 6, 2, [[0,0,1,2], [1,0,1,2], [0,2,2,4]]),
    d('Portrait 8', true, 6, 2, [[0,0,2,5], [0,5,1,1], [1,5,1,1]]),
    d('Portrait 9', true, 6, 2, [[0,0,1,1], [1,0,1,1], [0,1,2,5]]),
    d('Portrait 10', true, 4, 4, [[0,0,1,4], [1,0,3,1], [1,1,3,3]]),
    d('Portrait 11', true, 3, 3, [[0,0,2,1], [2,0,1,1], [0,1,3,2]]),
    d('Portrait 12', true, 3, 3, [[0,0,1,1], [1,0,2,1], [0,1,3,2]]),
    d('Portrait 13', true, 4, 3, [[0,0,1,1], [1,0,1,1], [2,0,1,1], [0,1,3,3]]),
    d('Portrait 14', true, 6, 2, [[0,0,2,4], [0,4,1,1], [0,5,1,1], [1,4,1,1], [1,5,1,1]]),
    d('Portrait 15', true, 6, 2, [[0,0,1,1], [0,1,1,1], [1,0,1,1], [1,1,1,1], [0,2,2,4]]),
    d('Portrait 16', true, 4, 3, [[0,0,2,3], [2,0,1,1], [2,1,1,1], [2,2,1,1], [0,3,1,1], [1,3,2,1]]),
    d('Portrait 17', true, 4, 3, [[0,0,2,2], [2,0,1,1], [2,1,1,1], [0,2,2,2], [2,2,1,1], [2,3,1,1]]),
    d('Portrait 18', true, 4, 4, [[0,0,3,3], [3,0,1,1], [3,1,1,1], [3,2,1,1], [0,3,1,1], [1,3,1,1], [2,3,1,1], [3,3,1,1]]),
]);

/** Disposition portant ce nom, ou null. */
export function trouverDisposition(nom) {
    return DISPOSITIONS.find((t) => t.nom === nom) ?? null;
}

/** Libellé affiché : « Landscape 3 » → « Paysage 3 ». */
export function libelleDisposition(nom) {
    if (nom === PERSONNALISEE) {
        return 'Personnalisée (paysage)';
    }
    if (nom === PERSONNALISEE_PORTRAIT) {
        return 'Personnalisée (portrait)';
    }
    return String(nom).replace('Landscape', 'Paysage');
}

/** Une disposition est en portrait si son nom l'indique (« Portrait N », « Personnalisé portrait »). */
export function estDispositionPortrait(nom) {
    return String(nom).startsWith('Portrait') || nom === PERSONNALISEE_PORTRAIT;
}

/**
 * Régions [x, y, largeur, hauteur] d'une disposition, en fractions de l'écran.
 * Portrait : la grille est transposée (les lignes deviennent des colonnes).
 */
export function regionsDe(disposition) {
    const a = disposition.colonnes;
    const b = disposition.lignes;
    return disposition.cellules.map(([r, c, rs, cs]) =>
        disposition.portrait ? [r / b, c / a, rs / b, cs / a] : [c / a, r / b, cs / a, rs / b]);
}

/**
 * Régions d'une grille personnalisée, à partir de rectangles [x, y, largeur, hauteur]
 * exprimés en cases de la grille TAILLE_GRILLE × TAILLE_GRILLE (pas de transposition).
 */
export function regionsPersonnalisees(rectangles) {
    const g = TAILLE_GRILLE;
    return rectangles.map(([x, y, w, h]) => [x / g, y / g, w / g, h / g]);
}
