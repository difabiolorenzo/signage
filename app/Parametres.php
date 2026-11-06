<?php
declare(strict_types=1);

/**
 * Réglages globaux du panneau d'administration (table parametres, clé / valeur). Une clé absente
 * prend sa valeur par défaut, en partie tirée de config/config.php.
 *
 * meteo_cle est secrète : elle ne sort jamais du serveur (ni vers l'éditeur, ni vers le lecteur
 * public, qui passe alors par le relais météo de ControleurPublic).
 */
final class Parametres
{
    public const SERVICES_METEO = ['open-meteo', 'open-meteo-cle'];

    private static ?array $valeurs = null;

    /** @return array<string, string> toutes les valeurs, enregistrées ou par défaut */
    public static function tous(): array
    {
        if (self::$valeurs === null) {
            $enregistres = array_column(Db::lignes('SELECT cle, valeur FROM parametres'), 'valeur', 'cle');
            self::$valeurs = array_intersect_key($enregistres, self::defauts()) + self::defauts();
        }
        return self::$valeurs;
    }

    public static function get(string $cle): string
    {
        return self::tous()[$cle] ?? throw new InvalidArgumentException("Paramètre inconnu : $cle.");
    }

    /** @param array<string, string> $valeurs déjà vérifiées */
    public static function enregistrer(array $valeurs): void
    {
        Db::transaction(static function () use ($valeurs): void {
            foreach ($valeurs as $cle => $valeur) {
                Db::executer(
                    'INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON DUPLICATE KEY UPDATE valeur = VALUES(valeur)',
                    [$cle, $valeur]
                );
            }
        });
        self::$valeurs = null;
    }

    /** Le lecteur passe par le relais du serveur : service à clé, et clé renseignée. */
    public static function meteoRelais(): bool
    {
        return self::get('meteo_service') === 'open-meteo-cle' && self::get('meteo_cle') !== '';
    }

    /** Taille maximale d'un média réglée dans le panneau, en octets. */
    public static function envoiMaxOctets(): int
    {
        return (int) self::get('envoi_max_mo') * 1024 * 1024;
    }

    /** Plus petite des limites de PHP (upload_max_filesize, post_max_size), 0 si aucune. */
    public static function limitePhpOctets(): int
    {
        $octets = static function (string $valeur): int {
            $n = (int) $valeur;
            return match (strtolower(substr(trim($valeur), -1))) {
                'g' => $n * 1024 ** 3,
                'm' => $n * 1024 ** 2,
                'k' => $n * 1024,
                default => $n,
            };
        };
        $limites = array_filter(
            [$octets((string) ini_get('upload_max_filesize')), $octets((string) ini_get('post_max_size'))],
            static fn (int $v): bool => $v > 0
        );
        return $limites === [] ? 0 : min($limites);
    }

    public static function fuseauValide(string $fuseau): bool
    {
        return in_array($fuseau, DateTimeZone::listIdentifiers(), true);
    }

    /** @return array<string, string> */
    private static function defauts(): array
    {
        return [
            'meteo_service' => 'open-meteo',
            'meteo_cle' => '',
            'meteo_celsius' => '1',
            'fuseau' => (string) Config::get('fuseau'),
            'envoi_max_mo' => (string) max(1, intdiv((int) Config::get('envoi_max_octets'), 1024 * 1024)),
        ];
    }
}
