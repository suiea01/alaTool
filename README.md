# alaTool — prototype

Prototype d’une application de synchronisation des outils Alabama.

## Mode test Nextcloud

L’application démarre automatiquement une copie réelle depuis un partage public
Nextcloud configuré localement dans `config/runtime.json`. Elle utilise le mode
`copy` de rclone : les fichiers nouveaux ou modifiés sont téléchargés, mais
aucun fichier local n’est supprimé.

La destination est sélectionnée ainsi :

- Windows : `T:\Tools`, sinon `Documents\Tools`
- macOS : `/Volumes/T/Tools`, sinon `Documents/Tools`

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
