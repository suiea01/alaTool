# alaTool — prototype

Prototype d’une application de synchronisation des outils Alabama.

## Mode test

L’application démarre automatiquement une simulation de téléchargement. Aucun
serveur n’est contacté et aucun fichier distant n’est écrit. Le bouton
« Ouvrir le dossier » crée uniquement le dossier de destination choisi.

La destination est sélectionnée ainsi :

- Windows : `T:\Tools`, sinon `Documents\Tools`
- macOS : `/Volumes/T/Tools`, sinon `Documents/Tools`

## Lancer le prototype

```sh
npm install
npm start
```

## Étape suivante

Le moteur de simulation de `src/renderer.js` sera remplacé par les événements
de progression rclone quand l’emplacement Synology et le compte en lecture
seule seront disponibles.
