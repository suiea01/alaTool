const sequence = [
  { name: "Connexion au serveur de test", from: 0, to: 7, duration: 500 },
  { name: "Analyse des composants", from: 7, to: 16, duration: 650 },
  {
    name: "Utilitaires vidéo",
    from: 16,
    to: 42,
    duration: 1500,
    count: "1 composant sur 4",
  },
  {
    name: "Outils réseau",
    from: 42,
    to: 61,
    duration: 1250,
    count: "2 composants sur 4",
  },
  {
    name: "Pilotes et profils",
    from: 61,
    to: 85,
    duration: 1450,
    count: "3 composants sur 4",
  },
  {
    name: "Scripts de prestation",
    from: 85,
    to: 96,
    duration: 950,
    count: "4 composants sur 4",
  },
  { name: "Vérification de l’intégrité", from: 96, to: 100, duration: 800 },
];

const totalMegabytes = 486;
let destination = null;
let cancelled = false;
let runId = 0;

const $ = (id) => document.getElementById(id);
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

function log(message) {
  const item = document.createElement("li");
  const time = new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  item.textContent = `${time} — ${message}`;
  $("logList").append(item);
  item.scrollIntoView({ block: "nearest" });
}

function setProgress(value) {
  const rounded = Math.round(value);
  $("progressFill").style.width = `${rounded}%`;
  $("percent").textContent = `${rounded} %`;
  document.querySelector(".progress-track").setAttribute("aria-valuenow", rounded);
  const transferred = Math.round((totalMegabytes * rounded) / 100);
  $("transferSize").textContent = `${transferred} Mo / ${totalMegabytes} Mo`;
}

async function animateStep(step, currentRun) {
  $("fileName").textContent = step.name;
  $("fileCount").textContent = step.count || "Préparation…";
  log(step.name);

  const frames = Math.max(1, Math.floor(step.duration / 80));
  for (let frame = 1; frame <= frames; frame += 1) {
    if (cancelled || runId !== currentRun) return false;
    const ratio = frame / frames;
    setProgress(step.from + (step.to - step.from) * ratio);
    await wait(80);
  }
  return true;
}

function setRunningState() {
  document.body.classList.remove("cancelled");
  $("statusMark").classList.remove("visible");
  $("title").textContent = "Mise à jour en cours…";
  $("subtitle").textContent =
    "Les fichiers nouveaux ou modifiés sont récupérés automatiquement.";
  $("progressBlock").classList.remove("hidden");
  $("cancelButton").classList.remove("hidden");
  $("openButton").classList.add("hidden");
  $("retryButton").classList.add("hidden");
  $("logList").replaceChildren();
  setProgress(0);
}

async function startSimulation() {
  runId += 1;
  const currentRun = runId;
  cancelled = false;
  setRunningState();
  log("Démarrage automatique d’alaTool");
  log(`Destination sélectionnée : ${destination.path}`);

  for (const step of sequence) {
    const completed = await animateStep(step, currentRun);
    if (!completed) return;
  }

  $("title").textContent = "Les outils sont à jour";
  $("subtitle").textContent =
    "4 composants ont été vérifiés. Le contenu existant est resté disponible pendant toute l’opération.";
  $("fileName").textContent = "Mise à jour terminée";
  $("fileCount").textContent = "4 composants vérifiés";
  $("transferSize").textContent = `${totalMegabytes} Mo`;
  $("statusMark").classList.add("visible");
  $("cancelButton").classList.add("hidden");
  $("openButton").classList.remove("hidden");
  log("Contrôle terminé — aucun fichier corrompu");
  log("Mode test terminé avec succès");
}

function cancelSimulation() {
  cancelled = true;
  document.body.classList.add("cancelled");
  $("title").textContent = "Téléchargement annulé";
  $("subtitle").textContent =
    "Aucun fichier existant n’a été modifié. Le téléchargement pourra être relancé.";
  $("fileName").textContent = "Opération interrompue";
  $("fileCount").textContent = "Fichiers temporaires écartés";
  $("cancelButton").classList.add("hidden");
  $("retryButton").classList.remove("hidden");
  log("Annulation demandée — destination laissée intacte");
}

async function init() {
  destination = await window.alaTool.getDestination();
  $("destinationPath").textContent = destination.path;
  $("fallbackNote").textContent = destination.fallback
    ? "Le volume T n’est pas disponible : dossier Documents utilisé."
    : "Volume T détecté.";

  $("cancelButton").addEventListener("click", cancelSimulation);
  $("retryButton").addEventListener("click", startSimulation);
  $("openButton").addEventListener("click", () =>
    window.alaTool.openFolder(destination.path),
  );
  $("detailsButton").addEventListener("click", () => {
    const panel = $("detailsPanel");
    panel.classList.toggle("hidden");
    $("detailsButton").textContent = panel.classList.contains("hidden")
      ? "Afficher les détails"
      : "Masquer les détails";
  });

  await wait(450);
  startSimulation();
}

init();
