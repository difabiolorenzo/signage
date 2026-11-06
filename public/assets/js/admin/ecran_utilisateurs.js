// Écran « Utilisateurs » (administrateurs) : création, nom et rôle, désactivation,
// nouveau mot de passe, chaînes que chaque éditeur peut modifier. L'API vérifie tout.

import { basculeMotDePasse } from '../commun/mot_de_passe.js';
import { api } from './api.js';
import { champ, confirmer, dialogue } from './dialogue.js';
import { dateCourte, el } from './dom.js';
import { ongletsAccueil } from './navigation.js';

const MOT_DE_PASSE_MIN = 10;

/** Mot de passe aléatoire de 14 caractères, sans caractères faciles à confondre (0/O, 1/l/I). */
function motDePasseAleatoire() {
    const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const octets = crypto.getRandomValues(new Uint32Array(14));
    return Array.from(octets, (n) => alphabet[n % alphabet.length]).join('');
}

/**
 * Champ de mot de passe avec bouton « Afficher » et « Générer » ; un mot de passe généré est
 * affiché en clair pour que l'administrateur puisse le transmettre.
 */
function champMotDePasse() {
    const entree = el('input', { type: 'password', required: true, minlength: MOT_DE_PASSE_MIN, autocomplete: 'new-password', spellcheck: 'false' });
    const bascule = basculeMotDePasse(entree);
    const bloc = el('div', { class: 'mot-de-passe' }, bascule.bloc, el('button', {
        type: 'button', class: 'bouton', text: 'Générer',
        onclick: () => {
            entree.value = motDePasseAleatoire();
            bascule.afficher(true);
            entree.select();
        },
    }));
    return { entree, bloc };
}

function verifierMotDePasse(valeur) {
    if (valeur.length < MOT_DE_PASSE_MIN) {
        throw new Error(`Le mot de passe doit faire ${MOT_DE_PASSE_MIN} caractères au moins.`);
    }
}

function selectRole(role) {
    return el('select', {},
        el('option', { value: 'editeur', text: 'Éditeur : les chaînes cochées pour lui', selected: role !== 'admin' }),
        el('option', { value: 'admin', text: 'Administrateur : tout, y compris les comptes', selected: role === 'admin' }));
}

function nouvelUtilisateur() {
    const identifiant = el('input', { required: true, maxlength: 64, pattern: '[A-Za-z0-9._\\-]{3,64}', autocomplete: 'off', spellcheck: 'false' });
    const nom = el('input', { maxlength: 100 });
    const role = selectRole('editeur');
    const mdp = champMotDePasse();
    return dialogue({
        titre: 'Nouvel utilisateur',
        texteValider: 'Créer',
        corps: [
            champ('Identifiant', identifiant, 'Lettres sans accent, chiffres, point, tiret ; 3 caractères au moins.'),
            champ('Nom affiché', nom),
            champ('Rôle', role),
            champ('Mot de passe', mdp.bloc, 'Communiquez-le à la personne : il ne sera plus affiché ensuite.'),
        ],
        valider: async () => {
            verifierMotDePasse(mdp.entree.value);
            const r = await api.post('/utilisateurs', {
                identifiant: identifiant.value.trim(), nom: nom.value, role: role.value, mot_de_passe: mdp.entree.value,
            });
            return r.id;
        },
    });
}

function modifierUtilisateur(u, estMoi) {
    const nom = el('input', { maxlength: 100, value: u.nom });
    const role = selectRole(u.role);
    if (estMoi) {
        role.disabled = true;
    }
    return dialogue({
        titre: `Modifier ${u.identifiant}`,
        texteValider: 'Enregistrer',
        corps: [
            champ('Nom affiché', nom),
            champ('Rôle', role, estMoi ? 'Vous ne pouvez pas retirer votre propre rôle d\'administrateur.' : null),
        ],
        valider: async () => {
            await api.put(`/utilisateurs/${u.id}`, estMoi ? { nom: nom.value } : { nom: nom.value, role: role.value });
            return true;
        },
    });
}

function nouveauMotDePasse(u) {
    const mdp = champMotDePasse();
    return dialogue({
        titre: `Nouveau mot de passe pour ${u.identifiant}`,
        texteValider: 'Enregistrer',
        corps: [
            champ('Mot de passe', mdp.bloc, 'Communiquez-le à la personne : il ne sera plus affiché ensuite.'),
        ],
        valider: async () => {
            verifierMotDePasse(mdp.entree.value);
            await api.put(`/utilisateurs/${u.id}`, { mot_de_passe: mdp.entree.value });
            return true;
        },
    });
}

