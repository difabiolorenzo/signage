// Calendrier interactif de la programmation (vues jour, semaine et mois) : créer une plage au clic
// ou en glissant, la modifier dans une bulle, la déplacer, changer sa durée en tirant un bord.
// Chaque geste a un équivalent clavier. Les modifications passent par `appliquer` (fournie par
// l'écran), qui enregistre aussitôt toute la programmation.

import { champ, dialogue } from './dialogue.js';
import { el } from './dom.js';
import { LIBELLES_STATUT, statutValidite, valideLe } from './validite.js';

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const QUART = 15;
const PX_MINUTE = 40 / 60; // 40 px par heure
const CHAMPS = ['playlist_id', 'date_debut', 'date_fin', 'heure_debut', 'heure_fin', 'jours', 'priorite'];

const z = (n) => String(n).padStart(2, '0');
export const dateIso = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m) => `${z(Math.floor(m / 60))}:${z(m % 60)}`; // 1440 → « 24:00 »
const depuisIso = (iso) => new Date(`${iso}T00:00`);
const jourDe = (d) => (d.getDay() + 6) % 7; // lundi = 0
const borner = (v, min, max) => Math.min(max, Math.max(min, v));
const sansId = ({ id, ...p }) => p;
const memePlage = (a, b) => Boolean(a && b) && CHAMPS.every((k) => a[k] === b[k]);
const nbJours = (masque) => JOURS.filter((_, i) => masque & (1 << i)).length;
const active = (p, iso, i) => Boolean(p.jours & (1 << i)) && (!p.date_debut || p.date_debut <= iso) && (!p.date_fin || iso <= p.date_fin);
const chevauche = (a, b) => minutes(a.heure_debut) < minutes(b.heure_fin) && minutes(b.heure_debut) < minutes(a.heure_fin);

function decaler(date, jours) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + jours);
    return d;
}

const lundiDe = (date) => decaler(date, -jourDe(date));

/** Décale les jours cochés de n jours (le dimanche passe au lundi). */
function tourner(masque, n) {
    const d = ((n % 7) + 7) % 7;
    return ((masque << d) | (masque >> (7 - d))) & 127;
}

const dateLongue = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const dateJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const moisAnnee = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

export function joursTexte(masque) {
    if (masque === 127) {
        return 'Tous les jours';
    }
    if (masque === 31) {
        return 'Du lundi au vendredi';
    }
    if (masque === 96) {
        return 'Samedi et dimanche';
    }
    return JOURS.filter((_, i) => masque & (1 << i)).map((j) => j.slice(0, 3)).join(', ');
}

export function periodeTexte(p) {
    const f = (iso) => dateLongue.format(depuisIso(iso));
    if (p.date_debut && p.date_fin) {
        return p.date_debut === p.date_fin ? `le ${f(p.date_debut)}` : `du ${f(p.date_debut)} au ${f(p.date_fin)}`;
    }
    if (p.date_debut) {
        return `à partir du ${f(p.date_debut)}`;
    }
    if (p.date_fin) {
        return `jusqu'au ${f(p.date_fin)}`;
    }
    return 'sans limite de dates';
}

export const heuresTexte = (p) => (p.heure_debut === '00:00' && p.heure_fin === '24:00' ? 'toute la journée' : `${p.heure_debut} – ${p.heure_fin}`);

// État conservé d'un affichage à l'autre (l'écran est redessiné après chaque enregistrement).
let vue = 'semaine';
let reference = new Date();
let defilement = 7 * 60 * PX_MINUTE;
let curseur = { jour: 0, jourFin: 0, debut: 8 * 60, fin: 9 * 60 }; // créneau choisi au clavier
let focusApres = null; // { plage, iso, bulle } ou { grille: true } : à reprendre après affichage
let memoPortee = null; // dernier choix « ce jour / tous les jours » au clavier, pour ne pas le redemander
let clicIgnore = false;
let geste = null; // glisser en cours ({ annuler })
let bulle = null; // { noeud, fermer }
let courant = null; // options du dernier affichage
let colonnes = []; // [{ noeud, date }] des vues jour et semaine

/** Demande si un changement s'applique au seul jour de l'occurrence ou à toute la plage. */
async function portee(p, jour, action) {
    if (nbJours(p.jours) <= 1) {
        return 'tous';
    }
    const nom = `portee-${Math.random().toString(36).slice(2, 9)}`;
    const seul = el('input', { type: 'radio', name: nom, checked: true });
    const tous = el('input', { type: 'radio', name: nom });
    return dialogue({
        titre: `${action} une plage répétée`,
        texteValider: action,
        corps: [
            el('p', { text: `Cette plage passe : ${joursTexte(p.jours).toLowerCase()}.` }),
            el('label', { class: 'case choix-portee' }, seul, ` Seulement le ${JOURS[jour].toLowerCase()}`),
            el('label', { class: 'case choix-portee' }, tous, ' Tous les jours de la plage'),
        ],
        valider: async () => (seul.checked ? 'jour' : 'tous'),
    });
}

/**
 * Change les heures d'une occurrence et/ou la déplace de `deltaJours`. Pour une plage répétée sur
 * plusieurs jours, « ce jour seulement » retire ce jour de la plage et crée une plage à part.
 * Renvoie le choix appliqué ('jour' | 'tous'), ou null si annulé ou en échec.
 */
