// Fenêtres modales (<dialog>) : formulaire avec validation asynchrone et confirmation.

import { el } from './dom.js';

/**
 * Ouvre une fenêtre. `valider` (facultatif, asynchrone) est appelée à l'envoi du formulaire :
 * si elle lève une erreur, son message s'affiche et la fenêtre reste ouverte ; sinon la
 * promesse se résout avec sa valeur de retour. Fermeture ou Annuler : null.
 */
export function dialogue({ titre, corps = [], texteValider = 'Valider', danger = false, large = false, valider = null }) {
    return new Promise((resoudre) => {
        let resolu = false;
        const terminer = (valeur) => {
            if (!resolu) {
                resolu = true;
                resoudre(valeur);
            }
        };

        const erreur = el('p', { class: 'erreur', role: 'alert', hidden: true });
        const boutonValider = el('button', { type: 'submit', class: danger ? 'bouton danger' : 'bouton principal', text: texteValider });
        const annuler = () => fenetre.close();
        const formulaire = el('form', { class: 'dialogue-corps', novalidate: false },
            corps,
            erreur,
            el('div', { class: 'boutons' },
                boutonValider,
                el('button', { type: 'button', class: 'bouton', text: 'Annuler', onclick: annuler })),
        );
        const fenetre = el('dialog', { class: large ? 'dialogue large' : 'dialogue', 'aria-label': titre },
            el('header', {},
                el('h2', { text: titre }),
                el('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer', text: '×', onclick: annuler })),
            formulaire,
        );

        formulaire.addEventListener('submit', async (evenement) => {
            evenement.preventDefault();
            erreur.hidden = true;
            boutonValider.disabled = true;
            try {
                const resultat = valider ? await valider() : true;
                terminer(resultat);
                fenetre.close();
            } catch (e) {
                erreur.textContent = e.message;
                erreur.hidden = false;
            } finally {
                boutonValider.disabled = false;
            }
        });
        fenetre.addEventListener('close', () => {
            terminer(null);
            fenetre.remove();
        });

        document.body.append(fenetre);
        fenetre.showModal();
        fenetre.querySelector('input:not([type=hidden]), select, textarea')?.focus();
    });
}

/** Demande de confirmation ; renvoie true si l'utilisateur confirme. */
export async function confirmer(titre, message, texteValider = 'Supprimer') {
    const paragraphes = [].concat(message).map((m) => el('p', { text: m }));
    return (await dialogue({ titre, corps: paragraphes, texteValider, danger: true })) === true;
}

/** Champ de formulaire étiqueté. */
export function champ(libelle, controle, aide = null) {
    const id = `champ-${Math.random().toString(36).slice(2, 9)}`;
    controle.id = id;
    return el('div', { class: 'champ' },
        el('label', { for: id, text: libelle }),
        controle,
        aide && el('small', { text: aide }));
}
