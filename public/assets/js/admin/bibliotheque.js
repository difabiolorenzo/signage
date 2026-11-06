// Outils communs aux écrans de la bibliothèque (playlists et médias) : portée, auteur, filtres.
// type : 'playlists' ou 'medias' (préfixe des routes de l'API).

import { api } from './api.js';
import { champ, dialogue } from './dialogue.js';
import { el } from './dom.js';

export const LIBELLES_PORTEE = { globale: 'Globale', restreinte: 'Restreinte', privee: 'Privée' };

/** « Globale », « Privée » ou « Restreinte : restaurant, hall · Marie ». */
export function textePortee(objet) {
    if (objet.portee !== 'restreinte') {
        return LIBELLES_PORTEE[objet.portee];
    }
    const noms = [objet.acces.chaines.map((c) => c.nom).join(', '), objet.acces.utilisateurs.map((u) => u.nom).join(', ')];
    return `Restreinte : ${noms.filter(Boolean).join(' · ')}`;
}

/** Liste de cases à cocher { id, nom } ; renvoie [élément, () => ids cochés]. */
function cases(elements, coches, aide) {
    const entrees = elements.map((e) => ({ id: e.id, entree: el('input', { type: 'checkbox', checked: coches.includes(e.id) }) }));
    const element = elements.length === 0
        ? el('p', { class: 'aide', text: aide })
        : el('div', { class: 'liste-cases' }, elements.map((e, i) => el('label', { class: 'case' }, entrees[i].entree, ` ${e.nom}`)));
    return [element, () => entrees.filter((e) => e.entree.checked).map((e) => e.id), entrees.map((e) => e.entree)];
}

/** Ajoute à `liste` les éléments de `existants` absents (ex. chaîne d'un autre éditeur déjà dans la portée). */
const completer = (liste, existants) => [...liste, ...existants.filter((x) => !liste.some((e) => e.id === x.id))];

/**
 * Fenêtre « Portée » : globale, ou restreinte aux chaînes et utilisateurs cochés (aucun : privée).
 * Un éditeur ne peut ajouter que ses chaînes (vérifié par le serveur). Renvoie la réponse de
 * l'API ({ portee, acces, avertissement? }), ou null si la fenêtre est annulée.
 */
export async function reglerPortee(type, objet) {
    const [{ chaines }, { utilisateurs }] = await Promise.all([api.get('/chaines'), api.get('/annuaire')]);
    const nom = `portee-${Math.random().toString(36).slice(2, 9)}`;
    const globale = el('input', { type: 'radio', name: nom, checked: objet.portee === 'globale' });
    const restreinte = el('input', { type: 'radio', name: nom, checked: objet.portee !== 'globale' });
    const [listeChaines, chainesCochees, entreesChaines] = cases(
        completer(chaines.map((c) => ({ id: c.id, nom: c.nom })), objet.acces.chaines),
        objet.acces.chaines.map((c) => c.id),
        'Aucune chaîne.'
    );
    const [listeUtilisateurs, utilisateursCoches, entreesUtilisateurs] = cases(
        completer(utilisateurs, objet.acces.utilisateurs),
        objet.acces.utilisateurs.map((u) => u.id),
        'Aucun utilisateur.'
    );
    const majActivation = () => [...entreesChaines, ...entreesUtilisateurs].forEach((e) => { e.disabled = globale.checked; });
    globale.addEventListener('change', majActivation);
    restreinte.addEventListener('change', majActivation);
    majActivation();

    const libelleObjet = type === 'playlists' ? 'cette playlist' : 'ce média';
    return dialogue({
        titre: `Portée — ${objet.nom}`,
        texteValider: 'Enregistrer',
        corps: [
            el('label', { class: 'case' }, globale, ` Globale : tous les utilisateurs peuvent ${type === 'playlists' ? 'la voir et la programmer sur leurs chaînes' : 'l\'insérer dans leurs playlists'}`),
            el('label', { class: 'case' }, restreinte, ' Restreinte aux chaînes et utilisateurs cochés (rien de coché : privée)'),
            el('div', { class: 'deux-colonnes' },
                el('fieldset', { class: 'bloc-portee' }, el('legend', { text: 'Chaînes' }), listeChaines),
                el('fieldset', { class: 'bloc-portee' }, el('legend', { text: 'Utilisateurs' }), listeUtilisateurs)),
            el('p', { class: 'aide', text: type === 'playlists'
                ? `Les éditeurs d'une chaîne cochée voient ${libelleObjet} et peuvent la programmer sur cette chaîne ; un utilisateur coché peut la programmer sur ses chaînes. Seuls l'auteur et les administrateurs la modifient.`
                : `Les éditeurs d'une chaîne cochée et les utilisateurs cochés peuvent insérer ${libelleObjet} dans leurs playlists. Restreindre un média ne le retire pas des playlists qui l'utilisent déjà.` }),
        ],
        valider: () => api.put(`/${type}/${objet.id}/portee`, globale.checked
            ? { portee: 'globale', chaines: [], utilisateurs: [] }
            : { portee: 'restreinte', chaines: chainesCochees(), utilisateurs: utilisateursCoches() }),
    });
}

