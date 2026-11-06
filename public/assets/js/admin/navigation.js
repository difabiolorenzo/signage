// Onglets de la barre latérale : accueil (chaînes, utilisateurs) et écrans d'une chaîne.

import { el } from './dom.js';

/** Accueil : « Chaînes », et « Utilisateurs » pour un administrateur. */
export function ongletsAccueil(contexte, actif) {
    return {
        onglets: [
            { texte: 'Chaînes', lien: '#/', actif: actif === 'chaines' },
            contexte.estAdmin() && { texte: 'Utilisateurs', lien: '#/utilisateurs', actif: actif === 'utilisateurs' },
        ].filter(Boolean),
    };
}

/** Écrans d'une chaîne : retour, nom de la chaîne, puis Playlists, Programmation, Médias. */
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
            { texte: 'Médias', lien: `${base}/medias`, actif: actif === 'medias' },
        ],
    };
}
