// Menu « Médias » : médias de la bibliothèque visibles par l'utilisateur, filtrés par chaîne,
// auteur, portée et type ; envoi par glisser-déposer ou sélection de fichiers (ouvert à la chaîne
// du filtre, sinon privé) ; portée « utilisable par… » et suppression par l'auteur ou un
// administrateur (suppression refusée si une playlist utilise le média). Les vignettes manquantes
// sont refaites à l'ouverture (envoi_medias.js).

import { api } from './api.js';
import { boutonsBibliotheque, filtres, optionsAuteurs, OPTIONS_PORTEE, textePortee } from './bibliotheque.js';
import { confirmer } from './dialogue.js';
import { dateCourte, duree, el } from './dom.js';
import { adresseVignette, envoyerMedias, regenererVignettes, taille } from './envoi_medias.js';
import { ongletsAccueil } from './navigation.js';

// Conservés pendant la session de l'éditeur.
const valeurs = { chaine: '', auteur: '', portee: '', type: '' };

function retenu(m) {
    const chaine = Number(valeurs.chaine);
    return (!chaine || m.acces.chaines.some((c) => c.id === chaine))
        && (!valeurs.auteur || String(m.auteur?.id) === valeurs.auteur)
        && (!valeurs.portee || m.portee === valeurs.portee)
        && (!valeurs.type || m.type.startsWith(`${valeurs.type}/`));
}

function vignette(media) {
    const adresse = adresseVignette(media);
    if (adresse) {
        return el('img', { class: 'vignette-media', src: adresse, alt: '', loading: 'lazy' });
    }
    // Vidéo sans vignette (en cours de création) : #t=0.5 montre une image plutôt qu'un cadre noir.
    return el('video', { class: 'vignette-media', src: `${media.url}#t=0.5`, preload: 'metadata', muted: true, 'aria-hidden': 'true' });
}

function carteMedia(media, contexte, rafraichir) {
    const details = [
        media.largeur && media.hauteur ? `${media.largeur} × ${media.hauteur}` : null,
        taille(media.taille),
        media.duree ? duree(media.duree) : null,
    ].filter(Boolean).join(' · ');
    const utilise = media.utilise_par.length + media.utilise_par_autres > 0;
    const utilisations = [...media.utilise_par, media.utilise_par_autres > 0 && `${media.utilise_par_autres} autre(s) playlist(s)`].filter(Boolean);
    return el('article', { class: 'carte-media' },
        el('div', { class: 'cadre-vignette' }, vignette(media),
            media.type.startsWith('video/') && el('span', { class: 'badge', text: 'Vidéo' })),
        el('p', { class: 'nom-fichier', title: media.nom, text: media.nom }),
        el('p', { class: 'meta', text: details }),
        el('p', { class: 'meta', text: `Envoyé le ${dateCourte(media.envoye_le)}${media.envoye_par ? ` par ${media.envoye_par}` : ''}` }),
        el('p', { class: 'meta', text: `Auteur : ${media.auteur?.nom ?? 'aucun'}` }),
        el('p', { class: 'meta', text: `Utilisable par : ${textePortee(media)}` }),
        el('p', { class: utilise ? 'meta utilise' : 'meta', text: utilise ? `Utilisé par : ${utilisations.join(', ')}` : 'Utilisé par aucune playlist' }),
        el('div', { class: 'actions' },
            el('a', { class: 'bouton', href: media.url, target: '_blank', rel: 'noopener', text: 'Ouvrir' }),
            boutonsBibliotheque('medias', media, contexte, rafraichir),
            media.modifiable && el('button', {
                type: 'button', class: 'bouton danger', text: 'Supprimer', disabled: utilise,
                title: utilise ? 'Retirez d\'abord ce média des playlists qui l\'utilisent.' : null,
                onclick: async () => {
                    if (await confirmer('Supprimer le média', `« ${media.nom} » sera supprimé définitivement.`)) {
                        try {
                            await api.supprimer(`/medias/${media.id}`);
                            contexte.notifier(`« ${media.nom} » supprimé.`);
                        } catch (e) {
                            contexte.notifier(e.message);
                        }
                        rafraichir();
                    }
                },
            })));
}

