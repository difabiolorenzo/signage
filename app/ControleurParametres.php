<?php
declare(strict_types=1);

/** Réglages globaux (panneau d'administration). La clé d'API météo n'est jamais renvoyée. */
final class ControleurParametres
{
    /**
     * GET /api/parametres : tous les réglages pour un administrateur (avec les limites de PHP et
     * la liste des fuseaux) ; pour un éditeur, seulement ce dont l'éditeur de playlist a besoin.
     */
    public static function lire(): never
    {
        $u = Auth::exigerConnexion();
        $p = Parametres::tous();
        if (!Droits::estAdmin($u)) {
            Reponse::json(['parametres' => ['meteo_celsius' => $p['meteo_celsius'] === '1']]);
        }
        Reponse::json([
            'parametres' => self::publier($p),
            'limite_php_mo' => intdiv(Parametres::limitePhpOctets(), 1024 * 1024),
            'fuseaux' => DateTimeZone::listIdentifiers(),
            'services_meteo' => Parametres::SERVICES_METEO,
        ]);
    }

    /**
     * PUT /api/parametres (admin) { meteo_service?, meteo_cle?, meteo_celsius?, fuseau?, envoi_max_mo? } :
     * seules les clés présentes changent ; meteo_cle "" efface la clé enregistrée.
     */
    public static function modifier(): never
    {
        Droits::exigerAdmin(Auth::exigerConnexion());
        $corps = Requete::json();
        $valeurs = [];

        if (array_key_exists('meteo_service', $corps)) {
            if (!in_array($corps['meteo_service'], Parametres::SERVICES_METEO, true)) {
                Reponse::erreur('Service météo inconnu.', 400);
            }
            $valeurs['meteo_service'] = $corps['meteo_service'];
        }
        if (array_key_exists('meteo_cle', $corps)) {
            $cle = $corps['meteo_cle'];
            if (!is_string($cle) || strlen(trim($cle)) > 255 || !preg_match('/^[\x21-\x7E]*$/', trim($cle))) {
                Reponse::erreur("Clé d'API : 255 caractères au plus, sans espace ni accent.", 400);
            }
            $valeurs['meteo_cle'] = trim($cle);
        }
        if (array_key_exists('meteo_celsius', $corps)) {
            if (!is_bool($corps['meteo_celsius'])) {
                Reponse::erreur('meteo_celsius : vrai ou faux attendu.', 400);
            }
            $valeurs['meteo_celsius'] = $corps['meteo_celsius'] ? '1' : '0';
        }
        if (array_key_exists('fuseau', $corps)) {
            if (!is_string($corps['fuseau']) || !Parametres::fuseauValide($corps['fuseau'])) {
                Reponse::erreur('Fuseau horaire inconnu.', 400);
            }
            $valeurs['fuseau'] = $corps['fuseau'];
        }
        if (array_key_exists('envoi_max_mo', $corps)) {
            $mo = $corps['envoi_max_mo'];
            $limite = intdiv(Parametres::limitePhpOctets(), 1024 * 1024);
            if (!is_int($mo) || $mo < 1 || ($limite > 0 && $mo > $limite)) {
                Reponse::erreur('Taille maximale : nombre entier de Mo, entre 1 et ' . ($limite > 0 ? $limite : 'la limite de PHP')
                    . ' (upload_max_filesize et post_max_size de PHP).', 400);
            }
            $valeurs['envoi_max_mo'] = (string) $mo;
        }

        $service = $valeurs['meteo_service'] ?? Parametres::get('meteo_service');
        $cle = $valeurs['meteo_cle'] ?? Parametres::get('meteo_cle');
        if ($service === 'open-meteo-cle' && $cle === '') {
            Reponse::erreur("Ce service météo demande une clé d'API.", 400);
        }

        $ancienRelais = Parametres::meteoRelais();
        Parametres::enregistrer($valeurs);
        if (Parametres::meteoRelais() !== $ancienRelais) {
            // Le lecteur choisit l'accès direct ou le relais à la création des widgets : rechargement.
            Db::executer('UPDATE chaines SET version = version + 1');
        }
        Reponse::json(['parametres' => self::publier(Parametres::tous())]);
    }

    private static function publier(array $p): array
    {
        return [
            'meteo_service' => $p['meteo_service'],
            'meteo_cle_definie' => $p['meteo_cle'] !== '',
            'meteo_celsius' => $p['meteo_celsius'] === '1',
            'fuseau' => $p['fuseau'],
            'envoi_max_mo' => (int) $p['envoi_max_mo'],
        ];
    }
}
