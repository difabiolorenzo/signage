// Types de widgets et valeurs par défaut, partagés par l'éditeur et le lecteur.
//
// Document enregistré dans playlists.pages :
//   { format: 1, pages: [ { duree, fond, widgets: [ un widget par région, dans l'ordre des régions ] } ] }
// Un widget est { type, ...réglages du type }. Changer cette structure impose d'incrémenter
// FORMAT_PAGES et de convertir les anciennes playlists à la lecture.
//
// Les tailles de texte sont en pixels d'un écran de référence 1920 × 1080
// (1080 × 1920 en portrait) ; le lecteur les met à l'échelle de l'écran réel.

export const FORMAT_PAGES = 1;

export const ECRAN_REFERENCE = Object.freeze({ largeur: 1920, hauteur: 1080 });

/** Durée d'affichage d'une page, en secondes. */
export const DUREE_PAGE = 30;
/** Durée d'affichage d'une image, en secondes. */
export const DUREE_MEDIA = 10;
export const TAILLE_TEXTE = 32;
export const TAILLE_HORLOGE = 28;
/** Flux RSS : intervalle de rafraîchissement en minutes et nombre d'éléments affichés. */
export const RSS_FREQUENCE = 30;
export const RSS_NOMBRE = 3;

/** Types de widgets, dans l'ordre du menu de l'éditeur. */
export const TYPES_WIDGETS = Object.freeze([
    { type: 'vide', libelle: 'Vide' },
    { type: 'media', libelle: 'Images / Vidéos' },
    { type: 'texte', libelle: 'Texte' },
    { type: 'rss', libelle: 'Flux RSS' },
    { type: 'page_web', libelle: 'Page Web' },
    { type: 'youtube', libelle: 'YouTube' },
    { type: 'horloge', libelle: 'Horloge' },
    { type: 'date_heure', libelle: 'Date et heure' },
    { type: 'compte_rebours', libelle: 'Compte à rebours' },
    { type: 'meteo', libelle: 'Météo' },
    { type: 'qr', libelle: 'Lien web et code QR' },
]);

/** Transitions entre les images d'un widget média. */
export const TRANSITIONS = Object.freeze([
    { valeur: 'defaut', libelle: 'Par défaut' },
    { valeur: 'ken_burns', libelle: 'Effet Ken Burns' },
    { valeur: 'retournement', libelle: 'Retournement' },
    { valeur: 'zoom', libelle: 'Zoom avant' },
    { valeur: 'fondu', libelle: 'Fondu' },
    { valeur: 'arrivee', libelle: 'Arrivée en vol' },
    { valeur: 'flottement', libelle: 'Flottement' },
    { valeur: 'sortie', libelle: 'Sortie en vol' },
    { valeur: 'rotation', libelle: 'Rotation' },
]);

/** Mise à l'échelle des médias : valeurs de `object-fit`. */
export const ECHELLES = Object.freeze([
    { valeur: 'contain', libelle: 'Ajuster à la région' },
    { valeur: 'fill', libelle: 'Étirer pour remplir' },
    { valeur: 'cover', libelle: "Mettre à l'échelle pour remplir" },
]);

/** Défilement du texte : sens du mouvement. */
export const DEFILEMENTS = Object.freeze([
    { valeur: 'aucun', libelle: 'Statique' },
    { valeur: 'gauche', libelle: 'De droite à gauche' },
    { valeur: 'droite', libelle: 'De gauche à droite' },
    { valeur: 'haut', libelle: 'De bas en haut' },
    { valeur: 'bas', libelle: 'De haut en bas' },
]);

/** Vitesses de défilement, en pixels de l'écran de référence par seconde. */
export const VITESSES = Object.freeze([
    { valeur: 'lente', libelle: 'Lente', pixelsParSeconde: 60 },
    { valeur: 'moyenne', libelle: 'Moyenne', pixelsParSeconde: 120 },
    { valeur: 'rapide', libelle: 'Rapide', pixelsParSeconde: 240 },
]);

/** Contenu affiché par l'horloge (indice enregistré dans `affichage`). */
export const AFFICHAGES_HORLOGE = Object.freeze([
    'Heure seulement',
    'Date seulement',
    'Date, Heure (une ligne)',
    'Date, Heure (deux lignes)',
    'Heure, Date (une ligne)',
    'Heure, Date (deux lignes)',
]);

const BLANC = '#ffffff';
const TRANSPARENT = 'transparent';

/** Réglages communs aux widgets qui affichent du texte. */
function texte(taille) {
    return { taille, couleur: BLANC, fond: TRANSPARENT };
}

/** Réglages du défilement (texte et RSS). */
function defilement() {
    return { defilement: 'gauche', vitesse: 'moyenne' };
}

/** Date et heure locales au format des champs `datetime-local` : « 2026-11-12T14:30 ». */
function dateLocale(date) {
    const z = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}T${z(date.getHours())}:${z(date.getMinutes())}`;
}

/** Nouveau widget du type demandé, avec ses valeurs par défaut. */
// Valeurs par défaut réglées dans le panneau d'administration (posées par l'éditeur ; le lecteur
// n'en a pas besoin : chaque widget enregistre ses propres réglages).
const preferences = { celsius: true };

/** parametres : réponse de GET /api/parametres ({ meteo_celsius, … }). */
export function definirPreferences(parametres) {
    if (typeof parametres?.meteo_celsius === 'boolean') {
        preferences.celsius = parametres.meteo_celsius;
    }
}

export function widgetParDefaut(type = 'vide') {
    switch (type) {
        case 'media':
            return { type, elements: [], transition: 'defaut', echelle: 'contain', muet: true };
        case 'texte':
            // mode : simple | markdown (champ texte) | riche (champ html), voir texte_riche.js.
            return { type, mode: 'simple', texte: 'Saisissez votre texte ici', ...defilement(), ...texte(TAILLE_TEXTE) };
        case 'rss':
            return { type, url: '', frequence: RSS_FREQUENCE, nombre: RSS_NOMBRE, ...defilement(), ...texte(TAILLE_TEXTE) };
        case 'page_web':
        case 'youtube':
        case 'qr':
            return { type, url: 'https://' };
        case 'horloge':
        case 'date_heure':
            return {
                type,
                analogique: false,
                h24: true,
                affichage: type === 'date_heure' ? 2 : 0,
                format_date: '%Y.%m.%d %A',
                ...texte(TAILLE_HORLOGE),
            };
        case 'compte_rebours': {
            const cible = new Date(Date.now() + 7 * 24 * 3600 * 1000);
            return {
                type,
                cible: dateLocale(cible),
                libelle: "Jusqu'à l'événement",
                texte_fin: "C'est maintenant !",
                secondes: true,
                ...texte(TAILLE_HORLOGE),
            };
        }
        case 'meteo':
            return { type, ville: 'Paris', celsius: preferences.celsius, ...texte(TAILLE_HORLOGE) };
        default:
            return { type: 'vide' };
    }
}

/** Élément d'un widget média : `media` est l'identifiant du média de la chaîne. */
export function elementMediaParDefaut(media) {
    return { media, duree: DUREE_MEDIA };
}

/** Nouvelle page : un widget vide par région, fond noir. */
export function pageParDefaut(nombreRegions) {
    return {
        duree: DUREE_PAGE,
        fond: '#000000',
        widgets: Array.from({ length: nombreRegions }, () => widgetParDefaut('vide')),
    };
}

/** Document `pages` d'une nouvelle playlist : une page. */
export function pagesParDefaut(nombreRegions) {
    return { format: FORMAT_PAGES, pages: [pageParDefaut(nombreRegions)] };
}
