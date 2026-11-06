<?php
// Modèle de configuration : à copier en config.php (ignoré par git) puis à adapter.
declare(strict_types=1);

return [
    // Connexion à la base MySQL / MariaDB (la base doit exister, vide).
    // Avec WAMP : MySQL écoute sur le port 3306, MariaDB sur le port 3307.
    'db' => [
        'hote' => '127.0.0.1',
        'port' => 3306,
        'base' => 'signage',
        'utilisateur' => 'root',
        'mot_de_passe' => '',
    ],

    // Fuseau horaire utilisé pour la programmation des playlists.
    'fuseau' => 'Europe/Paris',

    // Taille maximale d'un média envoyé, en octets. Doit rester sous
    // upload_max_filesize et post_max_size de PHP (sinon PHP refuse l'envoi avant).
    'envoi_max_octets' => 50 * 1024 * 1024,

    // Adresse du dossier public/ vue du navigateur, sans barre finale :
    // '/signage' avec un alias Apache, '' avec un hôte virtuel dédié.
    'url_base' => '/signage',
];
