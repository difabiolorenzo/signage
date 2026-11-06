// Aperçu d'une disposition : ses régions colorées dans un cadre aux proportions de l'écran.

import { couleurRegion } from '../commun/dispositions.js';
import { el } from './dom.js';

export function apercuDisposition(regions, portrait, { numeros = false } = {}) {
    const cadre = el('div', { class: portrait ? 'apercu portrait' : 'apercu paysage', 'aria-hidden': 'true' });
    (Array.isArray(regions) ? regions : []).forEach((r, i) => {
        const region = el('div', { class: 'apercu-region', text: numeros ? i + 1 : null });
        placer(region, r);
        region.style.backgroundColor = couleurRegion(i);
        cadre.append(region);
    });
    return cadre;
}

/** Positionne un élément sur une région [x, y, largeur, hauteur] (fractions). */
export function placer(element, r) {
    element.style.left = `${r[0] * 100}%`;
    element.style.top = `${r[1] * 100}%`;
    element.style.width = `${r[2] * 100}%`;
    element.style.height = `${r[3] * 100}%`;
}