/** chaineId : filtre « chaîne » imposé à l'ouverture (ancienne adresse #/chaines/{id}/medias). */
export async function afficher(ecran, contexte, chaineId = null) {
    if (chaineId !== null) {
        valeurs.chaine = String(chaineId);
    }
    const [bibliotheque, { chaines }] = await Promise.all([api.get('/medias'), api.get('/chaines')]);
    document.title = 'Médias — Signage Studio';
    let { medias } = bibliotheque;
    const { taille_max: tailleMax, types } = bibliotheque;
    if (valeurs.chaine && !chaines.some((c) => String(c.id) === valeurs.chaine)) {
        valeurs.chaine = '';
    }

    const grille = el('div', { class: 'grille-medias' });
    const suivi = el('ul', { class: 'suivi-envois', 'aria-live': 'polite' });
    const compte = el('p', { class: 'meta', 'aria-live': 'polite' });
    const destination = el('p', { class: 'aide' });

    let ecranQuitte = false;
    contexte.surQuitter(() => { ecranQuitte = true; });
    /** Vignettes manquantes refaites en arrière-plan ; la grille est redessinée à chaque réussite. */
    function completerVignettes() {
        regenererVignettes(medias, () => {
            if (!ecranQuitte) {
                dessinerListe();
            }
        });
    }
    async function rafraichirListe(message) {
        medias = (await api.get('/medias')).medias;
        dessinerListe();
        completerVignettes();
        if (message) {
            contexte.notifier(message);
        }
    }
    function dessinerListe() {
        const retenus = medias.filter(retenu);
        const chaine = chaines.find((c) => String(c.id) === valeurs.chaine);
        destination.textContent = chaine
            ? `Les fichiers envoyés seront utilisables par les éditeurs de la chaîne « ${chaine.nom} ».`
            : 'Les fichiers envoyés seront privés (vous et les administrateurs) ; choisissez une chaîne dans le filtre pour les lui ouvrir, ou réglez ensuite leur portée.';
        compte.textContent = `${retenus.length} média(s) sur ${medias.length}`;
        grille.replaceChildren(...(retenus.length === 0
            ? [el('p', { class: 'vide', text: medias.length === 0 ? 'Aucun média pour le moment. Déposez des images ou des vidéos ci-dessus.' : 'Aucun média ne correspond à ces filtres.' })]
            : retenus.map((m) => carteMedia(m, contexte, rafraichirListe))));
    }

    async function envoyer(fichiers) {
        const crees = await envoyerMedias(fichiers, { types, tailleMax, chaine: valeurs.chaine, suivi });
        if (crees.length > 0) {
            contexte.notifier(`${crees.length} fichier(s) envoyé(s).`);
            await rafraichirListe();
        }
    }

    const choixFichiers = el('input', { type: 'file', multiple: true, accept: types.join(','), hidden: true });
    choixFichiers.addEventListener('change', () => {
        envoyer([...choixFichiers.files]);
        choixFichiers.value = '';
    });
    const depot = el('div', { class: 'zone-depot', role: 'button', tabindex: 0, 'aria-label': 'Choisir des fichiers à envoyer' },
        el('strong', { text: 'Déposez ici des images ou des vidéos' }),
        el('span', { text: `ou cliquez pour les choisir · JPEG, PNG, WebP, GIF, MP4, WebM · ${taille(tailleMax)} au plus par fichier` }));
    depot.addEventListener('click', () => choixFichiers.click());
    depot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choixFichiers.click();
        }
    });
    depot.addEventListener('dragover', (e) => {
        e.preventDefault();
        depot.classList.add('survol');
    });
    depot.addEventListener('dragleave', () => depot.classList.remove('survol'));
    depot.addEventListener('drop', (e) => {
        e.preventDefault();
        depot.classList.remove('survol');
        envoyer([...e.dataTransfer.files]);
    });
    // Un fichier lâché à côté de la zone ne doit pas remplacer l'éditeur par le fichier.
    const ignorerDepot = (e) => e.preventDefault();
    window.addEventListener('dragover', ignorerDepot);
    window.addEventListener('drop', ignorerDepot);
    contexte.surQuitter(() => {
        window.removeEventListener('dragover', ignorerDepot);
        window.removeEventListener('drop', ignorerDepot);
    });

    const barreFiltres = filtres([
        { cle: 'chaine', libelle: 'Chaîne', options: [['', 'Toutes'], ...chaines.map((c) => [String(c.id), c.nom])] },
        { cle: 'auteur', libelle: 'Auteur', options: optionsAuteurs(medias) },
        { cle: 'portee', libelle: 'Portée', options: OPTIONS_PORTEE },
        { cle: 'type', libelle: 'Type', options: [['', 'Tous'], ['image', 'Images'], ['video', 'Vidéos']] },
    ], valeurs, dessinerListe);

    dessinerListe();
    completerVignettes();
    ecran.replaceChildren(contexte.cadre({
        ...ongletsAccueil(contexte, 'medias'),
        barre: [
            el('h1', { text: 'Médias' }),
            el('button', { type: 'button', class: 'bouton principal', text: '+ Envoyer des fichiers', onclick: () => choixFichiers.click() }),
        ],
        contenu: [barreFiltres, depot, destination, choixFichiers, suivi, compte, grille],
    }));
}