async function modifierOccurrence(o, index, iso, { debut, fin, deltaJours = 0 }, message, choixImpose = null) {
    const p = o.plages[index];
    const jour = jourDe(depuisIso(iso));
    const choix = choixImpose ?? await portee(p, jour, deltaJours ? 'Déplacer' : 'Modifier');
    if (!choix) {
        focusApres = { plage: sansId(p), iso };
        o.redessiner(); // remet la plage à sa place
        return null;
    }
    const liste = o.plages.map(sansId);
    const nouvelle = { ...sansId(p), heure_debut: hhmm(debut), heure_fin: hhmm(fin) };
    if (choix === 'jour') {
        liste[index] = { ...liste[index], jours: p.jours & ~(1 << jour) };
        nouvelle.jours = 1 << ((jour + deltaJours + 7) % 7);
        liste.push(nouvelle);
    } else {
        nouvelle.jours = tourner(p.jours, deltaJours);
        if (p.date_debut && p.date_debut === p.date_fin) { // plage d'un seul jour : la date suit
            nouvelle.date_debut = dateIso(decaler(depuisIso(p.date_debut), deltaJours));
            nouvelle.date_fin = nouvelle.date_debut;
        }
        liste[index] = nouvelle;
    }
    const isoCible = dateIso(decaler(depuisIso(iso), deltaJours));
    if (vue === 'jour') {
        reference = depuisIso(isoCible);
    }
    focusApres = { plage: nouvelle, iso: isoCible };
    return (await o.appliquer(liste, message)) ? choix : null;
}

async function supprimerOccurrence(o, index, iso) {
    const p = o.plages[index];
    const jour = jourDe(depuisIso(iso));
    const choix = await portee(p, jour, 'Supprimer');
    if (!choix) {
        return;
    }
    const liste = o.plages.map(sansId);
    if (choix === 'jour') {
        liste[index].jours &= ~(1 << jour);
    } else {
        liste.splice(index, 1);
    }
    focusApres = { grille: true };
    await o.appliquer(liste, choix === 'jour' ? `Plage retirée du ${JOURS[jour].toLowerCase()}.` : 'Plage supprimée.');
}

async function creer(o, masque, debut, fin, iso) {
    const nouvelle = {
        playlist_id: o.playlistProposee(), date_debut: null, date_fin: null,
        heure_debut: hhmm(debut), heure_fin: hhmm(fin), jours: masque, priorite: 0,
    };
    focusApres = { plage: nouvelle, iso, bulle: true };
    await o.appliquer([...o.plages.map(sansId), nouvelle], 'Plage ajoutée.');
}

/* ---------- Bulle de modification ---------- */

function fermerBulle(rendreFocus = true) {
    bulle?.fermer(rendreFocus);
}

