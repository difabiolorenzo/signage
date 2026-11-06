// Widget Images / Vidéos : enchaîne les médias de la liste avec une transition.
// Une image reste affichée sa durée ; une vidéo passe jusqu'à sa fin.

import { DUREE_MEDIA, ECHELLES, TRANSITIONS } from '../../commun/widgets.js';

const DUREE_TRANSITION = 1200; // ms, un peu plus que les animations de lecteur.css

export function creer(region, reglages) {
    const elements = (Array.isArray(reglages.elements) ? reglages.elements : [])
        .filter((e) => e && typeof e.url === 'string');
    if (elements.length === 0) {
        return null;
    }
    const echelle = ECHELLES.some((e) => e.valeur === reglages.echelle) ? reglages.echelle : 'contain';
    const transition = TRANSITIONS.some((t) => t.valeur === reglages.transition) ? reglages.transition : 'defaut';
    const seul = elements.length === 1;

    let index = -1;
    let courant = null;
    let minuteur = null;
    let detruit = false;

    function arreterVideo(noeud) {
        if (noeud instanceof HTMLVideoElement) {
            noeud.pause();
            noeud.removeAttribute('src');
            noeud.load();
        }
    }

    function retirer(noeud, delai) {
        setTimeout(() => {
            arreterVideo(noeud);
            noeud.remove();
        }, delai);
    }

    function suivant() {
        if (detruit) {
            return;
        }
        clearTimeout(minuteur);
        index = (index + 1) % elements.length;
        const element = elements[index];
        const duree = (Number(element.duree) > 0 ? Number(element.duree) : DUREE_MEDIA) * 1000;
        const video = String(element.type ?? '').startsWith('video/');

        const noeud = document.createElement(video ? 'video' : 'img');
        noeud.className = 'media-element';
        noeud.style.objectFit = echelle;
        noeud.style.setProperty('--duree', `${duree}ms`);

        if (video) {
            noeud.muted = reglages.muet !== false;
            noeud.playsInline = true;
            noeud.loop = seul;
            noeud.addEventListener('ended', suivant, { once: true });
            noeud.addEventListener('error', () => {
                minuteur = setTimeout(suivant, 2000);
            }, { once: true });
            noeud.src = element.url;
            noeud.play().catch(() => {
                // Lecture avec le son refusée par le navigateur : on la relance sans le son.
                noeud.muted = true;
                noeud.play().catch(() => {});
            });
        } else {
            noeud.alt = '';
            noeud.src = element.url;
            if (!seul) {
                minuteur = setTimeout(suivant, duree);
            }
        }

        const ancien = courant;
        courant = noeud;
        if (ancien && transition === 'sortie') {
            region.prepend(noeud);
            ancien.classList.add('sortie');
            retirer(ancien, DUREE_TRANSITION);
        } else {
            if (transition !== 'defaut') {
                noeud.classList.add(`entree-${transition}`);
            }
            region.append(noeud);
            if (ancien) {
                retirer(ancien, transition === 'defaut' ? 0 : DUREE_TRANSITION);
            }
        }
    }

    suivant();

    return {
        detruire() {
            detruit = true;
            clearTimeout(minuteur);
            region.querySelectorAll('video').forEach(arreterVideo);
        },
    };
}
