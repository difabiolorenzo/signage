// Widget Météo : temps actuel et prévisions d'une ville, d'après Open-Meteo (service sans clé).
// Quatre modèles d'affichage, qui s'adaptent à la forme de leur région (requêtes de conteneur,
// voir lecteur.css). Rafraîchi toutes les 30 minutes ; en cas d'échec, la dernière valeur reste.

import { TAILLE_HORLOGE } from '../../commun/widgets.js';
import { iconeMeteo } from '../meteo_icones.js';
import { styleTexte } from '../outils.js';

const RAFRAICHISSEMENT = 30 * 60 * 1000;
const positions = new Map(); // ville → { latitude, longitude, nom } (partagé entre les pages)
const derniers = new Map(); // ville + unité + jours → données

/** Modèles d'affichage ; `jours` : le modèle montre des prévisions sur plusieurs jours. */
export const MODELES_METEO = Object.freeze([
    { valeur: 'actuelle', libelle: 'Temps actuel seul', jours: false },
    { valeur: 'actuelle_journee', libelle: 'Temps actuel et journée', jours: false },
    { valeur: 'bandeau', libelle: 'Bandeau sur plusieurs jours', jours: true },
    { valeur: 'carte', libelle: 'Carte verticale (actuel + jours)', jours: true },
]);
export const JOURS_METEO = Object.freeze({ min: 1, max: 7, defaut: 3 });

// Codes météo de l'OMS (WMO) utilisés par Open-Meteo : libellé et catégorie d'icône.
const TEMPS = [
    [[0], 'Ciel dégagé', 'degage'], [[1], 'Peu nuageux', 'peu_nuageux'], [[2], 'Partiellement nuageux', 'nuageux'],
    [[3], 'Couvert', 'couvert'], [[45, 48], 'Brouillard', 'brouillard'], [[51, 53, 55, 56, 57], 'Bruine', 'bruine'],
    [[61, 63, 65, 66, 67], 'Pluie', 'pluie'], [[71, 73, 75, 77], 'Neige', 'neige'], [[80, 81, 82], 'Averses', 'averses'],
    [[85, 86], 'Averses de neige', 'averses_neige'], [[95, 96, 99], 'Orage', 'orage'],
];

const temps = (code) => TEMPS.find(([codes]) => codes.includes(code)) ?? [[], '', 'nuageux'];
const nomJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });

async function json(url) {
    const reponse = await fetch(url);
    if (!reponse.ok) {
        throw new Error(`HTTP ${reponse.status}`);
    }
    return reponse.json();
}

async function position(ville) {
    if (!positions.has(ville)) {
        const p = new URLSearchParams({ name: ville, count: '1', language: 'fr', format: 'json' });
        const r = await json(`https://geocoding-api.open-meteo.com/v1/search?${p}`);
        const lieu = r.results?.[0];
        if (!lieu) {
            throw new Error(`Ville inconnue : ${ville}`);
        }
        positions.set(ville, { latitude: lieu.latitude, longitude: lieu.longitude, nom: lieu.name });
    }
    return positions.get(ville);
}

async function telecharger(ville, celsius, nbJours) {
    const lieu = await position(ville);
    const p = new URLSearchParams({
        latitude: String(lieu.latitude),
        longitude: String(lieu.longitude),
        current: 'temperature_2m,weather_code,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        forecast_days: String(nbJours),
        temperature_unit: celsius ? 'celsius' : 'fahrenheit',
        timezone: 'auto',
    });
    const r = await json(`https://api.open-meteo.com/v1/forecast?${p}`);
    const d = r.daily ?? {};
    return {
        lieu: lieu.nom,
        actuel: { temperature: r.current.temperature_2m, code: r.current.weather_code, jour: r.current.is_day !== 0 },
        jours: (d.time ?? []).map((date, i) => ({
            date,
            code: d.weather_code?.[i],
            max: d.temperature_2m_max?.[i],
            min: d.temperature_2m_min?.[i],
            pluie: d.precipitation_probability_max?.[i],
        })),
        quand: Date.now(),
    };
}

function div(classe, texte = null, ...enfants) {
    const noeud = document.createElement('div');
    noeud.className = classe;
    if (texte !== null) {
        noeud.textContent = texte;
    }
    noeud.append(...enfants.filter(Boolean));
    return noeud;
}