function ouvrirBulle(o, index, iso, ancre) {
    fermerBulle(false);
    const p = sansId(o.plages[index]);
    const jour = jourDe(depuisIso(iso));
    const choixHeures = (min, max, valeur) => [...new Set([...Array.from({ length: 97 }, (_, i) => i * QUART), valeur])]
        .filter((m) => m >= min && m <= max).sort((a, b) => a - b)
        .map((m) => el('option', { value: m, text: hhmm(m), selected: m === valeur }));

    const playlist = el('select', {}, o.playlists.map((pl) => el('option', { value: pl.id, text: nomAvecStatut(pl), selected: pl.id === p.playlist_id })));
    const debut = el('select', {}, choixHeures(0, 1440 - QUART, minutes(p.heure_debut)));
    const fin = el('select', {}, choixHeures(QUART, 1440, minutes(p.heure_fin)));
    const cases = JOURS.map((j, i) => el('input', { type: 'checkbox', checked: Boolean(p.jours & (1 << i)) }));
    const unique = p.date_debut !== null && p.date_debut === p.date_fin;
    const repetition = el('select', {},
        el('option', { value: 'semaine', text: 'Chaque semaine', selected: !p.date_debut && !p.date_fin }),
        el('option', { value: 'unique', text: `Une seule fois, le ${dateLongue.format(depuisIso(iso))}`, selected: unique }),
        (p.date_debut || p.date_fin) && !unique && el('option', { value: 'periode', text: `Chaque semaine, ${periodeTexte(p)}`, selected: true }));
    const majCases = () => cases.forEach((c, i) => {
        c.disabled = repetition.value === 'unique';
        if (c.disabled) {
            c.checked = i === jour;
        }
    });
    repetition.addEventListener('change', majCases);
    majCases();
    const priorite = el('input', { type: 'number', min: -1000, max: 1000, step: 1, value: p.priorite, class: 'court' });
    const erreur = el('p', { class: 'erreur', role: 'alert', hidden: true });

    const retrouver = () => courant.plages.findIndex((q) => memePlage(q, p));
    const formulaire = el('form', { class: 'bulle-corps' },
        champ('Playlist', playlist),
        el('div', { class: 'deux-colonnes' }, champ('De', debut), champ('À', fin)),
        el('fieldset', { class: 'jours' },
            el('legend', { text: 'Jours' }),
            el('div', { class: 'cases-jours' }, cases.map((c, i) => el('label', { class: 'case', title: JOURS[i] }, c, ` ${JOURS[i].slice(0, 3)}`)))),
        champ('Répétition', repetition),
        champ('Priorité', priorite, 'La plus forte l\'emporte en cas de chevauchement.'),
        erreur,
        el('div', { class: 'boutons' },
            el('button', { type: 'submit', class: 'bouton principal', text: 'Enregistrer' }),
            el('button', {
                type: 'button', class: 'bouton danger', text: 'Supprimer',
                onclick: () => {
                    const i = retrouver();
                    fermerBulle(false);
                    if (i !== -1) {
                        supprimerOccurrence(courant, i, iso);
                    }
                },
            }),
            el('button', {
                type: 'button', class: 'bouton lien', text: 'Plus d\'options',
                onclick: () => {
                    const i = retrouver();
                    fermerBulle(false);
                    if (i !== -1) {
                        courant.plusDOptions(i);
                    }
                },
            })));

    formulaire.addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = Number(debut.value);
        const f = Number(fin.value);
        const jours = cases.reduce((m, c, i) => (c.checked ? m | (1 << i) : m), 0);
        const i = retrouver();
        const probleme = i === -1 ? 'La plage a changé entre-temps : rouvrez-la.'
            : f <= d ? 'L\'heure de fin doit suivre l\'heure de début.'
                : jours === 0 ? 'Cochez au moins un jour.' : null;
        if (probleme) {
            erreur.textContent = probleme;
            erreur.hidden = false;
            return;
        }
        const resultat = {
            ...p,
            playlist_id: Number(playlist.value),
            heure_debut: hhmm(d),
            heure_fin: hhmm(f),
            jours,
            priorite: borner(Math.round(Number(priorite.value) || 0), -1000, 1000),
            date_debut: repetition.value === 'semaine' ? null : repetition.value === 'unique' ? iso : p.date_debut,
            date_fin: repetition.value === 'semaine' ? null : repetition.value === 'unique' ? iso : p.date_fin,
        };
        const liste = courant.plages.map(sansId);
        liste[i] = resultat;
        courant.choisirPlaylist(resultat.playlist_id);
        fermerBulle(false);
        focusApres = { plage: resultat, iso };
        await courant.appliquer(liste, 'Plage enregistrée.');
    });

    const noeud = el('div', { class: 'bulle-plage', role: 'dialog', 'aria-label': `Plage ${o.nomDe(p.playlist_id)}` },
        el('header', {},
            el('h2', { text: `${JOURS[jour]} · ${heuresTexte(p)}` }),
            el('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer', text: '×', onclick: () => fermerBulle() })),
        formulaire);
    document.body.append(noeud);

    // À droite de la plage s'il y a la place, sinon à gauche ; toujours dans la fenêtre.
    const r = ancre.getBoundingClientRect();
    const largeur = noeud.offsetWidth;
    const hauteur = noeud.offsetHeight;
    const gauche = r.right + 8 + largeur <= innerWidth ? r.right + 8 : Math.max(8, r.left - 8 - largeur);
    noeud.style.left = `${gauche}px`;
    noeud.style.top = `${borner(r.top, 8, Math.max(8, innerHeight - hauteur - 8))}px`;

    const clavier = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            fermerBulle();
        }
    };
    const dehors = (e) => {
        if (!noeud.contains(e.target) && !e.target.closest?.('dialog')) {
            fermerBulle(false);
        }
    };
    noeud.addEventListener('keydown', clavier);
    setTimeout(() => document.addEventListener('pointerdown', dehors, true));
    bulle = {
        noeud,
        fermer(rendreFocus) {
            document.removeEventListener('pointerdown', dehors, true);
            noeud.remove();
            bulle = null;
            if (rendreFocus) {
                (ancre.isConnected ? ancre : trouverBloc(p, iso))?.focus();
            }
        },
    };
    playlist.focus();
}

/* ---------- Gestes à la souris ---------- */

function colonneSous(x) {
    const k = colonnes.findIndex((c) => {
        const r = c.noeud.getBoundingClientRect();
        return x >= r.left && x < r.right;
    });
    if (k !== -1) {
        return k;
    }
    return x < colonnes[0].noeud.getBoundingClientRect().left ? 0 : colonnes.length - 1;
}

const minuteSous = (y, k) => borner((y - colonnes[k].noeud.getBoundingClientRect().top) / PX_MINUTE, 0, 1440);

/** Pendant un glisser : écoute le pointeur jusqu'au relâchement ; Échap annule. */
function suivrePointeur(cible, evenement, { bouger, terminer, nettoyer }) {
    const depart = { x: evenement.clientX, y: evenement.clientY };
    let bouge = false;
    let annule = false;
    cible.setPointerCapture(evenement.pointerId);
    const fin = () => {
        cible.removeEventListener('pointermove', mouvement);
        cible.removeEventListener('pointerup', relache);
        cible.removeEventListener('pointercancel', abandon);
        geste = null;
        nettoyer();
    };
    const mouvement = (e) => {
        if (!bouge && Math.hypot(e.clientX - depart.x, e.clientY - depart.y) < 5) {
            return;
        }
        bouge = true;
        bouger(e, depart);
    };
    const relache = (e) => {
        fin();
        if (!annule) {
            terminer(e, bouge);
        }
    };
    const abandon = () => {
        annule = true;
        fin();
    };
    cible.addEventListener('pointermove', mouvement);
    cible.addEventListener('pointerup', relache);
    cible.addEventListener('pointercancel', abandon);
    geste = {
        annuler() {
            annule = true;
            if (bouge) {
                clicIgnore = true;
                setTimeout(() => { clicIgnore = false; });
            }
            fin();
        },
    };
}

