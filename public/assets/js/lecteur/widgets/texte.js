// Widget Texte : statique ou défilant dans 4 directions, à 3 vitesses ; texte simple, Markdown
// ou mis en forme (voir commun/texte_riche.js).

import { contenuRiche, modeTexte } from '../../commun/texte_riche.js';
import { TAILLE_TEXTE, VITESSES } from '../../commun/widgets.js';
import { styleTexte } from '../outils.js';

const HORIZONTAUX = ['gauche', 'droite'];
const VERTICAUX = ['haut', 'bas'];

/**
 * Zone de texte réutilisée par le widget RSS : renvoie { horizontal, definirTexte(t), definirContenu(fragment), detruire() }.
 * La vitesse est en pixels de l'écran de référence par seconde, mise à l'échelle par --echelle.
 */
export function zoneTexte(region, reglages) {
    const boite = document.createElement('div');
    const contenu = document.createElement('span');
    contenu.className = 'texte-contenu';
    boite.append(contenu);
    styleTexte(boite, reglages, TAILLE_TEXTE);
    region.append(boite);

    const sens = reglages.defilement;
    const horizontal = HORIZONTAUX.includes(sens);
    const vertical = VERTICAUX.includes(sens);
    boite.className = 'texte ' + (horizontal ? 'defile-h' : vertical ? 'defile-v' : 'statique');

    let animation = null;

    function lancer() {
        animation?.cancel();
        animation = null;
        if (!horizontal && !vertical) {
            return;
        }
        const facteur = parseFloat(getComputedStyle(boite).getPropertyValue('--echelle')) || 1;
        const vitesse = (VITESSES.find((v) => v.valeur === reglages.vitesse)?.pixelsParSeconde ?? 120) * facteur;
        const zone = horizontal ? boite.clientWidth : boite.clientHeight;
        const taille = horizontal ? contenu.offsetWidth : contenu.offsetHeight;
        if (zone === 0 || taille === 0) {
            return;
        }
        // Le texte entre par un bord et sort entièrement par l'autre avant de recommencer.
        const [debut, fin] = sens === 'gauche' || sens === 'haut' ? [zone, -taille] : [-taille, zone];
        const position = (p) => (horizontal ? `translate(${p}px, -50%)` : `translateY(${p}px)`);
        animation = contenu.animate(
            [{ transform: position(debut) }, { transform: position(fin) }],
            { duration: ((zone + taille) / vitesse) * 1000, iterations: Infinity },
        );
    }

    const observateur = new ResizeObserver(lancer);
    observateur.observe(boite);

    return {
        horizontal,
        definirTexte(texte) {
            contenu.textContent = texte;
            lancer();
        },
        /** Contenu déjà nettoyé (fragment DOM). */
        definirContenu(fragment) {
            boite.classList.add('texte-riche');
            contenu.replaceChildren(fragment);
            lancer();
        },
        detruire() {
            observateur.disconnect();
            animation?.cancel();
        },
    };
}

export function creer(region, reglages) {
    const zone = zoneTexte(region, reglages);
    if (modeTexte(reglages) === 'simple') {
        zone.definirTexte(String(reglages.texte ?? ''));
    } else {
        zone.definirContenu(contenuRiche(reglages, { uneLigne: zone.horizontal }));
    }
    return zone;
}
