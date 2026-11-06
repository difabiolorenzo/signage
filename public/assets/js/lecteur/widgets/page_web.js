// Widget Page web : un site affiché dans une iframe isolée (sandbox).
// Beaucoup de sites refusent d'être affichés ainsi : la région reste alors blanche.

import { urlWeb } from '../outils.js';

export function creer(region, reglages) {
    const url = urlWeb(reglages.url);
    if (!url) {
        return null;
    }
    const cadre = document.createElement('iframe');
    cadre.className = 'cadre';
    cadre.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    cadre.referrerPolicy = 'no-referrer';
    cadre.src = url.href;
    region.append(cadre);
    return null;
}
