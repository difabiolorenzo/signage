// Écran d'une chaîne : ses playlists (vignettes de disposition), création avec choix de la
// disposition sur aperçu ou dessin d'une grille personnalisée, duplication et suppression.

import { estDispositionPortrait, libelleDisposition } from '../commun/dispositions.js';
import { api } from './api.js';
import { apercuDisposition } from './apercu.js';
import { choixDisposition } from './choix_disposition.js';
import { champ, confirmer, dialogue } from './dialogue.js';
import { adresseComplete, dateCourte, duree, el } from './dom.js';
import { ongletsChaine } from './navigation.js';

const FILTRES = [['tout', 'Tout'], ['paysage', 'Paysage'], ['portrait', 'Portrait']];
let filtre = 'tout'; // conservé pendant la session de l'éditeur

function nomParDefaut() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    return `Playlist du ${z(d.getDate())}/${z(d.getMonth() + 1)} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

/** Fenêtre « Nouvelle playlist » : nom, puis disposition choisie sur aperçu ou dessinée. */
function nouvellePlaylist(chaine) {
    const nom = el('input', { required: true, maxlength: 100, value: nomParDefaut() });
    const choix = choixDisposition({ portraitDefaut: chaine.orientation === 'portrait' });

    return dialogue({
        titre: 'Créer une playlist — choisir une disposition',
        texteValider: 'Créer',
        large: true,
        corps: [
            champ('Nom de la playlist', nom),
            choix.element,
            el('p', { class: 'aide', text: 'La disposition découpe l\'écran en régions ; chaque région affichera un widget. Elle pourra être changée ensuite dans l\'éditeur de la playlist.' }),
        ],
        valider: async () => {
            const { disposition, regions } = choix.resultat();
            const r = await api.post(`/chaines/${chaine.id}/playlists`, { nom: nom.value, disposition, regions });
            return r.id;
        },
    });
}

function tuile(playlist, chaine, contexte, rafraichir) {
    const lien = `#/chaines/${chaine.id}/playlists/${playlist.id}`;
    const details = [libelleDisposition(playlist.disposition), `${playlist.nb_pages} page(s)`, duree(playlist.duree)].join(' · ');
    const modifie = `Modifiée le ${dateCourte(playlist.modifie_le)}${playlist.modifie_par ? ` par ${playlist.modifie_par}` : ''}`;

    return el('article', { class: 'tuile' },
        el('h2', { title: playlist.nom }, el('a', { href: lien, text: playlist.nom })),
        el('a', { class: 'tuile-apercu', href: lien, 'aria-label': `Modifier ${playlist.nom}` },
            apercuDisposition(playlist.regions, estDispositionPortrait(playlist.disposition)),
            playlist.par_defaut && el('span', { class: 'badge', text: 'Par défaut' })),
        el('p', { class: 'meta', text: details }),
        el('p', { class: 'meta', text: modifie }),
        el('div', { class: 'actions' },
            el('a', { class: 'bouton principal', href: lien, text: 'Modifier' }),
            el('button', {
                type: 'button', class: 'bouton', text: 'Dupliquer',
                onclick: async (evenement) => {
                    evenement.currentTarget.disabled = true;
                    try {
                        await api.post(`/chaines/${chaine.id}/playlists/${playlist.id}/duplication`);
                        contexte.notifier(`« ${playlist.nom} » dupliquée.`);
                    } catch (e) {
                        contexte.notifier(e.message);
                    }
                    rafraichir();
                },
            }),
            el('button', {
                type: 'button', class: 'bouton danger', text: 'Supprimer',
                onclick: async () => {
                    const message = [`La playlist « ${playlist.nom} » et ses plages de programmation seront supprimées.`];
                    if (playlist.par_defaut) {
                        message.push("C'est la playlist par défaut de la chaîne : en dehors des plages programmées, les afficheurs n'auront plus rien à montrer.");
                    }
                    if (await confirmer('Supprimer la playlist', message)) {
                        try {
                            await api.supprimer(`/chaines/${chaine.id}/playlists/${playlist.id}`);
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
    const rafraichir = () => afficher(ecran, contexte, chaineId);
    const [{ chaine }, { playlists }] = await Promise.all([
        api.get(`/chaines/${chaineId}`),
        api.get(`/chaines/${chaineId}/playlists`),
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
        contenu = el('p', { class: 'vide', text: 'Aucune playlist dans cette chaîne. Créez-en une avec « + Playlist ».' });
    } else if (visibles.length === 0) {
        contenu = el('p', { class: 'vide', text: 'Aucune playlist ne correspond à ce filtre.' });
    } else {
        contenu = el('div', { class: 'grille-tuiles' }, visibles.map((p) => tuile(p, chaine, contexte, rafraichir)));
    }

    ecran.replaceChildren(contexte.cadre({
        ...ongletsChaine(chaine, 'playlists'),
        barre,
        contenu,
    }));
}
