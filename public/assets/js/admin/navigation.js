// Onglets de la barre latérale : accueil (chaînes, bibliothèque, utilisateurs) et écrans d'une chaîne.

import { el } from './dom.js';

/** Accueil : « Chaînes », « Playlists », « Médias », « Utilisateurs » et « Sauvegarde » pour un administrateur, puis « Mon compte ». */
export function ongletsAccueil(contexte, actif) {
    return {
        onglets: [
            { texte: 'Chaînes', lien: '#/', actif: actif === 'chaines' },
            { texte: 'Playlists', lien: '#/playlists', actif: actif === 'playlists' },
            { texte: 'Médias', lien: '#/medias', actif: actif === 'medias' },
            contexte.estAdmin() && { texte: 'Utilisateurs', lien: '#/utilisateurs', actif: actif === 'utilisateurs' },
            contexte.estAdmin() && { texte: 'Sauvegarde', lien: '#/sauvegarde', actif: actif === 'sauvegarde' },
            { texte: 'Mon compte', lien: '#/compte', actif: actif === 'compte' },
        ].filter(Boolean),
    };
}

/** Écrans d'une chaîne : retour, nom de la chaîne, puis Playlists et Programmation (les médias sont dans le menu « Médias »). */
export function ongletsChaine(chaine, actif) {
    const base = `#/chaines/${chaine.id}`;
    return {
        avant: [
            el('a', { class: 'retour', href: '#/', text: '← Chaînes' }),
            el('p', { class: 'nom-chaine', text: chaine.nom }),
        ],
        onglets: [
            { texte: 'Playlists', lien: base, actif: actif === 'playlists' },
            { texte: 'Programmation', lien: `${base}/programmation`, actif: actif === 'programmation' },
        ],
    };
}
