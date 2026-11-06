// Affichage d'une page de playlist dans un élément : partagé par le lecteur et l'aperçu de l'éditeur.
//
// Chaque widget est un module qui exporte creer(region, reglages, contexte) et renvoie
// { detruire() } (ou null s'il n'a rien à nettoyer). Les tailles de texte s'appuient sur la
// variable CSS --echelle, posée sur l'élément qui contient la page (voir echelle()).
//
// contexte : { maintenant() → Date (horloge du serveur), urlApi (API publique de la chaîne),
// meteoRelais (météo par le relais du serveur ; absent dans l'aperçu : accès direct) }.

import { ECRAN_REFERENCE } from '../commun/widgets.js';
import * as media from './widgets/media.js';
import * as texte from './widgets/texte.js';
import * as rss from './widgets/rss.js';
import * as horloge from './widgets/horloge.js';
import * as compteRebours from './widgets/compte_rebours.js';
import * as pageWeb from './widgets/page_web.js';
import * as youtube from './widgets/youtube.js';
import * as meteo from './widgets/meteo.js';
import * as qr from './widgets/qr.js';

const WIDGETS = {
    media: media.creer,
    texte: texte.creer,
    rss: rss.creer,
    horloge: horloge.creer,
    date_heure: horloge.creer,
    compte_rebours: compteRebours.creer,
    page_web: pageWeb.creer,
    youtube: youtube.creer,
    meteo: meteo.creer,
    qr: qr.creer,
};

/** Facteur entre l'écran réel et l'écran de référence (1920 × 1080, ou 1080 × 1920 en portrait). */
export function echelle(largeur, hauteur, portrait) {
    const ref = portrait
        ? { largeur: ECRAN_REFERENCE.hauteur, hauteur: ECRAN_REFERENCE.largeur }
        : ECRAN_REFERENCE;
    return Math.min(largeur / ref.largeur, hauteur / ref.hauteur) || 1;
}

/** Affiche `page` de `playlist` dans `scene` ; renvoie { detruire() }. */
export function afficherPage(scene, playlist, page, contexte) {
    const conteneur = document.createElement('div');
    conteneur.className = 'page';
    if (typeof page.fond === 'string') {
        conteneur.style.backgroundColor = page.fond;
    }
    // La page est insérée avant de créer les widgets : certains mesurent leur région.
    scene.append(conteneur);

    const instances = [];
    const regions = Array.isArray(playlist.regions) ? playlist.regions : [];
    const widgets = Array.isArray(page.widgets) ? page.widgets : [];
    regions.forEach((r, i) => {
        if (!Array.isArray(r) || r.length !== 4) {
            return;
        }
        const region = document.createElement('div');
        region.className = 'region';
        region.style.left = `${r[0] * 100}%`;
        region.style.top = `${r[1] * 100}%`;
        region.style.width = `${r[2] * 100}%`;
        region.style.height = `${r[3] * 100}%`;
        conteneur.append(region);

        const reglages = widgets[i];
        const creer = reglages && WIDGETS[reglages.type];
        if (creer) {
            try {
                instances.push(creer(region, reglages, contexte));
            } catch (e) {
                console.error(`Widget ${reglages.type} de la région ${i + 1} :`, e);
            }
        }
    });

    return {
        detruire() {
            for (const instance of instances) {
                try {
                    instance?.detruire?.();
                } catch (e) {
                    console.error(e);
                }
            }
            conteneur.remove();
        },
    };
}
