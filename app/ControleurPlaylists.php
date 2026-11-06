<?php
declare(strict_types=1);

/**
 * Playlists de la bibliothèque partagée. Visibles et modifiables selon Droits (auteur,
 * administrateurs, portée) ; une playlist passe sur une chaîne par la programmation de celle-ci.
 * Toute modification incrémente la version des chaînes qui la programment, ce qui fait
 * recharger l'affichage de leurs lecteurs.
 */
final class ControleurPlaylists
{
    /** Nom de disposition accepté : celles de dispositions.js, ou la grille personnalisée. */
    private const MOTIF_DISPOSITION = '/^(Landscape [1-9][0-9]?|Portrait [1-9][0-9]?|Personnalisé|Personnalisé portrait)$/u';
    private const REGIONS_MAX = 64;

    /** Même règle que estDispositionPortrait() de dispositions.js. */
    public static function estPortrait(string $disposition): bool
    {
        return str_starts_with($disposition, 'Portrait') || $disposition === 'Personnalisé portrait';
    }

    public static function orientation(string $disposition): string
    {
        return self::estPortrait($disposition) ? 'portrait' : 'paysage';
    }

    /**
     * GET /api/playlists?chaine=&programmable=&auteur=&portee=&orientation= : playlists visibles.
     * chaine : celles ouvertes à cette chaîne ou programmées sur elle ; programmable : celles que
     * l'utilisateur peut ajouter à la programmation de cette chaîne ; portee : globale, restreinte
     * ou privee (restreinte sans aucun accès) ; orientation : paysage ou portrait.
     */
    public static function liste(): never
    {
        $u = Auth::exigerConnexion();
        $chaine = self::filtreId('chaine');
        $programmable = self::filtreId('programmable');
        $auteur = self::filtreId('auteur');
        $portee = $_GET['portee'] ?? null;
        $orientation = $_GET['orientation'] ?? null;
        foreach (array_filter([$chaine, $programmable]) as $c) {
            Droits::exigerChaine($u, $c);
        }

        [$visible, $params] = Droits::sqlVisible('playlist', $u);
        $lignes = Db::lignes(
            'SELECT o.id, o.nom, o.disposition, o.regions, o.pages, o.valide_du, o.valide_au, o.modifie_le,
                    o.auteur_id, o.portee, ' . Bibliotheque::sqlNom('m') . ' AS modifie_par, ' . Bibliotheque::sqlNom('a') . " AS auteur
             FROM playlists o
             LEFT JOIN utilisateurs m ON m.id = o.modifie_par
             LEFT JOIN utilisateurs a ON a.id = o.auteur_id
             WHERE $visible ORDER BY o.nom, o.id",
            $params
        );
        $ids = array_map(static fn (array $p): int => (int) $p['id'], $lignes);
        $acces = Bibliotheque::acces('playlist', $ids);
        $programmant = Bibliotheque::chainesProgrammant($ids);
        $noms = Bibliotheque::noms($acces);
        $defaut = $chaine === null ? null : Db::valeur('SELECT playlist_defaut_id FROM chaines WHERE id = ?', [$chaine]);

        $playlists = [];
        foreach ($lignes as $p) {
            $id = (int) $p['id'];
            $a = $acces[$id];
            $utilisee = $programmant[$id] ?? [];
            if (($chaine !== null && !in_array($chaine, $a['chaines'], true) && !isset($utilisee[$chaine]))
                || ($programmable !== null && !isset($utilisee[$programmable]) && !Droits::peutProgrammer($u, $p, $a, $programmable))
                || ($auteur !== null && (int) $p['auteur_id'] !== $auteur)
                || ($portee !== null && $portee !== self::porteeAffichee($p['portee'], $a))
                || ($orientation !== null && $orientation !== self::orientation($p['disposition']))) {
                continue;
            }
            $pages = Pages::lire((string) $p['pages'], $id);
            $playlists[] = self::publier($p, $a, $noms, $utilisee, $u) + [
                'regions' => json_decode((string) $p['regions'], true) ?: [],
                'nb_pages' => count($pages),
                'duree' => array_sum(array_map(static fn ($pg): int => (int) ($pg['duree'] ?? 0), $pages)),
                'par_defaut' => $defaut !== null && (int) $defaut === $id,
            ];
        }
        Reponse::json(['playlists' => $playlists]);
    }

