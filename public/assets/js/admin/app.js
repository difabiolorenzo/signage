// Éditeur : connexion, en-tête, navigation entre les écrans (#/, #/playlists, #/medias, #/chaines/{id}…).

import { api, definirJeton, ErreurApi, quandSessionPerdue } from './api.js';
import { basculeMotDePasse } from '../commun/mot_de_passe.js';
import { el } from './dom.js';
import * as ecranBibliothequePlaylists from './ecran_bibliotheque_playlists.js';
import * as ecranChaines from './ecran_chaines.js';
import * as ecranCompte from './ecran_compte.js';
import * as ecranMedias from './ecran_medias.js';
import * as ecranProgrammation from './ecran_programmation.js';
import * as ecranSauvegarde from './ecran_sauvegarde.js';
import * as ecranUtilisateurs from './ecran_utilisateurs.js';
import * as ecranPlaylist from './ecran_playlist.js';
import * as ecranPlaylists from './ecran_playlists.js';

const racine = document.getElementById('app');
const zoneNotification = document.getElementById('notification');
let utilisateur = null;
let minuteurNotification = null;

/**
 * Message bref en bas de l'écran (succès d'une action). `action` facultative : { texte, surClic },
 * un bouton dans la notification (ex. « Annuler »), qui reste alors affichée plus longtemps.
 */
function notifier(texte, action = null) {
    zoneNotification.replaceChildren(el('span', { text: texte }));
    if (action) {
        zoneNotification.append(el('button', {
            type: 'button', class: 'bouton lien', text: action.texte,
            onclick: () => {
                zoneNotification.hidden = true;
                action.surClic();
            },
        }));
    }
    zoneNotification.hidden = false;
    clearTimeout(minuteurNotification);
    minuteurNotification = setTimeout(() => {
        zoneNotification.hidden = true;
    }, action ? 8000 : 3500);
}

/**
 * Mise en page commune : barre latérale (onglets), barre d'outils et contenu.
 * onglets : [{ texte, lien, actif }] ; avant : nœuds placés au-dessus des onglets.
 */
function cadre({ avant = [], onglets = [], barre = [], contenu = [] }) {
    return el('div', { class: 'mise-en-page' },
        el('nav', { class: 'lateral', 'aria-label': 'Navigation' },
            avant,
            onglets.map((o) => el('a', { class: o.actif ? 'onglet actif' : 'onglet', href: o.lien, 'aria-current': o.actif ? 'page' : null, text: o.texte }))),
        el('main', { class: 'zone-principale' },
            el('div', { class: 'barre' }, barre),
            el('div', { class: 'contenu' }, contenu)));
}

function entete() {
    const nom = utilisateur.nom || utilisateur.identifiant;
    return el('header', { class: 'entete' },
        el('a', { class: 'marque', href: '#/' }, 'Signage ', el('span', { text: 'Studio' })),
        el('div', { class: 'compte' },
            el('a', { class: 'lien-compte', href: '#/compte', title: 'Mon compte', text: `${nom} · ${utilisateur.role === 'admin' ? 'administrateur' : 'éditeur'}` }),
            el('button', { type: 'button', class: 'bouton lien', text: 'Déconnexion', onclick: deconnecter })));
}

const contexte = {
    get utilisateur() {
        return utilisateur;
    },
    estAdmin: () => utilisateur?.role === 'admin',
    notifier,
    cadre,
    /** Met à jour l'utilisateur connecté (ex. après « Mon compte ») et l'en-tête. */
    majUtilisateur(u) {
        utilisateur = { ...utilisateur, ...u };
        racine.querySelector('.entete')?.replaceWith(entete());
    },
    /** Défini par un écran qui peut avoir des modifications non enregistrées. */
    modificationsEnCours: null,
    /** Enregistre une fonction de nettoyage appelée en quittant l'écran courant. */
    surQuitter: (fonction) => nettoyages.push(fonction),
};
let nettoyages = [];
let cheminAffiche = null;

const MESSAGE_QUITTER = 'Des modifications ne sont pas enregistrées. Quitter quand même ?';

