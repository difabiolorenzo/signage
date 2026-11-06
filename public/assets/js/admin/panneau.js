// Panneau de droite de l'éditeur de pages : réglages de la page, puis du widget de la région
// choisie. Les champs modifient directement les objets de la page ; chaque modification est
// signalée par modifie({ reconstruire }) : reconstruire = true redessine le panneau (choix d'un
// type, case à cocher…), sinon le panneau est gardé tel quel pour ne pas perdre la saisie.

import { couleurRegion } from '../commun/dispositions.js';
import {
    AFFICHAGES_HORLOGE, DEFILEMENTS, DUREE_MEDIA, ECHELLES, ECRAN_REFERENCE, elementMediaParDefaut,
    TRANSITIONS, TYPES_WIDGETS, VITESSES, widgetParDefaut,
} from '../commun/widgets.js';
import { urlWeb } from '../lecteur/outils.js';
import { creer as creerWidgetMedia } from '../lecteur/widgets/media.js';
import { formaterDate } from '../lecteur/widgets/horloge.js';
import { JOURS_METEO, MODELES_METEO } from '../lecteur/widgets/meteo.js';
import { FORMES_QR, problemeLisibilite, QR_DEFAUTS } from '../lecteur/widgets/qr.js';
import { identifiantVideo } from '../lecteur/widgets/youtube.js';
import { htmlMarkdown, htmlTexteSimple, MODES_TEXTE, modeTexte } from '../commun/texte_riche.js';
import { duree as dureeTexte, el } from './dom.js';
import { editeurRiche } from './editeur_riche.js';
import { adresseVignette, descriptionMedia } from './envoi_medias.js';

const FORMATS_DATE = ['%Y.%m.%d %A', '%d/%m/%Y', '%Y-%m-%d', '%A %d %B %Y', '%A %e %B'];
const FOND_PAR_DEFAUT = '#142228';

function ligne(libelle, ...controles) {
    return el('label', { class: 'ligne-champ' }, el('span', { text: libelle }), ...controles);
}

/** Construit les champs, liés à `modifie`. */
function champs(modifie) {
    const nombre = (objet, cle, { min, max, suffixe = '', defaut }) => {
        const entree = el('input', { type: 'number', min, max, step: 1, value: objet[cle] ?? defaut, class: 'court' });
        entree.addEventListener('input', () => {
            const v = Number(entree.value);
            const valide = entree.value !== '' && Number.isInteger(v) && v >= min && v <= max;
            entree.classList.toggle('invalide', !valide);
            if (valide) {
                objet[cle] = v;
                modifie();
            }
        });
        return suffixe ? [entree, el('span', { class: 'suffixe', text: suffixe })] : [entree];
    };
    const texte = (objet, cle, { multiligne = false, placeholder = '', type = 'text', maxlength = 2000 } = {}) => {
        const entree = el(multiligne ? 'textarea' : 'input', { type: multiligne ? null : type, placeholder, maxlength, rows: multiligne ? 4 : null });
        entree.value = objet[cle] ?? '';
        entree.addEventListener('input', () => {
            objet[cle] = entree.value;
            modifie();
        });
        return entree;
    };
    // Les valeurs d'option sont des chaînes : chaque option garde sa valeur d'origine (nombre, booléen).
    const liste = (objet, cle, options) => {
        const select = el('select', {}, options.map((o, i) => el('option', {
            value: i, text: o.libelle, selected: String(objet[cle]) === String(o.valeur),
        })));
        select.addEventListener('change', () => {
            objet[cle] = options[Number(select.value)].valeur;
            modifie({ reconstruire: true });
        });
        return select;
    };
    const coche = (objet, cle, libelle, { defaut = true } = {}) => {
        const entree = el('input', { type: 'checkbox', checked: (objet[cle] ?? defaut) === true });
        entree.addEventListener('change', () => {
            objet[cle] = entree.checked;
            modifie({ reconstruire: true });
        });
        return el('label', { class: 'case' }, entree, ` ${libelle}`);
    };
    const couleur = (objet, cle, defaut) => {
        const entree = el('input', { type: 'color', value: String(objet[cle] ?? defaut).slice(0, 7) });
        entree.addEventListener('input', () => {
            objet[cle] = entree.value;
            modifie();
        });
        return entree;
    };
    const avertissement = (texteMessage) => el('p', { class: 'avertissement', text: texteMessage });
    const aide = (texteMessage) => el('p', { class: 'aide', text: texteMessage });

    /** Taille, couleur du texte et arrière-plan (transparent ou couleur). */
    const styleTexte = (w) => {
        const transparent = (w.fond ?? 'transparent') === 'transparent';
        const caseFond = el('input', { type: 'checkbox', checked: transparent });
        caseFond.addEventListener('change', () => {
            w.fond = caseFond.checked ? 'transparent' : FOND_PAR_DEFAUT;
            modifie({ reconstruire: true });
        });
        return [
            el('h4', { text: 'Apparence' }),
            ligne('Taille de police', ...nombre(w, 'taille', { min: 4, max: 1000, suffixe: 'px', defaut: 32 })),
            ligne('Couleur du texte', couleur(w, 'couleur', '#ffffff')),
            el('label', { class: 'case' }, caseFond, ' Arrière-plan transparent'),
            !transparent && ligne("Couleur d'arrière-plan", couleur(w, 'fond', FOND_PAR_DEFAUT)),
        ];
    };

    return { nombre, texte, liste, coche, couleur, avertissement, aide, styleTexte };
}

