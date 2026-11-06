// Envoi de médias, partagé par l'écran Médias et la fenêtre de choix des médias : contrôle du type
// et de la taille, mesures et vignette des vidéos (le serveur ne sait pas lire une vidéo : le
// navigateur la mesure et en capture une image vers 1 s), suivi de chaque envoi. Régénère aussi
// les vignettes manquantes (médias envoyés avant les vignettes, ancienne sauvegarde restaurée).

import { api, envoyerFichier } from './api.js';
import { duree, el } from './dom.js';

const LARGEUR_VIGNETTE = 320;
// Échecs déjà constatés pendant la session : pas de nouvel essai à chaque affichage.
const vignettesImpossibles = new Set();

export function taille(octets) {
    if (octets >= 1024 * 1024) {
        return `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
    }
    return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/** « JPEG », « MP4 »… */
export const libelleFormat = (type) => String(type).split('/')[1]?.toUpperCase() ?? '';

/** « Image · JPEG · 1920 × 1080 » ou « Vidéo · MP4 · 0:42 · 1280 × 720 ». */
export function descriptionMedia(m) {
    const video = String(m.type).startsWith('video/');
    return [
        video ? 'Vidéo' : 'Image',
        libelleFormat(m.type),
        video && m.duree ? duree(Math.round(m.duree)) : null,
        m.largeur && m.hauteur ? `${m.largeur} × ${m.hauteur}` : null,
    ].filter(Boolean).join(' · ');
}

/**
 * Vignette à afficher : celle du serveur, à défaut l'image elle-même ; null pour une vidéo sans
 * vignette (l'appelant montre alors un cadre « Vidéo »).
 */
export function adresseVignette(m) {
    return m.vignette ?? (String(m.type).startsWith('image/') ? m.url : null);
}

/** Image courante d'une vidéo, réduite à 320 px de large : Blob JPEG, ou null. */
function capturer(video) {
    return new Promise((resoudre) => {
        if (!video.videoWidth || !video.videoHeight) {
            resoudre(null);
            return;
        }
        const largeur = Math.min(LARGEUR_VIGNETTE, video.videoWidth);
        const canvas = document.createElement('canvas');
        canvas.width = largeur;
        canvas.height = Math.max(1, Math.round(video.videoHeight * largeur / video.videoWidth));
        try {
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => resoudre(blob), 'image/jpeg', 0.85);
        } catch {
            resoudre(null);
        }
    });
}

/**
 * Dimensions, durée et vignette d'une vidéo : `source` est un fichier choisi ou l'URL d'un média
 * du même site. Résout toujours (valeurs absentes si le navigateur ne sait pas lire la vidéo).
 */
export function analyserVideo(source) {
    return new Promise((resoudre) => {
        const video = document.createElement('video');
        const local = source instanceof Blob;
        const url = local ? URL.createObjectURL(source) : source;
        let mesures = null;
        let fini = false;
        const fin = (valeurs) => {
            if (fini) {
                return;
            }
            fini = true;
            clearTimeout(minuteur);
            video.removeAttribute('src');
            video.load();
            if (local) {
                URL.revokeObjectURL(url);
            }
            resoudre(valeurs);
        };
        const minuteur = setTimeout(() => fin(mesures ?? {}), 15000);
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.addEventListener('loadedmetadata', () => {
            mesures = {
                largeur: video.videoWidth || null,
                hauteur: video.videoHeight || null,
                duree: Number.isFinite(video.duration) ? video.duration : null,
            };
            // 1 s, ou le milieu d'une vidéo plus courte : évite l'image noire du début.
            video.currentTime = mesures.duree ? Math.min(1, mesures.duree / 2) : 0;
        }, { once: true });
        video.addEventListener('seeked', async () => fin({ ...mesures, vignette: await capturer(video) }), { once: true });
        video.addEventListener('error', () => fin(mesures ?? {}), { once: true });
        video.src = url;
    });
}

/**
 * Envoie les fichiers un par un ; renvoie les médias créés (réponse de l'API), dans l'ordre.
 * options : { types, tailleMax, chaine (id ou ''), suivi (liste <ul> où ajouter une ligne par fichier) }.
 */
export async function envoyerMedias(fichiers, { types, tailleMax, chaine = '', suivi }) {
    const crees = [];
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
        if (chaine) {
            donnees.append('chaine', String(chaine));
        }
        if (fichier.type.startsWith('video/')) {
            etat.textContent = 'Analyse de la vidéo…';
            const { vignette, ...mesures } = await analyserVideo(fichier);
            for (const [cle, valeur] of Object.entries(mesures)) {
                if (valeur !== null && valeur !== undefined) {
                    donnees.append(cle, String(valeur));
                }
            }
            if (vignette) {
                donnees.append('vignette', vignette, 'vignette.jpg');
            }
        }
        etat.textContent = 'Envoi…';
        try {
            const { media } = await envoyerFichier('/medias', donnees, (fraction) => {
                barre.value = fraction;
            });
            barre.remove();
            ligne.classList.add('reussi');
            etat.textContent = 'Envoyé';
            crees.push(media);
        } catch (e) {
            erreur(e.message);
        }
    }
    return crees;
}

/**
 * Refait, l'une après l'autre, les vignettes manquantes des médias que l'utilisateur peut modifier :
 * images par le serveur, vidéos capturées ici. surVignette(media) est appelée après chaque réussite
 * (media.vignette est alors renseignée).
 */
export async function regenererVignettes(medias, surVignette) {
    const aFaire = medias.filter((m) => !m.vignette && m.modifiable && !vignettesImpossibles.has(m.id));
    for (const m of aFaire) {
        try {
            let reponse;
            if (m.type.startsWith('image/')) {
                reponse = await api.post(`/medias/${m.id}/vignette`);
            } else {
                const { vignette } = await analyserVideo(m.url);
                if (!vignette) {
                    throw new Error('capture impossible');
                }
                const donnees = new FormData();
                donnees.append('vignette', vignette, 'vignette.jpg');
                reponse = await envoyerFichier(`/medias/${m.id}/vignette`, donnees);
            }
            m.vignette = reponse.vignette;
            surVignette(m);
        } catch (e) {
            vignettesImpossibles.add(m.id);
            console.warn(`Vignette de « ${m.nom} » impossible :`, e.message);
        }
    }
}