    /**
     * GET /api/playlists/{id} : la playlist complète pour l'éditeur de pages, avec les médias que
     * l'utilisateur peut insérer et ceux qu'elle utilise déjà (accessible: false s'il ne les voit pas).
     */
    public static function lire(int $playlistId): never
    {
        $u = Auth::exigerConnexion();
        $p = Droits::exigerObjet($u, 'playlist', $playlistId, 'voir');
        $pages = Pages::lire((string) $p['pages'], $playlistId);
        $infos = Db::ligne(
            'SELECT ' . Bibliotheque::sqlNom('m') . ' AS modifie_par, ' . Bibliotheque::sqlNom('a') . ' AS auteur
             FROM playlists o LEFT JOIN utilisateurs m ON m.id = o.modifie_par LEFT JOIN utilisateurs a ON a.id = o.auteur_id
             WHERE o.id = ?',
            [$playlistId]
        );

        $visibles = ControleurMedias::visibles($u);
        $utilises = Pages::medias($pages);
        $manquants = array_values(array_diff($utilises, array_keys($visibles)));
        $medias = array_map(static fn (array $m): array => $m + ['accessible' => true], array_values($visibles));
        if ($manquants !== []) {
            $marques = implode(', ', array_fill(0, count($manquants), '?'));
            foreach (Db::lignes('SELECT ' . ControleurMedias::COLONNES_RESUME . " FROM medias o WHERE o.id IN ($marques)", $manquants) as $m) {
                $medias[] = ControleurMedias::resume($m) + ['accessible' => false];
            }
        }

        $noms = Bibliotheque::noms([$p['acces']]);
        $utilisee = Bibliotheque::chainesProgrammant([$playlistId])[$playlistId] ?? [];
        Reponse::json([
            'playlist' => self::publier($infos + $p,$p['acces'], $noms, $utilisee, $u) + [
                'portrait' => self::estPortrait($p['disposition']),
                'regions' => json_decode((string) $p['regions'], true) ?: [],
                'pages' => $pages,
            ],
            'medias' => $medias,
        ]);
    }

    /**
     * PUT /api/playlists/{id} { nom, pages, disposition?, regions?, valide_du?, valide_au? } :
     * disposition et régions sont envoyées ensemble quand la grille change ; les pages ont alors un
     * widget par nouvelle région. Période de validité : dates AAAA-MM-JJ ou null (sans limite).
     * Règles vérifiées par Pages::verifier (au moins une page, un YouTube par page…).
     */
    public static function enregistrer(int $playlistId): never
    {
        $u = Auth::exigerConnexion();
        $p = Droits::exigerObjet($u, 'playlist', $playlistId, 'modifier');
        $corps = Requete::json();
        $nom = self::nom($corps['nom'] ?? null);
        $disposition = $p['disposition'];
        $regions = json_decode((string) $p['regions'], true) ?: [];
        if (isset($corps['disposition']) || isset($corps['regions'])) {
            $disposition = self::disposition($corps['disposition'] ?? null);
            $regions = self::regions($corps['regions'] ?? null);
        }
        if (self::orientation($disposition) !== self::orientation($p['disposition'])) {
            self::verifierOrientation($playlistId, self::orientation($disposition));
        }
        $validiteDu = array_key_exists('valide_du', $corps) ? self::date($corps['valide_du'], 'Début de la période') : $p['valide_du'];
        $validiteAu = array_key_exists('valide_au', $corps) ? self::date($corps['valide_au'], 'Fin de la période') : $p['valide_au'];
        if ($validiteDu !== null && $validiteAu !== null && $validiteAu < $validiteDu) {
            Reponse::erreur('La fin de la période précède son début.', 400);
        }
        // Médias autorisés : ceux que l'utilisateur voit, et ceux que la playlist utilisait déjà
        // (insérés par quelqu'un qui y avait accès).
        $autorises = array_values(array_unique(array_merge(
            array_keys(ControleurMedias::visibles($u)),
            Pages::medias(Pages::lire((string) $p['pages'], $playlistId))
        )));
        $pages = Pages::verifier($corps['pages'] ?? null, count($regions), $autorises);

        Db::transaction(static function () use ($playlistId, $nom, $disposition, $regions, $pages, $validiteDu, $validiteAu, $u): void {
            Db::executer(
                'UPDATE playlists SET nom = ?, disposition = ?, regions = ?, pages = ?, valide_du = ?, valide_au = ?, modifie_par = ?
                 WHERE id = ?',
                [$nom, $disposition, json_encode($regions), Pages::document($pages), $validiteDu, $validiteAu, $u['id'], $playlistId]
            );
            Bibliotheque::chainesModifiees($playlistId);
        });
        Reponse::json(['ok' => true]);
    }

