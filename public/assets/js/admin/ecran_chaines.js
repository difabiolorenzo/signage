// Écran « Chaînes » : chaînes autorisées et leur lien public ; création et suppression réservées
// aux administrateurs (vérifié aussi par l'API). Nom, adresse et orientation d'une chaîne
// existante se règlent dans son onglet « Réglages » (ecran_reglages_chaine.js).

import { api } from './api.js';
import { champ, dialogue } from './dialogue.js';
import { adresseComplete, el } from './dom.js';
import { ongletsAccueil } from './navigation.js';

/** « Hall d'accueil » → « hall-d-accueil ». */
function versSlug(texte) {
    return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

/**
 * Champs nom, adresse et orientation, pré-remplis avec `chaine` (vides pour une création) ;
 * valeurs() renvoie le corps à envoyer à l'API.
 */
export function champsChaine(chaine = null) {
    const nom = el('input', { required: true, maxlength: 100, value: chaine?.nom ?? '' });
    const slug = el('input', {
        required: true, maxlength: 64, pattern: '[a-z0-9]+(-[a-z0-9]+)*', value: chaine?.slug ?? '', spellcheck: 'false',
    });
    const orientation = el('select', {},
        el('option', { value: 'paysage', text: 'Paysage', selected: chaine?.orientation !== 'portrait' }),
        el('option', { value: 'portrait', text: 'Portrait', selected: chaine?.orientation === 'portrait' }));

    // Création : l'adresse suit le nom tant qu'elle n'a pas été modifiée à la main.
    let slugManuel = chaine !== null;
    slug.addEventListener('input', () => {
        slugManuel = true;
    });
    nom.addEventListener('input', () => {
        if (!slugManuel) {
            slug.value = versSlug(nom.value);
        }
    });

    const aideSlug = chaine
        ? "Attention : changer l'adresse coupe les afficheurs qui utilisent l'ancienne."
        : 'Minuscules sans accent, chiffres et tirets. Apparaît dans l\'URL : ?chaine=…';
    return {
        elements: [
            champ('Nom', nom),
            champ('Adresse (slug)', slug, aideSlug),
            champ('Orientation des écrans', orientation),
        ],
        valeurs: () => ({ nom: nom.value, slug: slug.value, orientation: orientation.value }),
    };
}

/** Fenêtre de création ; renvoie la chaîne créée, ou null. */
function nouvelleChaine() {
    const champs = champsChaine();
    return dialogue({
        titre: 'Nouvelle chaîne',
        texteValider: 'Créer',
        corps: champs.elements,
        valider: async () => (await api.post('/chaines', champs.valeurs())).chaine,
    });
}

function supprimerChaine(chaine) {
    const saisie = el('input', { required: true, spellcheck: 'false', autocomplete: 'off' });
    return dialogue({
        titre: 'Supprimer la chaîne',
        texteValider: 'Supprimer définitivement',
        danger: true,
        corps: [
            el('p', { text: `La chaîne « ${chaine.nom} » sera supprimée avec sa programmation. Ses playlists et médias restent dans la bibliothèque ; ceux qui n'étaient ouverts qu'à elle deviennent privés (visibles par leur auteur et les administrateurs). Les afficheurs qui l'utilisent n'auront plus rien à montrer.` }),
            champ(`Pour confirmer, saisissez son adresse : ${chaine.slug}`, saisie),
        ],
        valider: async () => {
            if (saisie.value.trim() !== chaine.slug) {
                throw new Error(`Saisissez exactement « ${chaine.slug} » pour confirmer.`);
            }
            await api.supprimer(`/chaines/${chaine.id}`);
            return true;
        },
    });
}

function carte(chaine, contexte, rafraichir) {
    const lien = adresseComplete(chaine.lien_public);
    const actions = [el('a', { class: 'bouton principal', href: `#/chaines/${chaine.id}`, text: 'Modifier' })];
    if (contexte.estAdmin()) {
        actions.push(
            el('button', {
                type: 'button', class: 'bouton danger', text: 'Supprimer',
                onclick: async () => {
                    if (await supprimerChaine(chaine)) {
                        contexte.notifier(`Chaîne « ${chaine.nom} » supprimée.`);
                        rafraichir();
                    }
                },
            }),
        );
    }
    return el('article', { class: 'carte' },
        el('h2', {}, el('a', { href: `#/chaines/${chaine.id}`, text: chaine.nom })),
        el('p', { class: 'lien-public' }, el('a', { href: lien, target: '_blank', rel: 'noopener', text: lien })),
        el('p', { class: 'meta', text: `${chaine.orientation === 'portrait' ? 'Portrait' : 'Paysage'} · ${chaine.nb_playlists} playlist(s) programmée(s)` }),
        el('div', { class: 'actions' }, actions));
}

export async function afficher(ecran, contexte) {
    const rafraichir = () => afficher(ecran, contexte);
    const { chaines } = await api.get('/chaines');

    const barre = [el('h1', { text: 'Chaînes' })];
    if (contexte.estAdmin()) {
        barre.push(el('button', {
            type: 'button', class: 'bouton principal', text: '+ Chaîne',
            onclick: async () => {
                const chaine = await nouvelleChaine();
                if (chaine) {
                    contexte.notifier(`Chaîne « ${chaine.nom} » créée.`);
                    rafraichir();
                }
            },
        }));
    }

    let contenu;
    if (chaines.length === 0) {
        contenu = el('p', {
            class: 'vide',
            text: contexte.estAdmin()
                ? 'Aucune chaîne pour le moment. Créez-en une avec « + Chaîne ».'
                : "Aucune chaîne ne vous est attribuée. Demandez à un administrateur de vous en ouvrir l'accès.",
        });
    } else {
        contenu = el('div', { class: 'grille-cartes' }, chaines.map((c) => carte(c, contexte, rafraichir)));
    }

    ecran.replaceChildren(contexte.cadre({
        ...ongletsAccueil(contexte, 'chaines'),
        barre,
        contenu,
    }));
}