function zone(k, debut, fin, classe, texte = null) {
    const noeud = el('div', { class: classe, 'aria-hidden': 'true' }, texte && el('span', { text: texte }));
    noeud.style.top = `${debut * PX_MINUTE}px`;
    noeud.style.height = `${Math.max(QUART, fin - debut) * PX_MINUTE}px`;
    colonnes[k].noeud.append(noeud);
    return noeud;
}

/** Clic (plage d'une heure) ou glisser (début, fin et jours) sur un créneau vide. */
function gesteCreation(e, o, k) {
    if (e.button !== 0 || e.target !== e.currentTarget || o.occupe()) {
        return;
    }
    e.preventDefault();
    fermerBulle(false);
    const m0 = minuteSous(e.clientY, k);
    let selection = null;
    let zones = [];
    const effacer = () => {
        zones.forEach((n) => n.remove());
        zones = [];
    };
    suivrePointeur(e.currentTarget, e, {
        bouger(ev) {
            const k2 = colonneSous(ev.clientX);
            const m2 = minuteSous(ev.clientY, k);
            let d = Math.floor(Math.min(m0, m2) / QUART) * QUART;
            let f = Math.ceil(Math.max(m0, m2) / QUART) * QUART;
            if (f - d < QUART) {
                f = Math.min(1440, d + QUART);
                d = f - QUART;
            }
            selection = { k1: Math.min(k, k2), k2: Math.max(k, k2), d, f };
            effacer();
            for (let j = selection.k1; j <= selection.k2; j++) {
                zones.push(zone(j, d, f, 'selection-creneau', j === selection.k1 ? `${hhmm(d)} – ${hhmm(f)}` : null));
            }
        },
        terminer(ev, bouge) {
            if (!bouge) {
                const d = Math.min(Math.floor(m0 / 60) * 60, 1440 - 60);
                selection = { k1: k, k2: k, d, f: d + 60 };
            }
            let masque = 0;
            for (let j = selection.k1; j <= selection.k2; j++) {
                masque |= 1 << jourDe(colonnes[j].date);
            }
            creer(o, masque, selection.d, selection.f, dateIso(colonnes[selection.k1].date));
        },
        nettoyer: effacer,
    });
}

/** Glisser une plage (déplacer) ou l'un de ses bords (durée). */
function gesteBloc(e, o, index, iso, bloc) {
    if (e.button !== 0 || o.occupe()) {
        return;
    }
    e.stopPropagation();
    fermerBulle(false);
    const mode = e.target.classList.contains('haut') ? 'debut' : e.target.classList.contains('bas') ? 'fin' : 'deplacer';
    const p = o.plages[index];
    const d0 = minutes(p.heure_debut);
    const f0 = minutes(p.heure_fin);
    const k0 = colonnes.findIndex((c) => dateIso(c.date) === iso);
    let resultat = { d: d0, f: f0, k: k0 };
    let fantome = null;
    suivrePointeur(bloc, e, {
        bouger(ev, depart) {
            const ecart = (ev.clientY - depart.y) / PX_MINUTE;
            let { d, f, k } = { d: d0, f: f0, k: k0 };
            if (mode === 'deplacer') {
                const dm = borner(Math.round(ecart / QUART) * QUART, -d0, 1440 - f0);
                d += dm;
                f += dm;
                k = colonneSous(ev.clientX);
            } else if (mode === 'debut') {
                d = borner(Math.round((d0 + ecart) / QUART) * QUART, 0, f0 - QUART);
            } else {
                f = borner(Math.round((f0 + ecart) / QUART) * QUART, d0 + QUART, 1440);
            }
            resultat = { d, f, k };
            bloc.classList.add('en-deplacement');
            fantome?.remove();
            fantome = zone(k, d, f, 'fantome-plage', `${o.nomDe(p.playlist_id)} · ${hhmm(d)} – ${hhmm(f)}`);
            fantome.style.setProperty('--couleur', o.couleurDe(p.playlist_id));
        },
        terminer(ev, bouge) {
            if (!bouge) {
                return; // simple clic : l'événement click ouvre la bulle
            }
            clicIgnore = true;
            setTimeout(() => { clicIgnore = false; });
            const { d, f, k } = resultat;
            if (d === d0 && f === f0 && k === k0) {
                return;
            }
            const deltaJours = jourDe(colonnes[k].date) - jourDe(colonnes[k0].date);
            modifierOccurrence(o, index, iso, { debut: d, fin: f, deltaJours }, mode === 'deplacer' ? 'Plage déplacée.' : 'Durée modifiée.');
        },
        nettoyer() {
            fantome?.remove();
            bloc.classList.remove('en-deplacement');
        },
    });
}

/* ---------- Clavier ---------- */

const cleOccurrence = (p, iso) => `${iso}|${CHAMPS.map((k) => p[k]).join('|')}`;