    /**
     * POST /api/playlists { nom, disposition, regions, chaine? } : une page de widgets vides.
     * Avec chaine (où l'utilisateur a un droit) : restreinte à cette chaîne ; sinon privée.
     */
    public static function creer(): never
    {
        $u = Auth::exigerConnexion();
        $corps = Requete::json();
        $chaine = self::chaineCible($u, $corps['chaine'] ?? null);
        $nom = self::nom($corps['nom'] ?? null);
        $disposition = self::disposition($corps['disposition'] ?? null);
        $regions = self::regions($corps['regions'] ?? null);
        $pages = [[
            'duree' => 30,
            'fond' => '#000000',
            'widgets' => array_fill(0, count($regions), ['type' => 'vide']),
        ]];
        $id = Db::transaction(static function () use ($chaine, $nom, $disposition, $regions, $pages, $u): int {
            Db::executer(
                'INSERT INTO playlists (nom, disposition, regions, pages, modifie_par, auteur_id) VALUES (?, ?, ?, ?, ?, ?)',
                [$nom, $disposition, json_encode($regions), Pages::document($pages), $u['id'], $u['id']]
            );
            $id = Db::dernierId();
            Bibliotheque::ecrireAcces('playlist', $id, $chaine === null ? [] : [$chaine], []);
            return $id;
        });
        Reponse::json(['id' => $id], 201);
    }

    /** POST /api/playlists/{id}/duplication { nom?, chaine? } : copie dont on est l'auteur, portée comme à la création. */
    public static function dupliquer(int $playlistId): never
    {
        $u = Auth::exigerConnexion();
        $p = Droits::exigerObjet($u, 'playlist', $playlistId, 'voir');
        $corps = Requete::json();
        $chaine = self::chaineCible($u, $corps['chaine'] ?? null);
        $nom = isset($corps['nom']) ? self::nom($corps['nom']) : mb_substr($p['nom'], 0, 92) . ' (copie)';
        $id = Db::transaction(static function () use ($chaine, $nom, $p, $u): int {
            Db::executer(
                'INSERT INTO playlists (nom, disposition, regions, pages, valide_du, valide_au, modifie_par, auteur_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$nom, $p['disposition'], $p['regions'], $p['pages'], $p['valide_du'], $p['valide_au'], $u['id'], $u['id']]
            );
            $id = Db::dernierId();
            Bibliotheque::ecrireAcces('playlist', $id, $chaine === null ? [] : [$chaine], []);
            return $id;
        });
        Reponse::json(['id' => $id], 201);
    }

    /**
     * DELETE /api/playlists/{id}[?confirmer=1] : ses plages de programmation partent avec elle.
     * Programmée sur une chaîne que l'utilisateur ne gère pas : refusé (409). Programmée ailleurs
     * seulement sur ses chaînes : 409 avec details.confirmation tant que confirmer=1 n'est pas passé.
     */
    public static function supprimer(int $playlistId): never
    {
        $u = Auth::exigerConnexion();
        Droits::exigerObjet($u, 'playlist', $playlistId, 'modifier');
        $chaines = Bibliotheque::chainesProgrammant([$playlistId])[$playlistId] ?? [];
        if ($chaines !== []) {
            $liste = implode(', ', $chaines);
            $horsDroits = array_filter(array_keys($chaines), static fn (int $c): bool => !Droits::peutModifier($u, $c));
            if ($horsDroits !== []) {
                Reponse::erreur("Cette playlist est programmée sur des chaînes que vous ne gérez pas ($liste) : demandez à leurs éditeurs ou à un administrateur de l'en retirer.", 409);
            }
            if (($_GET['confirmer'] ?? null) !== '1') {
                Reponse::erreur("Cette playlist est programmée sur : $liste.", 409, ['confirmation' => true, 'chaines' => array_values($chaines)]);
            }
        }
        Db::transaction(static function () use ($playlistId, $chaines): void {
            if ($chaines !== []) {
                $marques = implode(', ', array_fill(0, count($chaines), '?'));
                Db::executer("UPDATE chaines SET version = version + 1 WHERE id IN ($marques)", array_keys($chaines));
            }
            Db::executer('DELETE FROM playlists WHERE id = ?', [$playlistId]);
        });
        Reponse::json(['ok' => true]);
    }

    /**
     * Champs communs à la liste et au détail.
     *
     * @param array<int, string> $utilisee chaînes qui programment la playlist
     */
    private static function publier(array $p, array $acces, array $noms, array $utilisee, array $u): array
    {
        return [
            'id' => (int) $p['id'],
            'nom' => $p['nom'],
            'disposition' => $p['disposition'],
            'orientation' => self::orientation($p['disposition']),
            'valide_du' => $p['valide_du'],
            'valide_au' => $p['valide_au'],
            'modifie_le' => $p['modifie_le'],
            'modifie_par' => $p['modifie_par'],
            'auteur' => $p['auteur_id'] === null ? null : ['id' => (int) $p['auteur_id'], 'nom' => $p['auteur']],
            'portee' => self::porteeAffichee($p['portee'], $acces),
            'acces' => Bibliotheque::accesPublies($acces, $noms),
            'utilisee_par' => array_map(static fn (int $id, string $nom): array => ['id' => $id, 'nom' => $nom], array_keys($utilisee), $utilisee),
            'modifiable' => Droits::peutModifierObjet($u, $p),
        ];
    }

