# Signage Studio

Un outil libre d'affichage dynamique pour les écrans d'accueil, les vitrines, les menus et les salles d'attente.

Créez des **chaînes**, une par écran ou par lieu (« restaurant », « entrée »…), composez leurs playlists à partir de dispositions prêtes à l'emploi, puis programmez ce qui passe à chaque heure de la semaine. Un afficheur n'a besoin de rien d'autre qu'un navigateur ouvert sur l'adresse de sa chaîne :

```
http://votre-serveur/signage/?chaine=restaurant
```

> **Projet en cours de réécriture.** La première version était une application de bureau. Elle est en train d'être remplacée par une application web en PHP + JavaScript avec un serveur central. Les fonctionnalités ci-dessous décrivent la cible.

## Fonctionnalités

- **Chaînes publiques** : le résultat de chaque chaîne est visible sans connexion, par l'URL de la chaîne. Tout changement apparaît sur les afficheurs sans intervention.
- **Utilisateurs et droits** : un administrateur gère tout ; chaque éditeur ne modifie que les chaînes qui lui sont confiées.
- **Dispositions d'écran** : 20 modèles en paysage, 18 en portrait, et une grille personnalisée de 16 × 16 cases.
- **Widgets** : images et vidéos (avec transitions), texte défilant, page web, YouTube, horloge, date et heure, compte à rebours, météo, flux RSS, lien web et code QR.
- **Programmation** : plages par dates, heures et jours de la semaine, avec une playlist par défaut.
- **Médias** : envoi des images et vidéos sur le serveur, bibliothèque par chaîne.

## Prérequis

- Un serveur web avec **PHP 8.1 ou plus** et **MySQL 5.7 ou plus** ou **MariaDB 10.3 ou plus** : WAMP, XAMPP ou MAMP en local, ou un hébergement mutualisé PHP + MySQL.
- Extensions PHP : `pdo_mysql`, `fileinfo`, `mbstring`.
- Pour envoyer des vidéos, augmenter `upload_max_filesize` et `post_max_size` (souvent 2 Mo et 8 Mo par défaut) : dans `php.ini`, ou pour ce site seulement dans la configuration Apache (voir Installation).
- Aucun outil de compilation : pas de Node, pas de Composer.
- phpMyAdmin est pratique pour créer la base, mais pas obligatoire.

Version de développement : WampServer 3.4.0 avec Apache 2.4.65, PHP 8.3.28, MySQL 8.4.7, MariaDB 11.4.9 et phpMyAdmin 5.2.3.

## Installation

1. **Copier le projet** sur le serveur et exposer **uniquement le dossier `public/`** (voir ci-dessous).
2. **Créer une base vide**, par exemple `signage` en `utf8mb4_unicode_ci` (avec phpMyAdmin : *Bases de données* › *Créer une base de données*).
3. **Copier `config/config.example.php` en `config/config.php`** et y renseigner la connexion à la base, le fuseau horaire et l'adresse (`url_base`).
4. **Ouvrir `installer.php`** dans le navigateur (ex. `http://localhost/signage/installer.php`) : il crée les tables et le premier compte administrateur, puis se désactive.

### Exposer `public/` avec Apache (WAMP)

Seul `public/` doit être servi : `app/`, `config/` et `sql/` contiennent le code et les identifiants de la base. Chacun de ces dossiers contient aussi un `.htaccess` qui refuse tout accès, par sécurité.

**Option 1 — alias `/signage`** (le plus simple avec WAMP) : créer `C:\wamp64\alias\signage.conf`, puis redémarrer Apache (icône WAMP › *Redémarrer les services*). L'application est alors à l'adresse `http://localhost/signage/`, avec `'url_base' => '/signage'` dans `config.php`.

```apache
Alias /signage "C:/chemin/vers/signage/public"
<Directory "C:/chemin/vers/signage/public/">
  Options -Indexes +FollowSymLinks
  AllowOverride all
  DirectoryIndex index.php
  Require local
  <IfModule php_module>
    php_admin_value upload_max_filesize 64M
    php_admin_value post_max_size 72M
  </IfModule>
</Directory>
```

**Option 2 — hôte virtuel sur un port dédié** (ex. 8001) : ajouter à la fin de `C:\wamp64\bin\apache\apache2.4.xx\conf\extra\httpd-vhosts.conf`, puis redémarrer Apache. L'application est alors à l'adresse `http://localhost:8001/`, avec `'url_base' => ''` dans `config.php`.

```apache
Listen 8001
<VirtualHost *:8001>
  DocumentRoot "C:/chemin/vers/signage/public"
  <Directory "C:/chemin/vers/signage/public/">
    Options -Indexes +FollowSymLinks
    AllowOverride all
    DirectoryIndex index.php
    Require local
  </Directory>
</VirtualHost>
```

`Require local` limite l'accès à l'ordinateur lui-même. Pour que les afficheurs du réseau local puissent ouvrir leur chaîne, le remplacer par `Require all granted` (ou par `Require ip 192.168.1` pour un seul réseau).

Les lignes `php_admin_value` autorisent l'envoi de vidéos jusqu'à 64 Mo ; `envoi_max_octets` dans `config.php` doit rester en dessous.

## Utilisation

1. **Connectez-vous** à l'éditeur (`/signage/admin/`).
2. **Créez une chaîne** et donnez les droits aux éditeurs concernés.
3. **Composez une playlist** : choisissez une disposition, puis un widget et son contenu pour chaque zone.
4. **Programmez-la** sur les jours et heures voulus.
5. **Sur l'afficheur**, ouvrez `?chaine=nom-de-la-chaine` en plein écran.

## Structure du projet

| Dossier | Rôle |
|---|---|
| `public/` | Seule partie exposée par le serveur web : lecteur public, éditeur (`admin/`), API (`api/`), fichiers CSS / JS, médias envoyés (`uploads/`) |
| `app/` | Code PHP : base de données, connexion, droits, API |
| `config/` | Configuration (`config.example.php` à copier en `config.php`) |
| `sql/` | Schéma de la base et migrations |

## Contribuer

Les signalements de bugs et les propositions sont les bienvenus dans les *Issues*.

## Licence

À définir.
