# alaTool — prototype

Prototype d’une application de synchronisation des outils Alabama.

## Mode test Nextcloud

L’application propose les catégories `ALL`, `LED`, `Captation`, `Divers`,
`Switcher` et `Média Serveur`. `Divers` est sélectionné par défaut. Après
validation, elle copie uniquement les dossiers choisis depuis le partage public
Nextcloud configuré dans `config/runtime.json`.

Le système de la machine (`Windows` ou `Mac`) est présélectionné et reste
modifiable dans l’interface. Pour chaque catégorie, l’application copie d’abord
les fichiers de `Commun`, puis ceux du système choisi. Les deux sources sont
réunies dans le même dossier local.

L’arborescence Nextcloud attendue est :

```text
Commun/
  LED/
  Captation/
  Divers/
  Switcher/
  Média Serveur/
Windows/
  LED/
  Captation/
  Divers/
  Switcher/
  Média Serveur/
Mac/
  LED/
  Captation/
  Divers/
  Switcher/
  Média Serveur/
```

Pendant la migration, si aucun dossier `Commun`, `Windows` ou `Mac` n’est
détecté, alaTool conserve automatiquement le fonctionnement de l’ancienne
arborescence par catégories.

Elle utilise le mode `copy` de rclone : les fichiers nouveaux ou modifiés sont
téléchargés, mais aucun fichier local n’est supprimé. La barre de progression
repose sur les octets réellement transférés par rclone.

Chaque catégorie peut être téléchargée entièrement ou limitée à certains de ses
sous-dossiers. Par exemple, sélectionner `LED/COEX/MX20` évite de récupérer les
autres variantes COEX. `Divers` reste sélectionné entièrement au démarrage.
Cocher un dossier parent coche tous ses sous-dossiers. Si un seul sous-dossier est
ensuite décoché, le parent affiche un trait pour signaler la sélection partielle.
La croix, la touche Échap et un clic à l’extérieur de la fenêtre enregistrent la
sélection courante lorsqu’elle a réellement été modifiée. Ouvrir puis refermer une
catégorie sans toucher aux choix conserve son état précédent. Seul le bouton
`Annuler` abandonne systématiquement les modifications.

Un dossier réservé nommé `_Inclus` peut être placé directement dans chaque
catégorie. Son contenu est masqué dans la fenêtre de sélection et toujours
téléchargé dès que la catégorie correspondante est choisie, entièrement ou
partiellement. Les fichiers isolés qui doivent être automatiques doivent donc être
rangés dans ce dossier, par exemple :

```text
Commun/
  LED/
    _Inclus/
      Mire/
      mire-reference.jpg
```

Le dossier `_Inclus` est uniquement technique : il n’est pas recréé dans la
destination. Dans cet exemple, son contenu arrive directement dans `LED/Mire/` et
`LED/mire-reference.jpg`.

La destination est sélectionnée ainsi :

- Windows : `T:\`, sinon `Documents\Tools`
- macOS : `/Volumes/T`, sinon `Documents/Tools`

À l’ouverture, alaTool vérifie le volume T en y créant puis supprimant un petit
fichier temporaire. Si cette écriture échoue, notamment sur un volume en lecture
seule, le dossier Documents est utilisé. L’arborescence Nextcloud est également
chargée en arrière-plan dès le lancement pour accélérer l’ouverture des catégories.

## Lancer le prototype

```sh
npm install
npm start
```

Copier d’abord `config/runtime.example.json` vers `config/runtime.json`, puis
renseigner l’adresse WebDAV et le jeton du partage. Le binaire rclone adapté à
la plateforme doit être placé dans `resources/bin/<plateforme>-<architecture>/`.

## Étape suivante

La même interface pourra être raccordée au Synology avec un compte dédié en
lecture seule. Le fichier `config/runtime.json` et les binaires rclone locaux
ne sont jamais publiés dans Git.

## Versions de test

Un tag Git commençant par `v` déclenche la fabrication automatique de :

- un DMG pour les Mac Apple Silicon ;
- un DMG pour les Mac Intel ;
- un EXE portable pour Windows 64 bits ;
- une préversion GitHub contenant les trois fichiers.

Le dépôt doit définir les secrets GitHub Actions `NEXTCLOUD_WEBDAV_URL` et
`NEXTCLOUD_SHARE_TOKEN`.