function choisirChaines(u, chaines) {
    const cases = chaines.map((c) => ({ id: c.id, entree: el('input', { type: 'checkbox', checked: u.chaines.includes(c.id) }) }));
    return dialogue({
        titre: `Chaînes de ${u.nom || u.identifiant}`,
        texteValider: 'Enregistrer',
        corps: [
            el('p', { text: 'Cet éditeur pourra modifier les playlists, la programmation et les médias des chaînes cochées.' }),
            chaines.length === 0
                ? el('p', { class: 'aide', text: 'Aucune chaîne pour le moment.' })
                : el('div', { class: 'liste-cases' }, chaines.map((c, i) => el('label', { class: 'case' }, cases[i].entree, ` ${c.nom}`, el('small', { text: ` ?chaine=${c.slug}` })))),
        ],
        valider: async () => {
            await api.put(`/utilisateurs/${u.id}/droits`, { chaines: cases.filter((c) => c.entree.checked).map((c) => c.id) });
            return true;
        },
    });
}

export async function afficher(ecran, contexte) {
    const rafraichir = () => afficher(ecran, contexte);
    const [{ utilisateurs }, { chaines }] = await Promise.all([api.get('/utilisateurs'), api.get('/chaines')]);
    const nomChaine = (id) => chaines.find((c) => c.id === id)?.nom ?? `#${id}`;
    const moi = contexte.utilisateur.id;

    const action = (texte, faire, message, classe = 'bouton') => el('button', {
        type: 'button', class: classe, text: texte,
        onclick: async () => {
            if (await faire()) {
                contexte.notifier(message);
                rafraichir();
            }
        },
    });

    const lignes = utilisateurs.map((u) => {
        const estMoi = u.id === moi;
        const droits = u.role === 'admin'
            ? el('span', { class: 'meta', text: 'Toutes (administrateur)' })
            : el('span', { text: u.chaines.length === 0 ? 'Aucune' : u.chaines.map(nomChaine).join(', ') });
        const basculer = estMoi ? null : action(
            u.actif ? 'Désactiver' : 'Réactiver',
            async () => {
                if (u.actif && !(await confirmer('Désactiver le compte', `${u.identifiant} ne pourra plus se connecter ; s'il est connecté, sa session sera fermée à sa prochaine action.`, 'Désactiver'))) {
                    return false;
                }
                try {
                    await api.put(`/utilisateurs/${u.id}`, { actif: !u.actif });
                    return true;
                } catch (e) {
                    contexte.notifier(e.message);
                    return false;
                }
            },
            u.actif ? `${u.identifiant} désactivé.` : `${u.identifiant} réactivé.`,
            u.actif ? 'bouton danger' : 'bouton',
        );
        return el('tr', { class: u.actif ? null : 'inactif' },
            el('td', {}, el('strong', { text: u.identifiant }), estMoi && el('span', { class: 'badge-moi', text: 'vous' })),
            el('td', { text: u.nom }),
            el('td', { text: u.role === 'admin' ? 'Administrateur' : 'Éditeur' }),
            el('td', { text: u.actif ? 'Actif' : 'Désactivé' }),
            el('td', {}, droits),
            el('td', { class: 'meta', text: dateCourte(u.cree_le) }),
            el('td', { class: 'actions-ligne' },
                action('Modifier', () => modifierUtilisateur(u, estMoi), 'Utilisateur enregistré.'),
                u.role !== 'admin' && action('Chaînes…', () => choisirChaines(u, chaines), 'Droits enregistrés.'),
                action('Mot de passe…', () => nouveauMotDePasse(u), `Mot de passe de ${u.identifiant} changé.`),
                basculer));
    });

    ecran.replaceChildren(contexte.cadre({
        ...ongletsAccueil(contexte, 'utilisateurs'),
        barre: [
            el('h1', { text: 'Utilisateurs' }),
            action('+ Utilisateur', nouvelUtilisateur, 'Utilisateur créé.', 'bouton principal'),
        ],
        contenu: [
            el('p', { class: 'aide-ecran', text: 'Un administrateur gère tout. Un éditeur ne modifie que les chaînes cochées pour lui. Un compte désactivé ne peut plus se connecter.' }),
            el('div', { class: 'tableau-defilant' }, el('table', { class: 'tableau' },
                el('thead', {}, el('tr', {}, ['Identifiant', 'Nom', 'Rôle', 'État', 'Chaînes', 'Créé le', ''].map((t) => el('th', { text: t })))),
                el('tbody', {}, lignes))),
        ],
    }));
}