async function clavierBloc(e, o, index, iso) {
    if (o.occupe() || e.ctrlKey || e.metaKey) {
        return;
    }
    const p = o.plages[index];
    let d = minutes(p.heure_debut);
    let f = minutes(p.heure_fin);
    let deltaJours = 0;
    let message = 'Plage déplacée.';
    if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        supprimerOccurrence(o, index, iso);
        return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const pas = e.key === 'ArrowUp' ? -QUART : QUART;
        if (e.shiftKey) {
            f = borner(f + pas, d + QUART, 1440);
            message = 'Durée modifiée.';
        } else if (e.altKey) {
            d = borner(d + pas, 0, f - QUART);
            message = 'Durée modifiée.';
        } else if (d + pas >= 0 && f + pas <= 1440) {
            d += pas;
            f += pas;
        }
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && vue !== 'mois' && !e.shiftKey && !e.altKey) {
        deltaJours = e.key === 'ArrowLeft' ? -1 : 1;
        const k = jourDe(depuisIso(iso)) + deltaJours;
        if (vue === 'semaine' && (k < 0 || k > 6)) {
            deltaJours = 0;
        }
    } else {
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (d === minutes(p.heure_debut) && f === minutes(p.heure_fin) && deltaJours === 0) {
        return;
    }
    const choix = memoPortee?.cle === cleOccurrence(p, iso) ? memoPortee.choix : null;
    const fait = await modifierOccurrence(o, index, iso, { debut: d, fin: f, deltaJours }, message, choix);
    memoPortee = fait && focusApres?.plage ? { cle: cleOccurrence(focusApres.plage, focusApres.iso), choix: fait } : null;
}

function annoncerCurseur(annonce) {
    const { jour, jourFin, debut, fin } = curseur;
    const nom = (k) => dateJour.format(colonnes[k].date);
    annonce.textContent = `${jour === jourFin ? nom(jour) : `Du ${nom(jour)} au ${nom(jourFin)}`}, ${hhmm(debut)} – ${hhmm(fin)}`;
}

function dessinerCurseur() {
    document.querySelectorAll('.curseur-creneau').forEach((n) => n.remove());
    for (let k = curseur.jour; k <= curseur.jourFin; k++) {
        zone(k, curseur.debut, curseur.fin, 'curseur-creneau');
    }
}

/** Choix d'un créneau au clavier dans la grille (équivalent du clic et du glisser). */
function clavierGrille(e, o, annonce) {
    if (e.target !== e.currentTarget || o.occupe() || e.ctrlKey || e.metaKey || e.altKey) {
        return;
    }
    const n = colonnes.length;
    const duree = curseur.fin - curseur.debut;
    switch (e.key) {
        case 'ArrowUp':
        case 'ArrowDown': {
            const sens = e.key === 'ArrowUp' ? -1 : 1;
            if (e.shiftKey) {
                curseur.fin = borner(curseur.fin + sens * QUART, curseur.debut + QUART, 1440);
            } else {
                curseur.debut = borner(curseur.debut + sens * 60, 0, 1440 - duree);
                curseur.fin = curseur.debut + duree;
            }
            break;
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
            const sens = e.key === 'ArrowLeft' ? -1 : 1;
            if (e.shiftKey) {
                curseur.jourFin = borner(curseur.jourFin + sens, curseur.jour, n - 1);
            } else if (curseur.jour + sens < 0 || curseur.jour + sens >= n) {
                curseur.jour = sens < 0 ? n - 1 : 0;
                curseur.jourFin = curseur.jour;
                focusApres = { grille: true };
                e.preventDefault();
                naviguer(o, sens);
                return;
            } else {
                curseur.jour += sens;
                curseur.jourFin = curseur.jour;
            }
            break;
        }
        case 'Enter': {
            let masque = 0;
            for (let k = curseur.jour; k <= curseur.jourFin; k++) {
                masque |= 1 << jourDe(colonnes[k].date);
            }
            e.preventDefault();
            creer(o, masque, curseur.debut, curseur.fin, dateIso(colonnes[curseur.jour].date));
            return;
        }
        case 'Escape':
            curseur.jourFin = curseur.jour;
            curseur.fin = Math.min(1440, curseur.debut + 60);
            break;
        default:
            return;
    }
    e.preventDefault();
    dessinerCurseur();
    annoncerCurseur(annonce);
    const defile = e.currentTarget;
    const haut = curseur.debut * PX_MINUTE;
    if (haut < defile.scrollTop + 40 || haut > defile.scrollTop + defile.clientHeight - 80) {
        defile.scrollTop = haut - 80;
    }
}

function naviguer(o, sens) {
    fermerBulle(false);
    if (sens === 0) {
        reference = new Date();
    } else if (vue === 'jour') {
        reference = decaler(reference, sens);
    } else if (vue === 'semaine') {
        reference = decaler(reference, 7 * sens);
    } else {
        reference = new Date(reference.getFullYear(), reference.getMonth() + sens, 1);
    }
    o.redessiner();
}

function changerVue(o, nouvelle) {
    fermerBulle(false);
    vue = nouvelle;
    o.redessiner();
}

/* ---------- Affichage ---------- */

function libelleBloc(o, p, iso) {
    return `${o.nomDe(p.playlist_id)}, ${dateJour.format(depuisIso(iso))}, ${heuresTexte(p)}, priorité ${p.priorite}`;
}

/** Nom d'une playlist suivi de son statut si sa période de diffusion est limitée. */
export function nomAvecStatut(playlist) {
    const statut = statutValidite(playlist);
    return statut && statut !== 'en_cours' ? `${playlist.nom} (${LIBELLES_STATUT[statut].toLowerCase()})` : playlist.nom;
}