/** Affiche l'écran correspondant à l'adresse (#/…). */
async function router() {
    if (!utilisateur) {
        return;
    }
    const chemin = location.hash.replace(/^#/, '') || '/';
    if (chemin === cheminAffiche) {
        return;
    }
    if (contexte.modificationsEnCours?.() && !confirm(MESSAGE_QUITTER)) {
        // Retour à l'adresse de l'écran en cours, sans le recharger.
        history.replaceState(null, '', `#${cheminAffiche}`);
        return;
    }
    nettoyages.forEach((f) => f());
    nettoyages = [];
    contexte.modificationsEnCours = null;
    cheminAffiche = chemin;

    const m = /^\/chaines\/(\d+)$/.exec(chemin);
    const mPlaylist = /^\/chaines\/(\d+)\/playlists\/(\d+)$/.exec(chemin);
    const mOnglet = /^\/chaines\/(\d+)\/(programmation|medias)$/.exec(chemin);
    const mBibliotheque = /^\/playlists\/(\d+)$/.exec(chemin);
    const ecran = el('div', { class: 'ecran' });
    document.title = 'Signage Studio — Éditeur';
    racine.replaceChildren(entete(), ecran);
    try {
        if (mOnglet) {
            // #/chaines/{id}/medias : ancienne adresse, menu « Médias » filtré sur la chaîne.
            const ecranOnglet = mOnglet[2] === 'medias' ? ecranMedias : ecranProgrammation;
            await ecranOnglet.afficher(ecran, contexte, Number(mOnglet[1]));
        } else if (chemin === '/playlists') {
            await ecranBibliothequePlaylists.afficher(ecran, contexte);
        } else if (chemin === '/medias') {
            await ecranMedias.afficher(ecran, contexte);
        } else if (mBibliotheque) {
            await ecranPlaylist.afficher(ecran, contexte, null, Number(mBibliotheque[1]));
        } else if (chemin === '/sauvegarde') {
            await ecranSauvegarde.afficher(ecran, contexte);
        } else if (chemin === '/compte') {
            await ecranCompte.afficher(ecran, contexte);
        } else if (chemin === '/utilisateurs') {
            await ecranUtilisateurs.afficher(ecran, contexte);
        } else if (mPlaylist) {
            await ecranPlaylist.afficher(ecran, contexte, Number(mPlaylist[1]), Number(mPlaylist[2]));
        } else if (m) {
            await ecranPlaylists.afficher(ecran, contexte, Number(m[1]));
        } else {
            await ecranChaines.afficher(ecran, contexte);
        }
    } catch (e) {
        if (e instanceof ErreurApi && e.statut === 401) {
            return;
        }
        ecran.replaceChildren(cadre({
            onglets: [{ texte: 'Chaînes', lien: '#/' }],
            contenu: el('p', { class: 'erreur', text: e.message }),
        }));
    }
}

function ecranConnexion(message = '') {
    utilisateur = null;
    const identifiant = el('input', { name: 'identifiant', autocomplete: 'username', required: true, maxlength: 64 });
    const motDePasse = el('input', { name: 'mot_de_passe', type: 'password', autocomplete: 'current-password', required: true });
    const erreur = el('p', { class: 'erreur', role: 'alert', text: message, hidden: message === '' });
    const bouton = el('button', { type: 'submit', class: 'bouton principal', text: 'Se connecter' });

    const formulaire = el('form', { class: 'connexion' },
        el('h1', {}, 'Signage ', el('span', { text: 'Studio' })),
        el('label', { text: 'Identifiant' }, identifiant),
        el('label', { text: 'Mot de passe' }, basculeMotDePasse(motDePasse).bloc),
        erreur,
        bouton);
    formulaire.addEventListener('submit', async (evenement) => {
        evenement.preventDefault();
        bouton.disabled = true;
        erreur.hidden = true;
        try {
            const r = await api.post('/connexion', { identifiant: identifiant.value, mot_de_passe: motDePasse.value });
            ouvrirSession(r);
        } catch (e) {
            erreur.textContent = e.message;
            erreur.hidden = false;
            motDePasse.value = '';
            motDePasse.focus();
        } finally {
            bouton.disabled = false;
        }
    });
    racine.replaceChildren(el('div', { class: 'page-connexion' }, formulaire));
    identifiant.focus();
}

function ouvrirSession({ utilisateur: u, jeton }) {
    utilisateur = u;
    definirJeton(jeton);
    cheminAffiche = null;
    router();
}

async function deconnecter() {
    if (contexte.modificationsEnCours?.() && !confirm(MESSAGE_QUITTER)) {
        return;
    }
    nettoyages.forEach((f) => f());
    nettoyages = [];
    contexte.modificationsEnCours = null;
    try {
        await api.post('/deconnexion');
    } catch {
        // Session déjà fermée côté serveur : on revient quand même à l'écran de connexion.
    }
    definirJeton(null);
    // Rechargement : rien de la session précédente ne reste en mémoire (filtres des écrans…).
    location.replace(location.pathname);
}

quandSessionPerdue(() => ecranConnexion('Votre session a expiré : reconnectez-vous.'));
window.addEventListener('hashchange', router);
window.addEventListener('beforeunload', (evenement) => {
    if (contexte.modificationsEnCours?.()) {
        evenement.preventDefault();
    }
});

try {
    const moi = await api.get('/moi');
    if (moi.utilisateur) {
        ouvrirSession(moi);
    } else {
        ecranConnexion();
    }
} catch (e) {
    racine.replaceChildren(el('p', { class: 'erreur chargement', text: e.message }));
}
