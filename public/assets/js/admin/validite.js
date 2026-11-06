// Période de validité d'une playlist (valide_du / valide_au, null = sans limite) : statut et texte.

const z = (n) => String(n).padStart(2, '0');
const aujourdHui = () => {
    const d = new Date();
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const dateLongue = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const f = (iso) => dateLongue.format(new Date(`${iso}T00:00`));

/** La playlist peut-elle passer à la date iso (AAAA-MM-JJ) ? */
export const valideLe = (p, iso) => Boolean(p) && (!p.valide_du || p.valide_du <= iso) && (!p.valide_au || iso <= p.valide_au);

/** 'a_venir' | 'en_cours' | 'expiree' pour une playlist à période limitée ; null sans limite. */
export function statutValidite(p, iso = aujourdHui()) {
    if (!p?.valide_du && !p?.valide_au) {
        return null;
    }
    if (p.valide_du && iso < p.valide_du) {
        return 'a_venir';
    }
    return p.valide_au && iso > p.valide_au ? 'expiree' : 'en_cours';
}

export const LIBELLES_STATUT = { a_venir: 'À venir', en_cours: 'En cours', expiree: 'Expirée' };

export function periodeValiditeTexte(p) {
    if (p.valide_du && p.valide_au) {
        return `du ${f(p.valide_du)} au ${f(p.valide_au)}`;
    }
    if (p.valide_du) {
        return `à partir du ${f(p.valide_du)}`;
    }
    if (p.valide_au) {
        return `jusqu'au ${f(p.valide_au)}`;
    }
    return 'sans limite';
}
