// Widgets Horloge et Date et heure : numérique ou analogique, 12 / 24 h, 6 affichages.
// L'heure est celle du serveur (contexte.maintenant), l'horloge d'un afficheur pouvant être fausse.

import { TAILLE_HORLOGE } from '../../commun/widgets.js';
import { styleTexte } from '../outils.js';

const SVG = 'http://www.w3.org/2000/svg';

const z = (n) => String(n).padStart(2, '0');
const nomJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });
const nomJourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const nomMois = new Intl.DateTimeFormat('fr-FR', { month: 'long' });
const nomMoisCourt = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

/** Format de date à la manière de strftime : %Y %y %m %d %e %A %a %B %b %H %I %M %S %p %%. */
export function formaterDate(date, format) {
    return String(format).replace(/%([YymdeAaBbHIMSp%])/g, (_, c) => {
        switch (c) {
            case 'Y': return String(date.getFullYear());
            case 'y': return z(date.getFullYear() % 100);
            case 'm': return z(date.getMonth() + 1);
            case 'd': return z(date.getDate());
            case 'e': return String(date.getDate());
            case 'A': return nomJour.format(date);
            case 'a': return nomJourCourt.format(date);
            case 'B': return nomMois.format(date);
            case 'b': return nomMoisCourt.format(date);
            case 'H': return z(date.getHours());
            case 'I': return z(date.getHours() % 12 || 12);
            case 'M': return z(date.getMinutes());
            case 'S': return z(date.getSeconds());
            case 'p': return date.getHours() < 12 ? 'AM' : 'PM';
            default: return '%';
        }
    });
}

function heure(date, h24) {
    return h24
        ? `${z(date.getHours())}:${z(date.getMinutes())}`
        : `${date.getHours() % 12 || 12}:${z(date.getMinutes())} ${date.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** Lignes à afficher selon AFFICHAGES_HORLOGE (indices 0 à 5). */
function lignes(date, reglages, avecHeure) {
    const h = heure(date, reglages.h24 !== false);
    const d = formaterDate(date, reglages.format_date ?? '%Y.%m.%d %A');
    switch (Number(reglages.affichage)) {
        case 1: return [d];
        case 2: return [avecHeure ? `${d} ${h}` : d];
        case 3: return avecHeure ? [d, h] : [d];
        case 4: return [avecHeure ? `${h} ${d}` : d];
        case 5: return avecHeure ? [h, d] : [d];
        default: return avecHeure ? [h] : [];
    }
}

function cadran() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    svg.classList.add('cadran');
    const trait = (attributs) => {
        const el = document.createElementNS(SVG, attributs.r ? 'circle' : 'line');
        for (const [k, v] of Object.entries(attributs)) {
            el.setAttribute(k, String(v));
        }
        svg.append(el);
        return el;
    };
    trait({ cx: 0, cy: 0, r: 96, fill: 'none', stroke: 'currentColor', 'stroke-width': 4 });
    for (let i = 0; i < 60; i++) {
        const a = (i * Math.PI) / 30;
        const r1 = i % 5 === 0 ? 78 : 86;
        trait({
            x1: r1 * Math.sin(a), y1: -r1 * Math.cos(a), x2: 90 * Math.sin(a), y2: -90 * Math.cos(a),
            stroke: 'currentColor', 'stroke-width': i % 5 === 0 ? 4 : 1.5,
        });
    }
    const aiguille = (longueur, epaisseur) => trait({
        x1: 0, y1: 12, x2: 0, y2: -longueur, stroke: 'currentColor', 'stroke-width': epaisseur, 'stroke-linecap': 'round',
    });
    const heures = aiguille(50, 7);
    const minutes = aiguille(72, 5);
    const secondes = aiguille(80, 2);
    secondes.setAttribute('opacity', '0.7');
    trait({ cx: 0, cy: 0, r: 5, fill: 'currentColor' });

    return {
        svg,
        regler(date) {
            const s = date.getSeconds();
            const m = date.getMinutes() + s / 60;
            const h = (date.getHours() % 12) + m / 60;
            heures.setAttribute('transform', `rotate(${h * 30})`);
            minutes.setAttribute('transform', `rotate(${m * 6})`);
            secondes.setAttribute('transform', `rotate(${s * 6})`);
        },
    };
}

export function creer(region, reglages, contexte) {
    const bloc = document.createElement('div');
    bloc.className = 'bloc';
    styleTexte(bloc, reglages, TAILLE_HORLOGE);
    region.append(bloc);

    const analogique = reglages.analogique === true;
    const aiguilles = analogique ? cadran() : null;
    if (aiguilles) {
        bloc.append(aiguilles.svg);
    }
    const zoneLignes = document.createElement('div');
    bloc.append(zoneLignes);

    let minuteur = null;
    function rafraichir() {
        const maintenant = contexte.maintenant();
        aiguilles?.regler(maintenant);
        const textes = lignes(maintenant, reglages, !analogique);
        zoneLignes.replaceChildren(...textes.map((t) => {
            const ligne = document.createElement('div');
            ligne.className = 'ligne';
            ligne.textContent = t;
            return ligne;
        }));
        minuteur = setTimeout(rafraichir, 1000 - (maintenant.getTime() % 1000) + 10);
    }
    rafraichir();

    return { detruire: () => clearTimeout(minuteur) };
}
