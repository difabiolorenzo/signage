<?php
declare(strict_types=1);

/**
 * Météo par l'offre à clé d'API d'Open-Meteo, pour le relais de ControleurPublic::meteo. Renvoie
 * les données sous la forme qu'attend le widget du lecteur (lecteur/widgets/meteo.js).
 * Les adresses appelées contiennent la clé : elles ne doivent jamais apparaître dans un message.
 */
final class RelaisMeteo
{
    private const GEOCODAGE = 'https://customer-geocoding-api.open-meteo.com/v1/search';
    private const PREVISIONS = 'https://customer-api.open-meteo.com/v1/forecast';

    /** @return array{lieu: string, actuel: array, jours: list<array>} */
    public static function previsions(string $ville, bool $celsius, int $jours, string $cle): array
    {
        $lieu = self::position($ville, $cle);
        $r = self::json(self::PREVISIONS . '?' . http_build_query([
            'latitude' => $lieu['latitude'],
            'longitude' => $lieu['longitude'],
            'current' => 'temperature_2m,weather_code,is_day',
            'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
            'forecast_days' => $jours,
            'temperature_unit' => $celsius ? 'celsius' : 'fahrenheit',
            'timezone' => 'auto',
            'apikey' => $cle,
        ]));
        $actuel = is_array($r['current'] ?? null) ? $r['current'] : throw new RuntimeException('Réponse sans temps actuel.');
        $d = is_array($r['daily'] ?? null) ? $r['daily'] : [];
        $resultat = [
            'lieu' => $lieu['nom'],
            'actuel' => ['temperature' => $actuel['temperature_2m'] ?? null, 'code' => $actuel['weather_code'] ?? null, 'jour' => ($actuel['is_day'] ?? 1) !== 0],
            'jours' => [],
        ];
        foreach (is_array($d['time'] ?? null) ? $d['time'] : [] as $i => $date) {
            $resultat['jours'][] = [
                'date' => $date,
                'code' => $d['weather_code'][$i] ?? null,
                'max' => $d['temperature_2m_max'][$i] ?? null,
                'min' => $d['temperature_2m_min'][$i] ?? null,
                'pluie' => $d['precipitation_probability_max'][$i] ?? null,
            ];
        }
        return $resultat;
    }

    /** Coordonnées d'une ville, gardées 30 jours dans le dossier temporaire. */
    private static function position(string $ville, string $cle): array
    {
        $cache = sys_get_temp_dir() . '/signage-meteo-lieu-' . sha1(mb_strtolower($ville)) . '.json';
        if (is_file($cache) && filemtime($cache) > time() - 30 * 86400) {
            $lieu = json_decode((string) file_get_contents($cache), true);
            if (is_array($lieu)) {
                return $lieu;
            }
        }
        $r = self::json(self::GEOCODAGE . '?' . http_build_query(['name' => $ville, 'count' => 1, 'language' => 'fr', 'format' => 'json', 'apikey' => $cle]));
        $trouve = $r['results'][0] ?? null;
        if (!is_array($trouve) || !is_numeric($trouve['latitude'] ?? null) || !is_numeric($trouve['longitude'] ?? null)) {
            throw new RuntimeException('Ville inconnue du service.');
        }
        $lieu = ['latitude' => (float) $trouve['latitude'], 'longitude' => (float) $trouve['longitude'], 'nom' => (string) ($trouve['name'] ?? $ville)];
        file_put_contents($cache, json_encode($lieu, JSON_UNESCAPED_UNICODE), LOCK_EX);
        return $lieu;
    }

    private static function json(string $url): array
    {
        $r = json_decode(RelaisRss::telecharger($url), true);
        return is_array($r) ? $r : throw new RuntimeException('Réponse illisible (JSON invalide).');
    }
}
