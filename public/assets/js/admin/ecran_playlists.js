// Écran d'une chaîne : les playlists de la bibliothèque ouvertes à cette chaîne ou programmées sur
// elle (vignettes de disposition), création avec choix de la disposition sur aperçu ou dessin
// d'une grille personnalisée, duplication et suppression (auteur et administrateurs).
// La fenêtre de création et les tuiles servent aussi au menu « Playlists » (sans chaîne).

import { estDispositionPortrait, libelleDisposition } from '../commun/dispositions.js';
import { api } from './api.js';
import { apercuDisposition } from './apercu.js';
import { boutonsBibliotheque, textePortee } from './bibliotheque.js';
import { choixDisposition } from './choix_disposition.js';
import { champ, confirmer, dialogue } from './dialogue.js';
import { adresseComplete, dateCourte, duree, el } from './dom.js';
import { ongletsChaine } from './navigation.js';
import { LIBELLES_STATUT, periodeValiditeTexte, statutValidite } from './validite.js';

const FILTRES = [['tout', 'Tout'], ['paysage', 'Paysage'], ['portrait', 'Portrait']];
let filtre = 'tout'; // conservé pendant la session de l'éditeur

function nomParDefaut() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    return `Playlist du ${z(d.getDate())}/${z(d.getMonth() + 1)} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

/**
 * Fenêtre « Nouvelle playlist » : nom, puis disposition choisie sur aperçu ou dessinée.
 * Avec une chaîne, la playlist est ouverte à cette chaîne ; sans, elle est privée.
 */
export function nouvellePlaylist(chaine = null) {
    const nom = el('input', { required: true, maxlength: 100, value: nomParDefaut() });
    const choix = choixDisposition({ portraitDefaut: chaine?.orientation === 'portrait' });

    return dialogue({
        titre: 'Créer une playlist — choisir une disposition',
        texteValider: 'Créer',
        large: true,
        corps: [
            champ('Nom de la playlist', nom),
            choix.element,
            el('p', { class: 'aide', text: 'La disposition découpe l\'écran en régions ; chaque région affichera un widget. Elle pourra être changée ensuite dans l\'éditeur de la playlist.' }),
            el('p', { class: 'aide', text: chaine
                ? `La playlist sera ouverte à la chaîne « ${chaine.nom} ». Sa portée se règle ensuite avec « Portée… ».`
                : 'La playlist sera privée (visible par vous et les administrateurs). Sa portée se règle ensuite avec « Portée… ».' }),
        ],
        valider: async () => {
            const { disposition, regions } = choix.resultat();
            const r = await api.post('/playlists', { nom: nom.value, disposition, regions, ...(chaine && { chaine: chaine.id }) });
            return r.id;
        },
    });
}

/** Lien vers l'éditeur de pages, dans le contexte d'une chaîne ou de la bibliothèque. */
export const lienPlaylist = (id, chaine = null) => (chaine ? `#/chaines/${chaine.id}/playlists/${id}` : `#/playlists/${id}`);

/**
 * Tuile d'une playlist. chaine : écran d'une chaîne (lien et duplication dans son contexte), ou
 * null pour la bibliothèque. rafraichir(message?) redessine l'écran.
 */
