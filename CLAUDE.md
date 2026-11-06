# Signage Studio — consignes pour Claude

Gestion de **chaînes** d'affichage dynamique : des utilisateurs composent des playlists (dispositions d'écran, widgets, médias) et programment leur diffusion ; chaque afficheur ouvre simplement l'URL publique de sa chaîne (`?chaine=restaurant`). Projet personnel destiné à être publié sur GitHub ; interface en français.

**En cours de réécriture** : l'ancienne version Rust / egui est remplacée par PHP + JavaScript. Architecture, tables, API et droits : `docs/etudes/serveur.md`. Étapes : `docs/TODO.md`. Tant que la tâche « Archiver le code Rust » n'est pas faite, `src/`, `Cargo.toml` et `web/` à la racine sont l'ancienne version.

## Git : interdiction de commiter

**Ne jamais lancer `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git revert`, `git tag` ni `git stash`**, même si cela paraît utile ou si un outil le suggère. L'utilisateur gère lui-même ses commits.

- Autorisé : `git status`, `git diff`, `git log`, `git show` (lecture seule).
- Le dépôt est sous Windows (fins de ligne CRLF) : depuis Linux, utiliser `git diff --ignore-cr-at-eol` pour voir les vrais changements.

## Pile technique

- PHP 8.1+ sans framework ni Composer ; MySQL 8 / MariaDB 10.6+ via PDO. JavaScript sans framework, HTML, CSS. **Aucun build, aucun npm, aucun CDN** : toute bibliothèque est copiée en local.
- Serveur de l'utilisateur : WAMP. Apache n'expose que `public/`.
- Lancer : WAMP démarré, puis l'URL configurée (alias `/signage` ou port 8001). Installation : copier `config/config.example.php` en `config/config.php`, puis ouvrir `installer.php`.

## Organisation

| Où | Quoi |
|---|---|
| `public/index.php` | Sans paramètre : liste des chaînes ; `?chaine=slug` : lecteur plein écran |
| `public/admin/` | Éditeur (page unique, connexion requise) |
| `public/api/index.php` | API JSON, point d'entrée unique |
| `public/assets/js/commun/` | Dispositions, widgets et valeurs par défaut, partagés par l'éditeur et le lecteur |
| `public/assets/js/lecteur/`, `public/assets/js/admin/` | Lecteur, écrans de l'éditeur |
| `public/uploads/` | Médias envoyés, vignettes dans `vignettes/` ; ignoré par git ; PHP interdit par `.htaccess` |
| `app/` | Code PHP hors racine web : `Db`, `Auth`, `Droits`, contrôleurs de l'API |
| `config/` | `config.example.php` (versionné) ; `config.php` (identifiants, ignoré par git) |
| `sql/` | `schema.sql`, `migrations/` numérotées |
| `outils/` | Scripts en ligne de commande (ex. `reinitialiser_mdp.php`), refusés par le navigateur |
| `sauvegardes/` | Sauvegardes automatiques faites avant chaque restauration ; ignoré par git |
| `assets/screenshots/` | Captures pour le README (anciennes captures Rust à remplacer) |
| `docs/` | Privé, ignoré par git, réservé à l'utilisateur et à Claude : `TODO.md`, `etudes/` |
| `_archive/` | Privé, ignoré par git : traces de l'analyse d'origine et, après archivage, le code Rust de référence. Ne rien en recopier dans le dépôt sauf des valeurs fonctionnelles (dispositions, valeurs par défaut, règles), sans les commentaires |

## Règles qui cassent l'application si on les oublie

1. **Droits vérifiés côté serveur** : chaque route d'écriture de l'API appelle `Droits` (`estAdmin`, `peutModifier` pour une chaîne, `exigerObjet` pour une playlist ou un média de la bibliothèque, `peutProgrammer`). Masquer un bouton dans l'éditeur ne protège rien.
2. **SQL** : uniquement des requêtes préparées PDO, jamais de variable concaténée dans une requête.
3. **Affichage de textes saisis** : `textContent` en JS, `htmlspecialchars` en PHP ; jamais `innerHTML` avec une donnée utilisateur. Seule exception, le texte mis en forme (Markdown, mise en forme du widget Texte) : il passe toujours par `nettoyer()` de `commun/texte_riche.js` (DOMPurify, liste blanche de balises et de styles) et s'insère en fragment DOM, jamais par `innerHTML`.
4. **Écritures** : session + jeton CSRF obligatoires ; réponses JSON avec un code HTTP correct (400, 401, 403, 404).
5. **Schéma** : toute modification de la base passe par un nouveau fichier `sql/migrations/NNN_description.sql`, qui se termine par `UPDATE version_schema SET version = NNN;`, **et** la mise à jour de `schema.sql` (y compris le numéro inséré dans `version_schema`). Migrations additives (colonne ajoutée avec une valeur par défaut) pour que les anciennes sauvegardes restent restaurables ; une nouvelle table à sauvegarder s'ajoute à `Sauvegarde::TABLES`.
6. **JSON des pages** (`playlists.pages`) : porte `format: 1`. Changer sa structure impose d'incrémenter `format` et de convertir les anciennes playlists à la lecture.
7. **Dispositions** : une playlist enregistre le nom de sa disposition et ses régions calculées ; ne pas renommer une disposition de `dispositions.js` sans garder l'ancien nom reconnu.
8. **Lecteur public** : il ne doit jamais demander de connexion ni exposer autre chose que le contenu de la chaîne (pas d'identifiant, pas de nom d'utilisateur).
9. **Médias** : types autorisés vérifiés avec `finfo`, nom de fichier aléatoire sur disque, taille maximale réglée dans l'écran Administration (`Parametres::envoiMaxOctets`, défaut dans `config.php`).
10. **Publication** : ne jamais introduire dans le dépôt de nom de logiciel tiers, d'adresse de binaire (`0x…`), de capture d'un autre logiciel ni de fichier de `_archive/`.

## Vérifications

Après toute modification :

```bash
php -l chemin/du/fichier.php        # pour chaque fichier PHP modifié
```

Puis dans le navigateur : l'écran touché dans l'éditeur, le lecteur d'une chaîne concernée, et la console (F12) sans erreur. Pour une route de l'API protégée : vérifier qu'un utilisateur sans droit reçoit 403.

## Façon de travailler

- Avant de commencer, regarder `docs/TODO.md`. Une tâche terminée en est **supprimée** (pas cochée).
- Petite tâche claire : la faire directement. Tâche large ou ambiguë : proposer d'abord un plan court.
- Changements ciblés : ne pas reformater ni réorganiser du code sans rapport avec la demande.
- Terminer par : ce qui a changé, le résultat des vérifications, ce que l'utilisateur doit tester, et le message de commit proposé.
- La documentation de `docs/` reste courte : un fait à un seul endroit, pas de statut à maintenir.
- Rédaction des fichiers Markdown : pas de retour à la ligne manuel au milieu d'un paragraphe ; un paragraphe ou un élément de liste tient sur une seule ligne.