/** Réglages propres à chaque type de widget. */
function reglagesWidget(w, f, medias) {
    const defilement = () => [
        ligne('Défilement', f.liste(w, 'defilement', DEFILEMENTS)),
        w.defilement !== 'aucun' && ligne('Vitesse', f.liste(w, 'vitesse', VITESSES)),
    ];
    switch (w.type) {
        case 'vide':
            return [f.aide('Cette région est vide. Choisissez un type de contenu ci-dessus.')];
        case 'media':
            return reglagesMedia(w, f, medias);
        case 'texte':
            return [...reglagesTexte(w, f), ...defilement(), ...f.styleTexte(w)];
        case 'rss':
            return [
                ligne('Flux (URL)', f.texte(w, 'url', { type: 'url', placeholder: 'https://…/rss' })),
                ligne('Mise à jour', ...f.nombre(w, 'frequence', { min: 1, max: 1440, suffixe: 'min', defaut: 30 })),
                ligne('Éléments affichés', ...f.nombre(w, 'nombre', { min: 1, max: 50, defaut: 3 })),
                f.aide("Le flux s'affiche dans l'aperçu une fois la playlist enregistrée."),
                ...defilement(),
                ...f.styleTexte(w),
            ];
        case 'page_web':
            return [
                ligne('Adresse (URL)', f.texte(w, 'url', { type: 'url', placeholder: 'https://…' })),
                !urlWeb(w.url) && f.avertissement('Adresse invalide : elle doit commencer par http:// ou https://.'),
                f.aide("Beaucoup de sites refusent d'être affichés dans une autre page : vérifiez le résultat dans l'aperçu."),
            ];
        case 'youtube':
            return [
                ligne('Adresse de la vidéo', f.texte(w, 'url', { type: 'url', placeholder: 'https://www.youtube.com/watch?v=…' })),
                !identifiantVideo(w.url) && f.avertissement('Adresse YouTube non reconnue.'),
                f.aide('La vidéo passe sans le son et en boucle. Un seul widget YouTube par page.'),
            ];
        case 'qr':
            return reglagesQr(w, f, medias);
        case 'horloge':
        case 'date_heure': {
            const exemple = new Date();
            const formats = FORMATS_DATE.map((valeur) => ({ valeur, libelle: formaterDate(exemple, valeur) }));
            if (!FORMATS_DATE.includes(w.format_date)) {
                formats.push({ valeur: w.format_date, libelle: formaterDate(exemple, w.format_date) });
            }
            return [
                w.type === 'horloge' && f.coche(w, 'analogique', 'Horloge analogique (à aiguilles)', { defaut: false }),
                f.coche(w, 'h24', 'Format 24 heures'),
                ligne('Afficher', f.liste(w, 'affichage', AFFICHAGES_HORLOGE.map((libelle, valeur) => ({ valeur, libelle })))),
                ligne('Format de date', f.liste(w, 'format_date', formats)),
                ...f.styleTexte(w),
            ];
        }
        case 'compte_rebours':
            return [
                ligne('Date cible', f.texte(w, 'cible', { type: 'datetime-local' })),
                ligne('Libellé', f.texte(w, 'libelle', { maxlength: 200 })),
                ligne('Texte final', f.texte(w, 'texte_fin', { maxlength: 200 })),
                f.coche(w, 'secondes', 'Afficher les secondes'),
                ...f.styleTexte(w),
            ];
        case 'meteo':
            return [
                ligne('Ville', f.texte(w, 'ville', { maxlength: 100 })),
                ligne('Unité', f.liste(w, 'celsius', [{ valeur: true, libelle: 'Celsius (°C)' }, { valeur: false, libelle: 'Fahrenheit (°F)' }])),
                ligne('Affichage', f.liste(w, 'modele', MODELES_METEO)),
                MODELES_METEO.find((m) => m.valeur === (w.modele ?? 'actuelle'))?.jours
                    && ligne('Prévisions', ...f.nombre(w, 'jours', { min: JOURS_METEO.min, max: JOURS_METEO.max, suffixe: 'jours', defaut: JOURS_METEO.defaut })),
                f.aide("Chaque affichage s'adapte à la forme de la région : en colonne dans une région haute, en ligne dans une région large."),
                ...f.styleTexte(w),
            ];
        default:
            return [f.avertissement('Type de widget inconnu.')];
    }
}