/** Fenêtre « Changer d'auteur » (administrateur) ; renvoie true si l'auteur a changé. */
export async function changerAuteur(type, objet) {
    const { utilisateurs } = await api.get('/annuaire');
    const choix = el('select', {}, utilisateurs.map((u) => el('option', { value: u.id, text: u.nom, selected: u.id === objet.auteur?.id })));
    return dialogue({
        titre: `Auteur — ${objet.nom}`,
        texteValider: 'Enregistrer',
        corps: [
            champ('Nouvel auteur', choix, 'L\'auteur et les administrateurs sont seuls à pouvoir modifier, restreindre ou supprimer.'),
        ],
        valider: async () => {
            await api.put(`/${type}/${objet.id}/auteur`, { auteur_id: Number(choix.value) });
            return true;
        },
    });
}

/**
 * Boutons « Portée… » (auteur, administrateur) et « Auteur… » (administrateur) d'une carte.
 * apres(message) : appelée après un changement, avec l'avertissement éventuel du serveur.
 */
export function boutonsBibliotheque(type, objet, contexte, apres) {
    return [
        objet.modifiable && el('button', {
            type: 'button', class: 'bouton', text: 'Portée…',
            onclick: async () => {
                try {
                    const r = await reglerPortee(type, objet);
                    if (r) {
                        apres(r.avertissement ? `Portée enregistrée. ${r.avertissement}` : 'Portée enregistrée.');
                    }
                } catch (e) {
                    contexte.notifier(e.message);
                }
            },
        }),
        contexte.estAdmin() && el('button', {
            type: 'button', class: 'bouton', text: 'Auteur…',
            onclick: async () => {
                try {
                    if (await changerAuteur(type, objet)) {
                        apres('Auteur changé.');
                    }
                } catch (e) {
                    contexte.notifier(e.message);
                }
            },
        }),
    ];
}

/**
 * Barre de filtres : listes déroulantes { cle, libelle, options: [[valeur, texte]] } dont la
 * première option (« Tous ») vaut ''. valeurs : objet modifié en place ; surChange() après chaque choix.
 */
export function filtres(definitions, valeurs, surChange) {
    return el('div', { class: 'filtres', role: 'group', 'aria-label': 'Filtres' },
        definitions.map((d) => {
            const choix = el('select', { 'aria-label': d.libelle },
                d.options.map(([valeur, texte]) => el('option', { value: valeur, text: texte, selected: String(valeurs[d.cle] ?? '') === String(valeur) })));
            choix.addEventListener('change', () => {
                valeurs[d.cle] = choix.value;
                surChange();
            });
            return el('label', { class: 'filtre' }, el('span', { class: 'etiquette', text: d.libelle }), choix);
        }));
}

/** Options d'auteur à partir des objets listés. */
export function optionsAuteurs(objets) {
    const auteurs = new Map();
    objets.forEach((o) => o.auteur && auteurs.set(o.auteur.id, o.auteur.nom));
    return [['', 'Tous'], ...[...auteurs].sort((a, b) => a[1].localeCompare(b[1], 'fr')).map(([id, nom]) => [String(id), nom])];
}

export const OPTIONS_PORTEE = [['', 'Toutes'], ['globale', 'Globale'], ['restreinte', 'Restreinte'], ['privee', 'Privée']];
