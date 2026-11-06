// Construction du DOM sans innerHTML : les textes passent toujours par textContent.

/**
 * el('button', { class: 'bouton', text: 'OK', onclick: f, type: 'button' }, enfant1, 'texte', …)
 * Clés spéciales : class, text, dataset (objet), on… (écouteurs). Les autres deviennent des
 * attributs ; true donne un attribut vide, false / null / undefined n'ajoute rien.
 */
export function el(balise, proprietes = {}, ...enfants) {
    const noeud = document.createElement(balise);
    for (const [cle, valeur] of Object.entries(proprietes)) {
        if (valeur === false || valeur === null || valeur === undefined) {
            continue;
        }
        if (cle === 'class') {
            noeud.className = valeur;
        } else if (cle === 'text') {
            noeud.textContent = String(valeur);
        } else if (cle === 'dataset') {
            Object.assign(noeud.dataset, valeur);
        } else if (cle.startsWith('on') && typeof valeur === 'function') {
            noeud.addEventListener(cle.slice(2), valeur);
        } else {
            noeud.setAttribute(cle, valeur === true ? '' : String(valeur));
        }
    }
    noeud.append(...enfants.flat().filter((e) => e !== null && e !== undefined && e !== false));
    return noeud;
}

/** « 2026-11-05 22:55:44 » → « 05/11/2026 22:55 ». */
export function dateCourte(texte) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(texte ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '';
}

/** 95 → « 1 min 35 s ». */
export function duree(secondes) {
    const s = Math.max(0, Math.round(Number(secondes) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return [h && `${h} h`, m && `${m} min`, (r || s === 0) && `${r} s`].filter(Boolean).join(' ');
}

/** Adresse publique complète d'un lien relatif renvoyé par l'API. */
export function adresseComplete(lien) {
    return new URL(lien, location.origin).href;
}
