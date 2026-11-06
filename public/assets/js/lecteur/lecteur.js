// Lecteur plein écran d'une chaîne (public/index.php?chaine=slug).
//
// Interroge l'API publique toutes les 30 s et à l'heure du prochain changement prévu.
// Une nouvelle playlist (champ `etat` différent) n'est appliquée qu'à la fin de la page en
// cours, pour éviter une coupure. Si le serveur ne répond plus, l'affichage continue.

import { DUREE_PAGE } from '../commun/widgets.js';
import { afficherPage, echelle } from './affichage.js';

const INTERVALLE_INTERROGATION = 30 * 1000;

const scene = document.getElementById('scene');
const message = document.getElementById('message');
const urlApi = scene.dataset.api;

let decalageHorloge = 0; // horloge du serveur - horloge locale, en ms
let donnees = null; // réponse de l'API actuellement affichée
let enAttente = null; // réponse plus récente, appliquée au prochain changement de page
let pageAffichee = null;
let indexPage = 0;
let minuteurPage = null;
let minuteurChangement = null;

const contexte = {
    maintenant: () => new Date(Date.now() + decalageHorloge),
    urlApi,
    meteoRelais: false, // météo par le relais du serveur (réglage du panneau d'administration)
};

function montrerMessage(texte) {
    message.textContent = texte;
    message.hidden = false;
}

function pages() {
    const p = donnees?.playlist?.pages;
    return Array.isArray(p) ? p : [];
}

function mettreAEchelle() {
    const portrait = donnees?.playlist?.portrait ?? donnees?.chaine?.orientation === 'portrait';
    scene.style.setProperty('--echelle', String(echelle(scene.clientWidth, scene.clientHeight, portrait)));
}

function appliquer(nouvelles) {
    donnees = nouvelles;
    contexte.meteoRelais = nouvelles.meteo_relais === true;
    enAttente = null;
    indexPage = 0;
    mettreAEchelle();
    montrerPage();
}

function montrerPage() {
    clearTimeout(minuteurPage);
    const liste = pages();
    const ancienne = pageAffichee;
    pageAffichee = null;
    if (liste.length > 0) {
        const page = liste[indexPage % liste.length];
        pageAffichee = afficherPage(scene, donnees.playlist, page, contexte);
        const duree = Number(page.duree) > 0 ? Number(page.duree) : DUREE_PAGE;
        minuteurPage = setTimeout(pageSuivante, duree * 1000);
    }
    ancienne?.detruire();
}

function pageSuivante() {
    if (enAttente) {
        appliquer(enAttente);
        return;
    }
    const liste = pages();
    if (liste.length > 1) {
        indexPage = (indexPage + 1) % liste.length;
        montrerPage();
    } else {
        // Une seule page : elle reste affichée sans être recréée (vidéos, défilements continus).
        const duree = Number(liste[0]?.duree) > 0 ? Number(liste[0].duree) : DUREE_PAGE;
        minuteurPage = setTimeout(pageSuivante, duree * 1000);
    }
}

function planifierChangement(iso) {
    clearTimeout(minuteurChangement);
    const instant = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(instant)) {
        const delai = instant - contexte.maintenant().getTime() + 500;
        minuteurChangement = setTimeout(interroger, Math.min(Math.max(delai, 0), 2 ** 31 - 1));
    }
}

async function interroger() {
    let reponse;
    try {
        reponse = await fetch(urlApi, { cache: 'no-store', headers: { Accept: 'application/json' } });
    } catch (e) {
        console.warn('Serveur injoignable, affichage conservé.', e);
        if (!donnees) {
            montrerMessage('Connexion au serveur…');
        }
        return;
    }
    if (reponse.status === 404) {
        donnees = null;
        enAttente = null;
        clearTimeout(minuteurPage);
        pageAffichee?.detruire();
        pageAffichee = null;
        montrerMessage('Chaîne introuvable.');
        return;
    }
    if (!reponse.ok) {
        console.warn(`Réponse ${reponse.status} du serveur, affichage conservé.`);
        return;
    }

    let nouvelles;
    try {
        nouvelles = await reponse.json();
    } catch (e) {
        console.warn('Réponse illisible, affichage conservé.', e);
        return;
    }
    message.hidden = true;
    const heureServeur = Date.parse(nouvelles.maintenant);
    if (Number.isFinite(heureServeur)) {
        decalageHorloge = heureServeur - Date.now();
    }
    planifierChangement(nouvelles.prochain_changement);

    if (!donnees || pages().length === 0) {
        appliquer(nouvelles);
    } else if (nouvelles.etat !== donnees.etat) {
        enAttente = nouvelles;
    } else {
        enAttente = null;
    }
    if (pages().length === 0) {
        montrerMessage(donnees.playlist ? 'Cette playlist ne contient aucune page.' : 'Aucune playlist programmée.');
    }
}

// Empêche la mise en veille de l'écran, quand le navigateur le permet.
async function garderEveille() {
    try {
        await navigator.wakeLock?.request('screen');
    } catch {
        // Refusé (onglet en arrière-plan, économie d'énergie) : nouvel essai au retour au premier plan.
    }
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        garderEveille();
    }
});

new ResizeObserver(mettreAEchelle).observe(scene);
garderEveille();
interroger();
setInterval(interroger, INTERVALLE_INTERROGATION);
