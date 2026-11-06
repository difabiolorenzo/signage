// Widget Lien web et code QR : le code QR d'une adresse, avec l'adresse en dessous.

import { codeQR } from '../qrcode.js';
import { styleTexte, urlWeb } from '../outils.js';

const SVG = 'http://www.w3.org/2000/svg';
const MARGE = 4; // zone blanche autour du code, en modules (exigée par la norme)

/** Code QR en SVG : un seul chemin pour tous les modules foncés. */
export function svgQR(texte) {
    const m = codeQR(texte);
    const n = m.length + 2 * MARGE;
    let d = '';
    m.forEach((ligne, y) => ligne.forEach((fonce, x) => {
        if (fonce) {
            d += `M${x + MARGE} ${y + MARGE}h1v1h-1z`;
        }
    }));
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.classList.add('qr-code');
    const chemin = document.createElementNS(SVG, 'path');
    chemin.setAttribute('d', d);
    chemin.setAttribute('fill', '#000');
    svg.append(chemin);
    return svg;
}

export function creer(region, reglages) {
    const url = urlWeb(reglages.url);
    if (!url) {
        return null;
    }
    const bloc = document.createElement('div');
    bloc.className = 'bloc qr';
    styleTexte(bloc, reglages, 28);
    const adresse = document.createElement('div');
    adresse.className = 'ligne petit';
    adresse.textContent = url.href;
    bloc.append(svgQR(url.href), adresse);
    region.append(bloc);
    return null;
}
