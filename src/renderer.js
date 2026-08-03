let destination = null;
let server = null;
let cancelled = false;
let selectedFiles = [];
let selectedCategories = [];
let selectedPlatform = null;
let scanCache = null;
let modalCategory = null;
let modalPaths = new Set();

const categories = ["LED", "Captation", "Divers", "Switcher", "Média Serveur"];
const categorySelections = new Map([
  ["Divers", { mode: "all", paths: [] }],
]);

const $ = (id) => document.getElementById(id);
const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

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

function selectionEntries() {
  return categories.flatMap((category) => {
    const selection = categorySelections.get(category);
    if (!selection) return [];
    return [{
      category,
      paths: selection.mode === "all" ? null : [...selection.paths],
    }];
  });
}

function fileIsSelected(file, selections, platform, structured) {
  const parts = file.path.split(/[\\/]/);
  const source = parts[0]?.normalize("NFC");
  const category = structured ? parts[1] : parts[0];
  if (structured && !["Commun", platform].includes(source)) return false;
  const normalizedCategory = category
    ?.normalize("NFC")
    .toLocaleLowerCase("fr");
  const selection = selections.find(
    (entry) =>
      entry.category.normalize("NFC").toLocaleLowerCase("fr") ===
      normalizedCategory,
  );
  if (!selection) return false;
  if (selection.paths === null) return true;
  const relativeParts = parts.slice(structured ? 2 : 1);
  const folderPath = relativeParts.slice(0, -1).join("/");
  return selection.paths.some((selectedPath) =>
    selectedPath
      ? folderPath === selectedPath || folderPath.startsWith(`${selectedPath}/`)
      : folderPath === "",
  );
}

function renderCategoryStates() {
  const allComplete = categories.every(
    (category) => categorySelections.get(category)?.mode === "all",
  );
  const hasSelection = categorySelections.size > 0;
  const allButton = document.querySelector('[data-category="ALL"]');
  allButton.classList.toggle("selected", allComplete);
  allButton.classList.toggle("partial", !allComplete && hasSelection);
  $("status-ALL").textContent = allComplete
    ? "Tout sélectionné"
    : hasSelection
      ? "Sélection active"
      : "Tout sélectionner";

  categories.forEach((category) => {
    const button = document.querySelector(`[data-category="${category}"]`);
    const selection = categorySelections.get(category);
    button.classList.toggle("selected", selection?.mode === "all");
    button.classList.toggle("partial", selection?.mode === "partial");
    $(`status-${category}`).textContent = !selection
      ? "Non sélectionné"
      : selection.mode === "all"
        ? "Tout le dossier"
        : `${selection.paths.length} dossier${selection.paths.length > 1 ? "s" : ""}`;
  });
}

function categoryTree(category, platform) {
  const root = { children: new Map(), rootFiles: false };
  if (!scanCache) return root;
  scanCache.files.forEach((file) => {
    const parts = file.path.split(/[\\/]/);
    const source = scanCache.structured ? parts[0] : null;
    const fileCategory = scanCache.structured ? parts[1] : parts[0];
    if (fileCategory?.normalize("NFC") !== category.normalize("NFC")) return;
    if (scanCache.structured && !["Commun", platform].includes(source)) return;
    const folderParts = parts.slice(scanCache.structured ? 2 : 1, -1);
    if (!folderParts.length) {
      root.rootFiles = true;
      return;
    }
    let node = root;
    folderParts.forEach((part) => {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, children: new Map() });
      }
      node = node.children.get(part);
    });
  });
  return root;
}

function folderNodeElement(node, parentPath = "", pathOverride = null) {
  const folderPath = pathOverride ?? (parentPath ? `${parentPath}/${node.name}` : node.name);
  const wrapper = document.createElement("div");
  wrapper.className = "folder-node";

  const row = document.createElement("div");
  row.className = "folder-row";
  if (node.children.size) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "folder-toggle";
    toggle.textContent = "▾";
    toggle.setAttribute("aria-label", `Afficher ou masquer ${node.name}`);
    toggle.addEventListener("click", () => wrapper.classList.toggle("collapsed"));
    row.append(toggle);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "folder-spacer";
    row.append(spacer);
  }

  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = folderPath;
  input.checked = modalPaths.has(folderPath);
  input.addEventListener("change", () => {
    if (input.checked) modalPaths.add(folderPath);
    else modalPaths.delete(folderPath);
  });
  const text = document.createElement("span");
  text.textContent = node.name;
  label.append(input, text);
  row.append(label);
  wrapper.append(row);

  if (node.children.size) {
    const children = document.createElement("div");
    children.className = "folder-children";
    [...node.children.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }))
      .forEach((child) => children.append(folderNodeElement(child, folderPath)));
    wrapper.append(children);
  }
  return wrapper;
}

