// Widget Météo : température et temps actuels d'une ville, d'après Open-Meteo (service sans clé).
// Rafraîchi toutes les 30 minutes ; en cas d'échec, la dernière valeur reste affichée.

import { TAILLE_HORLOGE } from '../../commun/widgets.js';
import { styleTexte } from '../outils.js';

const RAFRAICHISSEMENT = 30 * 60 * 1000;
const positions = new Map(); // ville → { latitude, longitude, nom } (partagé entre les pages)
const derniers = new Map(); // ville + unité → { temperature, description, quand }

// Codes météo de l'OMS (WMO) utilisés par Open-Meteo.
const TEMPS = [
    [[0], 'Ciel dégagé'], [[1], 'Peu nuageux'], [[2], 'Partiellement nuageux'], [[3], 'Couvert'],
    [[45, 48], 'Brouillard'], [[51, 53, 55, 56, 57], 'Bruine'], [[61, 63, 65, 66, 67], 'Pluie'],
    [[71, 73, 75, 77], 'Neige'], [[80, 81, 82], 'Averses'], [[85, 86], 'Averses de neige'], [[95, 96, 99], 'Orage'],
];

function libelleTemps(code) {
    return TEMPS.find(([codes]) => codes.includes(code))?.[1] ?? '';
}

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

export function creer(region, reglages) {
    const ville = String(reglages.ville ?? '').trim();
    const celsius = reglages.celsius !== false;

    const bloc = document.createElement('div');
    bloc.className = 'bloc';
    styleTexte(bloc, reglages, TAILLE_HORLOGE);
    const temperature = document.createElement('div');
    temperature.className = 'ligne grand';
    const description = document.createElement('div');
    description.className = 'ligne petit';
    description.textContent = ville;
    bloc.append(temperature, description);
    region.append(bloc);

    const cle = `${ville}|${celsius ? 'C' : 'F'}`;
    const afficher = (d) => {
        temperature.textContent = d.temperature;
        description.textContent = d.description;
    };

    let minuteur = null;
    let detruit = false;
    async function rafraichir() {
        try {
            const lieu = await position(ville);
            const p = new URLSearchParams({
                latitude: String(lieu.latitude),
                longitude: String(lieu.longitude),
                current: 'temperature_2m,weather_code',
                temperature_unit: celsius ? 'celsius' : 'fahrenheit',
                timezone: 'auto',
            });
            const r = await json(`https://api.open-meteo.com/v1/forecast?${p}`);
            const temps = libelleTemps(r.current.weather_code);
            const d = {
                temperature: `${Math.round(r.current.temperature_2m)} °${celsius ? 'C' : 'F'}`,
                description: temps ? `${lieu.nom} · ${temps}` : lieu.nom,
                quand: Date.now(),
            };
            derniers.set(cle, d);
            if (!detruit) {
                afficher(d);
            }
        } catch (e) {
            console.warn('Météo indisponible :', e);
            if (!detruit && temperature.textContent === '') {
                description.textContent = `${ville} · météo indisponible`;
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
