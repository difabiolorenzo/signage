// Widget Compte à rebours : temps restant jusqu'à une date, puis un texte final.

import { TAILLE_HORLOGE } from '../../commun/widgets.js';
import { styleTexte } from '../outils.js';

const z = (n) => String(n).padStart(2, '0');

function restant(ms, secondes) {
    const total = Math.floor(ms / 1000);
    const j = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const jours = j > 0 ? `${j} j ` : '';
    return secondes ? `${jours}${z(h)}:${z(m)}:${z(s)}` : `${jours}${z(h)} h ${z(m)} min`;
}

export function creer(region, reglages, contexte) {
    const bloc = document.createElement('div');
    bloc.className = 'bloc';
    styleTexte(bloc, reglages, TAILLE_HORLOGE);
    const libelle = document.createElement('div');
    libelle.className = 'ligne';
    libelle.textContent = String(reglages.libelle ?? '');
    const valeur = document.createElement('div');
    valeur.className = 'ligne grand';
    bloc.append(libelle, valeur);
    region.append(bloc);

    // « 2026-11-12T14:30 » : heure locale de l'afficheur.
    const cible = new Date(String(reglages.cible ?? '')).getTime();
    const secondes = reglages.secondes !== false;

    let minuteur = null;
    function rafraichir() {
        const maintenant = contexte.maintenant().getTime();
        if (!Number.isFinite(cible)) {
            valeur.textContent = '--:--';
        } else if (maintenant >= cible) {
            libelle.hidden = true;
            valeur.textContent = String(reglages.texte_fin ?? '');
            return;
        } else {
            // Arrondi à la seconde supérieure : on affiche 00:00:01 jusqu'au dernier instant.
            valeur.textContent = restant(cible - maintenant + 999, secondes);
        }
        minuteur = setTimeout(rafraichir, 1000 - (maintenant % 1000) + 10);
    }
    rafraichir();

    return { detruire: () => clearTimeout(minuteur) };
}
