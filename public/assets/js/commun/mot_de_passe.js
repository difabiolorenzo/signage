// Bouton « Afficher le mot de passe » (icône œil) accolé à un champ de mot de passe.
// Utilisé par la connexion, l'écran des utilisateurs et l'installateur.

const SVG = 'http://www.w3.org/2000/svg';

function icone(barre) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    const formes = [
        ['path', { d: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z' }],
        ['circle', { cx: '12', cy: '12', r: '3' }],
    ];
    if (barre) {
        formes.push(['line', { x1: '3', y1: '3', x2: '21', y2: '21' }]);
    }
    for (const [balise, attributs] of formes) {
        const forme = document.createElementNS(SVG, balise);
        Object.entries(attributs).forEach(([cle, valeur]) => forme.setAttribute(cle, valeur));
        svg.append(forme);
    }
    return svg;
}

/**
 * Entoure `entree` d'un bloc avec le bouton de bascule (le bloc prend sa place s'il est déjà
 * dans la page). Renvoie { bloc, afficher(visible) }.
 */
export function basculeMotDePasse(entree, { visible = false } = {}) {
    const bloc = document.createElement('span');
    bloc.className = 'champ-secret';
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'bascule-mdp';
    bouton.setAttribute('aria-label', 'Afficher le mot de passe');
    if (entree.id) {
        bouton.setAttribute('aria-controls', entree.id);
    }

    function afficher(oui) {
        entree.type = oui ? 'text' : 'password';
        bouton.setAttribute('aria-pressed', String(oui));
        bouton.title = oui ? 'Masquer le mot de passe' : 'Afficher le mot de passe';
        bouton.replaceChildren(icone(oui));
    }

    bouton.addEventListener('click', () => afficher(entree.type === 'password'));
    entree.parentNode?.insertBefore(bloc, entree);
    bloc.append(entree, bouton);
    afficher(visible);
    return { bloc, afficher };
}

/** Ajoute le bouton à chaque champ de mot de passe de `racine`. */
export function ajouterBascules(racine = document) {
    racine.querySelectorAll('input[type="password"]').forEach((entree) => basculeMotDePasse(entree));
}