export function tuile(playlist, chaine, contexte, rafraichir) {
    const lien = lienPlaylist(playlist.id, chaine);
    const details = [libelleDisposition(playlist.disposition), `${playlist.nb_pages} page(s)`, duree(playlist.duree)].join(' · ');
    const statut = statutValidite(playlist);
    const modifie = `Modifiée le ${dateCourte(playlist.modifie_le)}${playlist.modifie_par ? ` par ${playlist.modifie_par}` : ''}`;
    const auteur = `Auteur : ${playlist.auteur?.nom ?? 'aucun'}`;
    const n = playlist.utilisee_par.length;
    const utilisee = n === 0 ? 'Utilisée par aucune chaîne'
        : `Utilisée par ${n} chaîne${n > 1 ? 's' : ''} : ${playlist.utilisee_par.map((c) => c.nom).join(', ')}`;

    return el('article', { class: 'tuile' },
        el('h2', { title: playlist.nom }, el('a', { href: lien, text: playlist.nom })),
        el('a', { class: 'tuile-apercu', href: lien, 'aria-label': `Modifier ${playlist.nom}` },
            apercuDisposition(playlist.regions, estDispositionPortrait(playlist.disposition)),
            playlist.par_defaut && el('span', { class: 'badge', text: 'Par défaut' }),
            statut && el('span', { class: `badge-validite ${statut}`, text: LIBELLES_STATUT[statut] })),
        el('p', { class: 'meta', text: details }),
        statut && el('p', { class: `meta validite ${statut}`, text: `Diffusion ${periodeValiditeTexte(playlist)}` }),
        el('p', { class: 'meta', text: modifie }),
        el('p', { class: 'meta', text: auteur }),
        el('p', { class: 'meta', text: `Portée : ${textePortee(playlist)}` }),
        el('p', { class: n > 0 ? 'meta utilise' : 'meta', text: utilisee }),
        el('div', { class: 'actions' },
            el('a', { class: 'bouton principal', href: lien, text: playlist.modifiable ? 'Modifier' : 'Voir' }),
            el('button', {
                type: 'button', class: 'bouton', text: 'Dupliquer',
                onclick: async (evenement) => {
                    evenement.currentTarget.disabled = true;
                    try {
                        await api.post(`/playlists/${playlist.id}/duplication`, chaine ? { chaine: chaine.id } : {});
                        contexte.notifier(`« ${playlist.nom} » dupliquée.`);
                    } catch (e) {
                        contexte.notifier(e.message);
                    }
                    rafraichir();
                },
            }),
            boutonsBibliotheque('playlists', playlist, contexte, (message) => rafraichir(message)),
            playlist.modifiable && el('button', {
                type: 'button', class: 'bouton danger', text: 'Supprimer',
                onclick: async () => {
                    const message = [`La playlist « ${playlist.nom} » et ses plages de programmation seront supprimées.`];
                    if (playlist.par_defaut && chaine) {
                        message.push("C'est la playlist par défaut de la chaîne : en dehors des plages programmées, les afficheurs n'auront plus rien à montrer.");
                    }
                    if (playlist.utilisee_par.length > 0) {
                        message.push(`Elle est programmée sur : ${playlist.utilisee_par.map((c) => c.nom).join(', ')}.`);
                    }
                    if (await confirmer('Supprimer la playlist', message)) {
                        try {
                            // Le serveur redemande confirmation (409) si elle est programmée : déjà faite ci-dessus.
                            await api.supprimer(`/playlists/${playlist.id}${playlist.utilisee_par.length > 0 ? '?confirmer=1' : ''}`);
                            contexte.notifier(`« ${playlist.nom} » supprimée.`);
                        } catch (e) {
                            contexte.notifier(e.message);
                        }
                        rafraichir();
                    }
                },
            })));
}

export async function afficher(ecran, contexte, chaineId) {
    const rafraichir = async (message) => {
        await afficher(ecran, contexte, chaineId);
        if (message) {
            contexte.notifier(message);
        }
    };
    const [{ chaine }, { playlists }] = await Promise.all([
        api.get(`/chaines/${chaineId}`),
        api.get(`/playlists?chaine=${chaineId}`),
    ]);
    document.title = `${chaine.nom} — Signage Studio`;

    const visibles = playlists.filter((p) => filtre === 'tout' || (filtre === 'portrait') === estDispositionPortrait(p.disposition));

    const barre = [
        el('div', { class: 'segments', role: 'group', 'aria-label': 'Filtre de playlist' },
            el('span', { class: 'etiquette', text: 'Filtre :' }),
            FILTRES.map(([valeur, texte]) => el('button', {
                type: 'button', class: valeur === filtre ? 'segment actif' : 'segment', 'aria-pressed': String(valeur === filtre), text: texte,
                onclick: () => {
                    filtre = valeur;
                    rafraichir();
                },
            }))),
        el('span', { class: 'espace' }),
        el('a', { class: 'bouton lien', href: adresseComplete(chaine.lien_public), target: '_blank', rel: 'noopener', text: 'Voir le lecteur ↗' }),
        el('button', {
            type: 'button', class: 'bouton principal', text: '+ Playlist',
            onclick: async () => {
                const id = await nouvellePlaylist(chaine);
                if (id) {
                    location.hash = `#/chaines/${chaine.id}/playlists/${id}`;
                }
            },
        }),
    ];

    let contenu;
    if (playlists.length === 0) {
        contenu = el('p', { class: 'vide', text: 'Aucune playlist ouverte à cette chaîne. Créez-en une avec « + Playlist ».' });
    } else if (visibles.length === 0) {
        contenu = el('p', { class: 'vide', text: 'Aucune playlist ne correspond à ce filtre.' });
    } else {
        contenu = el('div', { class: 'grille-tuiles' }, visibles.map((p) => tuile(p, chaine, contexte, rafraichir)));
    }

    ecran.replaceChildren(contexte.cadre({
        ...ongletsChaine(chaine, 'playlists', contexte),
        barre,
        contenu,
    }));
}