/**
 * Plages actives un jour donné, avec pour chacune `horsPeriode` (sa playlist n'est pas valide ce
 * jour-là : elle ne passe pas) et `masquee` (une autre plage diffusable plus prioritaire la cache).
 */
function activesDu(o, date) {
    const iso = dateIso(date);
    const actives = o.plages
        .map((p, index) => ({ p, index, horsPeriode: !valideLe(o.playlists.find((pl) => pl.id === p.playlist_id), iso) }))
        .filter(({ p }) => active(p, iso, jourDe(date)))
        .sort((a, b) => minutes(a.p.heure_debut) - minutes(b.p.heure_debut) || minutes(b.p.heure_fin) - minutes(a.p.heure_fin));
    for (const a of actives) {
        a.masquee = !a.horsPeriode && actives.some((b) => b !== a && !b.horsPeriode && chevauche(a.p, b.p)
            && (b.p.priorite > a.p.priorite || (b.p.priorite === a.p.priorite && b.index < a.index)));
    }
    return actives;
}

function etatOccurrence({ horsPeriode, masquee }) {
    if (horsPeriode) {
        return { classe: ' hors-periode', texte: 'hors de la période de diffusion de la playlist' };
    }
    return masquee ? { classe: ' masquee', texte: 'masquée par une plage prioritaire' } : { classe: '', texte: '' };
}

function colonneJour(o, date, k) {
    const iso = dateIso(date);
    const estAujourdHui = iso === dateIso(new Date());
    const colonne = el('div', { class: estAujourdHui ? 'colonne-jour aujourdhui' : 'colonne-jour' });
    colonne.addEventListener('pointerdown', (e) => gesteCreation(e, o, k));

    // Plages qui se chevauchent : côte à côte, sur des « couloirs ».
    const actives = activesDu(o, date);
    const finsCouloirs = [];
    const places = actives.map((a) => {
        let couloir = finsCouloirs.findIndex((f) => f <= minutes(a.p.heure_debut));
        if (couloir === -1) {
            couloir = finsCouloirs.length;
            finsCouloirs.push(0);
        }
        finsCouloirs[couloir] = minutes(a.p.heure_fin);
        return { ...a, couloir };
    });
    const nbCouloirs = Math.max(1, finsCouloirs.length);
    for (const place of places) {
        const { p, index, couloir } = place;
        const debut = minutes(p.heure_debut);
        const etat = etatOccurrence(place);
        const bloc = el('button', {
            type: 'button',
            class: `bloc-plage${etat.classe}`,
            dataset: { index, occurrence: iso },
            title: `${o.nomDe(p.playlist_id)} · ${heuresTexte(p)} · priorité ${p.priorite}${etat.texte && ` · ${etat.texte}`}`,
            'aria-label': `${libelleBloc(o, p, iso)}${etat.texte && `, ${etat.texte}`}`,
            'aria-describedby': 'aide-bloc-plage',
        },
        el('span', { class: 'poignee haut', 'aria-hidden': 'true' }),
        el('strong', { text: o.nomDe(p.playlist_id) }),
        el('span', { text: heuresTexte(p) }),
        p.priorite !== 0 && el('span', { class: 'priorite', text: `priorité ${p.priorite}` }),
        el('span', { class: 'poignee bas', 'aria-hidden': 'true' }));
        bloc.style.top = `${debut * PX_MINUTE}px`;
        bloc.style.height = `${Math.max(QUART, minutes(p.heure_fin) - debut) * PX_MINUTE}px`;
        bloc.style.left = `calc(${(couloir / nbCouloirs) * 100}% + 1px)`;
        bloc.style.width = `calc(${100 / nbCouloirs}% - 3px)`;
        bloc.style.setProperty('--couleur', o.couleurDe(p.playlist_id));
        bloc.addEventListener('pointerdown', (e) => gesteBloc(e, o, index, iso, bloc));
        bloc.addEventListener('click', () => {
            if (!clicIgnore) {
                ouvrirBulle(o, index, iso, bloc);
            }
        });
        bloc.addEventListener('keydown', (e) => clavierBloc(e, o, index, iso));
        colonne.append(bloc);
    }
    if (estAujourdHui) {
        colonne.append(el('div', { class: 'trait-maintenant', 'aria-hidden': 'true' }));
    }
    return colonne;
}

