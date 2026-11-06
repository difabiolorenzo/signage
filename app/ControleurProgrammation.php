<?php
declare(strict_types=1);

/**
 * Programmation d'une chaîne : playlist par défaut et plages horaires, lues et remplacées en
 * bloc (droit sur la chaîne requis). Le choix de la playlist en cours est fait par Programmation.
 */
final class ControleurProgrammation
{
    private const PLAGES_MAX = 200;

    /** GET /api/chaines/{id}/programmation */
    public static function lire(int $chaineId): never
    {
        Droits::exigerChaine(Auth::exigerConnexion(), $chaineId);
        $defaut = Db::valeur('SELECT playlist_defaut_id FROM chaines WHERE id = ?', [$chaineId]);
        $lignes = Db::lignes(
            'SELECT id, playlist_id, date_debut, date_fin, heure_debut, heure_fin, jours, priorite
             FROM programmations WHERE chaine_id = ? ORDER BY priorite DESC, id',
            [$chaineId]
        );
        $programmation = new Programmation($lignes, $defaut === null ? null : (int) $defaut);
        $maintenant = new DateTimeImmutable();

        Reponse::json([
            'playlist_defaut_id' => $defaut === null ? null : (int) $defaut,
            'plages' => array_map(static fn (array $p): array => [
                'id' => (int) $p['id'],
                'playlist_id' => (int) $p['playlist_id'],
                'date_debut' => $p['date_debut'],
                'date_fin' => $p['date_fin'],
                'heure_debut' => substr((string) $p['heure_debut'], 0, 5),
                'heure_fin' => substr((string) $p['heure_fin'], 0, 5),
                'jours' => (int) $p['jours'],
                'priorite' => (int) $p['priorite'],
            ], $lignes),
            'maintenant' => [
                'instant' => $maintenant->format(DATE_ATOM),
                'playlist_id' => $programmation->playlistA($maintenant),
                'prochain_changement' => $programmation->prochainChangement($maintenant)?->format(DATE_ATOM),
            ],
        ]);
    }

    /**
     * PUT /api/chaines/{id}/programmation { playlist_defaut_id, plages: [{ playlist_id, date_debut,
     * date_fin, heure_debut, heure_fin, jours, priorite }] } : remplace toute la programmation.
     */
    public static function remplacer(int $chaineId): never
    {
        Droits::exigerChaine(Auth::exigerConnexion(), $chaineId);
        $corps = Requete::json();
        $playlists = array_map('intval', array_column(Db::lignes('SELECT id FROM playlists WHERE chaine_id = ?', [$chaineId]), 'id'));

        $defaut = $corps['playlist_defaut_id'] ?? null;
        if ($defaut !== null && (!is_int($defaut) || !in_array($defaut, $playlists, true))) {
            Reponse::erreur('Playlist par défaut introuvable dans cette chaîne.', 400);
        }
        $plages = $corps['plages'] ?? null;
        if (!is_array($plages) || !array_is_list($plages) || count($plages) > self::PLAGES_MAX) {
            Reponse::erreur('Plages : liste de ' . self::PLAGES_MAX . ' plages au plus attendue.', 400);
        }
        $propres = [];
        foreach ($plages as $i => $p) {
            $propres[] = self::plage($p, $i + 1, $playlists);
        }

        Db::transaction(static function () use ($chaineId, $defaut, $propres): void {
            Db::executer('DELETE FROM programmations WHERE chaine_id = ?', [$chaineId]);
            foreach ($propres as $p) {
                Db::executer(
                    'INSERT INTO programmations (chaine_id, playlist_id, date_debut, date_fin, heure_debut, heure_fin, jours, priorite)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [$chaineId, $p['playlist_id'], $p['date_debut'], $p['date_fin'], $p['heure_debut'], $p['heure_fin'], $p['jours'], $p['priorite']]
                );
            }
            Db::executer('UPDATE chaines SET playlist_defaut_id = ?, version = version + 1 WHERE id = ?', [$defaut, $chaineId]);
        });
        self::lire($chaineId);
    }

    /** Plage vérifiée ; réponse 400 avec le numéro de la plage sinon. */
    private static function plage(mixed $p, int $n, array $playlists): array
    {
        $erreur = static function (string $message) use ($n): never {
            Reponse::erreur("Plage $n : $message", 400);
        };
        if (!is_array($p)) {
            $erreur('format invalide.');
        }
        $playlist = $p['playlist_id'] ?? null;
        if (!is_int($playlist) || !in_array($playlist, $playlists, true)) {
            $erreur('playlist introuvable dans cette chaîne.');
        }
        $date = static function (mixed $v) use ($erreur): ?string {
            if ($v === null || $v === '') {
                return null;
            }
            $d = is_string($v) ? DateTimeImmutable::createFromFormat('!Y-m-d', $v) : false;
            if ($d === false || $d->format('Y-m-d') !== $v) {
                $erreur('date invalide (AAAA-MM-JJ attendu).');
            }
            return $v;
        };
        $debut = $date($p['date_debut'] ?? null);
        $fin = $date($p['date_fin'] ?? null);
        if ($debut !== null && $fin !== null && $fin < $debut) {
            $erreur('la date de fin précède la date de début.');
        }
        $heure = static function (mixed $v) use ($erreur): string {
            if (!is_string($v) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/', $v)) {
                $erreur('heure invalide (HH:MM attendu, 24:00 pour minuit en fin de journée).');
            }
            return $v . ':00';
        };
        $heureDebut = $heure($p['heure_debut'] ?? null);
        $heureFin = $heure($p['heure_fin'] ?? null);
        if ($heureDebut === '24:00:00' || $heureFin <= $heureDebut) {
            $erreur("l'heure de fin doit suivre l'heure de début (une plage ne passe pas minuit).");
        }
        $jours = $p['jours'] ?? null;
        if (!is_int($jours) || $jours < 1 || $jours > 127) {
            $erreur('cochez au moins un jour.');
        }
        $priorite = $p['priorite'] ?? 0;
        if (!is_int($priorite) || $priorite < -1000 || $priorite > 1000) {
            $erreur('priorité entre -1000 et 1000.');
        }
        return [
            'playlist_id' => $playlist, 'date_debut' => $debut, 'date_fin' => $fin,
            'heure_debut' => $heureDebut, 'heure_fin' => $heureFin, 'jours' => $jours, 'priorite' => $priorite,
        ];
    }
}