/** Code QR : lien, couleurs (avec alerte de lisibilité), marge, forme des modules, logo. */
function reglagesQr(w, f, medias) {
    const alerte = el('p', { class: 'avertissement', role: 'status' });
    const verifier = () => {
        const probleme = problemeLisibilite(w.qr_couleur ?? QR_DEFAUTS.qr_couleur, w.qr_fond ?? QR_DEFAUTS.qr_fond);
        const marge = w.qr_marge ?? QR_DEFAUTS.qr_marge;
        const messages = [probleme, marge < 2 && 'Marge inférieure à 2 modules : certains lecteurs ne trouvent plus le code (la norme en demande 4).'].filter(Boolean);
        alerte.textContent = messages.join(' ');
        alerte.hidden = messages.length === 0;
    };
    const couleurModules = f.couleur(w, 'qr_couleur', QR_DEFAUTS.qr_couleur);
    const couleurFond = f.couleur(w, 'qr_fond', QR_DEFAUTS.qr_fond);
    const marge = f.nombre(w, 'qr_marge', { min: 0, max: 10, suffixe: 'modules', defaut: QR_DEFAUTS.qr_marge });
    [couleurModules, couleurFond, marge[0]].forEach((c) => c.addEventListener('input', verifier));
    verifier();

    // Un média que l'utilisateur ne voit pas (accessible: false) reste proposé s'il est déjà le logo.
    const images = medias.filter((m) => String(m.type).startsWith('image/') && (m.accessible !== false || m.id === w.logo));
    const logo = el('select', {},
        el('option', { value: '', text: '— Aucun —' }),
        images.map((m) => el('option', { value: m.id, text: m.nom, selected: m.id === w.logo })),
        Number.isInteger(w.logo) && !images.some((m) => m.id === w.logo) && el('option', { value: w.logo, text: 'Média introuvable', selected: true }));
    logo.addEventListener('change', () => {
        if (logo.value === '') {
            delete w.logo;
        } else {
            w.logo = Number(logo.value);
        }
        f.modifieStructure();
    });

    return [
        ligne('Lien à encoder', f.texte(w, 'url', { type: 'url', placeholder: 'https://…' })),
        !urlWeb(w.url) && f.avertissement('Adresse invalide : elle doit commencer par http:// ou https://.'),
        el('h4', { text: 'Code QR' }),
        ligne('Couleur des modules', couleurModules),
        ligne('Couleur du fond', couleurFond),
        ligne('Marge', ...marge),
        ligne('Forme des modules', f.liste(w, 'qr_forme', FORMES_QR)),
        ligne('Logo central', logo),
        images.length === 0 && f.aide("Envoyez une image dans les médias de la chaîne pour l'utiliser comme logo."),
        Number.isInteger(w.logo) && f.aide("Avec un logo, le code utilise la correction d'erreur maximale (30 %) pour rester lisible."),
        alerte,
        f.aide('Vérifiez toujours le code avec un téléphone avant de le diffuser.'),
        ...f.styleTexte(w),
    ];
}

