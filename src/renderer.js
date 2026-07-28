let destination = null;
let server = null;
let cancelled = false;
let selectedFiles = [];
let selectedCategories = [];

const $ = (id) => document.getElementById(id);
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const categoryInputs = () => [
  ...document.querySelectorAll('input[name="category"]'),
];

function formatBytes(bytes) {
  if (!bytes) return "0 octet";
  const units = ["octets", "Ko", "Mo", "Go", "To"];
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

function selectedValues() {
  if ($("categoryAll").checked) return ["ALL"];
  return categoryInputs()
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function fileIsSelected(file, categories) {
  if (categories.includes("ALL")) return true;
  const topFolder = file.path.split(/[\\/]/)[0].normalize("NFC").toLocaleLowerCase("fr");
  return categories.some(
    (category) =>
      category.normalize("NFC").toLocaleLowerCase("fr") === topFolder,
  );
}

function showSelection() {
  cancelled = false;
  document.body.classList.remove("cancelled");
  $("statusMark").classList.remove("visible");
  $("title").textContent = "Quels outils souhaitez-vous télécharger ?";
  $("subtitle").textContent =
    "Sélectionnez une ou plusieurs catégories. Divers est coché par défaut.";
  $("categoryBlock").classList.remove("hidden");
  $("progressBlock").classList.add("hidden");
  $("startButton").classList.remove("hidden");
  $("cancelButton").classList.add("hidden");
  $("openButton").classList.add("hidden");
  $("retryButton").classList.add("hidden");
  $("selectionError").classList.add("hidden");
}

function setRunningState(categories) {
  cancelled = false;
  document.body.classList.remove("cancelled");
  $("statusMark").classList.remove("visible");
  $("title").textContent = "Analyse des outils sélectionnés…";
  $("subtitle").textContent = `Sélection : ${categories.includes("ALL") ? "toutes les catégories" : categories.join(", ")}.`;
  $("categoryBlock").classList.add("hidden");
  $("progressBlock").classList.remove("hidden");
  $("startButton").classList.add("hidden");
  $("cancelButton").classList.remove("hidden");
  $("openButton").classList.add("hidden");
  $("retryButton").classList.add("hidden");
  $("logList").replaceChildren();
  $("fileName").textContent = "Lecture du dossier distant";
  $("fileCount").textContent = "Analyse en cours…";
  $("transferSize").textContent = "—";
  setProgress(0);
}

async function startSync() {
  selectedCategories = selectedValues();
  if (selectedCategories.length === 0) {
    $("selectionError").classList.remove("hidden");
    return;
  }

  $("selectionError").classList.add("hidden");
  setRunningState(selectedCategories);
  log(`Connexion à ${server.serverName}`);
  log(`Destination sélectionnée : ${destination.path}`);

  try {
    const scan = await window.alaTool.scan();
    if (cancelled) return;
    selectedFiles = scan.files.filter((file) =>
      fileIsSelected(file, selectedCategories),
    );
    const selectedBytes = selectedFiles.reduce(
      (sum, file) => sum + Math.max(0, file.size || 0),
      0,
    );

    if (selectedFiles.length === 0) {
      setProgress(100);
      $("title").textContent = "Aucun outil disponible";
      $("subtitle").textContent =
        "Les catégories sélectionnées sont actuellement vides sur Nextcloud.";
      $("fileName").textContent = "Aucun fichier à télécharger";
      $("fileCount").textContent = "0 fichier";
      $("transferSize").textContent = "0 octet";
      $("statusMark").classList.add("visible");
      $("cancelButton").classList.add("hidden");
      $("retryButton").classList.remove("hidden");
      log("Aucun fichier trouvé dans la sélection");
      return;
    }

    $("title").textContent = "Téléchargement des outils…";
    $("subtitle").textContent =
      "La barre indique les octets réellement transférés pour cette mise à jour.";
    $("fileCount").textContent =
      `${selectedFiles.length} fichier${selectedFiles.length > 1 ? "s" : ""} sélectionné${selectedFiles.length > 1 ? "s" : ""}`;
    $("transferSize").textContent = `${formatBytes(selectedBytes)} sélectionnés`;
    $("fileName").textContent = "Préparation de la copie";
    log(
      `${selectedFiles.length} fichier${selectedFiles.length > 1 ? "s" : ""} sélectionné${selectedFiles.length > 1 ? "s" : ""} — ${formatBytes(selectedBytes)}`,
    );

    await window.alaTool.sync({
      destination: destination.path,
      categories: selectedCategories,
    });
    if (cancelled) return;

    setProgress(100);
    $("title").textContent = "Les outils sélectionnés sont à jour";
    $("subtitle").textContent =
      "La copie Nextcloud s’est terminée avec succès. Aucun fichier local n’a été supprimé.";
    $("fileName").textContent = "Mise à jour terminée";
    $("fileCount").textContent =
      `${selectedFiles.length} fichier${selectedFiles.length > 1 ? "s" : ""} vérifié${selectedFiles.length > 1 ? "s" : ""}`;
    $("statusMark").classList.add("visible");
    $("cancelButton").classList.add("hidden");
    $("openButton").classList.remove("hidden");
    $("retryButton").classList.remove("hidden");
    log("Téléchargement et contrôle terminés");
  } catch (error) {
    if (cancelled) return;
    document.body.classList.add("cancelled");
    $("title").textContent = "Téléchargement impossible";
    $("subtitle").textContent =
      "Les fichiers existants n’ont pas été supprimés. Consultez les détails puis revenez au choix.";
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
    "Aucun fichier existant n’a été supprimé. Vous pouvez revenir au choix des catégories.";
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
    if (event.type === "transfer-started") {
      $("fileName").textContent = "Comparaison avec les fichiers existants";
      setProgress(0);
    }
    if (event.type === "progress") {
      const percent =
        event.totalBytes > 0 ? (event.bytes / event.totalBytes) * 100 : 0;
      setProgress(percent);
      $("transferSize").textContent =
        event.totalBytes > 0
          ? `${formatBytes(event.bytes)} / ${formatBytes(event.totalBytes)}`
          : "Aucun octet à télécharger";
      if (event.totalTransfers > 0) {
        $("fileCount").textContent =
          `${event.transfers} / ${event.totalTransfers} fichier${event.totalTransfers > 1 ? "s" : ""} transféré${event.transfers > 1 ? "s" : ""}`;
      }
    }
    if (event.type === "current-file") {
      $("fileName").textContent = event.path;
    }
    if (event.type === "log") {
      log(event.line.trim());
    }
  });

  $("categoryAll").addEventListener("change", (event) => {
    categoryInputs().forEach((input) => {
      input.checked = event.target.checked;
    });
    $("selectionError").classList.add("hidden");
  });
  categoryInputs().forEach((input) => {
    input.addEventListener("change", () => {
      $("categoryAll").checked = categoryInputs().every(
        (category) => category.checked,
      );
      $("selectionError").classList.add("hidden");
    });
  });

  $("startButton").addEventListener("click", startSync);
  $("cancelButton").addEventListener("click", cancelSync);
  $("retryButton").addEventListener("click", showSelection);
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

  await wait(250);
  showSelection();
}

init();