function renderFolderTree() {
  const platform =
    document.querySelector('input[name="platform"]:checked')?.value ||
    server.defaultPlatform;
  const tree = categoryTree(modalCategory, platform);
  $("folderTree").replaceChildren();

  if (tree.rootFiles) {
    const rootNode = { name: "Fichiers du dossier principal", children: new Map() };
    const rootElement = folderNodeElement(rootNode, "", "");
    $("folderTree").append(rootElement);
  }

  [...tree.children.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }))
    .forEach((node) => $("folderTree").append(folderNodeElement(node)));

  const empty = !tree.rootFiles && tree.children.size === 0;
  $("folderEmpty").classList.toggle("hidden", !empty);
}

function updateModalMode() {
  const mode = document.querySelector('input[name="selectionMode"]:checked')?.value;
  $("folderBrowser").classList.toggle("hidden", mode !== "partial");
}

async function openCategoryModal(category) {
  modalCategory = category;
  const selection = categorySelections.get(category);
  modalPaths = new Set(selection?.paths || []);
  $("modalTitle").textContent = category;
  $("folderModal").classList.remove("hidden");
  const mode = selection?.mode || "none";
  document.querySelector(
    `input[name="selectionMode"][value="${mode}"]`,
  ).checked = true;
  updateModalMode();
  $("folderTree").replaceChildren();
  $("folderEmpty").textContent = "Analyse de Nextcloud…";
  $("folderEmpty").classList.remove("hidden");

  try {
    if (!scanCache) scanCache = await window.alaTool.scan();
    renderFolderTree();
    $("folderEmpty").textContent =
      "Aucun sous-dossier disponible dans cette catégorie.";
  } catch (error) {
    $("folderEmpty").textContent =
      "Impossible de lire les dossiers Nextcloud pour le moment.";
    log(error.message || String(error));
  }
}

function closeCategoryModal() {
  $("folderModal").classList.add("hidden");
  modalCategory = null;
}

function applyCategoryModal() {
  const mode = document.querySelector('input[name="selectionMode"]:checked')?.value;
  if (mode === "partial" && modalPaths.size === 0) {
    $("folderEmpty").textContent = "Sélectionnez au moins un dossier.";
    $("folderEmpty").classList.remove("hidden");
    return;
  }
  if (mode === "none") categorySelections.delete(modalCategory);
  else {
    const normalizedPaths = [...modalPaths]
      .sort((a, b) => a.split("/").length - b.split("/").length)
      .filter(
        (selectedPath, index, paths) =>
          selectedPath === "" ||
          !paths.slice(0, index).some(
            (parentPath) =>
              parentPath !== "" && selectedPath.startsWith(`${parentPath}/`),
          ),
      );
    categorySelections.set(modalCategory, {
      mode,
      paths: mode === "partial" ? normalizedPaths : [],
    });
  }
  renderCategoryStates();
  $("selectionError").classList.add("hidden");
  closeCategoryModal();
}

function showSelection() {
  cancelled = false;
  document.body.classList.remove("cancelled");
  $("statusMark").classList.remove("visible");
  $("title").textContent = "";
  $("title").classList.add("hidden");
  $("subtitle").textContent = "";
  $("subtitle").classList.add("hidden");
  $("platformBlock").classList.remove("hidden");
  $("categoryBlock").classList.remove("hidden");
  $("progressBlock").classList.add("hidden");
  $("startButton").classList.remove("hidden");
  $("cancelButton").classList.add("hidden");
  $("openButton").classList.add("hidden");
  $("retryButton").classList.add("hidden");
  $("selectionError").classList.add("hidden");
  renderCategoryStates();
}

