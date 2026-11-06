// Écran « Programmation » d'une chaîne : ce qui passe maintenant, playlist par défaut, calendrier
// interactif et liste des plages. Chaque modification remplace toute la programmation (PUT) ;
// la dernière peut être annulée.

import { couleurRegion } from '../commun/dispositions.js';
import { api } from './api.js';
import { apresAffichage, calendrier, demarrer, heuresTexte, JOURS, joursTexte, periodeTexte } from './calendrier.js';
import { champ, confirmer, dialogue } from './dialogue.js';
import { el } from './dom.js';
import { ongletsChaine } from './navigation.js';

const heure = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
const sansId = ({ id, ...p }) => p;

/** Fenêtre d'ajout ou de modification d'une plage ; renvoie la plage, ou null. */
function formulairePlage(playlists, plage = null) {
    const p = plage ?? { playlist_id: playlists[0].id, date_debut: null, date_fin: null, heure_debut: '08:00', heure_fin: '18:00', jours: 31, priorite: 0 };
    const playlist = el('select', {}, playlists.map((pl) => el('option', { value: pl.id, text: pl.nom, selected: pl.id === p.playlist_id })));
    const debut = el('input', { type: 'date', value: p.date_debut ?? '' });
    const fin = el('input', { type: 'date', value: p.date_fin ?? '' });
    const heureDebut = el('input', { type: 'time', required: true, value: p.heure_debut });
    const finJournee = p.heure_fin === '24:00';
    const heureFin = el('input', { type: 'time', required: true, value: finJournee ? '23:59' : p.heure_fin, disabled: finJournee });
    const minuit = el('input', { type: 'checkbox', checked: finJournee });
    minuit.addEventListener('change', () => {
        heureFin.disabled = minuit.checked;
    });
    const cases = JOURS.map((j, i) => el('input', { type: 'checkbox', checked: Boolean(p.jours & (1 << i)), 'aria-label': j }));
    const preselection = (masque) => cases.forEach((c, i) => { c.checked = Boolean(masque & (1 << i)); });
    const priorite = el('input', { type: 'number', min: -1000, max: 1000, step: 1, value: p.priorite, class: 'court' });

    return dialogue({
        titre: plage ? 'Modifier la plage' : 'Nouvelle plage',
        texteValider: plage ? 'Enregistrer' : 'Ajouter',
        corps: [
            champ('Playlist', playlist),
            el('div', { class: 'deux-colonnes' }, champ('Du (facultatif)', debut), champ('Au (facultatif)', fin)),
            el('div', { class: 'deux-colonnes' },
                champ('De', heureDebut),
                el('div', { class: 'champ' }, el('label', { text: 'À' }), heureFin,
                    el('label', { class: 'case' }, minuit, ' jusqu\'à minuit'))),
            el('fieldset', { class: 'jours' },
                el('legend', { text: 'Jours' }),
                el('div', { class: 'cases-jours' }, cases.map((c, i) => el('label', { class: 'case' }, c, ` ${JOURS[i].slice(0, 3)}`))),
                el('div', { class: 'raccourcis-jours' },
                    el('button', { type: 'button', class: 'bouton lien', text: 'Semaine', onclick: () => preselection(31) }),
                    el('button', { type: 'button', class: 'bouton lien', text: 'Week-end', onclick: () => preselection(96) }),
                    el('button', { type: 'button', class: 'bouton lien', text: 'Tous', onclick: () => preselection(127) }))),
            champ('Priorité', priorite, 'Si plusieurs plages se chevauchent, celle de plus forte priorité est diffusée.'),
        ],
        valider: async () => {
            const jours = cases.reduce((m, c, i) => (c.checked ? m | (1 << i) : m), 0);
            const resultat = {
                playlist_id: Number(playlist.value),
                date_debut: debut.value || null,
                date_fin: fin.value || null,
                heure_debut: heureDebut.value,
                heure_fin: minuit.checked ? '24:00' : heureFin.value,
                jours,
                priorite: Number(priorite.value) || 0,
            };
            if (jours === 0) {
                throw new Error('Cochez au moins un jour.');
            }
            if (resultat.heure_fin !== '24:00' && resultat.heure_fin <= resultat.heure_debut) {
                throw new Error("L'heure de fin doit suivre l'heure de début (une plage ne passe pas minuit : créez-en deux).");
            }
            if (resultat.date_debut && resultat.date_fin && resultat.date_fin < resultat.date_debut) {
                throw new Error('La date de fin précède la date de début.');
            }
            return resultat;
        },
    });
}

