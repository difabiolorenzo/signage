// Choix d'une disposition sur aperçu (paysage, portrait) ou dessin d'une grille personnalisée.
// Sert à la création d'une playlist et au changement de grille d'une playlist existante.

import {
    DISPOSITIONS, estDispositionPortrait, libelleDisposition, PERSONNALISEE, PERSONNALISEE_PORTRAIT,
    regionsDe, regionsPersonnalisees, TAILLE_GRILLE, trouverDisposition,
} from '../commun/dispositions.js';
import { apercuDisposition } from './apercu.js';
import { el } from './dom.js';
import { grillePersonnalisee } from './grille.js';

const egales = (a, b) => a.every((v, k) => Math.abs(v - b[k]) < 1e-6);

/** Régions en cases de la grille personnalisée, ou [] si elles ne tombent pas sur ses cases. */
function rectanglesGrille(regions) {
    const cases = regions.map((r) => r.map((v) => v * TAILLE_GRILLE));
    return cases.every((r) => r.every((v) => Math.abs(v - Math.round(v)) < 1e-6)) ? cases.map((r) => r.map(Math.round)) : [];
}

/**
 * Pour chaque nouvelle région, l'indice de l'ancienne région dont elle reprend les widgets, ou null :
 * d'abord une ancienne région de même position et taille, puis les autres dans l'ordre des numéros.
 */
export function correspondance(anciennes, nouvelles) {
    const libres = new Set(anciennes.keys());
    const resultat = nouvelles.map((r) => {
        const i = [...libres].find((k) => egales(anciennes[k], r));
        if (i === undefined) {
            return null;
        }
        libres.delete(i);
        return i;
    });
    const restantes = [...libres];
    return resultat.map((i) => (i !== null ? i : restantes.shift() ?? null));
}

/**
 * actuelle : { disposition, regions } de la playlist modifiée, ou null pour une création ;
 * portraitDefaut : orientation proposée à la création.
 * Renvoie { element, resultat() } ; resultat() lève une erreur si le choix est incomplet, sinon
 * { disposition, regions, origines } (origines : voir correspondance(), [] à la création).
 */
export function choixDisposition({ actuelle = null, portraitDefaut = false }) {
    const anciennes = actuelle?.regions ?? [];
    const personnalisee = actuelle !== null && trouverDisposition(actuelle.disposition) === null;
    const portrait = actuelle ? estDispositionPortrait(actuelle.disposition) : portraitDefaut;
    let mode = personnalisee ? 'perso' : (portrait ? 'portrait' : 'paysage'); // paysage | portrait | perso
    let choix = actuelle ? trouverDisposition(actuelle.disposition) : null;

    const onglets = el('div', { class: 'segments', role: 'tablist' });
    const grille = el('div', { class: 'grille-dispositions', role: 'listbox', 'aria-label': 'Dispositions' });
    const initiaux = personnalisee ? rectanglesGrille(anciennes) : [];
    const perso = grillePersonnalisee(portrait, initiaux);
    const zone = el('div', { class: 'zone-disposition' });

    /** Marque la disposition choisie sans reconstruire la grille (garde la position de défilement). */
    function selectionner(d) {
        choix = d;
        for (const bouton of grille.children) {
            const actif = bouton.dataset.nom === d.nom;
            bouton.classList.toggle('actif', actif);
            bouton.setAttribute('aria-selected', String(actif));
        }
    }

    function dessiner() {
        onglets.replaceChildren(...[['paysage', 'Paysage'], ['portrait', 'Portrait'], ['perso', 'Personnalisé']].map(([valeur, texte]) => el('button', {
            type: 'button', role: 'tab', class: valeur === mode ? 'segment actif' : 'segment',
            'aria-selected': String(valeur === mode), text: texte,
            onclick: () => {
                mode = valeur;
                dessiner();
            },
        })));
        if (mode === 'perso') {
            zone.replaceChildren(perso.element);
            return;
        }
        const liste = DISPOSITIONS.filter((d) => d.portrait === (mode === 'portrait'));
        grille.replaceChildren(...liste.map((d) => el('button', {
            type: 'button', role: 'option', class: 'choix-disposition', dataset: { nom: d.nom },
            title: `${libelleDisposition(d.nom)} : ${d.cellules.length} région(s)`,
            onclick: () => selectionner(d),
            ondblclick: () => grille.closest('form').requestSubmit(),
        }, apercuDisposition(regionsDe(d), d.portrait), el('span', { text: libelleDisposition(d.nom) }))));
        grille.scrollTop = 0;
        selectionner(liste.includes(choix) ? choix : liste[0]);
        zone.replaceChildren(grille);
        grille.querySelector('.actif')?.scrollIntoView({ block: 'nearest' });
    }
    dessiner();

    function resultat() {
        if (mode !== 'perso') {
            const regions = regionsDe(choix);
            return { disposition: choix.nom, regions, origines: correspondance(anciennes, regions) };
        }
        const rectangles = perso.rectangles();
        if (rectangles.length === 0) {
            throw new Error('Faites glisser la souris dans la grille pour créer au moins une région.');
        }
        const regions = regionsPersonnalisees(rectangles);
        return {
            disposition: perso.portrait() ? PERSONNALISEE_PORTRAIT : PERSONNALISEE,
            regions,
            // Grille reprise de la playlist : chaque région garde les widgets de celle dont elle provient.
            origines: initiaux.length > 0 ? perso.origines() : correspondance(anciennes, regions),
        };
    }

    return { element: el('div', { class: 'choix-disposition-bloc' }, onglets, zone), resultat };
}
