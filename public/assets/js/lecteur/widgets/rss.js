// Widget Flux RSS : les premiers titres du flux, affichés comme un texte (défilant ou non).
// Le flux est récupéré par le serveur (GET /api/public/{slug}/rss?url=), rafraîchi selon
// `frequence` (minutes) ; en cas d'échec, les derniers titres restent affichés.

import { RSS_FREQUENCE, RSS_NOMBRE } from '../../commun/widgets.js';
import { zoneTexte } from './texte.js';

const SEPARATEUR = '   •   ';

// Derniers titres reçus par flux, gardés quand la page est recréée : { titres, quand }.
const derniers = new Map();

export function creer(region, reglages, contexte) {
    const url = String(reglages.url ?? '');
    if (url === '' || !contexte.urlApi) {
        return null;
    }
    const nombre = Number(reglages.nombre) > 0 ? Math.floor(reglages.nombre) : RSS_NOMBRE;
    const periode = Math.max(1, Number(reglages.frequence) > 0 ? Number(reglages.frequence) : RSS_FREQUENCE) * 60 * 1000;
    const zone = zoneTexte(region, reglages);
    const afficher = (titres) => zone.definirTexte(titres.slice(0, nombre).join(SEPARATEUR));

    let minuteur = null;
    let detruit = false;
    async function rafraichir() {
        try {
            const reponse = await fetch(`${contexte.urlApi}/rss?url=${encodeURIComponent(url)}`, { cache: 'no-store' });
            if (!reponse.ok) {
                throw new Error(`HTTP ${reponse.status}`);
            }
            const { elements } = await reponse.json();
            if (Array.isArray(elements)) {
                const titres = elements.map(String);
                derniers.set(url, { titres, quand: Date.now() });
                if (!detruit) {
                    afficher(titres);
                }
            }
        } catch (e) {
            console.warn('Flux RSS indisponible :', e);
        }
        if (!detruit) {
            minuteur = setTimeout(rafraichir, periode);
        }
    }

    const connu = derniers.get(url);
    if (connu) {
        afficher(connu.titres);
        minuteur = setTimeout(rafraichir, Math.max(0, connu.quand + periode - Date.now()));
    } else {
        rafraichir();
    }

    return {
        detruire() {
            detruit = true;
            clearTimeout(minuteur);
            zone.detruire();
        },
    };
}
