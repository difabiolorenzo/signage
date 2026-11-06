<?php
declare(strict_types=1);

/**
 * Choix de la playlist d'une chaîne à un instant donné, d'après ses plages de programmation.
 *
 * Une plage s'applique si le jour de la semaine est coché, la date dans [date_debut, date_fin]
 * (NULL = sans limite) et l'heure dans [heure_debut, heure_fin[. Entre plages qui s'appliquent,
 * la plus forte priorité l'emporte, puis la plus ancienne. Sans plage : playlist par défaut.
 * Une plage ne passe pas minuit (heure_fin après heure_debut) ; « jusqu'à minuit » s'écrit 24:00:00.
 * Une playlist hors de sa période de validité (valide_du / valide_au) n'est jamais choisie, ni par
 * une plage ni comme playlist par défaut : la plage suivante en priorité prend alors le relais.
 */
final class Programmation
{
    /** Au-delà, prochainChangement() renvoie null : le lecteur interroge de toute façon le serveur. */
    private const HORIZON_JOURS = 7;

    /**
     * @param list<array{playlist_id: int|string, date_debut: ?string, date_fin: ?string,
     *     heure_debut: string, heure_fin: string, jours: int|string, priorite: int|string}> $plages
     * @param array<int, array{0: ?string, 1: ?string}> $validites période [du, au] par playlist ;
     *     une playlist absente est valide sans limite
     */
    public function __construct(private array $plages, private ?int $playlistDefaut, private array $validites = [])
    {
        usort($this->plages, static fn (array $a, array $b): int => (int) $b['priorite'] <=> (int) $a['priorite']);
    }

    /** Identifiant de la playlist à afficher à l'instant $t, ou null. */
    public function playlistA(DateTimeImmutable $t): ?int
    {
        $date = $t->format('Y-m-d');
        $heure = $t->format('H:i:s');
        $bitJour = 1 << ((int) $t->format('N') - 1);

        foreach ($this->plages as $p) {
            if (((int) $p['jours'] & $bitJour) === 0
                || ($p['date_debut'] !== null && $date < $p['date_debut'])
                || ($p['date_fin'] !== null && $date > $p['date_fin'])
                || $heure < self::heure($p['heure_debut'])
                || $heure >= self::heure($p['heure_fin'])
                || !$this->valide((int) $p['playlist_id'], $date)) {
                continue;
            }
            return (int) $p['playlist_id'];
        }
        return $this->playlistDefaut !== null && $this->valide($this->playlistDefaut, $date) ? $this->playlistDefaut : null;
    }

    /** La playlist peut-elle passer à la date $date (AAAA-MM-JJ) ? */
    public function valide(int $playlistId, string $date): bool
    {
        [$du, $au] = $this->validites[$playlistId] ?? [null, null];
        return ($du === null || $date >= $du) && ($au === null || $date <= $au);
    }

    /** Périodes de validité des playlists programmées sur une chaîne, pour le constructeur. */
    public static function validitesChaine(int $chaineId): array
    {
        $validites = [];
        $ids = Bibliotheque::playlistsProgrammees($chaineId);
        if ($ids === []) {
            return [];
        }
        $marques = implode(', ', array_fill(0, count($ids), '?'));
        foreach (Db::lignes("SELECT id, valide_du, valide_au FROM playlists WHERE id IN ($marques)", $ids) as $p) {
            $validites[(int) $p['id']] = [$p['valide_du'], $p['valide_au']];
        }
        return $validites;
    }

    /**
     * Premier instant après $t où la playlist à afficher change, ou null si rien ne change
     * dans les HORIZON_JOURS jours. La playlist ne peut changer qu'à minuit ou au début
     * ou à la fin d'une plage : il suffit d'examiner ces instants dans l'ordre.
     */
    public function prochainChangement(DateTimeImmutable $t): ?DateTimeImmutable
    {
        $actuelle = $this->playlistA($t);
        $instants = [];
        for ($i = 0; $i <= self::HORIZON_JOURS; $i++) {
            $jour = $t->setTime(0, 0)->modify("+$i day");
            $instants[] = $jour;
            foreach ($this->plages as $p) {
                foreach ([$p['heure_debut'], $p['heure_fin']] as $h) {
                    [$hh, $mm, $ss] = array_map('intval', explode(':', self::heure($h)));
                    $instants[] = $jour->setTime($hh, $mm, $ss);
                }
            }
        }
        usort($instants, static fn (DateTimeImmutable $a, DateTimeImmutable $b): int => $a <=> $b);

        foreach ($instants as $instant) {
            if ($instant > $t && $this->playlistA($instant) !== $actuelle) {
                return $instant;
            }
        }
        return null;
    }

    /** « 8:00:00 » ou « 08:00 » → « 08:00:00 », pour comparer les heures comme des chaînes. */
    private static function heure(string $h): string
    {
        $parties = array_map('intval', explode(':', $h)) + [0, 0, 0];
        return sprintf('%02d:%02d:%02d', $parties[0], $parties[1], $parties[2]);
    }
}
