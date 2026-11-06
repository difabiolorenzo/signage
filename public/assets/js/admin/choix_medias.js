// Fenêtre « Ajouter des médias » de l'éditeur de pages : grille de vignettes des médias que
// l'utilisateur peut insérer, recherche par nom, filtre Images / Vidéos, sélection multiple, et
// envoi d'un fichier dont le média arrive présélectionné.

import { api } from './api.js';
import { dialogue } from './dialogue.js';
import { el } from './dom.js';
import { adresseVignette, descriptionMedia, envoyerMedias } from './envoi_medias.js';

const FILTRES = [['', 'Tous'], ['image', 'Images'], ['video', 'Vidéos']];

/**
 * Ouvre la fenêtre ; résout avec les médias choisis (objets de GET /api/medias, dans l'ordre de
 * sélection), ou null si elle est fermée. chaine : identifiant de la chaîne à laquelle ouvrir les
 * fichiers envoyés (sinon ils sont privés).
 */
export async function choisirMedias({ chaine = null } = {}) {
    const { medias, taille_max: tailleMax, types } = await api.get('/medias');
    const choisis = []; // identifiants, dans l'ordre de sélection
    let filtre = '';
    let bouton = null;

    const recherche = el('input', { type: 'search', placeholder: 'Rechercher par nom', 'aria-label': 'Rechercher un média par nom', autocomplete: 'off' });
    const grille = el('div', { class: 'grille-choix', role: 'group', 'aria-label': 'Médias disponibles' });
    const compte = el('p', { class: 'meta', role: 'status' });
    const suivi = el('ul', { class: 'suivi-envois', 'aria-live': 'polite' });
    const segments = el('div', { class: 'segments', role: 'group', 'aria-label': 'Type de média' });

    function majBouton() {
        const n = choisis.length;
        compte.textContent = `${n} média${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}`;
        if (bouton) {
            bouton.textContent = n === 0 ? 'Ajouter' : `Ajouter ${n} média${n > 1 ? 's' : ''}`;
            bouton.disabled = n === 0;
        }
    }

    function tuile(m) {
        const adresse = adresseVignette(m);
        const selectionne = choisis.includes(m.id);
        const ordre = choisis.indexOf(m.id) + 1;
        return el('button', {
            type: 'button', class: selectionne ? 'tuile-choix choisie' : 'tuile-choix', 'aria-pressed': String(selectionne),
            title: m.nom,
            onclick: () => {
                const i = choisis.indexOf(m.id);
                if (i >= 0) {
                    choisis.splice(i, 1);
                } else {
                    choisis.push(m.id);
                }
                dessiner();
                // Le bouton est recréé : le focus revient sur la même tuile.
                grille.querySelector(`[data-id="${m.id}"]`)?.focus();
            },
            dataset: { id: String(m.id) },
        },
        el('span', { class: 'cadre-vignette' },
            adresse
                ? el('img', { class: 'vignette-media', src: adresse, alt: '', loading: 'lazy' })
                : el('span', { class: 'vignette-vide', text: 'Vidéo' }),
            selectionne && el('span', { class: 'ordre-choix', text: String(ordre), 'aria-hidden': 'true' })),
        el('span', { class: 'nom-fichier', text: m.nom }),
        el('span', { class: 'meta', text: descriptionMedia(m) }));
    }

    function dessiner() {
        const texte = recherche.value.trim().toLocaleLowerCase('fr');
        const retenus = medias.filter((m) => (!filtre || m.type.startsWith(`${filtre}/`))
            && (!texte || m.nom.toLocaleLowerCase('fr').includes(texte)));
        segments.replaceChildren(...FILTRES.map(([valeur, libelle]) => el('button', {
            type: 'button', class: valeur === filtre ? 'segment actif' : 'segment', 'aria-pressed': String(valeur === filtre), text: libelle,
            onclick: () => {
                filtre = valeur;
                dessiner();
            },
        })));
        grille.replaceChildren(...(retenus.length === 0
            ? [el('p', { class: 'vide', text: medias.length === 0 ? 'Aucun média pour le moment : envoyez un fichier.' : 'Aucun média ne correspond.' })]
            : retenus.map(tuile)));
        majBouton();
    }

    recherche.addEventListener('input', dessiner);
    // Entrée dans la recherche ne doit pas valider la fenêtre.
    recherche.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });

    const fichiers = el('input', { type: 'file', multiple: true, accept: types.join(','), hidden: true });
    fichiers.addEventListener('change', async () => {
        const crees = await envoyerMedias([...fichiers.files], { types, tailleMax, chaine: chaine ?? '', suivi });
        fichiers.value = '';
        medias.unshift(...crees);
        choisis.push(...crees.map((m) => m.id));
        dessiner();
    });

    dessiner();
    const resultat = await dialogue({
        titre: 'Ajouter des médias',
        large: true,
        texteValider: 'Ajouter',
        preparer: (b) => {
            bouton = b;
            majBouton();
        },
        corps: [
            el('div', { class: 'barre-choix' },
                recherche,
                segments,
                el('button', { type: 'button', class: 'bouton', text: 'Envoyer un fichier', onclick: () => fichiers.click() })),
            fichiers,
            suivi,
            grille,
            compte,
        ],
        valider: async () => {
            if (choisis.length === 0) {
                throw new Error('Choisissez au moins un média.');
            }
            return choisis.map((id) => medias.find((m) => m.id === id));
        },
    });
    return resultat;
}
