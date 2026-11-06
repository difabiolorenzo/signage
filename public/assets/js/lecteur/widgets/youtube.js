// Widget YouTube : lecteur intégré, sans le son (condition de la lecture automatique), en boucle.
// Un seul widget YouTube par page (règle vérifiée par l'éditeur).

import { urlWeb } from '../outils.js';

/** Identifiant de vidéo d'une adresse YouTube (watch?v=, youtu.be/, embed/, shorts/, live/), ou null. */
export function identifiantVideo(texte) {
    const url = urlWeb(texte);
    if (!url) {
        return null;
    }
    const hote = url.hostname.replace(/^(www|m)\./, '');
    let id = null;
    if (hote === 'youtu.be') {
        id = url.pathname.slice(1);
    } else if (hote === 'youtube.com' || hote === 'youtube-nocookie.com') {
        id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function creer(region, reglages) {
    const id = identifiantVideo(reglages.url);
    if (!id) {
        return null;
    }
    const parametres = new URLSearchParams({
        autoplay: '1', mute: '1', controls: '0', loop: '1', playlist: id, rel: '0', playsinline: '1',
    });
    const cadre = document.createElement('iframe');
    cadre.className = 'cadre';
    cadre.allow = 'autoplay; encrypted-media';
    cadre.referrerPolicy = 'strict-origin-when-cross-origin';
    cadre.src = `https://www.youtube-nocookie.com/embed/${id}?${parametres}`;
    region.append(cadre);
    return null;
}