function grilleHeures(o, dates) {
    const aujourdHui = dateIso(new Date());
    colonnes = [];
    const grille = el('div', { class: 'grille-heures' });
    grille.style.setProperty('--colonnes', dates.length);
    grille.append(el('div', { class: 'coin' }));
    for (const date of dates) {
        grille.append(el('div', { class: dateIso(date) === aujourdHui ? 'entete-jour aujourdhui' : 'entete-jour' },
            el('button', {
                type: 'button', class: 'lien-jour', 'aria-label': `Afficher le ${dateJour.format(date)}`,
                onclick: () => {
                    reference = date;
                    changerVue(o, 'jour');
                },
            }, el('strong', { text: JOURS[jourDe(date)] }), el('span', { text: dateCourte.format(date) }))));
    }
    grille.append(el('div', { class: 'axe-heures', 'aria-hidden': 'true' },
        Array.from({ length: 24 }, (_, h) => el('span', { text: h === 0 ? '' : `${z(h)}:00` }))));
    dates.forEach((date, k) => {
        const noeud = colonneJour(o, date, k);
        colonnes.push({ noeud, date });
        grille.append(noeud);
    });

    curseur.jour = Math.min(curseur.jour, dates.length - 1);
    curseur.jourFin = borner(curseur.jourFin, curseur.jour, dates.length - 1);
    const annonce = el('p', { class: 'visuellement-cache', 'aria-live': 'polite' });
    const defile = el('div', {
        class: 'calendrier-defilement', tabindex: 0, role: 'group',
        'aria-label': 'Créneaux du calendrier',
        'aria-describedby': 'aide-grille',
    }, grille);
    defile.addEventListener('scroll', () => {
        defilement = defile.scrollTop;
    });
    defile.addEventListener('keydown', (e) => clavierGrille(e, o, annonce));
    defile.addEventListener('focus', (e) => {
        if (e.target === defile) {
            dessinerCurseur();
            annoncerCurseur(annonce);
        }
    });
    defile.addEventListener('blur', () => document.querySelectorAll('.curseur-creneau').forEach((n) => n.remove()));
    return [defile, annonce];
}

function grilleMois(o) {
    const premier = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const nbSemaines = Math.ceil((jourDe(premier) + new Date(premier.getFullYear(), premier.getMonth() + 1, 0).getDate()) / 7);
    const debut = lundiDe(premier);
    const aujourdHui = dateIso(new Date());
    const voirJour = (date) => () => {
        reference = date;
        changerVue(o, 'jour');
    };
    colonnes = [];
    const grille = el('div', { class: 'grille-mois' }, JOURS.map((j) => el('div', { class: 'entete-mois', text: j.slice(0, 3) })));
    for (let n = 0; n < nbSemaines * 7; n++) {
        const date = decaler(debut, n);
        const iso = dateIso(date);
        const actives = activesDu(o, date);
        const classes = ['cellule-mois', date.getMonth() !== premier.getMonth() && 'hors-mois', iso === aujourdHui && 'aujourdhui'];
        grille.append(el('div', { class: classes.filter(Boolean).join(' ') },
            el('button', { type: 'button', class: 'numero-jour', text: date.getDate(), 'aria-label': `Afficher le ${dateJour.format(date)}`, onclick: voirJour(date) }),
            actives.slice(0, 3).map((occurrence) => {
                const { p, index } = occurrence;
                const etat = etatOccurrence(occurrence);
                const puce = el('button', {
                    type: 'button', class: `puce-plage${etat.classe}`,
                    dataset: { index, occurrence: iso },
                    title: etat.texte || null,
                    'aria-label': `${libelleBloc(o, p, iso)}${etat.texte && `, ${etat.texte}`}`,
                    'aria-describedby': 'aide-puce-plage',
                }, el('span', { class: 'pastille' }), el('span', { text: `${p.heure_debut} ${o.nomDe(p.playlist_id)}` }));
                puce.querySelector('.pastille').style.backgroundColor = o.couleurDe(p.playlist_id);
                puce.addEventListener('click', () => ouvrirBulle(o, index, iso, puce));
                puce.addEventListener('keydown', (e) => {
                    if ((e.key === 'Delete' || e.key === 'Backspace') && !o.occupe()) {
                        e.preventDefault();
                        supprimerOccurrence(o, index, iso);
                    }
                });
                return puce;
            }),
            actives.length > 3 && el('button', { type: 'button', class: 'bouton lien autres', text: `+ ${actives.length - 3} autres`, onclick: voirJour(date) })));
    }
    return grille;
}

function trouverBloc(plage, iso) {
    return [...document.querySelectorAll('[data-occurrence]')]
        .find((b) => b.dataset.occurrence === iso && memePlage(courant.plages[Number(b.dataset.index)], plage));
}

function placerTraitMaintenant() {
    const m = new Date();
    document.querySelectorAll('.trait-maintenant').forEach((t) => {
        t.style.top = `${(m.getHours() * 60 + m.getMinutes()) * PX_MINUTE}px`;
    });
}

/**
 * Calendrier complet (barre de navigation, vue, aide). Options : plages, playlists, nomDe,
 * couleurDe, appliquer(plages, message) → Promise<bool>, occupe(), redessiner(), plusDOptions(index),
 * playlistProposee(), choisirPlaylist(id), annuler().
 */
