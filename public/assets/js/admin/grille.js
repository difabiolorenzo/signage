// Grille personnalisée : l'utilisateur dessine ses régions à la souris (ou au doigt) sur une
// grille de TAILLE_GRILLE × TAILLE_GRILLE cases. Les régions ne peuvent pas se chevaucher.
// Un clic sans glisser sur une région la supprime.

import { couleurRegion, TAILLE_GRILLE } from '../commun/dispositions.js';
import { placer } from './apercu.js';
import { el } from './dom.js';

const chevauche = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

/**
 * Renvoie { element, rectangles(), origines(), portrait() } ; rectangles en cases : [x, y, largeur, hauteur].
 * `initiaux` : rectangles de départ (modification d'une grille existante) ; origines() donne pour
 * chaque rectangle l'indice du rectangle initial dont il provient, ou null s'il a été tracé.
 */
export function grillePersonnalisee(portraitInitial, initiaux = []) {
    const n = TAILLE_GRILLE;
    const rectangles = initiaux.map((r, i) => ({ r: [...r], origine: i }));
    let portrait = portraitInitial;
    let depart = null;

    const zone = el('div', { class: 'grille-dessin', role: 'img', 'aria-label': `Grille de ${n} × ${n} cases` });
    const selection = el('div', { class: 'grille-selection', hidden: true });
    const compteur = el('span');
    const erreur = el('p', { class: 'erreur', role: 'alert', hidden: true });
    const caseOrientation = el('input', { type: 'checkbox', checked: portrait });

    function dessiner() {
        zone.classList.toggle('portrait', portrait);
        zone.replaceChildren(...rectangles.map(({ r }, i) => {
            const region = el('div', { class: 'apercu-region', text: i + 1 });
            placer(region, r.map((v) => v / n));
            region.style.backgroundColor = couleurRegion(i);
            return region;
        }), selection);
        compteur.textContent = `${rectangles.length} région(s)`;
    }

    function caseSous(evenement) {
        const r = zone.getBoundingClientRect();
        const borne = (v) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
        return [borne((evenement.clientX - r.left) / r.width), borne((evenement.clientY - r.top) / r.height)];
    }

    function rectangleEntre(a, b) {
        const x = Math.min(a[0], b[0]);
        const y = Math.min(a[1], b[1]);
        return [x, y, Math.abs(a[0] - b[0]) + 1, Math.abs(a[1] - b[1]) + 1];
    }

    zone.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) {
            return;
        }
        e.preventDefault();
        zone.setPointerCapture(e.pointerId);
        depart = caseSous(e);
        erreur.hidden = true;
        placer(selection, rectangleEntre(depart, depart).map((v) => v / n));
        selection.hidden = false;
    });
    zone.addEventListener('pointermove', (e) => {
        if (depart) {
            placer(selection, rectangleEntre(depart, caseSous(e)).map((v) => v / n));
        }
    });
    zone.addEventListener('pointerup', (e) => {
        if (!depart) {
            return;
        }
        const fin = caseSous(e);
        const nouveau = rectangleEntre(depart, fin);
        const clic = fin[0] === depart[0] && fin[1] === depart[1];
        depart = null;
        selection.hidden = true;
        const touchee = rectangles.findIndex(({ r }) => chevauche(r, nouveau));
        if (clic && touchee >= 0) {
            rectangles.splice(touchee, 1);
            dessiner();
            return;
        }
        if (touchee >= 0) {
            erreur.textContent = 'Les régions ne peuvent pas se chevaucher.';
            erreur.hidden = false;
            return;
        }
        rectangles.push({ r: nouveau, origine: null });
        dessiner();
    });
    zone.addEventListener('pointercancel', () => {
        depart = null;
        selection.hidden = true;
    });
    caseOrientation.addEventListener('change', () => {
        portrait = caseOrientation.checked;
        dessiner();
    });

    dessiner();
    const element = el('div', { class: 'grille-perso' },
        el('label', { class: 'case' }, caseOrientation, ' Orientation portrait'),
        el('p', { class: 'aide', text: 'Faites glisser la souris dans la grille pour tracer chaque région ; cliquez sur une région pour la supprimer.' }),
        zone,
        erreur,
        el('div', { class: 'grille-outils' },
            compteur,
            el('button', { type: 'button', class: 'bouton', text: 'Annuler la dernière', onclick: () => { rectangles.pop(); dessiner(); } }),
            el('button', { type: 'button', class: 'bouton', text: 'Tout effacer', onclick: () => { rectangles.length = 0; dessiner(); } })));

    return {
        element,
        rectangles: () => rectangles.map(({ r }) => [...r]),
        origines: () => rectangles.map(({ origine }) => origine),
        portrait: () => portrait,
    };
}