export async function afficher(ecran, contexte, chaineId) {
    const [{ chaine }, { playlists }, programmation] = await Promise.all([
        api.get(`/chaines/${chaineId}`),
        api.get(`/chaines/${chaineId}/playlists`),
        api.get(`/chaines/${chaineId}/programmation`),
    ]);
    document.title = `Programmation — ${chaine.nom} — Signage Studio`;
    let etat = programmation;
    let enCours = false;
    let annulation = null; // état d'avant la dernière modification
    let playlistRecente = null;

    const nomDe = (id) => playlists.find((p) => p.id === id)?.nom ?? 'Playlist supprimée';
    const couleurDe = (id) => couleurRegion(Math.max(0, playlists.findIndex((p) => p.id === id)));
    const corps = el('div', { class: 'programmation' });

    /**
     * Enregistre aussitôt : affichage immédiat, puis état renvoyé par le serveur ; en cas
     * d'échec, retour à l'état précédent avec le message d'erreur. Renvoie true si enregistré.
     */
    async function enregistrer(modification, message, annulable = true) {
        if (enCours) {
            contexte.notifier('Enregistrement en cours, patientez…');
            return false;
        }
        const precedent = etat;
        const avant = { playlist_defaut_id: etat.playlist_defaut_id, plages: etat.plages.map(sansId) };
        const suivant = { ...avant, ...modification };
        enCours = true;
        etat = { ...etat, ...suivant };
        dessiner();
        try {
            const reponse = await api.put(`/chaines/${chaineId}/programmation`, suivant);
            enCours = false;
            etat = reponse;
            annulation = annulable ? avant : null;
            contexte.notifier(message, annulable ? { texte: 'Annuler', surClic: annuler } : null);
            dessiner();
            return true;
        } catch (e) {
            enCours = false;
            etat = precedent;
            contexte.notifier(`${e.message} Modification non enregistrée.`);
            dessiner();
            return false;
        }
    }

    async function annuler() {
        if (!annulation) {
            contexte.notifier('Rien à annuler.');
            return;
        }
        const etatAvant = annulation;
        annulation = null;
        await enregistrer(etatAvant, 'Dernière action annulée.', false);
    }

    async function modifierPlage(index) {
        const plage = await formulairePlage(playlists, etat.plages[index]);
        if (plage) {
            const plages = etat.plages.map(sansId);
            plages[index] = plage;
            await enregistrer({ plages }, 'Plage enregistrée.');
        }
    }

    function dessiner() {
        if (playlists.length === 0) {
            corps.replaceChildren(el('p', { class: 'vide' }, 'Créez d\'abord une playlist dans l\'onglet ',
                el('a', { href: `#/chaines/${chaineId}`, text: 'Playlists' }), '.'));
            return;
        }
        const { maintenant } = etat;
        const texteEnCours = maintenant.playlist_id === null ? 'rien (aucune plage en cours ni playlist par défaut)' : nomDe(maintenant.playlist_id);
        const jusque = maintenant.prochain_changement ? ` jusqu'à ${heure.format(new Date(maintenant.prochain_changement))}` : '';

        const defaut = el('select', { 'aria-label': 'Playlist par défaut' },
            el('option', { value: '', text: '— Aucune (écran noir hors des plages) —', selected: etat.playlist_defaut_id === null }),
            playlists.map((p) => el('option', { value: p.id, text: p.nom, selected: p.id === etat.playlist_defaut_id })));
        defaut.addEventListener('change', () => enregistrer(
            { playlist_defaut_id: defaut.value === '' ? null : Number(defaut.value) },
            'Playlist par défaut enregistrée.',
        ));

        const lignes = etat.plages.map((p, i) => el('tr', {},
            el('td', {}, el('span', { class: 'pastille', style: null }), nomDe(p.playlist_id)),
            el('td', { text: joursTexte(p.jours) }),
            el('td', { text: heuresTexte(p) }),
            el('td', { text: periodeTexte(p) }),
            el('td', { text: String(p.priorite) }),
            el('td', { class: 'actions-ligne' },
                el('button', { type: 'button', class: 'bouton', text: 'Modifier', onclick: () => modifierPlage(i) }),
                el('button', {
                    type: 'button', class: 'bouton danger', text: 'Supprimer',
                    onclick: async () => {
                        if (await confirmer('Supprimer la plage', `${nomDe(p.playlist_id)} · ${joursTexte(p.jours)} · ${heuresTexte(p)}`)) {
                            const plages = etat.plages.map(sansId).filter((_, j) => j !== i);
                            await enregistrer({ plages }, 'Plage supprimée.');
                        }
                    },
                }))));
        lignes.forEach((ligne, i) => {
            ligne.querySelector('.pastille').style.backgroundColor = couleurDe(etat.plages[i].playlist_id);
        });

        corps.replaceChildren(
            el('section', { class: 'maintenant' },
                el('p', {}, el('span', { class: 'etiquette', text: 'En ce moment : ' }), el('strong', { text: texteEnCours }), jusque)),
            el('section', { class: 'bloc-defaut' },
                el('label', { class: 'ligne-defaut' }, el('span', { text: 'Playlist par défaut (en dehors des plages) :' }), defaut)),
            el('div', { class: 'bloc-calendrier' },
                calendrier({
                    plages: etat.plages,
                    playlists,
                    nomDe,
                    couleurDe,
                    appliquer: (plages, message) => enregistrer({ plages }, message),
                    occupe: () => enCours,
                    redessiner: dessiner,
                    plusDOptions: modifierPlage,
                    playlistProposee: () => (playlists.some((p) => p.id === playlistRecente) ? playlistRecente
                        : (playlists.find((p) => p.id !== etat.playlist_defaut_id) ?? playlists[0]).id),
                    choisirPlaylist: (id) => { playlistRecente = id; },
                    annuler,
                }),
                el('p', { class: 'aide-semaine', text: etat.playlist_defaut_id === null
                    ? 'En dehors des plages : écran noir (aucune playlist par défaut).'
                    : `En dehors des plages : ${nomDe(etat.playlist_defaut_id)}.` })),
            el('section', {},
                el('h2', { text: 'Plages' }),
                etat.plages.length === 0
                    ? el('p', { class: 'vide', text: 'Aucune plage : la playlist par défaut passe en permanence.' })
                    : el('table', { class: 'tableau' },
                        el('thead', {}, el('tr', {}, ['Playlist', 'Jours', 'Heures', 'Période', 'Priorité', ''].map((t) => el('th', { text: t })))),
                        el('tbody', {}, lignes))));
        apresAffichage();
    }

    contexte.surQuitter(demarrer());
    ecran.replaceChildren(contexte.cadre({
        ...ongletsChaine(chaine, 'programmation'),
        barre: [
            el('h1', { text: 'Programmation' }),
            playlists.length > 0 && el('button', {
                type: 'button', class: 'bouton principal', text: '+ Plage',
                onclick: async () => {
                    const plage = await formulairePlage(playlists);
                    if (plage) {
                        await enregistrer({ plages: [...etat.plages.map(sansId), plage] }, 'Plage ajoutée.');
                    }
                },
            }),
        ],
        contenu: corps,
    }));
    dessiner();
}
