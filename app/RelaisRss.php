<?php
declare(strict_types=1);

/**
 * Téléchargement et lecture d'un flux RSS / Atom pour le lecteur (le navigateur en est
 * empêché par CORS).
 *
 * Protection SSRF : seules les adresses http(s) sont acceptées, et l'hôte doit se résoudre
 * en adresses publiques. La connexion est faite vers l'adresse vérifiée (CURLOPT_RESOLVE),
 * pour qu'un second appel DNS ne puisse pas viser le réseau local ; chaque redirection est
 * vérifiée de la même façon.
 */
final class RelaisRss
{
    private const TAILLE_MAX = 2 * 1024 * 1024;
    private const REDIRECTIONS_MAX = 3;
    private const TITRES_MAX = 50;

    /** Corps du flux ; RuntimeException en cas d'adresse refusée ou d'échec. */
    public static function telecharger(string $url): string
    {
        for ($i = 0; $i <= self::REDIRECTIONS_MAX; $i++) {
            [$hote, $port, $ip] = self::verifier($url);
            $options = [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                CURLOPT_USERAGENT => 'SignageStudio-RSS/1.0',
                CURLOPT_HTTPHEADER => ['Accept: application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1'],
                CURLOPT_ENCODING => '',
                CURLOPT_NOPROGRESS => false,
                CURLOPT_PROGRESSFUNCTION => static fn ($c, int $total, int $recu): int => $recu > self::TAILLE_MAX ? 1 : 0,
            ];
            if ((string) ini_get('curl.cainfo') === '') {
                // Sans fichier de certificats dans php.ini (cas de WAMP) : magasin du système.
                // 16 = CURLSSLOPT_NATIVE_CA, constante absente de PHP 8.1.
                $options[CURLOPT_SSL_OPTIONS] = defined('CURLSSLOPT_NATIVE_CA') ? CURLSSLOPT_NATIVE_CA : 16;
            }
            if ($ip !== $hote) {
                $options[CURLOPT_RESOLVE] = ["$hote:$port:$ip"];
            }
            $ch = curl_init($url);
            curl_setopt_array($ch, $options);
            $corps = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $redirection = (string) curl_getinfo($ch, CURLINFO_REDIRECT_URL);
            $erreur = curl_error($ch);
            curl_close($ch);

            if ($corps === false) {
                throw new RuntimeException("Téléchargement impossible : $erreur");
            }
            if ($code >= 300 && $code < 400 && $redirection !== '') {
                $url = $redirection;
                continue;
            }
            if ($code !== 200) {
                throw new RuntimeException("Réponse HTTP $code.");
            }
            return (string) $corps;
        }
        throw new RuntimeException('Trop de redirections.');
    }

    /**
     * Titres des éléments d'un flux RSS 2.0, RSS 1.0 ou Atom, dans l'ordre du flux.
     * Les entités externes ne sont jamais chargées (LIBXML_NONET, pas de LIBXML_NOENT).
     *
     * @return list<string>
     */
    public static function titres(string $xml): array
    {
        $precedent = libxml_use_internal_errors(true);
        try {
            $doc = simplexml_load_string($xml, SimpleXMLElement::class, LIBXML_NONET | LIBXML_NOCDATA);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($precedent);
        }
        if ($doc === false) {
            throw new RuntimeException('Flux illisible (XML invalide).');
        }
        $titres = [];
        $noeuds = $doc->xpath('//*[local-name()="item" or local-name()="entry"]/*[local-name()="title"]') ?: [];
        foreach ($noeuds as $noeud) {
            $titre = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags((string) $noeud), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
            if ($titre !== '') {
                $titres[] = $titre;
            }
            if (count($titres) >= self::TITRES_MAX) {
                break;
            }
        }
        return $titres;
    }

    /** @return array{string, int, string} hôte, port, adresse IP publique vérifiée */
    private static function verifier(string $url): array
    {
        $p = parse_url($url);
        $schema = strtolower((string) ($p['scheme'] ?? ''));
        if (!in_array($schema, ['http', 'https'], true) || empty($p['host']) || isset($p['user']) || isset($p['pass'])) {
            throw new RuntimeException('Adresse refusée : seules les adresses http(s) sans identifiants sont acceptées.');
        }
        $hote = trim($p['host'], '[]');
        $port = (int) ($p['port'] ?? ($schema === 'https' ? 443 : 80));

        $ips = filter_var($hote, FILTER_VALIDATE_IP) !== false ? [$hote] : (gethostbynamel($hote) ?: []);
        if ($ips === []) {
            throw new RuntimeException("Hôte introuvable : $hote.");
        }
        foreach ($ips as $ip) {
            if (!self::estPublique($ip)) {
                throw new RuntimeException('Adresse refusée : réseau local ou réservé.');
            }
        }
        return [$hote, $port, $ips[0]];
    }

    private static function estPublique(string $ip): bool
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
        $binaire = inet_pton($ip);
        if ($binaire === false) {
            return false;
        }
        if (strlen($binaire) === 16) {
            // IPv6 : refuse les adresses qui embarquent une IPv4 (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::).
            if (str_starts_with($binaire, str_repeat("\0", 10) . "\xff\xff") || str_starts_with($binaire, str_repeat("\0", 12))
                || str_starts_with($binaire, "\x00\x64\xff\x9b")) {
                return false;
            }
            return true;
        }
        // IPv4 : plages partagées ou de test que le filtre de PHP ne couvre pas toujours.
        $n = unpack('N', $binaire)[1];
        foreach ([['100.64.0.0', 10], ['192.0.0.0', 24], ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['0.0.0.0', 8], ['127.0.0.0', 8], ['169.254.0.0', 16]] as [$reseau, $bits]) {
            $masque = (-1 << (32 - $bits)) & 0xFFFFFFFF;
            if (($n & $masque) === (ip2long($reseau) & $masque)) {
                return false;
            }
        }
        return true;
    }
}
