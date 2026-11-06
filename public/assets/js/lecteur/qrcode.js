// Générateur de code QR (norme ISO/IEC 18004) : mode octets, correction d'erreur M,
// versions 1 à 40. Renvoie une matrice de booléens (true = module foncé), sans marge.

// Codewords de correction par bloc et nombre de blocs, niveau M, indexés par version.
const ECC_PAR_BLOC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const NOMBRE_BLOCS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21,
    23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const BITS_NIVEAU_M = 0;

// --- Corps de Galois GF(256), polynôme 0x11D ---
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
        x ^= 0x11d;
    }
}
for (let i = 255; i < 512; i++) {
    EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Générateur de Reed-Solomon de degré n : coefficients sans le terme de tête. */
function generateur(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
        const suivant = new Array(g.length + 1).fill(0);
        for (let j = 0; j < g.length; j++) {
            suivant[j] ^= g[j];
            suivant[j + 1] ^= mul(g[j], EXP[i]);
        }
        g = suivant;
    }
    return g.slice(1);
}

function reedSolomon(donnees, n) {
    const g = generateur(n);
    const reste = new Array(n).fill(0);
    for (const octet of donnees) {
        const facteur = octet ^ reste.shift();
        reste.push(0);
        for (let i = 0; i < n; i++) {
            reste[i] ^= mul(g[i], facteur);
        }
    }
    return reste;
}

// --- Capacités ---
function positionsAlignement(version) {
    if (version === 1) {
        return [];
    }
    const nombre = Math.floor(version / 7) + 2;
    const pas = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (nombre * 2 - 2)) * 2;
    const positions = [6];
    for (let p = version * 4 + 10; positions.length < nombre; p -= pas) {
        positions.splice(1, 0, p);
    }
    return positions;
}

/** Nombre de modules disponibles pour les données et la correction. */
function modulesDonnees(version) {
    let n = (16 * version + 128) * version + 64;
    if (version >= 2) {
        const a = Math.floor(version / 7) + 2;
        n -= (25 * a - 10) * a - 55;
        if (version >= 7) {
            n -= 36;
        }
    }
    return n;
}

const codewordsDonnees = (v) => Math.floor(modulesDonnees(v) / 8) - ECC_PAR_BLOC[v] * NOMBRE_BLOCS[v];

// --- Encodage ---
function encoder(octets) {
    let version = 1;
    for (; version <= 40; version++) {
        const bitsLongueur = version < 10 ? 8 : 16;
        if (4 + bitsLongueur + octets.length * 8 <= codewordsDonnees(version) * 8) {
            break;
        }
    }
    if (version > 40) {
        throw new Error('Texte trop long pour un code QR.');
    }
    const capacite = codewordsDonnees(version) * 8;
    const bits = [];
    const ajouter = (valeur, n) => {
        for (let i = n - 1; i >= 0; i--) {
            bits.push((valeur >>> i) & 1);
        }
    };
    ajouter(0b0100, 4);
    ajouter(octets.length, version < 10 ? 8 : 16);
    octets.forEach((o) => ajouter(o, 8));
    ajouter(0, Math.min(4, capacite - bits.length));
    ajouter(0, (8 - (bits.length % 8)) % 8);
    for (let remplissage = 0xec; bits.length < capacite; remplissage ^= 0xec ^ 0x11) {
        ajouter(remplissage, 8);
    }
    const donnees = [];
    for (let i = 0; i < bits.length; i += 8) {
        donnees.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    }
    return { version, codewords: entrelacer(donnees, version) };
}

/** Découpe en blocs, ajoute la correction de chaque bloc, puis entrelace. */
function entrelacer(donnees, version) {
    const nombreBlocs = NOMBRE_BLOCS[version];
    const ecc = ECC_PAR_BLOC[version];
    const total = Math.floor(modulesDonnees(version) / 8);
    const courts = nombreBlocs - (total % nombreBlocs);
    const longueurCourte = Math.floor(total / nombreBlocs) - ecc;

    const blocs = [];
    for (let i = 0, k = 0; i < nombreBlocs; i++) {
        const longueur = longueurCourte + (i < courts ? 0 : 1);
        const bloc = donnees.slice(k, k + longueur);
        k += longueur;
        blocs.push({ donnees: bloc, ecc: reedSolomon(bloc, ecc) });
    }
    const resultat = [];
    for (let i = 0; i <= longueurCourte; i++) {
        for (const b of blocs) {
            if (i < b.donnees.length) {
                resultat.push(b.donnees[i]);
            }
        }
    }
    for (let i = 0; i < ecc; i++) {
        for (const b of blocs) {
            resultat.push(b.ecc[i]);
        }
    }
    return resultat;
}