/** Widget Texte : mode (simple, Markdown, mise en forme) et saisie correspondante. */
function reglagesTexte(w, f) {
    const mode = modeTexte(w);
    const choix = el('select', {}, MODES_TEXTE.map((m) => el('option', { value: m.valeur, text: m.libelle, selected: m.valeur === mode })));
    choix.addEventListener('change', () => {
        // Premier passage en mise en forme : on part du texte actuel.
        if (choix.value === 'riche' && !w.html) {
            w.html = mode === 'markdown' ? htmlMarkdown(w.texte) : htmlTexteSimple(w.texte);
        }
        w.mode = choix.value;
        f.modifieStructure();
    });

    let saisie;
    if (mode === 'riche') {
        saisie = [
            editeurRiche(w.html ?? '', (html) => {
                w.html = html;
                f.modifie();
            }, { couleur: w.couleur, fond: w.fond }),
            f.aide('La taille et la couleur de base se règlent dans « Apparence ».'),
        ];
    } else {
        saisie = [ligne('Texte', f.texte(w, 'texte', { multiligne: true, maxlength: 20000 }))];
        if (mode === 'markdown') {
            saisie.push(f.aide('**gras**, *italique*, # Titre, ## Sous-titre, - liste, 1. liste numérotée, > citation.'));
        }
    }
    return [ligne('Mode', choix), ...saisie];
}

// Élément à remettre au focus après le redessin du panneau (déplacement ou retrait au clavier) :
// { index, bouton: 'monter' | 'descendre' | 'retirer' | 'ajouter' }.
let focusApres = null;
// Démonstration de la transition en cours (une seule à la fois : le panneau est redessiné souvent).
let demo = null;

