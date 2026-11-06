// Écran « Médias » d'une chaîne : envoi par glisser-déposer ou sélection de fichiers,
// bibliothèque avec vignettes, suppression (refusée si une playlist utilise le média).

import { api, envoyerFichier } from './api.js';
import { confirmer } from './dialogue.js';
import { dateCourte, duree, el } from './dom.js';
import { ongletsChaine } from './navigation.js';

function taille(octets) {
    if (octets >= 1024 * 1024) {
        return `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
    }
    return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/** Dimensions et durée d'une vidéo, lues par le navigateur (le serveur ne sait pas les mesurer). */
function mesurerVideo(fichier) {
    return new Promise((resoudre) => {
        const video = document.createElement('video');
        const url = URL.createObjectURL(fichier);
        const fin = (valeurs) => {
            URL.revokeObjectURL(url);
            resoudre(valeurs);
        };
        video.preload = 'metadata';
        video.muted = true;
        video.addEventListener('loadedmetadata', () => fin({
            largeur: video.videoWidth || null, hauteur: video.videoHeight || null,
            duree: Number.isFinite(video.duration) ? video.duration : null,
        }), { once: true });
        video.addEventListener('error', () => fin({}), { once: true });
        setTimeout(() => fin({}), 5000);
        video.src = url;
    });
}

function vignette(media) {
    if (media.type.startsWith('video/')) {
        // #t=0.5 : le navigateur montre une image de la vidéo plutôt qu'un cadre noir.
        return el('video', { class: 'vignette-media', src: `${media.url}#t=0.5`, preload: 'metadata', muted: true, 'aria-hidden': 'true' });
    }
    return el('img', { class: 'vignette-media', src: media.url, alt: '', loading: 'lazy' });
}

function carteMedia(media, chaineId, contexte, rafraichir) {
    const details = [
        media.largeur && media.hauteur ? `${media.largeur} × ${media.hauteur}` : null,
        taille(media.taille),
        media.duree ? duree(media.duree) : null,
    ].filter(Boolean).join(' · ');
    const utilise = media.utilise_par.length > 0;
    return el('article', { class: 'carte-media' },
        el('div', { class: 'cadre-vignette' }, vignette(media),
            media.type.startsWith('video/') && el('span', { class: 'badge', text: 'Vidéo' })),
        el('p', { class: 'nom-fichier', title: media.nom, text: media.nom }),
        el('p', { class: 'meta', text: details }),
        el('p', { class: 'meta', text: `Envoyé le ${dateCourte(media.envoye_le)}${media.envoye_par ? ` par ${media.envoye_par}` : ''}` }),
        el('p', { class: utilise ? 'meta utilise' : 'meta', text: utilise ? `Utilisé par : ${media.utilise_par.join(', ')}` : 'Utilisé par aucune playlist' }),
        el('div', { class: 'actions' },
            el('a', { class: 'bouton', href: media.url, target: '_blank', rel: 'noopener', text: 'Ouvrir' }),
            el('button', {
                type: 'button', class: 'bouton danger', text: 'Supprimer', disabled: utilise,
                title: utilise ? 'Retirez d\'abord ce média des playlists qui l\'utilisent.' : null,
                onclick: async () => {
                    if (await confirmer('Supprimer le média', `« ${media.nom} » sera supprimé définitivement.`)) {
                        try {
                            await api.supprimer(`/chaines/${chaineId}/medias/${media.id}`);
                            contexte.notifier(`« ${media.nom} » supprimé.`);
                        } catch (e) {
                            contexte.notifier(e.message);
                        }
                        rafraichir();
                    }
                },
            })));
}

export async function afficher(ecran, contexte, chaineId) {
    const [{ chaine }, bibliotheque] = await Promise.all([
        api.get(`/chaines/${chaineId}`),
        api.get(`/chaines/${chaineId}/medias`),
    ]);
    document.title = `Médias — ${chaine.nom} — Signage Studio`;
    const { medias, taille_max: tailleMax, types } = bibliotheque;

    const grille = el('div', { class: 'grille-medias' });
    const suivi = el('ul', { class: 'suivi-envois', 'aria-live': 'polite' });

    async function rafraichirListe() {
        const r = await api.get(`/chaines/${chaineId}/medias`);
        dessinerListe(r.medias);
    }
    function dessinerListe(liste) {
        grille.replaceChildren(...(liste.length === 0
            ? [el('p', { class: 'vide', text: 'Aucun média pour le moment. Déposez des images ou des vidéos ci-dessus.' })]
            : liste.map((m) => carteMedia(m, chaineId, contexte, rafraichirListe))));
    }

    /** Envoie les fichiers un par un, avec une ligne de suivi chacun. */
    async function envoyer(fichiers) {
        let envoyes = 0;
        for (const fichier of fichiers) {
            const barre = el('progress', { max: 1, value: 0 });
            const etat = el('span', { class: 'etat-envoi', text: 'En attente…' });
            const ligne = el('li', {}, el('span', { class: 'nom-fichier', text: fichier.name }), barre, etat);
            suivi.prepend(ligne);

            const erreur = (texte) => {
                ligne.classList.add('echec');
                barre.remove();
                etat.textContent = texte;
            };
            if (!types.includes(fichier.type)) {
                erreur('Type non accepté : JPEG, PNG, WebP, GIF, MP4 ou WebM.');
                continue;
            }
            if (tailleMax > 0 && fichier.size > tailleMax) {
                erreur(`Trop volumineux (${taille(fichier.size)}) : la limite est de ${taille(tailleMax)}.`);
                continue;
            }
            const donnees = new FormData();
            donnees.append('fichier', fichier);
            if (fichier.type.startsWith('video/')) {
                const mesures = await mesurerVideo(fichier);
                for (const [cle, valeur] of Object.entries(mesures)) {
                    if (valeur !== null && valeur !== undefined) {
                        donnees.append(cle, String(valeur));
                    }
                }
            }
            etat.textContent = 'Envoi…';
            try {
                await envoyerFichier(`/chaines/${chaineId}/medias`, donnees, (fraction) => {
                    barre.value = fraction;
                });
                barre.remove();
                ligne.classList.add('reussi');
                etat.textContent = 'Envoyé';
                envoyes++;
            } catch (e) {
                erreur(e.message);
            }
        }
        if (envoyes > 0) {
            contexte.notifier(`${envoyes} fichier(s) envoyé(s).`);
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

    dessinerListe(medias);
    ecran.replaceChildren(contexte.cadre({
        ...ongletsChaine(chaine, 'medias'),
        barre: [
            el('h1', { text: 'Médias' }),
            el('button', { type: 'button', class: 'bouton principal', text: '+ Envoyer des fichiers', onclick: () => choixFichiers.click() }),
        ],
        contenu: [depot, choixFichiers, suivi, grille],
    }));
}
