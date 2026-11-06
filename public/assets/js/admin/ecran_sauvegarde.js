// Section « Sauvegarde » de l'écran Administration (administrateurs) : télécharger une sauvegarde
// de la base, en restaurer une.

import { api, envoyerFichier } from './api.js';
import { confirmer } from './dialogue.js';
import { el } from './dom.js';

const AVERTISSEMENT_MEDIAS = 'Les médias (images et vidéos du dossier public/uploads/) ne sont pas inclus : copiez ce dossier à la main pour les sauvegarder.';

function liste(titre, elements) {
    return elements.length === 0 ? null : el('div', {},
        el('p', { text: titre }),
        el('ul', { class: 'liste-controle' }, elements.map((e) => el('li', { text: e }))));
}

function resultat(r) {
    const { manquants, orphelins } = r.medias;
    return el('div', { class: 'resultat-restauration', role: 'status' },
        el('p', { class: 'succes', text: 'Restauration terminée.' }),
        el('p', { text: `L'état précédent a été enregistré sur le serveur dans sauvegardes/${r.sauvegarde_automatique}.` }),
        manquants.length === 0 && orphelins.length === 0
            ? el('p', { text: 'Médias : chaque média de la base a son fichier dans public/uploads/, et inversement.' })
            : [
                liste(`Médias dont le fichier manque dans public/uploads/ (${manquants.length}) : copiez-y les fichiers de l'ancien serveur.`, manquants),
                liste(`Fichiers de public/uploads/ qu'aucun média n'utilise (${orphelins.length}) :`, orphelins),
            ],
        el('p', { text: 'Les comptes ont pu changer : rechargez l’éditeur (une nouvelle connexion peut être demandée).' }),
        el('button', { type: 'button', class: 'bouton principal', text: 'Recharger l’éditeur', onclick: () => location.reload() }));
}

/** Cartes « Télécharger » et « Restaurer ». */
export async function cartesSauvegarde(contexte) {
    const { version_base: versionBase, version_application: versionApplication } = await api.get('/sauvegarde');
    const aJour = versionBase === versionApplication;

    // Téléchargement : un simple lien (GET avec le cookie de session), le navigateur enregistre le fichier.
    const telecharger = aJour
        ? el('a', { class: 'bouton principal', href: `${document.body.dataset.api}/sauvegarde/telechargement`, text: 'Télécharger une sauvegarde' })
        : el('p', { class: 'erreur', text: `La base est à la version ${versionBase} du schéma et l'application à la version ${versionApplication} : appliquez d'abord les migrations de sql/migrations/ (voir le README).` });

    const fichier = el('input', { type: 'file', accept: '.json,application/json', required: true });
    const caseConfirmation = el('input', { type: 'checkbox', required: true });
    const erreur = el('p', { class: 'erreur', role: 'alert', hidden: true });
    const progression = el('progress', { max: 1, value: 0, hidden: true });
    const bouton = el('button', { type: 'submit', class: 'bouton danger', text: 'Restaurer une sauvegarde', disabled: !aJour });
    const zoneResultat = el('div', {});
    const formulaire = el('form', { class: 'carte formulaire-compte' },
        el('h2', { text: 'Restaurer une sauvegarde' }),
        el('p', { text: 'Seuls les fichiers produits par « Télécharger une sauvegarde » sont acceptés, d’une version de l’application identique ou plus ancienne.' }),
        el('label', { class: 'champ' }, el('span', { text: 'Fichier de sauvegarde' }), fichier),
        el('label', { class: 'case' }, caseConfirmation, ' Je comprends que toutes les données actuelles (chaînes, playlists, programmation, médias, comptes, réglages) seront remplacées.'),
        el('p', { class: 'meta', text: 'L’état actuel est d’abord sauvegardé automatiquement sur le serveur (dossier sauvegardes/). L’import se fait en tout ou rien.' }),
        erreur, progression,
        el('div', { class: 'actions' }, bouton),
        zoneResultat);

    formulaire.addEventListener('submit', async (e) => {
        e.preventDefault();
        erreur.hidden = true;
        const choisi = fichier.files[0];
        if (!choisi || !caseConfirmation.checked) {
            erreur.textContent = 'Choisissez un fichier et cochez la case de confirmation.';
            erreur.hidden = false;
            return;
        }
        const ok = await confirmer('Restaurer la sauvegarde', [
            `Toutes les données actuelles vont être remplacées par celles de « ${choisi.name} ».`,
            AVERTISSEMENT_MEDIAS,
        ], 'Remplacer toutes les données');
        if (!ok) {
            return;
        }
        const donnees = new FormData();
        donnees.append('fichier', choisi);
        donnees.append('confirmation', 'REMPLACER');
        bouton.disabled = true;
        progression.hidden = false;
        try {
            const r = await envoyerFichier('/sauvegarde/restauration', donnees, (p) => { progression.value = p; });
            formulaire.querySelectorAll('input, button[type=submit]').forEach((c) => { c.disabled = true; });
            zoneResultat.replaceChildren(resultat(r));
            contexte.notifier('Sauvegarde restaurée.');
        } catch (ex) {
            erreur.textContent = ex.message;
            erreur.hidden = false;
            bouton.disabled = false;
        } finally {
            progression.hidden = true;
        }
    });

    return [
        el('section', { class: 'carte formulaire-compte' },
            el('h2', { text: 'Télécharger une sauvegarde' }),
            el('p', { text: 'Fichier JSON de toute la base : chaînes, playlists, programmation, liste des médias, comptes et droits (mots de passe sous forme d’empreintes uniquement), réglages de cet écran (clé d’API météo comprise, en clair : gardez le fichier en lieu sûr).' }),
            el('p', { class: 'avertissement', text: AVERTISSEMENT_MEDIAS }),
            el('p', { class: 'meta', text: `Version du schéma : ${versionBase}.` }),
            el('div', { class: 'actions' }, telecharger)),
        formulaire,
    ];
}