// --- Matrice ---
const MASQUES = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function construire(version, codewords, masque) {
    const taille = version * 4 + 17;
    const m = Array.from({ length: taille }, () => new Array(taille).fill(false));
    const fonction = Array.from({ length: taille }, () => new Array(taille).fill(false));
    const poser = (x, y, fonce) => {
        m[y][x] = fonce;
        fonction[y][x] = true;
    };

    for (let i = 0; i < taille; i++) {
        poser(6, i, i % 2 === 0);
        poser(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [taille - 4, 3], [3, taille - 4]]) {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const x = cx + dx;
                const y = cy + dy;
                if (x >= 0 && x < taille && y >= 0 && y < taille) {
                    const d = Math.max(Math.abs(dx), Math.abs(dy));
                    poser(x, y, d !== 2 && d !== 4);
                }
            }
        }
    }
    const alignements = positionsAlignement(version);
    const dernier = alignements.length - 1;
    alignements.forEach((ax, i) => alignements.forEach((ay, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === dernier) || (i === dernier && j === 0)) {
            return;
        }
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                poser(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
        }
    }));

    // Informations de format (niveau + masque), protégées par un code BCH.
    const format = (BITS_NIVEAU_M << 3) | masque;
    let reste = format;
    for (let i = 0; i < 10; i++) {
        reste = (reste << 1) ^ ((reste >>> 9) * 0x537);
    }
    const bitsFormat = ((format << 10) | reste) ^ 0x5412;
    const bit = (valeur, i) => ((valeur >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) {
        poser(8, i, bit(bitsFormat, i));
    }
    poser(8, 7, bit(bitsFormat, 6));
    poser(8, 8, bit(bitsFormat, 7));
    poser(7, 8, bit(bitsFormat, 8));
    for (let i = 9; i < 15; i++) {
        poser(14 - i, 8, bit(bitsFormat, i));
    }
    for (let i = 0; i < 8; i++) {
        poser(taille - 1 - i, 8, bit(bitsFormat, i));
    }
    for (let i = 8; i < 15; i++) {
        poser(8, taille - 15 + i, bit(bitsFormat, i));
    }
    poser(8, taille - 8, true);

    // Informations de version (version 7 et au-delà).
    if (version >= 7) {
        let r = version;
        for (let i = 0; i < 12; i++) {
            r = (r << 1) ^ ((r >>> 11) * 0x1f25);
        }
        const bitsVersion = (version << 12) | r;
        for (let i = 0; i < 18; i++) {
            const a = taille - 11 + (i % 3);
            const b = Math.floor(i / 3);
            poser(a, b, bit(bitsVersion, i));
            poser(b, a, bit(bitsVersion, i));
        }
    }

    // Données en zigzag, par colonnes de deux modules, de droite à gauche.
    const masquer = MASQUES[masque];
    let i = 0;
    for (let droite = taille - 1; droite >= 1; droite -= 2) {
        if (droite === 6) {
            droite = 5;
        }
        for (let v = 0; v < taille; v++) {
            for (let j = 0; j < 2; j++) {
                const x = droite - j;
                const montant = ((droite + 1) & 2) === 0;
                const y = montant ? taille - 1 - v : v;
                if (!fonction[y][x]) {
                    const fonce = i < codewords.length * 8 && bit(codewords[i >>> 3], 7 - (i & 7));
                    m[y][x] = fonce !== masquer(x, y);
                    i++;
                }
            }
        }
    }
    return m;
}

/** Pénalité simplifiée (suites de 5 modules et plus, carrés 2 × 2, équilibre) pour choisir le masque. */
function penalite(m) {
    const n = m.length;
    let p = 0;
    let fonces = 0;
    for (let a = 0; a < n; a++) {
        let suiteL = 1;
        let suiteC = 1;
        for (let b = 0; b < n; b++) {
            if (m[a][b]) {
                fonces++;
            }
            if (b > 0) {
                suiteL = m[a][b] === m[a][b - 1] ? suiteL + 1 : 1;
                suiteC = m[b][a] === m[b - 1][a] ? suiteC + 1 : 1;
                p += (suiteL === 5 ? 3 : suiteL > 5 ? 1 : 0) + (suiteC === 5 ? 3 : suiteC > 5 ? 1 : 0);
            }
            if (a > 0 && b > 0) {
                const c = m[a][b];
                if (c === m[a - 1][b] && c === m[a][b - 1] && c === m[a - 1][b - 1]) {
                    p += 3;
                }
            }
        }
    }
    return p + Math.floor(Math.abs(fonces * 20 - n * n * 10) / (n * n)) * 10;
}

/** Matrice du code QR de `texte` (encodé en UTF-8). */
export function codeQR(texte) {
    const { version, codewords } = encoder([...new TextEncoder().encode(String(texte))]);
    let meilleure = null;
    let meilleurePenalite = Infinity;
    for (let masque = 0; masque < 8; masque++) {
        const m = construire(version, codewords, masque);
        const p = penalite(m);
        if (p < meilleurePenalite) {
            meilleure = m;
            meilleurePenalite = p;
        }
    }
    return meilleure;
}