/** Deux images de démonstration (paysage 4:3), pour montrer transition et mise à l'échelle. */
function imageDemo(fond, soleil) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${fond}"/>`
        + `<circle cx="300" cy="80" r="45" fill="${soleil}"/><path d="M0 300 140 120 240 230 300 170 400 300z" fill="#1d3b2a"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const IMAGES_DEMO = [imageDemo('#5aa9e6', '#ffe066'), imageDemo('#f4a261', '#fff3b0')];

/**
 * Petit aperçu animé de l'effet : le widget du lecteur lui-même, avec deux images de
 * démonstration, la transition et la mise à l'échelle choisies.
 */
function schemaEffet(w) {
    demo?.detruire();
    const boite = el('div', { class: 'schema-effet', role: 'img', 'aria-label': 'Aperçu de la transition et de la mise à l\'échelle choisies' });
    const instance = creerWidgetMedia(boite, {
        elements: IMAGES_DEMO.map((url) => ({ url, type: 'image/svg+xml', duree: 2 })),
        transition: w.transition,
        echelle: w.echelle,
    });
    // Arrêt quand le panneau est remplacé (le minuteur du widget continuerait sinon).
    const surveillance = setInterval(() => {
        if (!boite.isConnected) {
            arreter();
        }
    }, 1000);
    const arreter = () => {
        clearInterval(surveillance);
        instance?.detruire();
        if (demo?.boite === boite) {
            demo = null;
        }
    };
    demo = { boite, detruire: arreter };
    return boite;
}

/**
 * Widget Images / Vidéos : liste réordonnable (glisser-déposer par la poignée, ou boutons Monter /
 * Descendre qui gardent le focus), vignette agrandie au survol et au focus, durée des images,
 * durée réelle des vidéos (le lecteur les passe jusqu'au bout), puis réglages communs.
 */
function reglagesMedia(w, f, medias) {
    w.elements = Array.isArray(w.elements) ? w.elements : [];
    const parId = new Map(medias.map((m) => [m.id, m]));
    const modifie = f.modifieStructure;
    const estVideo = (e) => String(parId.get(e.media)?.type ?? '').startsWith('video/');

    const deplacer = (de, vers, bouton) => {
        const [element] = w.elements.splice(de, 1);
        w.elements.splice(vers, 0, element);
        focusApres = bouton && { index: vers, bouton };
        modifie();
    };

    let glisse = null; // index de l'élément saisi par sa poignée
    const lignes = w.elements.map((e, i) => {
        const m = parId.get(e.media);
        const nom = m?.nom ?? `Média ${e.media} (introuvable)`;
        const adresse = m ? adresseVignette(m) : null;
        const video = estVideo(e);
        const dernier = i === w.elements.length - 1;

        let duree;
        if (video) {
            duree = el('span', { class: 'duree-video', text: m?.duree ? `${dureeTexte(m.duree)}, jusqu'au bout` : "jusqu'au bout" });
        } else {
            const [entree] = f.nombre(e, 'duree', { min: 1, max: 86400, defaut: DUREE_MEDIA });
            entree.setAttribute('aria-label', `Durée d'affichage de ${nom}, en secondes`);
            duree = el('span', { class: 'duree-image' }, entree, el('span', { class: 'suffixe', text: 's', 'aria-hidden': 'true' }));
        }
        const bouton = (action, texte, libelle, desactive, surClic) => el('button', {
            type: 'button', class: 'mini', text: texte, 'aria-label': libelle, title: libelle, disabled: desactive, dataset: { action }, onclick: surClic,
        });

        const poignee = el('span', { class: 'poignee-element', title: 'Glisser pour déplacer', 'aria-hidden': 'true', text: '⠿' });
        const li = el('li', { class: 'element-media', dataset: { index: String(i) } },
            poignee,
            el('span', { class: 'vignette-element' },
                adresse ? el('img', { src: adresse, alt: nom, loading: 'lazy' }) : el('span', { class: 'vignette-vide', text: video ? 'Vidéo' : '?' }),
                adresse && el('span', { class: 'apercu-grand', 'aria-hidden': 'true', hidden: true }, el('img', { src: adresse, alt: '' }))),
            el('span', { class: 'infos-element' },
                el('span', { class: 'nom-media', title: nom, text: nom }),
                el('span', { class: 'meta', text: m ? descriptionMedia(m) : 'Introuvable' }),
                duree),
            el('span', { class: 'boutons-element' },
                bouton('monter', '↑', `Monter ${nom}`, i === 0, () => deplacer(i, i - 1, 'monter')),
                bouton('descendre', '↓', `Descendre ${nom}`, dernier, () => deplacer(i, i + 1, 'descendre')),
                bouton('retirer', '×', `Retirer ${nom}`, false, () => {
                    w.elements.splice(i, 1);
                    focusApres = w.elements.length === 0 ? { bouton: 'ajouter' } : { index: Math.min(i, w.elements.length - 1), bouton: 'retirer' };
                    modifie();
                })));

        // Aperçu agrandi au survol et au focus, à gauche du panneau (position fixe : le panneau
        // défile et couperait un élément positionné dans la liste).
        const grand = li.querySelector('.apercu-grand');
        if (grand) {
            const montrer = () => {
                const cadre = li.getBoundingClientRect();
                grand.style.left = `${Math.max(8, cadre.left - 256)}px`;
                grand.style.top = `${Math.max(8, Math.min(cadre.top, innerHeight - 200))}px`;
                grand.hidden = glisse !== null;
            };
            const cacher = () => {
                grand.hidden = !li.matches(':hover') && !li.contains(document.activeElement);
            };
            li.addEventListener('mouseenter', montrer);
            li.addEventListener('focusin', montrer);
            li.addEventListener('mouseleave', cacher);
            li.addEventListener('focusout', () => setTimeout(cacher));
        }

        // Glisser-déposer : seulement depuis la poignée, pour garder la saisie de la durée.
        poignee.addEventListener('pointerdown', () => { li.draggable = true; });
        poignee.addEventListener('pointerup', () => { li.draggable = false; });
        li.addEventListener('dragstart', (ev) => {
            glisse = i;
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', String(i));
            li.classList.add('glisse');
            if (grand) {
                grand.hidden = true;
            }
        });
        li.addEventListener('dragend', () => {
            li.draggable = false;
            li.classList.remove('glisse');
            glisse = null;
        });
        li.addEventListener('dragover', (ev) => {
            if (glisse === null || glisse === i) {
                return;
            }
            ev.preventDefault();
            const cadre = li.getBoundingClientRect();
            const apres = ev.clientY - cadre.top > cadre.height / 2;
            li.classList.toggle('cible-avant', !apres);
            li.classList.toggle('cible-apres', apres);
        });
        li.addEventListener('dragleave', () => li.classList.remove('cible-avant', 'cible-apres'));
        li.addEventListener('drop', (ev) => {
            ev.preventDefault();
            const apres = li.classList.contains('cible-apres');
            li.classList.remove('cible-avant', 'cible-apres');
            if (glisse === null) {
                return;
            }
            let vers = apres ? i + 1 : i;
            if (glisse < vers) {
                vers--;
            }
            if (vers !== glisse) {
                deplacer(glisse, vers, null);
            }
        });
        return li;
    });

    const boutonAjouter = el('button', {
        type: 'button', class: 'bouton', text: '+ Ajouter des médias', dataset: { action: 'ajouter' },
        onclick: async () => {
            const choisis = await f.ajouterMedias();
            if (choisis.length > 0) {
                w.elements.push(...choisis.map((m) => elementMediaParDefaut(m.id)));
                focusApres = { bouton: 'ajouter' };
                modifie();
            }
        },
    });

    const liste = w.elements.length === 0
        ? f.aide('Aucun fichier : ajoutez des images ou des vidéos.')
        : el('ol', { class: 'liste-medias', 'aria-label': 'Ordre de passage des médias' }, lignes);

    // Focus rendu après le redessin (le panneau est attaché au document juste après ce retour).
    if (focusApres) {
        const cible = focusApres;
        focusApres = null;
        setTimeout(() => {
            if (cible.bouton === 'ajouter') {
                boutonAjouter.focus();
                return;
            }
            const li = lignes[cible.index];
            const b = li?.querySelector(`[data-action="${cible.bouton}"]`);
            // Arrivé en haut ou en bas, le bouton utilisé est désactivé : on prend l'autre.
            const autre = li?.querySelector(`[data-action="${cible.bouton === 'monter' ? 'descendre' : 'monter'}"]`);
            (b && !b.disabled ? b : autre && !autre.disabled ? autre : li?.querySelector('button'))?.focus();
        });
    }

    const images = w.elements.filter((e) => !estVideo(e));
    const toutes = { duree: images[0]?.duree ?? DUREE_MEDIA };
    const [champToutes] = f.nombre(toutes, 'duree', { min: 1, max: 86400, defaut: DUREE_MEDIA });
    champToutes.addEventListener('change', () => {
        if (!champToutes.classList.contains('invalide')) {
            images.forEach((e) => { e.duree = toutes.duree; });
            modifie();
        }
    });

    return [
        el('h4', { text: 'Fichiers' }),
        liste,
        boutonAjouter,
        el('fieldset', { class: 'tous-elements' },
            el('legend', { text: 'Pour tous les éléments' }),
            images.length > 0 && ligne('Durée de chaque image', champToutes, el('span', { class: 'suffixe', text: 's' })),
            f.aide("Une vidéo passe toujours jusqu'à sa fin."),
            ligne('Transition', f.liste(w, 'transition', TRANSITIONS)),
            ligne("Mise à l'échelle", f.liste(w, 'echelle', ECHELLES)),
            schemaEffet(w),
            f.coche(w, 'muet', 'Couper le son des vidéos')),
    ];
}

