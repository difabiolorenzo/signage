// Onglet « Réglages » d'une chaîne (administrateurs) : nom, adresse publique et orientation.
// L'API refuse aussi la modification à un éditeur (403).

import { api } from './api.js';
import { adresseComplete, el } from './dom.js';
import { champsChaine } from './ecran_chaines.js';
import { carteFormulaire } from './ecran_compte.js';
import { ongletsChaine } from './navigation.js';

export async function afficher(ecran, contexte, chaineId) {
    const { chaine } = await api.get(`/chaines/${chaineId}`);
    document.title = `${chaine.nom} — Réglages — Signage Studio`;

    let contenu;
    if (!contexte.estAdmin()) {
        contenu = el('p', { class: 'vide', text: 'Seuls les administrateurs peuvent modifier les réglages d\'une chaîne.' });
    } else {
        const champs = champsChaine(chaine);
        const lien = adresseComplete(chaine.lien_public);
        contenu = el('div', { class: 'grille-compte' }, carteFormulaire('Réglages de la chaîne', [
            el('p', { class: 'meta' }, 'Adresse des afficheurs : ', el('a', { href: lien, target: '_blank', rel: 'noopener', text: lien })),
            ...champs.elements,
        ], 'Enregistrer', async () => {
            await api.put(`/chaines/${chaine.id}`, champs.valeurs());
            await afficher(ecran, contexte, chaineId);
            contexte.notifier('Chaîne enregistrée.');
        }));
    }

    ecran.replaceChildren(contexte.cadre({
        ...ongletsChaine(chaine, 'reglages', contexte),
        barre: [el('h1', { text: 'Réglages' })],
        contenu,
    }));
}
