// Écran « Mon compte », pour tous les utilisateurs : nom affiché, identifiant de connexion et mot de passe.

import { basculeMotDePasse } from '../commun/mot_de_passe.js';
import { api } from './api.js';
import { champ } from './dialogue.js';
import { el } from './dom.js';
import { AIDE_IDENTIFIANT, champIdentifiant, MOT_DE_PASSE_MIN } from './ecran_utilisateurs.js';
import { ongletsAccueil } from './navigation.js';

/** Formulaire en carte : `envoyer` lève une erreur pour l'afficher sous les champs. */
export function carteFormulaire(titre, champs, texteBouton, envoyer) {
    const erreur = el('p', { class: 'erreur', role: 'alert', hidden: true });
    const bouton = el('button', { type: 'submit', class: 'bouton principal', text: texteBouton });
    const formulaire = el('form', { class: 'carte formulaire-compte' }, el('h2', { text: titre }), champs, erreur, el('div', { class: 'actions' }, bouton));
    formulaire.addEventListener('submit', async (e) => {
        e.preventDefault();
        erreur.hidden = true;
        bouton.disabled = true;
        try {
            await envoyer();
        } catch (ex) {
            erreur.textContent = ex.message;
            erreur.hidden = false;
        } finally {
            bouton.disabled = false;
        }
    });
    return formulaire;
}

function champSecret(libelle, autocomplete, aide = null) {
    const entree = el('input', { type: 'password', required: true, autocomplete, spellcheck: 'false', maxlength: 4096 });
    const bloc = champ(libelle, entree, aide);
    basculeMotDePasse(entree);
    return { entree, bloc };
}

export async function afficher(ecran, contexte) {
    document.title = 'Mon compte — Signage Studio';
    const moi = contexte.utilisateur;

    const nom = el('input', { maxlength: 100, value: moi.nom, autocomplete: 'name' });
    const carteNom = carteFormulaire('Identité', [
        el('p', { class: 'meta', text: `Identifiant : ${moi.identifiant} · ${moi.role === 'admin' ? 'administrateur' : 'éditeur'}` }),
        champ('Nom affiché', nom, 'Visible des autres utilisateurs (ex. « modifiée par … »). Laissez vide pour afficher l\'identifiant.'),
    ], 'Enregistrer le nom', async () => {
        const { utilisateur } = await api.put('/moi', { nom: nom.value });
        contexte.majUtilisateur(utilisateur);
        contexte.notifier('Nom enregistré.');
    });

    const identifiant = champIdentifiant(moi.identifiant);
    identifiant.autocomplete = 'username';
    const mdpIdentifiant = champSecret('Mot de passe actuel', 'current-password');
    const carteIdentifiant = carteFormulaire('Identifiant de connexion', [
        champ('Nouvel identifiant', identifiant, AIDE_IDENTIFIANT),
        mdpIdentifiant.bloc,
        el('p', { class: 'meta', text: 'Vos sessions ouvertes restent valides ; utilisez le nouvel identifiant à la prochaine connexion.' }),
    ], 'Changer l\'identifiant', async () => {
        const { utilisateur } = await api.put('/moi/identifiant', { identifiant: identifiant.value.trim(), mot_de_passe: mdpIdentifiant.entree.value });
        mdpIdentifiant.entree.value = '';
        contexte.majUtilisateur(utilisateur);
        contexte.notifier(`Identifiant changé : ${utilisateur.identifiant}.`);
        afficher(ecran, contexte);
    });

    const ancien = champSecret('Mot de passe actuel', 'current-password');
    const nouveau = champSecret('Nouveau mot de passe', 'new-password', `${MOT_DE_PASSE_MIN} caractères au moins.`);
    const confirmation = champSecret('Nouveau mot de passe, à nouveau', 'new-password');
    nouveau.entree.minLength = MOT_DE_PASSE_MIN;
    const carteMdp = carteFormulaire('Mot de passe', [
        ancien.bloc, nouveau.bloc, confirmation.bloc,
        el('p', { class: 'meta', text: 'Après le changement, vos sessions ouvertes sur d\'autres appareils ou navigateurs sont fermées.' }),
    ], 'Changer le mot de passe', async () => {
        if (nouveau.entree.value.length < MOT_DE_PASSE_MIN) {
            throw new Error(`Le nouveau mot de passe doit faire ${MOT_DE_PASSE_MIN} caractères au moins.`);
        }
        if (nouveau.entree.value !== confirmation.entree.value) {
            throw new Error('Les deux saisies du nouveau mot de passe ne sont pas identiques.');
        }
        await api.put('/moi/mot_de_passe', {
            ancien: ancien.entree.value, nouveau: nouveau.entree.value, confirmation: confirmation.entree.value,
        });
        [ancien, nouveau, confirmation].forEach((c) => { c.entree.value = ''; });
        contexte.notifier('Mot de passe changé. Vos autres sessions sont fermées.');
    });

    ecran.replaceChildren(contexte.cadre({
        ...ongletsAccueil(contexte, 'compte'),
        barre: [el('h1', { text: 'Mon compte' })],
        contenu: el('div', { class: 'grille-compte' }, carteNom, carteIdentifiant, carteMdp),
    }));
}