/**
 * Panneau complet. options : { page, numeroPage, indexRegion, regions, portrait, medias, modifie,
 * ajouterMedias }. modifie({ reconstruire, type }) est appelée à chaque changement ;
 * ajouterMedias() ouvre le choix des médias et résout avec les médias choisis (liste, vide si annulé).
 */
export function panneauProprietes({ page, numeroPage, indexRegion, regions, portrait, medias, modifie, ajouterMedias }) {
    const f = champs(modifie);
    f.ajouterMedias = ajouterMedias;
    f.modifie = () => modifie();
    f.modifieStructure = () => modifie({ reconstruire: true });

    const blocPage = [
        el('h3', { text: `Page ${numeroPage}` }),
        ligne('Durée de la page', ...f.nombre(page, 'duree', { min: 1, max: 86400, suffixe: 's', defaut: 30 })),
        ligne("Couleur d'arrière-plan", f.couleur(page, 'fond', '#000000')),
    ];

    if (indexRegion === null || !page.widgets[indexRegion]) {
        return el('div', { class: 'panneau' }, blocPage, el('hr'),
            f.aide("Cliquez sur une région de l'écran pour choisir son contenu."));
    }

    const w = page.widgets[indexRegion];
    const r = regions[indexRegion];
    const [lw, lh] = portrait ? [ECRAN_REFERENCE.hauteur, ECRAN_REFERENCE.largeur] : [ECRAN_REFERENCE.largeur, ECRAN_REFERENCE.hauteur];
    const px = (v, total) => Math.round(v * total);
    const pastille = el('span', { class: 'pastille' });
    pastille.style.backgroundColor = couleurRegion(indexRegion);

    const type = el('select', {}, TYPES_WIDGETS.map((t) => el('option', { value: t.type, text: t.libelle, selected: t.type === w.type })));
    type.addEventListener('change', () => {
        page.widgets[indexRegion] = widgetParDefaut(type.value);
        modifie({ reconstruire: true });
    });

    return el('div', { class: 'panneau' },
        blocPage,
        el('hr'),
        el('h3', {}, pastille, `Région ${indexRegion + 1}`),
        el('p', { class: 'aide', text: `Position ${px(r[0], lw)} × ${px(r[1], lh)}, taille ${px(r[2], lw)} × ${px(r[3], lh)} px` }),
        ligne('Contenu', type),
        reglagesWidget(w, f, medias));
}
