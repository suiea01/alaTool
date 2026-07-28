let destination = null;
let server = null;
let cancelled = false;
let currentFiles = [];

const $ = (id) => document.getElementById(id);
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

function formatBytes(bytes) {
  if (!bytes) return "0 octet";
  const units = ["octets", "Ko", "Mo", "Go"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[index]}`;
}

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
  const rounded = Math.max(0, Math.min(100, Math.round(value)));
  $("progressFill").style.width = `${rounded}%`;
  $("percent").textContent = `${rounded} %`;
  document.querySelector(".progress-track").setAttribute("aria-valuenow", rounded);
}

function setRunningState() {
  cancelled = false;
  document.body.classList.remove("cancelled");
  $("statusMark").classList.remove("visible");
  $("title").textContent = "Connexion à Nextcloud…";
  $("subtitle").textContent =
    "alaTool recherche les fichiers nouveaux ou modifiés.";
  $("progressBlock").classList.remove("hidden");
  $("cancelButton").classList.remove("hidden");
  $("openButton").classList.add("hidden");
  $("retryButton").classList.add("hidden");
  $("logList").replaceChildren();
  $("fileName").textContent = "Lecture du dossier distant";
  $("fileCount").textContent = "Analyse en cours…";
  $("transferSize").textContent = "—";
  setProgress(4);
}

async function startSync() {
  setRunningState();
  log(`Connexion à ${server.serverName}`);
  log(`Destination sélectionnée : ${destination.path}`);

  try {
    const scan = await window.alaTool.scan();
    if (cancelled) return;
    currentFiles = scan.files;
    setProgress(18);

    $("title").textContent = "Téléchargement des outils…";
    $("subtitle").textContent =
      "Les fichiers existants restent disponibles pendant l’opération.";
    $("fileCount").textContent =
      `${scan.files.length} fichier${scan.files.length > 1 ? "s" : ""} détecté${scan.files.length > 1 ? "s" : ""}`;
    $("transferSize").textContent = formatBytes(scan.totalBytes);
    $("fileName").textContent =
      scan.files[0]?.path || "Le dossier distant est vide";
    log(
      `${scan.files.length} fichier${scan.files.length > 1 ? "s" : ""} à vérifier — ${formatBytes(scan.totalBytes)}`,
    );

    await wait(300);
    setProgress(35);
    await window.alaTool.sync(destination.path);
    if (cancelled) return;

    setProgress(100);
    $("title").textContent = "Les outils sont à jour";
    $("subtitle").textContent =
      "La copie Nextcloud s’est terminée avec succès. Aucun fichier local n’a été supprimé.";
    $("fileName").textContent = "Mise à jour terminée";
    $("fileCount").textContent =
      `${scan.files.length} fichier${scan.files.length > 1 ? "s" : ""} vérifié${scan.files.length > 1 ? "s" : ""}`;
    $("statusMark").classList.add("visible");
    $("cancelButton").classList.add("hidden");
    $("openButton").classList.remove("hidden");
    log("Téléchargement et contrôle terminés");
  } catch (error) {
    if (cancelled) return;
    document.body.classList.add("cancelled");
    $("title").textContent = "Téléchargement impossible";
    $("subtitle").textContent =
      "Les fichiers existants n’ont pas été supprimés. Consultez les détails puis réessayez.";
    $("fileName").textContent = "Une erreur est survenue";
    $("cancelButton").classList.add("hidden");
    $("retryButton").classList.remove("hidden");
    log(error.message || String(error));
  }
}

async function cancelSync() {
  cancelled = true;
  await window.alaTool.cancelSync();
  document.body.classList.add("cancelled");
  $("title").textContent = "Téléchargement annulé";
  $("subtitle").textContent =
    "Aucun fichier existant n’a été supprimé. Le téléchargement pourra être relancé.";
  $("fileName").textContent = "Opération interrompue";
  $("cancelButton").classList.add("hidden");
  $("retryButton").classList.remove("hidden");
  log("Annulation demandée");
}

async function init() {
  [destination, server] = await Promise.all([
    window.alaTool.getDestination(),
    window.alaTool.getServer(),
  ]);
  $("destinationPath").textContent = destination.path;
  $("fallbackNote").textContent = destination.fallback
    ? "Le volume T n’est pas disponible : dossier Documents utilisé."
    : "Volume T détecté.";

  window.alaTool.onSyncEvent((event) => {
    if (event.type === "transfer-started") setProgress(48);
    if (event.type === "transfer-complete") setProgress(92);
    if (event.type === "log" && event.line.includes("Copied")) {
      const cleaned = event.line.trim().replace(/^.*INFO\s*:\s*/, "");
      log(cleaned);
      const matchingFile = currentFiles.find((file) =>
        event.line.includes(file.name),
      );
      if (matchingFile) $("fileName").textContent = matchingFile.path;
      setProgress(78);
    }
  });

  $("cancelButton").addEventListener("click", cancelSync);
  $("retryButton").addEventListener("click", startSync);
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
  startSync();
}

init();