export function calendrier(o) {
    courant = o;
    let titre;
    let corps;
    if (vue === 'mois') {
        titre = moisAnnee.format(reference);
        corps = [grilleMois(o)];
    } else if (vue === 'jour') {
        titre = dateJour.format(reference);
        corps = grilleHeures(o, [reference]);
    } else {
        const lundi = lundiDe(reference);
        const dimanche = decaler(lundi, 6);
        titre = `Semaine du ${dateCourte.format(lundi)} au ${dateLongue.format(dimanche)}`;
        corps = grilleHeures(o, Array.from({ length: 7 }, (_, i) => decaler(lundi, i)));
    }
    const nomsPeriode = { jour: 'Jour', semaine: 'Semaine', mois: 'Mois' };
    const precedent = { jour: 'Jour précédent', semaine: 'Semaine précédente', mois: 'Mois précédent' }[vue];
    const suivant = { jour: 'Jour suivant', semaine: 'Semaine suivante', mois: 'Mois suivant' }[vue];

    return el('section', { class: 'calendrier' },
        el('div', { class: 'barre-calendrier' },
            el('button', { type: 'button', class: 'bouton', text: 'Aujourd\'hui', title: 'Raccourci : T', onclick: () => naviguer(o, 0) }),
            el('button', { type: 'button', class: 'bouton icone', 'aria-label': precedent, title: 'Raccourci : flèche gauche', text: '‹', onclick: () => naviguer(o, -1) }),
            el('button', { type: 'button', class: 'bouton icone', 'aria-label': suivant, title: 'Raccourci : flèche droite', text: '›', onclick: () => naviguer(o, 1) }),
            el('h2', { class: 'titre-periode', text: titre, 'aria-live': 'polite' }),
            el('div', { class: 'segments', role: 'group', 'aria-label': 'Vue du calendrier' },
                [['jour', 'J'], ['semaine', 'S'], ['mois', 'M']].map(([valeur, touche]) => el('button', {
                    type: 'button', class: valeur === vue ? 'segment actif' : 'segment', 'aria-pressed': String(valeur === vue),
                    title: `Raccourci : ${touche}`, text: nomsPeriode[valeur], onclick: () => changerVue(o, valeur),
                })))),
        corps,
        el('p', { id: 'aide-bloc-plage', class: 'visuellement-cache',
            text: 'Entrée : modifier. Flèches haut et bas : déplacer d\'un quart d\'heure ; gauche et droite : d\'un jour. Maj + flèches : changer la fin ; Alt + flèches : changer le début. Suppr : supprimer.' }),
        el('p', { id: 'aide-puce-plage', class: 'visuellement-cache', text: 'Entrée : modifier. Suppr : supprimer.' }),
        el('p', { id: 'aide-grille', class: 'visuellement-cache',
            text: 'Flèches : choisir un créneau ; Maj + flèches : l\'étendre ; Entrée : créer une plage ; Échap : réduire le créneau.' }),
        el('details', { class: 'aide-calendrier' },
            el('summary', { text: 'Souris et clavier' }),
            el('ul', {},
                el('li', { text: 'Clic sur un créneau vide : plage d\'une heure. Glisser : choisir le début, la fin et les jours.' }),
                el('li', { text: 'Clic sur une plage : la modifier. Glisser : la déplacer (au quart d\'heure). Tirer son bord haut ou bas : changer sa durée.' }),
                el('li', { text: 'Clavier, sur la grille : flèches pour choisir un créneau, Maj + flèches pour l\'étendre, Entrée pour créer.' }),
                el('li', { text: 'Sur une plage : flèches pour la déplacer, Maj + flèches pour changer sa fin, Alt + flèches pour son début, Suppr pour la supprimer.' }),
                el('li', { text: 'Ailleurs : flèches gauche et droite pour changer de période, T pour aujourd\'hui, J / S / M pour la vue, Ctrl + Z pour annuler la dernière action, Échap pour interrompre un glisser ou fermer la bulle.' }),
                el('li', { text: 'Plage hachurée : masquée par une plage de plus forte priorité au même moment. Plage grisée et barrée : sa playlist est hors de sa période de diffusion ce jour-là.' }))));
}

/** À appeler une fois le calendrier inséré dans la page : défilement, focus, bulle à rouvrir. */
export function apresAffichage() {
    placerTraitMaintenant();
    const defile = document.querySelector('.calendrier-defilement');
    if (defile) {
        defile.scrollTop = defilement;
    }
    const cible = focusApres;
    if (!cible || !courant) {
        return;
    }
    if (!courant.occupe()) {
        focusApres = null;
    }
    if (cible.grille) {
        defile?.focus({ preventScroll: true });
        return;
    }
    const bloc = trouverBloc(cible.plage, cible.iso);
    if (!bloc) {
        return;
    }
    if (cible.bulle) {
        cible.bulle = false;
        ouvrirBulle(courant, Number(bloc.dataset.index), cible.iso, bloc);
    } else if (!bulle) {
        bloc.focus();
    }
}

/** Raccourcis globaux et mise à jour de la ligne de l'heure actuelle ; renvoie la fonction d'arrêt. */
export function demarrer() {
    const clavier = (e) => {
        if (!courant) {
            return;
        }
        if (e.key === 'Escape' && geste) {
            e.preventDefault();
            geste.annuler();
            return;
        }
        const t = e.target;
        if (bulle || document.querySelector('dialog[open]') || t.closest?.('input, select, textarea, [contenteditable]')) {
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            courant.annuler();
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey || t.closest?.('.bloc-plage, .puce-plage, .calendrier-defilement')) {
            return;
        }
        const actions = {
            ArrowLeft: () => naviguer(courant, -1),
            ArrowRight: () => naviguer(courant, 1),
            t: () => naviguer(courant, 0),
            j: () => changerVue(courant, 'jour'),
            s: () => changerVue(courant, 'semaine'),
            m: () => changerVue(courant, 'mois'),
        };
        const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
        if (action && !e.shiftKey) {
            e.preventDefault();
            action();
        }
    };
    document.addEventListener('keydown', clavier);
    const minuteur = setInterval(placerTraitMaintenant, 60 * 1000);
    return () => {
        document.removeEventListener('keydown', clavier);
        clearInterval(minuteur);
        fermerBulle(false);
        geste?.annuler();
        courant = null;
    };
}
