// Écran « Administration » (administrateurs) : réglages globaux (météo, fuseau horaire, taille des
// envois) et sauvegarde de la base. L'API vérifie les droits et chaque valeur.

import { definirPreferences } from '../commun/widgets.js';
import { api } from './api.js';
import { champ } from './dialogue.js';
import { el } from './dom.js';
import { carteFormulaire } from './ecran_compte.js';
import { cartesSauvegarde } from './ecran_sauvegarde.js';
import { ongletsAccueil } from './navigation.js';

const LIBELLES_SERVICES = {
    'open-meteo': 'Open-Meteo, gratuit, sans clé (usage non commercial)',
    'open-meteo-cle': 'Open-Meteo avec clé d\'API (offre commerciale)',
};

function carteMeteo(p, services, enregistrer) {
    const service = el('select', {}, services.map((s) => el('option', { value: s, text: LIBELLES_SERVICES[s] ?? s, selected: s === p.meteo_service })));
    const cle = el('input', { type: 'password', maxlength: 255, autocomplete: 'off', spellcheck: 'false', placeholder: p.meteo_cle_definie ? 'Clé enregistrée' : '' });
    const effacer = el('input', { type: 'checkbox' });
    const unite = el('select', {},
        el('option', { value: '1', text: 'Celsius (°C)', selected: p.meteo_celsius }),
        el('option', { value: '0', text: 'Fahrenheit (°F)', selected: !p.meteo_celsius }));
    const blocCle = el('div', {},
        champ('Clé d\'API', cle, p.meteo_cle_definie
            ? 'Une clé est enregistrée ; elle n\'est jamais réaffichée. Laissez vide pour la garder.'
            : 'Elle reste sur le serveur : les afficheurs passent alors par lui pour obtenir la météo.'),
        p.meteo_cle_definie && el('label', { class: 'case' }, effacer, ' Effacer la clé enregistrée'));
    const majVisibilite = () => { blocCle.hidden = service.value !== 'open-meteo-cle' && !p.meteo_cle_definie; };
    service.addEventListener('change', majVisibilite);
    majVisibilite();

    return carteFormulaire('Météo', [
        champ('Service', service),
        blocCle,
        champ('Unité par défaut des nouveaux widgets', unite, 'Les widgets Météo existants gardent leur unité.'),
    ], 'Enregistrer', async () => {
        const corps = { meteo_service: service.value, meteo_celsius: unite.value === '1' };
        if (effacer.checked) {
            corps.meteo_cle = '';
        } else if (cle.value.trim() !== '') {
            corps.meteo_cle = cle.value.trim();
        }
        await enregistrer(corps);
    });
}

function carteGeneral(p, fuseaux, limitePhpMo, enregistrer) {
    const fuseau = el('select', {}, fuseaux.map((f) => el('option', { value: f, text: f, selected: f === p.fuseau })));
    const envoi = el('input', { type: 'number', required: true, min: 1, max: limitePhpMo > 0 ? limitePhpMo : null, step: 1, value: p.envoi_max_mo });
    return carteFormulaire('Général', [
        champ('Fuseau horaire', fuseau, 'Sert à la programmation des playlists (heures de début et de fin des plages).'),
        champ('Taille maximale d\'un média envoyé (Mo)', envoi, limitePhpMo > 0
            ? `PHP accepte au plus ${limitePhpMo} Mo (upload_max_filesize et post_max_size de php.ini).`
            : null),
    ], 'Enregistrer', async () => {
        await enregistrer({ fuseau: fuseau.value, envoi_max_mo: Number(envoi.value) });
    });
}

export async function afficher(ecran, contexte) {
    document.title = 'Administration — Signage Studio';
    if (!contexte.estAdmin()) {
        ecran.replaceChildren(contexte.cadre({ ...ongletsAccueil(contexte, ''), contenu: el('p', { class: 'erreur', text: 'Réservé aux administrateurs.' }) }));
        return;
    }
    const [r, sauvegarde] = await Promise.all([api.get('/parametres'), cartesSauvegarde(contexte)]);
    const enregistrer = async (corps) => {
        const { parametres } = await api.put('/parametres', corps);
        definirPreferences(parametres);
        contexte.notifier('Réglages enregistrés.');
        afficher(ecran, contexte);
    };

    ecran.replaceChildren(contexte.cadre({
        ...ongletsAccueil(contexte, 'administration'),
        barre: [el('h1', { text: 'Administration' })],
        contenu: [
            el('h2', { class: 'titre-section', text: 'Réglages' }),
            el('div', { class: 'grille-compte' },
                carteMeteo(r.parametres, r.services_meteo, enregistrer),
                carteGeneral(r.parametres, r.fuseaux, r.limite_php_mo, enregistrer)),
            el('h2', { class: 'titre-section', text: 'Sauvegarde de la base' }),
            el('div', { class: 'grille-compte' }, sauvegarde),
        ],
    }));
}