const degres = (t, unite) => (Number.isFinite(t) ? `${Math.round(t)}°${unite}` : '–');
/** Minimum / maximum, sans l'unité (déjà donnée par la température actuelle ou le réglage). */
const minMax = (j) => `${degres(j.min, '')} / ${degres(j.max, '')}`;
const pluieTexte = (j) => (Number.isFinite(j.pluie) ? `☂ ${j.pluie} %` : '');

/** Bloc « temps actuel » : icône, température, lieu et description. */
function actuel(d, unite, journee = null) {
    const [, libelle, categorie] = temps(d.actuel.code);
    return div('meteo-actuel', null,
        iconeMeteo(categorie, { jour: d.actuel.jour, libelle }),
        div('meteo-texte', null,
            div('ligne grand', degres(d.actuel.temperature, unite)),
            div('ligne petit', libelle ? `${d.lieu} · ${libelle}` : d.lieu),
            journee && div('ligne petit', [minMax(journee), pluieTexte(journee)].filter(Boolean).join(' · '))));
}

/** Une journée de prévision : nom du jour, icône, min / max, probabilité de pluie. */
function journee(j, i, unite) {
    const [, libelle, categorie] = temps(j.code);
    const nom = i === 0 ? 'Auj.' : nomJour.format(new Date(`${j.date}T12:00`)).replace('.', '');
    return div('meteo-jour', null,
        div('meteo-nom-jour', nom),
        iconeMeteo(categorie, { libelle }),
        div('meteo-temperatures', minMax(j)),
        div('meteo-pluie', pluieTexte(j)));
}

function rendu(modele, d, unite, nbJours) {
    switch (modele) {
        case 'actuelle_journee':
            return [actuel(d, unite, d.jours[0] ?? null)];
        case 'bandeau':
            return [div('meteo-jours', null, ...d.jours.slice(0, nbJours).map((j, i) => journee(j, i, unite)))];
        case 'carte':
            return [actuel(d, unite), div('meteo-jours', null, ...d.jours.slice(0, nbJours).map((j, i) => journee(j, i, unite)))];
        default:
            return [actuel(d, unite)];
    }
}

export function creer(region, reglages) {
    const ville = String(reglages.ville ?? '').trim();
    const celsius = reglages.celsius !== false;
    const unite = celsius ? 'C' : 'F';
    const modele = MODELES_METEO.some((m) => m.valeur === reglages.modele) ? reglages.modele : 'actuelle';
    const avecJours = MODELES_METEO.find((m) => m.valeur === modele).jours;
    const n = Number(reglages.jours);
    const nbJours = avecJours ? (Number.isInteger(n) && n >= JOURS_METEO.min && n <= JOURS_METEO.max ? n : JOURS_METEO.defaut) : 1;

    // .meteo est le conteneur interrogé par les requêtes de conteneur ; .meteo-contenu s'y adapte.
    const attente = div('ligne petit', ville);
    const contenu = div(`meteo-contenu meteo-${modele}`, null, attente);
    const bloc = div('meteo', null, contenu);
    styleTexte(bloc, reglages, TAILLE_HORLOGE);
    region.append(bloc);

    const cle = `${ville}|${unite}|${nbJours}`;
    const afficher = (d) => contenu.replaceChildren(...rendu(modele, d, unite, nbJours));

    let minuteur = null;
    let detruit = false;
    async function rafraichir() {
        try {
            const d = await telecharger(ville, celsius, nbJours);
            derniers.set(cle, d);
            if (!detruit) {
                afficher(d);
            }
        } catch (e) {
            console.warn('Météo indisponible :', e);
            if (!detruit && !derniers.has(cle)) {
                attente.textContent = `${ville} · météo indisponible`;
            }
        }
        if (!detruit) {
            minuteur = setTimeout(rafraichir, RAFRAICHISSEMENT);
        }
    }
    const connu = derniers.get(cle);
    if (connu) {
        afficher(connu);
        minuteur = setTimeout(rafraichir, Math.max(0, connu.quand + RAFRAICHISSEMENT - Date.now()));
    } else if (ville !== '') {
        rafraichir();
    }

    return {
        detruire() {
            detruit = true;
            clearTimeout(minuteur);
        },
    };
}
