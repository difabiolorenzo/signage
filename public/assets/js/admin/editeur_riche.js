// Éditeur de mise en forme du widget Texte : barre d'outils (gras, italique, souligné, couleur,
// listes, alignement) et zone modifiable. Le HTML saisi est relu par nettoyer() à l'affichage.

import { nettoyer } from '../commun/texte_riche.js';
import { el } from './dom.js';

const COMMANDES = [
    { commande: 'bold', texte: 'G', titre: 'Gras (Ctrl+B)', classe: 'gras' },
    { commande: 'italic', texte: 'I', titre: 'Italique (Ctrl+I)', classe: 'italique' },
    { commande: 'underline', texte: 'S', titre: 'Souligné (Ctrl+U)', classe: 'souligne' },
    { commande: 'insertUnorderedList', texte: '•', titre: 'Liste à puces' },
    { commande: 'insertOrderedList', texte: '1.', titre: 'Liste numérotée' },
    { alignement: 'left', texte: '⇤', titre: 'Aligner à gauche' },
    { alignement: 'center', texte: '↔', titre: 'Centrer' },
    { alignement: 'right', texte: '⇥', titre: 'Aligner à droite' },
    { commande: 'removeFormat', texte: '⌫', titre: 'Effacer la mise en forme' },
];

/**
 * html : contenu initial ; changement(html) est appelée à chaque modification ;
 * couleur et fond : ceux du widget, pour voir le texte comme à l'écran.
 */
export function editeurRiche(html, changement, { couleur: couleurTexte = '#ffffff', fond = '#000000' } = {}) {
    const zone = el('div', {
        class: 'editeur-riche', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Texte mis en forme',
    });
    zone.replaceChildren(nettoyer(html));
    zone.style.color = couleurTexte;
    zone.style.backgroundColor = fond === 'transparent' ? '#000000' : fond;

    // La sélection est mémorisée : le choix d'une couleur fait perdre le focus à la zone.
    let selection = null;
    document.addEventListener('selectionchange', function memoriser() {
        if (!zone.isConnected) {
            document.removeEventListener('selectionchange', memoriser);
            return;
        }
        const s = document.getSelection();
        if (s.rangeCount > 0 && zone.contains(s.getRangeAt(0).commonAncestorContainer)) {
            selection = s.getRangeAt(0).cloneRange();
        }
    });

    function restaurer() {
        zone.focus();
        if (selection) {
            const s = document.getSelection();
            s.removeAllRanges();
            s.addRange(selection);
        }
    }

    function executer(commande, valeur = null) {
        restaurer();
        document.execCommand('styleWithCSS', false, false);
        document.execCommand(commande, false, valeur);
        signaler();
    }

    /**
     * Alignement par le CSSOM : execCommand('justify…') écrirait un attribut style, bloqué par
     * la politique de sécurité de la page (style-src 'self').
     */
    function aligner(alignement) {
        const BLOCS = 'p, div, li, h1, h2, h3, h4, h5, h6, blockquote';
        const depart = selection?.startContainer;
        const element = depart?.nodeType === Node.TEXT_NODE ? depart.parentElement : depart;
        const bloc = element?.closest(BLOCS);
        if (!bloc || bloc === zone || !zone.contains(bloc)) {
            executer('formatBlock', 'p'); // texte hors paragraphe : on en crée un
        } else {
            restaurer();
        }
        const s = document.getSelection();
        if (s.rangeCount === 0) {
            return;
        }
        const plage = s.getRangeAt(0);
        const blocs = [...zone.querySelectorAll(BLOCS)]
            .filter((b) => plage.intersectsNode(b) && !b.querySelector(BLOCS));
        blocs.forEach((b) => { b.style.textAlign = alignement; });
        signaler();
    }

    function signaler() {
        changement(zone.innerHTML);
    }

    const boutons = COMMANDES.map(({ commande, alignement, texte, titre, classe }) => el('button', {
        type: 'button', class: classe ? `outil ${classe}` : 'outil', text: texte, title: titre, 'aria-label': titre,
        // mousedown sans focus : la sélection reste dans la zone de texte.
        onmousedown: (e) => e.preventDefault(),
        onclick: () => (alignement ? aligner(alignement) : executer(commande)),
    }));
    const couleur = el('input', { type: 'color', value: '#ffcc00', title: 'Couleur du texte sélectionné', 'aria-label': 'Couleur du texte sélectionné' });
    couleur.addEventListener('change', () => executer('foreColor', couleur.value));

    zone.addEventListener('input', signaler);
    // Collage : texte seul, pour ne pas importer la mise en forme d'une autre page.
    zone.addEventListener('paste', (e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });

    return el('div', { class: 'bloc-riche' },
        el('div', { class: 'barre-riche', role: 'toolbar', 'aria-label': 'Mise en forme' }, boutons, couleur),
        zone);
}
