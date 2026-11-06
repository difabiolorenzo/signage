// Éditeur de pages d'une playlist : liste des pages à gauche, aperçu au centre (même code
// d'affichage que le lecteur), réglages de la page et de la région choisie à droite.
// La disposition peut être changée, et deux régions échangées (glisser-déposer ou bouton).

import { couleurRegion, estDispositionPortrait, libelleDisposition } from '../commun/dispositions.js';
import { problemePlaylist } from '../commun/regles.js';
import { DUREE_PAGE, ECRAN_REFERENCE, pageParDefaut, TYPES_WIDGETS, widgetParDefaut } from '../commun/widgets.js';
import { afficherPage, echelle } from '../lecteur/affichage.js';
import { api } from './api.js';
import { apercuDisposition, placer } from './apercu.js';
import { choixDisposition } from './choix_disposition.js';
import { choisirMedias } from './choix_medias.js';
import { champ, confirmer, dialogue } from './dialogue.js';
import { duree, el } from './dom.js';
import { panneauProprietes } from './panneau.js';
import { LIBELLES_STATUT, periodeValiditeTexte, statutValidite } from './validite.js';

const libelleType = (type) => TYPES_WIDGETS.find((t) => t.type === type)?.libelle ?? type;

/**
 * Une page a exactement un widget par région, et chaque widget tous les réglages de son type
 * (les pages anciennes ou incomplètes sont complétées par les valeurs par défaut).
 */
function normaliser(pages, nombreRegions) {
    const liste = Array.isArray(pages) && pages.length > 0 ? pages : [pageParDefaut(nombreRegions)];
    return liste.map((p) => ({
        duree: Number.isInteger(p.duree) && p.duree > 0 ? p.duree : DUREE_PAGE,
        fond: typeof p.fond === 'string' ? p.fond : '#000000',
        widgets: Array.from({ length: nombreRegions }, (_, i) => {
            const w = p.widgets?.[i];
            const connu = w && typeof w === 'object' && TYPES_WIDGETS.some((t) => t.type === w.type);
            return connu ? { ...widgetParDefaut(w.type), ...w } : widgetParDefaut('vide');
        }),
    }));
}

/**
 * chaineId : ouverte depuis la page d'une chaîne (#/chaines/{c}/playlists/{p}), ou null depuis le
 * menu « Playlists » (#/playlists/{p}). La chaîne sert au retour et à l'aperçu des flux RSS, que le
 * serveur ne relaie que pour une chaîne qui programme la playlist.
 */
