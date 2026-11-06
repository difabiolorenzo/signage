// Client de l'API JSON : jeton CSRF sur chaque écriture, erreurs transformées en ErreurApi.

const base = document.body.dataset.api;
let jeton = null;
let surSessionPerdue = () => {};

export class ErreurApi extends Error {
    constructor(message, statut, details = null) {
        super(message);
        this.statut = statut;
        this.details = details;
    }
}

/** Jeton CSRF reçu à la connexion ou par GET /moi. */
export function definirJeton(valeur) {
    jeton = valeur;
}

/** Appelée quand une requête reçoit 401 (session expirée ou fermée ailleurs). */
export function quandSessionPerdue(fonction) {
    surSessionPerdue = fonction;
}

async function requete(methode, chemin, corps) {
    const options = { method: methode, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (methode !== 'GET') {
        options.headers['X-CSRF-Token'] = jeton ?? '';
    }
    if (corps !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(corps);
    }
    let reponse;
    try {
        reponse = await fetch(base + chemin, options);
    } catch {
        throw new ErreurApi('Le serveur ne répond pas. Vérifiez la connexion puis réessayez.', 0);
    }
    let donnees = null;
    try {
        donnees = await reponse.json();
    } catch {
        // Réponse vide ou non JSON : le message d'erreur générique suffit.
    }
    if (!reponse.ok) {
        const erreur = new ErreurApi(donnees?.erreur ?? `Erreur du serveur (${reponse.status}).`, reponse.status, donnees?.details ?? null);
        if (reponse.status === 401 && chemin !== '/connexion' && chemin !== '/moi') {
            surSessionPerdue();
        }
        throw erreur;
    }
    return donnees;
}

/**
 * Envoi d'un formulaire multipart (fichier) avec suivi de la progression : fetch ne la donne pas,
 * d'où XMLHttpRequest. surProgression reçoit une fraction entre 0 et 1.
 */
export function envoyerFichier(chemin, donnees, surProgression = () => {}) {
    return new Promise((resoudre, rejeter) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', base + chemin);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('X-CSRF-Token', jeton ?? '');
        xhr.responseType = 'json';
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                surProgression(e.loaded / e.total);
            }
        });
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resoudre(xhr.response);
                return;
            }
            if (xhr.status === 401) {
                surSessionPerdue();
            }
            rejeter(new ErreurApi(xhr.response?.erreur ?? `Erreur du serveur (${xhr.status}).`, xhr.status));
        });
        xhr.addEventListener('error', () => rejeter(new ErreurApi('Le serveur ne répond pas. Vérifiez la connexion puis réessayez.', 0)));
        xhr.send(donnees);
    });
}

export const api = {
    get: (chemin) => requete('GET', chemin),
    post: (chemin, corps = {}) => requete('POST', chemin, corps),
    put: (chemin, corps) => requete('PUT', chemin, corps),
    supprimer: (chemin) => requete('DELETE', chemin),
};