    /** « globale », « restreinte », ou « privee » (restreinte sans aucun accès). */
    public static function porteeAffichee(string $portee, array $acces): string
    {
        return $portee === 'restreinte' && $acces['chaines'] === [] && $acces['utilisateurs'] === [] ? 'privee' : $portee;
    }

    /** Refus (409) si la playlist est programmée sur une chaîne d'une autre orientation que $orientation. */
    private static function verifierOrientation(int $playlistId, string $orientation): void
    {
        $chaines = array_keys(Bibliotheque::chainesProgrammant([$playlistId])[$playlistId] ?? []);
        if ($chaines === []) {
            return;
        }
        $marques = implode(', ', array_fill(0, count($chaines), '?'));
        $autres = array_column(Db::lignes("SELECT nom FROM chaines WHERE orientation <> ? AND id IN ($marques) ORDER BY nom", [$orientation, ...$chaines]), 'nom');
        if ($autres !== []) {
            Reponse::erreur('Cette playlist est programmée sur des chaînes en ' . ($orientation === 'portrait' ? 'paysage' : 'portrait')
                . ' (' . implode(', ', $autres) . ') : retirez-la de leur programmation avant de changer d\'orientation.', 409);
        }
    }

    /** Chaîne demandée à la création ou à la duplication : null, ou une chaîne où l'utilisateur a un droit. */
    private static function chaineCible(array $u, mixed $valeur): ?int
    {
        if ($valeur === null) {
            return null;
        }
        if (!is_int($valeur)) {
            Reponse::erreur('chaine : identifiant attendu.', 400);
        }
        Droits::exigerChaine($u, $valeur);
        return $valeur;
    }

    private static function filtreId(string $nom): ?int
    {
        $valeur = $_GET[$nom] ?? null;
        if ($valeur === null || $valeur === '') {
            return null;
        }
        if (!is_string($valeur) || !preg_match('/^[1-9][0-9]{0,9}$/', $valeur)) {
            Reponse::erreur("Filtre $nom : identifiant attendu.", 400);
        }
        return (int) $valeur;
    }

    private static function nom(mixed $valeur): string
    {
        $nom = trim((string) $valeur);
        if ($nom === '' || mb_strlen($nom) > 100) {
            Reponse::erreur('Nom de la playlist : 1 à 100 caractères.', 400);
        }
        return $nom;
    }

    /** Date AAAA-MM-JJ, ou null pour « sans limite ». */
    private static function date(mixed $valeur, string $libelle): ?string
    {
        if ($valeur === null || $valeur === '') {
            return null;
        }
        $d = is_string($valeur) ? DateTimeImmutable::createFromFormat('!Y-m-d', $valeur) : false;
        if ($d === false || $d->format('Y-m-d') !== $valeur) {
            Reponse::erreur("$libelle : date invalide (AAAA-MM-JJ attendu).", 400);
        }
        return $valeur;
    }

    private static function disposition(mixed $valeur): string
    {
        $disposition = (string) $valeur;
        if (!preg_match(self::MOTIF_DISPOSITION, $disposition)) {
            Reponse::erreur('Disposition inconnue.', 400);
        }
        return $disposition;
    }

    /** Régions [x, y, largeur, hauteur] en fractions de l'écran, contenues dans l'écran. */
    private static function regions(mixed $regions): array
    {
        if (!is_array($regions) || !array_is_list($regions) || $regions === [] || count($regions) > self::REGIONS_MAX) {
            Reponse::erreur('Régions : 1 à ' . self::REGIONS_MAX . ' régions attendues.', 400);
        }
        $propres = [];
        foreach ($regions as $r) {
            $valide = is_array($r) && array_is_list($r) && count($r) === 4
                && array_reduce($r, static fn (bool $ok, $v): bool => $ok && (is_int($v) || is_float($v)), true);
            if ($valide) {
                [$x, $y, $l, $h] = array_map(static fn ($v): float => round((float) $v, 6), $r);
                $valide = $x >= 0 && $y >= 0 && $l > 0 && $h > 0 && $x + $l <= 1.000001 && $y + $h <= 1.000001;
            }
            if (!$valide) {
                Reponse::erreur('Régions : chaque région est [x, y, largeur, hauteur], comprise dans l\'écran.', 400);
            }
            $propres[] = [$x, $y, $l, $h];
        }
        return $propres;
    }
}
