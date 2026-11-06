// Texte riche du widget Texte, partagé par l'éditeur et le lecteur.
//
// Modes : « simple » (texte brut, affiché par textContent), « markdown » (champ `texte`
// converti par marked) et « riche » (champ `html`, saisi dans l'éditeur de mise en forme).
// Tout HTML passe par nettoyer() (DOMPurify, liste blanche de balises et de styles) et
// devient un fragment DOM : jamais d'innerHTML.

import DOMPurify from '../lib/dompurify/purify.es.js';
import { marked } from '../lib/marked/marked.esm.js';

export const MODES_TEXTE = Object.freeze([
    { valeur: 'simple', libelle: 'Texte simple' },
    { valeur: 'markdown', libelle: 'Markdown' },
    { valeur: 'riche', libelle: 'Mise en forme' },
]);

const BALISES = [
    'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'font',
];
const ATTRIBUTS = ['data-style', 'color'];
/** Seules propriétés CSS gardées d'un attribut style (pas de position, de taille ni d'URL). */
const STYLES = ['color', 'background-color', 'text-align', 'font-weight', 'font-style', 'text-decoration-line'];
const MOTIF_COULEUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i;
/** Attribut style dans une balise (le texte hors balise a ses « < » échappés). */
const MOTIF_STYLE = /(<[a-z][^<>]*?\s)style\s*=/gi;

DOMPurify.addHook('uponSanitizeAttribute', (_noeud, donnees) => {
    if (donnees.attrName === 'color') {
        donnees.keepAttr = MOTIF_COULEUR.test(donnees.attrValue.trim());
    }
});

/**
 * Fragment DOM sûr à partir de HTML quelconque. La politique de sécurité des pages
 * (style-src 'self') refuse les attributs style écrits en HTML : ils sont renommés data-style
 * avant l'analyse, puis seules les propriétés de STYLES sont appliquées par le CSSOM.
 */
export function nettoyer(html) {
    const source = String(html ?? '').replace(MOTIF_STYLE, '$1data-style=');
    const fragment = DOMPurify.sanitize(source, { ALLOWED_TAGS: BALISES, ALLOWED_ATTR: ATTRIBUTS, RETURN_DOM_FRAGMENT: true });
    const lecteur = document.createElement('span');
    fragment.querySelectorAll('[data-style]').forEach((element) => {
        lecteur.style.cssText = element.dataset.style;
        element.removeAttribute('data-style');
        for (const propriete of STYLES) {
            const valeur = lecteur.style.getPropertyValue(propriete);
            if (valeur !== '' && !/url\(/i.test(valeur)) {
                element.style.setProperty(propriete, valeur);
            }
        }
    });
    return fragment;
}

/** HTML (non nettoyé) produit par du Markdown ; un retour à la ligne simple est gardé. */
export function htmlMarkdown(source) {
    return marked.parse(String(source ?? ''), { async: false, gfm: true, breaks: true });
}

/** HTML (non nettoyé) d'un texte brut : un paragraphe par ligne. */
export function htmlTexteSimple(texte) {
    const conteneur = document.createElement('div');
    for (const ligne of String(texte ?? '').split('\n')) {
        const p = document.createElement('p');
        p.textContent = ligne;
        conteneur.append(p);
    }
    return conteneur.innerHTML;
}

/** Mode du widget, `simple` par défaut (widgets enregistrés avant l'ajout des modes). */
export function modeTexte(widget) {
    return MODES_TEXTE.some((m) => m.valeur === widget.mode) ? widget.mode : 'simple';
}

/**
 * Contenu mis en forme d'un widget Texte (modes markdown et riche), en fragment DOM nettoyé.
 * uneLigne : défilement horizontal, les retours à la ligne deviennent des espaces.
 */
export function contenuRiche(widget, { uneLigne = false } = {}) {
    const fragment = nettoyer(modeTexte(widget) === 'markdown' ? htmlMarkdown(widget.texte) : widget.html);
    if (uneLigne) {
        fragment.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
    }
    return fragment;
}