export async function afficher(ecran, contexte, chaineId, playlistId) {
    const [{ chaines }, { playlist, medias }] = await Promise.all([
        api.get('/chaines'),
        api.get(`/playlists/${playlistId}`),
    ]);
    const chaine = chaines.find((c) => c.id === chaineId)
        ?? chaines.find((c) => playlist.utilisee_par.some((u) => u.id === c.id))
        ?? chaines.find((c) => playlist.acces.chaines.some((a) => a.id === c.id))
        ?? null;
    const retour = chaineId !== null && chaine ? `#/chaines/${chaineId}` : '#/playlists';
    const mediasParId = new Map(medias.map((m) => [m.id, m]));
    const etat = {
        nom: playlist.nom,
        disposition: playlist.disposition,
        regions: playlist.regions,
        portrait: playlist.portrait,
        valide_du: playlist.valide_du,
        valide_au: playlist.valide_au,
        grilleModifiee: false, // disposition et régions à envoyer à l'enregistrement
        pages: normaliser(playlist.pages, playlist.regions.length),
        page: 0,
        region: null,
        modifie: false,
        multiChainesConfirme: false,
    };
    document.title = `${playlist.nom} — Signage Studio`;
    contexte.modificationsEnCours = () => etat.modifie;

    // --- Structure de l'écran ---
    const champNom = el('input', { class: 'nom-playlist', maxlength: 100, value: etat.nom, 'aria-label': 'Nom de la playlist' });
    const infos = el('span', { class: 'infos' });
    const indicateur = el('span', { class: 'non-enregistre', text: 'Modifications non enregistrées', hidden: true });
    const probleme = el('p', { class: 'probleme', role: 'alert', hidden: true });
    const boutonEnregistrer = el('button', { type: 'button', class: 'bouton principal', text: 'Enregistrer', title: 'Enregistrer (Ctrl+S)' });
    const boutonDisposition = el('button', {
        type: 'button', class: 'bouton', text: 'Changer la disposition…', title: 'Choisir une autre disposition ou redessiner la grille',
    });
    const boutonPeriode = el('button', { type: 'button', class: 'bouton', title: 'Dates entre lesquelles la playlist peut être diffusée' });
    const boutonEchanger = el('button', {
        type: 'button', class: 'bouton', text: 'Échanger avec…', title: 'Permuter le contenu de la région choisie avec celui d\'une autre région',
    });

    const listePages = el('ol', { class: 'liste-pages' });
    const outilsPages = el('div', { class: 'outils-pages' });
    const scene = el('div', { class: 'scene-apercu' });
    const calques = el('div', { class: 'calques' });
    const toile = el('div', { class: 'toile' }, scene, calques);
    const zoneToile = el('section', { class: 'zone-toile', 'aria-label': 'Aperçu de la page' },
        toile,
        el('div', { class: 'outils-toile' },
            el('p', { class: 'aide-toile', text: 'Cliquez sur une région pour choisir son contenu ; faites-la glisser sur une autre pour les échanger.' }),
            boutonEchanger));
    const proprietes = el('aside', { class: 'proprietes', 'aria-label': 'Réglages' });

    ecran.replaceChildren(el('div', { class: 'editeur' },
        el('div', { class: 'barre-editeur' },
            el('a', { class: 'retour-editeur', href: retour, text: '← Playlists' }),
            champNom, infos, boutonDisposition, boutonPeriode, indicateur,
            el('span', { class: 'espace' }),
            boutonEnregistrer),
        probleme,
        el('div', { class: 'editeur-corps' },
            el('aside', { class: 'pages' }, el('h2', { text: 'Pages' }), listePages, outilsPages),
            zoneToile,
            proprietes)));

    // Lecture seule : seuls l'auteur et les administrateurs peuvent enregistrer (vérifié par le serveur).
    if (!playlist.modifiable) {
        boutonEnregistrer.disabled = true;
        boutonEnregistrer.title = 'Seuls l\'auteur et les administrateurs peuvent modifier cette playlist.';
        probleme.textContent = `Lecture seule : seuls ${playlist.auteur ? `son auteur (${playlist.auteur.nom})` : 'son auteur'} et les administrateurs peuvent modifier cette playlist. Vous pouvez la dupliquer depuis la liste des playlists.`;
        probleme.hidden = false;
    }

    // --- Aperçu (même code que le lecteur) ---
    const contexteApercu = {
        maintenant: () => new Date(),
        urlApi: chaine ? `${document.body.dataset.api}/public/${encodeURIComponent(chaine.slug)}` : null,
    };
    let pageAffichee = null;
    let minuteurApercu = null;

    /** Copie de la page où chaque média référencé devient { url, type, duree } comme pour le lecteur. */
    function pagePourApercu(page) {
        return {
            ...page,
            widgets: page.widgets.map((w) => (w.type === 'qr' ? {
                ...w,
                logo_url: String(mediasParId.get(w.logo)?.type ?? '').startsWith('image/') ? mediasParId.get(w.logo).url : null,
            } : w.type !== 'media' ? w : {
                ...w,
                elements: (w.elements ?? []).map((e) => {
                    const m = mediasParId.get(e.media);
                    return m && { url: m.url, type: m.type, duree: e.duree };
                }).filter(Boolean),
            })),
        };
    }

    function rendreApercu() {
        clearTimeout(minuteurApercu);
        pageAffichee?.detruire();
        pageAffichee = afficherPage(scene, { regions: etat.regions },pagePourApercu(etat.pages[etat.page]), contexteApercu);
    }

    function dessinerCalques() {
        const page = etat.pages[etat.page];
        calques.replaceChildren(...etat.regions.map((r, i) => {
            const calque = el('button', {
                type: 'button',
                class: i === etat.region ? 'calque selectionne' : 'calque',
                dataset: { region: i },
                'aria-pressed': String(i === etat.region),
                'aria-label': `Région ${i + 1} : ${libelleType(page.widgets[i].type)}`,
                onclick: () => {
                    etat.region = i;
                    dessinerCalques();
                    dessinerProprietes();
                },
            }, el('span', { class: 'etiquette-region', text: `Région ${i + 1} · ${libelleType(page.widgets[i].type)}` }));
            calque.style.setProperty('--couleur-region', couleurRegion(i));
            placer(calque, r);
            return calque;
        }));
        boutonEchanger.disabled = etat.region === null || etat.regions.length < 2;
        boutonEchanger.textContent = etat.region === null ? 'Échanger avec…' : `Échanger la région ${etat.region + 1} avec…`;
    }

    // --- Échange de deux régions : glisser un calque sur un autre ---
    let glisse = null; // { depart, x, y, actif, cible }
    function finGlisse() {
        calques.classList.remove('glisse-en-cours');
        calques.querySelectorAll('.source, .cible').forEach((c) => c.classList.remove('source', 'cible'));
        document.removeEventListener('pointermove', bougerGlisse);
        document.removeEventListener('pointerup', lacherGlisse);
        document.removeEventListener('pointercancel', annulerGlisse);
    }
    function bougerGlisse(e) {
        if (!glisse.actif && Math.hypot(e.clientX - glisse.x, e.clientY - glisse.y) < 6) {
            return;
        }
        glisse.actif = true;
        calques.classList.add('glisse-en-cours');
        const sous = document.elementFromPoint(e.clientX, e.clientY)?.closest('.calque');
        const indice = sous && calques.contains(sous) ? Number(sous.dataset.region) : null;
        glisse.cible = indice !== glisse.depart ? indice : null;
        for (const c of calques.children) {
            c.classList.toggle('source', Number(c.dataset.region) === glisse.depart);
            c.classList.toggle('cible', Number(c.dataset.region) === glisse.cible);
        }
    }
    function lacherGlisse() {
        const { actif, depart, cible } = glisse;
        glisse = null;
        finGlisse();
        if (actif && cible !== null) {
            echanger(depart, cible);
        }
    }
    function annulerGlisse() {
        glisse = null;
        finGlisse();
    }
    calques.addEventListener('pointerdown', (e) => {
        const calque = e.target.closest('.calque');
        if (!calque || e.button !== 0 || glisse || etat.regions.length < 2) {
            return;
        }
        glisse = { depart: Number(calque.dataset.region), x: e.clientX, y: e.clientY, actif: false, cible: null };
        document.addEventListener('pointermove', bougerGlisse);
        document.addEventListener('pointerup', lacherGlisse);
        document.addEventListener('pointercancel', annulerGlisse);
    });

    /** Permute les widgets des régions a et b, sur la page courante ou sur toutes (choix demandé). */
    async function echanger(a, b = null) {
        const libelle = (i) => `Région ${i + 1} · ${libelleType(etat.pages[etat.page].widgets[i].type)}`;
        const autre = el('select', {}, etat.regions.map((_, i) => i !== a && el('option', { value: i, text: libelle(i), selected: i === b })));
        const portee = (valeur, texte, coche) => el('label', { class: 'case' },
            el('input', { type: 'radio', name: 'portee-echange', value: valeur, checked: coche }), ` ${texte}`);
        const choixPortee = el('fieldset', { class: 'portee' },
            el('legend', { text: 'Sur' }),
            portee('page', `cette page (page ${etat.page + 1})`, true),
            portee('toutes', `toutes les pages (${etat.pages.length})`, false));
        const resultat = await dialogue({
            titre: `Échanger la région ${a + 1}`,
            texteValider: 'Échanger',
            corps: [
                champ('Avec', autre),
                choixPortee,
                el('p', { class: 'aide', text: 'Les widgets et leurs réglages sont permutés entre les deux régions.' }),
            ],
            valider: async () => ({
                cible: Number(autre.value),
                toutes: choixPortee.querySelector('input:checked').value === 'toutes',
            }),
        });
        if (!resultat) {
            return;
        }
        const { cible, toutes } = resultat;
        for (const page of toutes ? etat.pages : [etat.pages[etat.page]]) {
            [page.widgets[a], page.widgets[cible]] = [page.widgets[cible], page.widgets[a]];
        }
        etat.region = cible;
        modifie();
        toutDessiner();
        contexte.notifier(`Régions ${a + 1} et ${cible + 1} échangées${toutes ? ' sur toutes les pages' : ''}.`);
    }
    boutonEchanger.addEventListener('click', () => etat.region !== null && echanger(etat.region));

    // --- Changement de disposition ---
    async function changerDisposition() {
        const choix = choixDisposition({ actuelle: { disposition: etat.disposition, regions: etat.regions } });
        const resultat = await dialogue({
            titre: 'Changer la disposition',
            texteValider: 'Appliquer',
            large: true,
            corps: [
                choix.element,
                el('p', { class: 'aide', text: 'Les régions conservées gardent leurs widgets. Le changement est enregistré avec le bouton « Enregistrer ».' }),
            ],
            valider: async () => choix.resultat(),
        });
        if (!resultat) {
            return;
        }
        const { disposition, regions, origines } = resultat;
        const gardees = new Set(origines.filter((i) => i !== null));
        const perdus = [];
        etat.pages.forEach((page, n) => page.widgets.forEach((w, i) => {
            if (!gardees.has(i) && w.type !== 'vide') {
                perdus.push(`Page ${n + 1}, région ${i + 1} : ${libelleType(w.type)}`);
            }
        }));
        if (perdus.length > 0) {
            const max = 15;
            const liste = perdus.length > max ? [...perdus.slice(0, max), `… et ${perdus.length - max} autre(s).`] : perdus;
            const message = ['Ces widgets n\'ont plus de région dans la nouvelle disposition et seront retirés :', ...liste];
            if (!(await confirmer('Widgets retirés', message, 'Changer quand même'))) {
                return;
            }
        }
        etat.pages = normaliser(etat.pages.map((page) => ({
            ...page,
            widgets: origines.map((i) => (i === null ? widgetParDefaut('vide') : page.widgets[i])),
        })), regions.length);
        etat.disposition = disposition;
        etat.regions = regions;
        etat.portrait = estDispositionPortrait(disposition);
        etat.grilleModifiee = true;
        etat.region = null;
        modifie();
        ajusterToile();
        toutDessiner();
    }
    boutonDisposition.addEventListener('click', changerDisposition);

    // La toile garde les proportions de l'écran (16:9 ou 9:16) dans la place disponible.
    function ajusterToile() {
        const portrait = etat.portrait;
        const marge = 24;
        const largeurDispo = zoneToile.clientWidth - 2 * marge;
        const hauteurDispo = zoneToile.clientHeight - 2 * marge - 24;
        const rapport = portrait ? ECRAN_REFERENCE.hauteur / ECRAN_REFERENCE.largeur : ECRAN_REFERENCE.largeur / ECRAN_REFERENCE.hauteur;
        const largeur = Math.max(80, Math.min(largeurDispo, hauteurDispo * rapport));
        const hauteur = largeur / rapport;
        toile.style.width = `${largeur}px`;
        toile.style.height = `${hauteur}px`;
        scene.style.setProperty('--echelle', String(echelle(largeur, hauteur, portrait)));
    }
    new ResizeObserver(ajusterToile).observe(zoneToile);

    // --- Pages ---
    function dessinerPages() {
        listePages.replaceChildren(...etat.pages.map((page, i) => el('li', {},
            el('button', {
                type: 'button', class: i === etat.page ? 'vignette-page active' : 'vignette-page', 'aria-current': i === etat.page ? 'true' : null,
                onclick: () => {
                    etat.page = i;
                    toutDessiner();
                },
            },
            apercuDisposition(etat.regions, etat.portrait),
            el('span', { class: 'legende' }, el('span', { text: `Page ${i + 1}` }), el('span', { text: `${page.duree} s` }))))));

        const n = etat.pages.length;
        const p = etat.page;
        const action = (texte, titre, actif, faire) => el('button', {
            type: 'button', class: 'bouton', text: texte, title: titre, disabled: !actif,
            onclick: () => {
                faire();
                modifie();
                toutDessiner();
            },
        });
        outilsPages.replaceChildren(
            action('+ Nouvelle page', 'Ajouter une page vide à la fin', true, () => {
                etat.pages.push(pageParDefaut(etat.regions.length));
                etat.page = etat.pages.length - 1;
            }),
            action('Dupliquer', 'Copier cette page juste après', true, () => {
                etat.pages.splice(p + 1, 0, structuredClone(etat.pages[p]));
                etat.page = p + 1;
            }),
            action('↑', 'Monter la page', p > 0, () => {
                [etat.pages[p - 1], etat.pages[p]] = [etat.pages[p], etat.pages[p - 1]];
                etat.page = p - 1;
            }),
            action('↓', 'Descendre la page', p < n - 1, () => {
                [etat.pages[p + 1], etat.pages[p]] = [etat.pages[p], etat.pages[p + 1]];
                etat.page = p + 1;
            }),
            action('Supprimer', n > 1 ? 'Supprimer cette page' : 'Une playlist garde au moins une page', n > 1, () => {
                etat.pages.splice(p, 1);
                etat.page = Math.min(p, etat.pages.length - 1);
            }));
    }

    /** Fenêtre de choix des médias ; les médias choisis (ou envoyés) rejoignent la liste connue de l'éditeur. */
    async function ajouterMedias() {
        // Fichiers envoyés depuis la fenêtre : ouverts à la chaîne de la page, si la playlist y a été ouverte.
        const choisis = (await choisirMedias({ chaine: chaineId !== null && chaine ? chaine.id : null })) ?? [];
        for (const m of choisis) {
            if (!mediasParId.has(m.id)) {
                medias.push(m);
                mediasParId.set(m.id, m);
            }
        }
        return choisis;
    }

    function dessinerProprietes() {
        proprietes.replaceChildren(panneauProprietes({
            page: etat.pages[etat.page],
            numeroPage: etat.page + 1,
            indexRegion: etat.region,
            regions: etat.regions,
            portrait: etat.portrait,
            medias,
            ajouterMedias,
            modifie: ({ reconstruire = false } = {}) => {
                modifie();
                if (reconstruire) {
                    dessinerProprietes();
                    dessinerCalques();
                    rendreApercu();
                } else {
                    // Saisie au clavier : l'aperçu attend une courte pause pour ne pas clignoter.
                    clearTimeout(minuteurApercu);
                    minuteurApercu = setTimeout(rendreApercu, 400);
                    dessinerPages();
                }
            },
        }));
    }

    function dessinerInfos() {
        const total = etat.pages.reduce((s, p) => s + (Number(p.duree) || 0), 0);
        const taille = etat.portrait ? '1080 × 1920' : '1920 × 1080';
        infos.textContent = `${libelleDisposition(etat.disposition)} · ${taille} · ${etat.pages.length} page(s) · ${duree(total)}`;
        const message = problemePlaylist(etat.pages);
        probleme.textContent = message ?? '';
        probleme.hidden = message === null;
        indicateur.hidden = !etat.modifie;
        const statut = statutValidite(etat);
        boutonPeriode.textContent = statut ? `Diffusion ${periodeValiditeTexte(etat)} · ${LIBELLES_STATUT[statut].toLowerCase()}` : 'Diffusion : sans limite de dates';
        boutonPeriode.classList.toggle('expiree', statut === 'expiree');
    }

    async function changerPeriode() {
        const du = el('input', { type: 'date', value: etat.valide_du ?? '' });
        const au = el('input', { type: 'date', value: etat.valide_au ?? '' });
        const periode = await dialogue({
            titre: 'Période de diffusion',
            texteValider: 'Appliquer',
            corps: [
                el('p', { text: "En dehors de cette période, la playlist n'est jamais diffusée, même comme playlist par défaut : la plage suivante en priorité prend le relais. Laissez vide pour ne pas limiter." }),
                el('div', { class: 'deux-colonnes' }, champ('Du (facultatif)', du), champ('Au (facultatif)', au)),
            ],
            valider: async () => {
                if (du.value && au.value && au.value < du.value) {
                    throw new Error('La fin de la période précède son début.');
                }
                return { valide_du: du.value || null, valide_au: au.value || null };
            },
        });
        if (periode && (periode.valide_du !== etat.valide_du || periode.valide_au !== etat.valide_au)) {
            Object.assign(etat, periode);
            modifie();
        }
    }

    function toutDessiner() {
        dessinerInfos();
        dessinerPages();
        dessinerCalques();
        dessinerProprietes();
        rendreApercu();
    }

    function modifie() {
        etat.modifie = true;
        dessinerInfos();
    }

    // --- Enregistrement ---
    async function enregistrer() {
        if (boutonEnregistrer.disabled) {
            return; // lecture seule (Ctrl+S) ou enregistrement déjà en cours
        }
        const message = !champNom.value.trim() ? 'Donnez un nom à la playlist.' : problemePlaylist(etat.pages);
        if (message) {
            probleme.textContent = message;
            probleme.hidden = false;
            contexte.notifier(`Non enregistré : ${message}`);
            return;
        }
        // Une playlist programmée sur plusieurs chaînes change partout : confirmation, une fois par ouverture.
        const chaines = playlist.utilisee_par;
        if (chaines.length > 1 && !etat.multiChainesConfirme) {
            boutonEnregistrer.disabled = true;
            const ok = await dialogue({
                titre: 'Playlist utilisée par plusieurs chaînes',
                texteValider: 'Enregistrer quand même',
                corps: [
                    el('p', { text: `Cette playlist passe sur ${chaines.length} chaînes (${chaines.map((c) => c.nom).join(', ')}).` }),
                    el('p', { text: 'Vos modifications apparaîtront sur tous leurs afficheurs.' }),
                ],
            });
            boutonEnregistrer.disabled = false;
            if (ok !== true) {
                return;
            }
            etat.multiChainesConfirme = true;
        }
        boutonEnregistrer.disabled = true;
        try {
            const corps = { nom: champNom.value.trim(), pages: etat.pages, valide_du: etat.valide_du, valide_au: etat.valide_au };
            if (etat.grilleModifiee) {
                Object.assign(corps, { disposition: etat.disposition, regions: etat.regions });
            }
            await api.put(`/playlists/${playlistId}`, corps);
            etat.modifie = false;
            etat.grilleModifiee = false;
            dessinerInfos();
            document.title = `${champNom.value.trim()} — Signage Studio`;
            contexte.notifier('Playlist enregistrée.');
        } catch (e) {
            probleme.textContent = e.message;
            probleme.hidden = false;
            contexte.notifier(`Non enregistré : ${e.message}`);
        } finally {
            boutonEnregistrer.disabled = false;
        }
    }

    boutonEnregistrer.addEventListener('click', enregistrer);
    boutonPeriode.addEventListener('click', changerPeriode);
    champNom.addEventListener('input', modifie);
    const raccourci = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            enregistrer();
        }
    };
    document.addEventListener('keydown', raccourci);
    // Garde la session ouverte pendant une longue modification (expiration de PHP après inactivité).
    const maintienSession = setInterval(() => api.get('/moi').catch(() => {}), 5 * 60 * 1000);
    contexte.surQuitter(() => {
        clearInterval(maintienSession);
        document.removeEventListener('keydown', raccourci);
        clearTimeout(minuteurApercu);
        finGlisse();
        pageAffichee?.detruire();
    });

    toutDessiner();
}
