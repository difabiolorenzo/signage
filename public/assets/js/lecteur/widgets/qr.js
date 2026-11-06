// Widget Lien web et code QR : le code QR d'une adresse, avec l'adresse en dessous.
// Personnalisable : couleurs des modules et du fond, marge, forme des modules, logo central.

import { codeQR } from '../qrcode.js';
import { styleTexte, urlWeb } from '../outils.js';

const SVG = 'http://www.w3.org/2000/svg';

/** Valeurs par défaut des réglages du code (aussi utilisées par le panneau de l'éditeur). */
export const QR_DEFAUTS = Object.freeze({ qr_couleur: '#000000', qr_fond: '#ffffff', qr_marge: 4, qr_forme: 'carres' });

export const FORMES_QR = Object.freeze([
    { valeur: 'carres', libelle: 'Carrés' },
    { valeur: 'arrondis', libelle: 'Carrés arrondis' },
    { valeur: 'points', libelle: 'Points' },
]);

/** Part de la largeur du code occupée par le logo (le niveau de correction H en tolère 30 %). */
const PART_LOGO = 0.22;

const COULEUR = /^#[0-9a-fA-F]{6}$/;

function luminance(hex) {
    const canal = (i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Rapport de contraste WCAG entre deux couleurs #rrggbb (de 1 à 21). */
export function contraste(a, b) {
    const [la, lb] = [luminance(a), luminance(b)];
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Problème de lisibilité des couleurs choisies, ou null. */
export function problemeLisibilite(couleur, fond) {
    if (luminance(couleur) > luminance(fond)) {
        return 'Modules plus clairs que le fond : beaucoup de lecteurs de codes QR ne savent pas lire un code inversé.';
    }
    if (contraste(couleur, fond) < 4) {
        return `Contraste faible (${contraste(couleur, fond).toFixed(1)} : 1) : le code risque d'être illisible. Visez au moins 4 : 1, idéalement un module foncé sur fond clair.`;
    }
    return null;
}

const rectArrondi = (x, y, l, h, r) => `M${x + r} ${y}h${l - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}`
    + `h${-(l - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

/** Tracé d'un module foncé (case de 1 × 1 en x, y) selon la forme choisie. */
function module(x, y, forme) {
    if (forme === 'points') {
        return `M${x + 0.08} ${y + 0.5}a.42 .42 0 1 0 .84 0a.42 .42 0 1 0 -.84 0z`;
    }
    if (forme === 'arrondis') {
        return rectArrondi(x + 0.04, y + 0.04, 0.92, 0.92, 0.3);
    }
    return `M${x} ${y}h1v1h-1z`;
}

/** Repère de position (7 × 7 modules) : anneau puis carré central, arrondis selon la forme. */
function repere(x, y, forme) {
    const r = forme === 'carres' ? 0 : forme === 'points' ? 1 : 0.6;
    const trace = (dx, dy, cote, rayon) => (rayon === 0 ? `M${x + dx} ${y + dy}h${cote}v${cote}h${-cote}z` : rectArrondi(x + dx, y + dy, cote, cote, rayon));
    // Le carré intérieur (5 × 5) est tracé dans l'autre sens par evenodd : il creuse l'anneau.
    return trace(0, 0, 7, r * 2) + trace(1, 1, 5, r * 1.4) + trace(2, 2, 3, r);
}

const surRepere = (x, y, n) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

/**
 * Code QR en SVG. options : qr_couleur, qr_fond, qr_marge (en modules), qr_forme, logo (URL d'une
 * image, ou null). Avec un logo, le niveau de correction passe de M à H et les modules qu'il
 * recouvre ne sont pas dessinés.
 */
export function svgQR(texte, options = {}) {
    const o = { ...QR_DEFAUTS, ...options };
    const couleur = COULEUR.test(o.qr_couleur) ? o.qr_couleur : QR_DEFAUTS.qr_couleur;
    const fond = COULEUR.test(o.qr_fond) ? o.qr_fond : QR_DEFAUTS.qr_fond;
    const marge = Number.isInteger(o.qr_marge) && o.qr_marge >= 0 && o.qr_marge <= 10 ? o.qr_marge : QR_DEFAUTS.qr_marge;
    const forme = FORMES_QR.some((f) => f.valeur === o.qr_forme) ? o.qr_forme : QR_DEFAUTS.qr_forme;

    const m = codeQR(texte, o.logo ? 'H' : 'M');
    const n = m.length;
    const total = n + 2 * marge;

    // Zone du logo, centrée, en modules entiers (taille impaire pour rester centrée).
    let zoneLogo = null;
    if (o.logo) {
        const cote = Math.max(3, Math.floor((n * PART_LOGO) / 2) * 2 + 1);
        const debut = (n - cote) / 2;
        zoneLogo = { debut, fin: debut + cote };
    }
    const sousLogo = (x, y) => zoneLogo && x >= zoneLogo.debut && x < zoneLogo.fin && y >= zoneLogo.debut && y < zoneLogo.fin;

    let d = forme === 'carres' ? '' : [[0, 0], [n - 7, 0], [0, n - 7]].map(([x, y]) => repere(x + marge, y + marge, forme)).join('');
    m.forEach((ligne, y) => ligne.forEach((fonce, x) => {
        if (fonce && !sousLogo(x, y) && (forme === 'carres' || !surRepere(x, y, n))) {
            d += module(x + marge, y + marge, forme);
        }
    }));

    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Code QR : ${texte}`);
    svg.classList.add('qr-code');
    if (forme === 'carres') {
        svg.setAttribute('shape-rendering', 'crispEdges');
    }
    const arrierePlan = document.createElementNS(SVG, 'rect');
    arrierePlan.setAttribute('width', total);
    arrierePlan.setAttribute('height', total);
    arrierePlan.setAttribute('fill', fond);
    const chemin = document.createElementNS(SVG, 'path');
    chemin.setAttribute('d', d);
    chemin.setAttribute('fill', couleur);
    chemin.setAttribute('fill-rule', 'evenodd');
    svg.append(arrierePlan, chemin);

    if (zoneLogo) {
        const cote = zoneLogo.fin - zoneLogo.debut;
        const image = document.createElementNS(SVG, 'image');
        image.setAttribute('href', o.logo);
        image.setAttribute('x', zoneLogo.debut + marge + 0.4);
        image.setAttribute('y', zoneLogo.debut + marge + 0.4);
        image.setAttribute('width', cote - 0.8);
        image.setAttribute('height', cote - 0.8);
        image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.append(image);
    }
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
    // logo_url : l'URL du média choisi, ajoutée par le serveur (lecteur) ou par l'éditeur (aperçu).
    bloc.append(svgQR(url.href, { ...reglages, logo: typeof reglages.logo_url === 'string' ? reglages.logo_url : null }), adresse);
    region.append(bloc);
    return null;
}