function setRunningState(categories, platform) {
  cancelled = false;
  document.body.classList.remove("cancelled");
  $("statusMark").classList.remove("visible");
  $("title").textContent = "Analyse des outils sélectionnés…";
  $("title").classList.remove("hidden");
  $("subtitle").textContent =
    `${platform} + fichiers communs · ${categories.includes("ALL") ? "toutes les catégories" : categories.join(", ")}.`;
  $("subtitle").classList.remove("hidden");
  $("platformBlock").classList.add("hidden");
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
  const selections = selectionEntries();
  selectedCategories = selections.map((selection) => selection.category);
  selectedPlatform =
    document.querySelector('input[name="platform"]:checked')?.value ||
    server.defaultPlatform;
  if (selectedCategories.length === 0) {
    $("selectionError").classList.remove("hidden");
    return;
  }

  $("selectionError").classList.add("hidden");
  setRunningState(selectedCategories, selectedPlatform);
  log(`Connexion à ${server.serverName}`);
  log(`Système sélectionné : ${selectedPlatform}`);
  log(`Destination sélectionnée : ${destination.path}`);

  try {
    const scan = await window.alaTool.scan();
    if (cancelled) return;
    selectedFiles = scan.files.filter((file) =>
      fileIsSelected(
        file,
        selections,
        selectedPlatform,
        scan.structured,
      ),
    );
    const selectedSources = scan.structured
      ? [
          ...new Set(
            selectedFiles
              .map((file) => file.path.split(/[\\/]/)[0])
              .filter((source) =>
                ["Commun", selectedPlatform].includes(source),
              ),
          ),
        ]
      : [];
    const selectedBytes = selectedFiles.reduce(
      (sum, file) => sum + Math.max(0, file.size || 0),
      0,
    );

    if (selectedFiles.length === 0) {
      setProgress(100);
      $("title").textContent = "Aucun outil disponible";
      $("subtitle").textContent =
        "Les catégories sélectionnées sont actuellement vides sur Nextcloud.";
      $("subtitle").classList.remove("hidden");
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
    $("subtitle").textContent = "";
    $("subtitle").classList.add("hidden");
    $("fileCount").textContent =
      `${selectedFiles.length} fichier${selectedFiles.length > 1 ? "s" : ""} sélectionné${selectedFiles.length > 1 ? "s" : ""}`;
    $("transferSize").textContent = `${formatBytes(selectedBytes)} sélectionnés`;
    $("fileName").textContent = "Préparation de la copie";
    log(
      `${selectedFiles.length} fichier${selectedFiles.length > 1 ? "s" : ""} sélectionné${selectedFiles.length > 1 ? "s" : ""} — ${formatBytes(selectedBytes)}`,
    );
    if (!scan.structured) {
      log(
        "Structure Nextcloud actuelle détectée : mode compatible sans filtrage du système.",
      );
    }

    await window.alaTool.sync({
      destination: destination.path,
      categories: selectedCategories,
      selections,
      platform: selectedPlatform,
      structured: scan.structured,
      sources: selectedSources,
    });
    if (cancelled) return;

    setProgress(100);
    $("title").textContent = "Les outils sélectionnés sont à jour";
    $("subtitle").textContent =
      "La copie Nextcloud s’est terminée avec succès. Aucun fichier local n’a été supprimé.";
    $("subtitle").classList.remove("hidden");
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
    $("subtitle").classList.remove("hidden");
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
  $("subtitle").classList.remove("hidden");
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
    if (event.type === "preflight-started") {
      $("fileName").textContent =
        "Calcul des fichiers réellement nécessaires";
      $("fileCount").textContent = "Comparaison avec la destination…";
    }
    if (event.type === "transfer-plan") {
      $("transferSize").textContent =
        event.totalBytes > 0
          ? `0 octet / ${formatBytes(event.totalBytes)}`
          : "Tout est déjà à jour";
      $("fileCount").textContent =
        event.totalTransfers > 0
          ? `0 / ${event.totalTransfers} fichier${event.totalTransfers > 1 ? "s" : ""} à transférer`
          : "Aucun fichier à transférer";
    }
    if (event.type === "phase-started") {
      $("fileName").textContent =
        event.phase === "Commun"
          ? "Mise à jour des fichiers communs"
          : event.phase === "Structure actuelle"
            ? "Mise à jour des outils"
            : `Mise à jour des outils ${event.phase}`;
      log(`Traitement : ${event.phase}`);
    }
    if (event.type === "progress") {
      const percent =
        event.totalBytes > 0 ? (event.bytes / event.totalBytes) * 100 : 0;
      setProgress(percent);
      $("transferSize").textContent =
        event.totalBytes > 0
          ? `${formatBytes(event.bytes)} / ${formatBytes(event.totalBytes)}${event.speed > 0 ? ` · ${formatBytes(event.speed)}/s` : ""}`
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

  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      if (category === "ALL") {
        const allComplete = categories.every(
          (item) => categorySelections.get(item)?.mode === "all",
        );
        categorySelections.clear();
        if (!allComplete) {
          categories.forEach((item) =>
            categorySelections.set(item, { mode: "all", paths: [] }),
          );
        }
        renderCategoryStates();
        $("selectionError").classList.add("hidden");
        return;
      }
      openCategoryModal(category);
    });
  });

  document.querySelectorAll('input[name="selectionMode"]').forEach((input) =>
    input.addEventListener("change", updateModalMode),
  );
  $("modalApply").addEventListener("click", applyCategoryModal);
  $("modalCancel").addEventListener("click", closeCategoryModal);
  $("modalClose").addEventListener("click", closeCategoryModal);
  $("folderModal").addEventListener("click", (event) => {
    if (event.target === $("folderModal")) closeCategoryModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("folderModal").classList.contains("hidden")) {
      closeCategoryModal();
    }
  });

  const defaultPlatform = document.querySelector(
    `input[name="platform"][value="${server.defaultPlatform}"]`,
  );
  if (defaultPlatform) defaultPlatform.checked = true;

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
