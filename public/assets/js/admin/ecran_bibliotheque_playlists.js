// Menu « Playlists » : toutes les playlists visibles par l'utilisateur (bibliothèque partagée),
// filtrées par chaîne, auteur, portée et orientation ; création d'une playlist privée.

import { api } from './api.js';
import { filtres, optionsAuteurs, OPTIONS_PORTEE } from './bibliotheque.js';
import { el } from './dom.js';
import { lienPlaylist, nouvellePlaylist, tuile } from './ecran_playlists.js';
import { ongletsAccueil } from './navigation.js';

// Conservés pendant la session de l'éditeur.
const valeurs = { chaine: '', auteur: '', portee: '', orientation: '' };

/** La playlist passe-t-elle les filtres ? chaîne : ouverte à cette chaîne ou programmée dessus. */
function retenue(p) {
    const chaine = Number(valeurs.chaine);
    return (!chaine || p.acces.chaines.some((c) => c.id === chaine) || p.utilisee_par.some((c) => c.id === chaine))
        && (!valeurs.auteur || String(p.auteur?.id) === valeurs.auteur)
        && (!valeurs.portee || p.portee === valeurs.portee)
        && (!valeurs.orientation || p.orientation === valeurs.orientation);
}

export async function afficher(ecran, contexte) {
    const [{ playlists }, { chaines }] = await Promise.all([api.get('/playlists'), api.get('/chaines')]);
    document.title = 'Playlists — Signage Studio';
    if (valeurs.chaine && !chaines.some((c) => String(c.id) === valeurs.chaine)) {
        valeurs.chaine = '';
    }

    const grille = el('div', { class: 'grille-tuiles' });
    const compte = el('p', { class: 'meta', 'aria-live': 'polite' });
    const rafraichir = async (message) => {
        await afficher(ecran, contexte);
        if (message) {
            contexte.notifier(message);
        }
    };
    const dessiner = () => {
        const retenues = playlists.filter(retenue);
        compte.textContent = `${retenues.length} playlist(s) sur ${playlists.length}`;
        grille.replaceChildren(...(retenues.length === 0
            ? [el('p', { class: 'vide', text: playlists.length === 0 ? 'Aucune playlist pour le moment. Créez-en une avec « + Playlist ».' : 'Aucune playlist ne correspond à ces filtres.' })]
            : retenues.map((p) => tuile(p, null, contexte, rafraichir))));
    };

    const barreFiltres = filtres([
        { cle: 'chaine', libelle: 'Chaîne', options: [['', 'Toutes'], ...chaines.map((c) => [String(c.id), c.nom])] },
        { cle: 'auteur', libelle: 'Auteur', options: optionsAuteurs(playlists) },
        { cle: 'portee', libelle: 'Portée', options: OPTIONS_PORTEE },
        { cle: 'orientation', libelle: 'Orientation', options: [['', 'Toutes'], ['paysage', 'Paysage'], ['portrait', 'Portrait']] },
    ], valeurs, dessiner);

    dessiner();
    ecran.replaceChildren(contexte.cadre({
        ...ongletsAccueil(contexte, 'playlists'),
        barre: [
            el('h1', { text: 'Playlists' }),
            el('button', {
                type: 'button', class: 'bouton principal', text: '+ Playlist',
                onclick: async () => {
                    const id = await nouvellePlaylist();
                    if (id) {
                        location.hash = lienPlaylist(id);
                    }
                },
            }),
        ],
        contenu: [
            el('p', { class: 'aide-ecran', text: 'Toutes les playlists que vous pouvez voir. Une playlist passe sur une chaîne quand elle est dans sa programmation ; seuls son auteur et les administrateurs la modifient.' }),
            barreFiltres,
            compte,
            grille,
        ],
    }));
}
