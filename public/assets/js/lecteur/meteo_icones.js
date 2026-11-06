// Icônes météo en SVG, dessinées par code (aucun fichier externe) : un symbole par type de temps,
// avec variantes jour / nuit pour les temps où le soleil ou la lune apparaît.

const SVG = 'http://www.w3.org/2000/svg';

const COULEURS = Object.freeze({
    soleil: '#f8b62d', lune: '#e3e8f2', nuage: '#eef2f6', nuageSombre: '#9aa6b2',
    pluie: '#4ea7ff', neige: '#ffffff', eclair: '#ffd43b', brouillard: '#c4ccd4',
});

function forme(balise, attributs) {
    const noeud = document.createElementNS(SVG, balise);
    for (const [cle, valeur] of Object.entries(attributs)) {
        noeud.setAttribute(cle, String(valeur));
    }
    return noeud;
}

function groupe(transformation, ...enfants) {
    const g = forme('g', transformation ? { transform: transformation } : {});
    g.append(...enfants);
    return g;
}

function soleil(cx, cy, r) {
    const rayons = Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        return forme('line', {
            x1: cx + c * (r + 3), y1: cy + s * (r + 3), x2: cx + c * (r + 8), y2: cy + s * (r + 8),
            stroke: COULEURS.soleil, 'stroke-width': 3, 'stroke-linecap': 'round',
        });
    });
    return groupe(null, ...rayons, forme('circle', { cx, cy, r, fill: COULEURS.soleil }));
}

let numeroMasque = 0;

function lune(cx, cy, r) {
    // Croissant : disque masqué par un disque décalé (identifiant de masque unique par icône).
    const id = `lune-masque-${++numeroMasque}`;
    const masque = forme('mask', { id });
    masque.append(
        forme('circle', { cx, cy, r, fill: '#fff' }),
        forme('circle', { cx: cx + r * 0.45, cy: cy - r * 0.35, r: r * 0.85, fill: '#000' }),
    );
    return groupe(null, forme('defs', {}), masque, forme('circle', { cx, cy, r, fill: COULEURS.lune, mask: `url(#${id})` }));
}

/** Nuage de 44 × 24 environ, posé en (x, y) puis mis à l'échelle. */
function nuage(x, y, echelle = 1, couleur = COULEURS.nuage) {
    const attributs = { fill: couleur };
    return groupe(`translate(${x} ${y}) scale(${echelle})`,
        forme('circle', { cx: 12, cy: 14, r: 9, ...attributs }),
        forme('circle', { cx: 24, cy: 9, r: 11, ...attributs }),
        forme('circle', { cx: 35, cy: 15, r: 8, ...attributs }),
        forme('rect', { x: 4, y: 14, width: 38, height: 11, rx: 5.5, ...attributs }));
}

const gouttes = (debut, longueur, nombre = 3) => Array.from({ length: nombre }, (_, i) => forme('line', {
    x1: 20 + i * 11, y1: debut, x2: 17 + i * 11, y2: debut + longueur,
    stroke: COULEURS.pluie, 'stroke-width': 3, 'stroke-linecap': 'round',
}));

const bruine = () => [0, 1, 2].flatMap((i) => [0, 1].map((j) => forme('circle', { cx: 20 + i * 11 - j * 2, cy: 48 + j * 7, r: 1.8, fill: COULEURS.pluie })));

const flocons = () => [[20, 50], [32, 55], [44, 50], [26, 60], [38, 60]].map(([cx, cy]) => forme('circle', { cx, cy, r: 2.6, fill: COULEURS.neige }));

const lignesBrouillard = () => [44, 51, 58].map((y, i) => forme('line', {
    x1: 10 + i * 4, y1: y, x2: 54 - i * 2, y2: y, stroke: COULEURS.brouillard, 'stroke-width': 3.5, 'stroke-linecap': 'round',
}));

const eclair = () => forme('path', { d: 'M33 38l-8 13h7l-4 12 12-16h-7l5-9z', fill: COULEURS.eclair });

const astre = (jour, cx, cy, r) => (jour ? soleil(cx, cy, r) : lune(cx, cy, r));

/** Dessins par catégorie de temps (voir TEMPS dans widgets/meteo.js). */
const DESSINS = {
    degage: (jour) => [astre(jour, 32, 32, 13)],
    peu_nuageux: (jour) => [astre(jour, 24, 24, 11), nuage(18, 30, 0.95)],
    nuageux: (jour) => [astre(jour, 20, 20, 9), nuage(8, 22, 1.2)],
    couvert: () => [nuage(16, 12, 0.9, COULEURS.nuageSombre), nuage(6, 24, 1.15)],
    brouillard: () => [nuage(10, 8, 1.0, COULEURS.brouillard), ...lignesBrouillard()],
    bruine: () => [nuage(8, 10, 1.15), ...bruine()],
    pluie: () => [nuage(8, 8, 1.15, COULEURS.nuageSombre), ...gouttes(44, 14)],
    neige: () => [nuage(8, 8, 1.15), ...flocons()],
    averses: (jour) => [astre(jour, 44, 18, 9), nuage(4, 14, 1.1), ...gouttes(46, 12)],
    averses_neige: (jour) => [astre(jour, 44, 18, 9), nuage(4, 14, 1.1), ...flocons()],
    orage: () => [nuage(8, 6, 1.15, COULEURS.nuageSombre), ...gouttes(42, 10, 2), eclair()],
};

/** Icône de la catégorie (ex. 'pluie'), de jour ou de nuit ; `libelle` sert de texte alternatif. */
export function iconeMeteo(categorie, { jour = true, libelle = '' } = {}) {
    const svg = forme('svg', { viewBox: '0 0 64 64', class: 'meteo-icone' });
    if (libelle) {
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', libelle);
    } else {
        svg.setAttribute('aria-hidden', 'true');
    }
    svg.append(...(DESSINS[categorie] ?? DESSINS.nuageux)(jour));
    return svg;
}
