const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

let activeTransfer = null;

function runtimePath(...segments) {
  if (app.isPackaged) return path.join(process.resourcesPath, ...segments);
  return path.join(__dirname, "..", ...segments);
}

function loadRuntimeConfig() {
  return JSON.parse(
    fs.readFileSync(runtimePath("config", "runtime.json"), "utf8"),
  );
}

function rclonePath() {
  const platformKey = `${process.platform}-${process.arch}`;
  const executable = process.platform === "win32" ? "rclone.exe" : "rclone";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bin", platformKey, executable);
  }
  return runtimePath("resources", "bin", platformKey, executable);
}

function webdavArgs(config) {
  return [
    "--config",
    process.platform === "win32" ? "NUL" : "/dev/null",
    "--webdav-url",
    config.webdavUrl,
    "--webdav-vendor",
    "nextcloud",
    "--webdav-user",
    config.shareToken,
    "--webdav-pass",
    "",
  ];
}

function runRclone(args, onLine) {
  return new Promise((resolve, reject) => {
    const binary = rclonePath();
    if (!fs.existsSync(binary)) {
      reject(
        new Error(
          `Moteur rclone introuvable pour ${process.platform}-${process.arch}`,
        ),
      );
      return;
    }

    const child = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeTransfer = child;
    let stdout = "";
    let stderr = "";
    let stdoutLine = "";
    let stderrLine = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLine) {
        stdoutLine += text;
        const lines = stdoutLine.split(/\r?\n/);
        stdoutLine = lines.pop();
        lines.forEach((line) => onLine(line));
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLine) {
        stderrLine += text;
        const lines = stderrLine.split(/\r?\n/);
        stderrLine = lines.pop();
        lines.forEach((line) => onLine(line));
      }
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      activeTransfer = null;
      if (onLine) {
        if (stdoutLine) onLine(stdoutLine);
        if (stderrLine) onLine(stderrLine);
      }
      if (signal) {
        reject(new Error("Téléchargement annulé"));
      } else if (code !== 0) {
        reject(new Error(stderr.trim() || `rclone a retourné le code ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function destinationInfo() {
  if (process.platform === "win32") {
    const preferred = "T:\\";
    if (fs.existsSync(preferred)) {
      return { path: path.join(preferred, "Tools"), fallback: false };
    }
  }

  if (process.platform === "darwin") {
    const preferred = "/Volumes/T";
    if (fs.existsSync(preferred)) {
      return { path: path.join(preferred, "Tools"), fallback: false };
    }
  }

  return {
    path: path.join(os.homedir(), "Documents", "Tools"),
    fallback: true,
  };
}

function createWindow() {
  const initialHeight = process.platform === "win32" ? 650 : 670;
  const window = new BrowserWindow({
    width: 780,
    height: initialHeight,
    useContentSize: true,
    minWidth: 720,
    minHeight: 650,
    show: false,
    center: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#11131a" : "#f6f7fb",
    title: "alaTool",
    icon: path.join(__dirname, "..", "assets", "alatool-icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(path.join(__dirname, "index.html"));
  window.once("ready-to-show", () => window.show());
}

ipcMain.handle("destination:get", () => destinationInfo());
ipcMain.handle("server:get", () => {
  const config = loadRuntimeConfig();
  return {
    mode: config.mode,
    serverName: config.serverName,
    defaultPlatform: process.platform === "win32" ? "Windows" : "Mac",
  };
});
ipcMain.handle("sync:scan", async () => {
  const config = loadRuntimeConfig();
  const result = await runRclone([
    "lsjson",
    "-R",
    "--files-only",
    ":webdav:",
    ...webdavArgs(config),
  ]);
  const files = JSON.parse(result.stdout || "[]");
  const mappedFiles = files.map((file) => ({
    path: file.Path,
    name: file.Name,
    size: file.Size,
  }));
  const structured = mappedFiles.some((file) =>
    ["Commun", "Windows", "Mac"].includes(file.path.split(/[\\/]/)[0]),
  );
  return {
    files: mappedFiles,
    structured,
    totalBytes: files.reduce(
      (sum, file) => sum + Math.max(0, file.Size || 0),
      0,
    ),
  };
});
ipcMain.handle("sync:run", async (event, request) => {
  const config = loadRuntimeConfig();
  const allowedCategories = [
    "LED",
    "Captation",
    "Divers",
    "Switcher",
    "Média Serveur",
  ];
  const requestedCategories = Array.isArray(request?.categories)
    ? request.categories
    : [];
  const allSelected = requestedCategories.includes("ALL");
  const selectedPlatform = ["Windows", "Mac"].includes(request?.platform)
    ? request.platform
    : process.platform === "win32"
      ? "Windows"
      : "Mac";
  const categories = allSelected
    ? allowedCategories
    : requestedCategories.filter((category) =>
        allowedCategories.includes(category),
      );

  if (!request?.destination || categories.length === 0) {
    throw new Error("Aucune catégorie valide n’a été sélectionnée.");
  }

  const filterArgs = allSelected
    ? []
    : categories.flatMap((category) => [
        "--include",
        `/${category}/**`,
      ]);

  const allowedSources = ["Commun", selectedPlatform];
  const requestedSources = Array.isArray(request?.sources)
    ? request.sources.filter((source) => allowedSources.includes(source))
    : allowedSources;
  const phases = request?.structured
    ? requestedSources.map((source) => ({
        name: source,
        remote: `:webdav:${source}`,
      }))
    : [{ name: "Structure actuelle", remote: ":webdav:" }];

  const parseStats = (line, callback) => {
    if (!line.trim()) return;
    try {
      const entry = JSON.parse(line);
      if (entry.stats) callback(entry.stats, entry);
    } catch {
      // Les lignes non JSON sont conservées uniquement dans le journal rclone.
    }
  };

  event.sender.send("sync:event", { type: "transfer-started" });
  event.sender.send("sync:event", { type: "preflight-started" });

  for (const phase of phases) {
    phase.totalBytes = 0;
    phase.totalTransfers = 0;
    await runRclone(
      [
        "copy",
        phase.remote,
        request.destination,
        ...webdavArgs(config),
        ...filterArgs,
        "--dry-run",
        "--check-first",
        "--stats",
        "250ms",
        "--stats-log-level",
        "INFO",
        "--use-json-log",
        "--log-level",
        "INFO",
      ],
      (line) =>
        parseStats(line, (stats) => {
          phase.totalBytes = Math.max(
            phase.totalBytes,
            Math.max(0, stats.totalBytes || 0),
          );
          phase.totalTransfers = Math.max(
            phase.totalTransfers,
            Math.max(0, stats.totalTransfers || 0),
          );
        }),
    );
  }

  const plannedBytes = phases.reduce(
    (sum, phase) => sum + phase.totalBytes,
    0,
  );
  const plannedTransfers = phases.reduce(
    (sum, phase) => sum + phase.totalTransfers,
    0,
  );
  let completedBytes = 0;
  let completedTransfers = 0;
  let combinedLog = "";

  event.sender.send("sync:event", {
    type: "transfer-plan",
    totalBytes: plannedBytes,
    totalTransfers: plannedTransfers,
  });

  for (const phase of phases) {
    event.sender.send("sync:event", {
      type: "phase-started",
      phase: phase.name,
    });
    const result = await runRclone(
      [
        "copy",
        phase.remote,
        request.destination,
        ...webdavArgs(config),
        ...filterArgs,
        "--check-first",
        "--create-empty-src-dirs",
        "--stats",
        "250ms",
        "--stats-log-level",
        "INFO",
        "--use-json-log",
        "--log-level",
        "INFO",
      ],
      (line) => {
        if (!line.trim()) return;
        try {
          const entry = JSON.parse(line);
          if (entry.stats) {
            const phaseBytes = Math.min(
              phase.totalBytes,
              Math.max(0, entry.stats.bytes || 0),
            );
            const phaseTransfers = Math.min(
              phase.totalTransfers,
              Math.max(0, entry.stats.transfers || 0),
            );
            event.sender.send("sync:event", {
              type: "progress",
              bytes: completedBytes + phaseBytes,
              totalBytes: plannedBytes,
              transfers: completedTransfers + phaseTransfers,
              totalTransfers: plannedTransfers,
              speed: Math.max(0, Number(entry.stats.speed) || 0),
            });
            const activeFile = Array.isArray(entry.stats.transferring)
              ? entry.stats.transferring.find((transfer) => transfer?.name)
              : null;
            if (activeFile) {
              event.sender.send("sync:event", {
                type: "current-file",
                path: activeFile.name,
              });
            }
          }
          if (entry.object) {
            event.sender.send("sync:event", {
              type: "current-file",
              path: entry.object,
            });
          }
          if (entry.msg && !entry.stats) {
            event.sender.send("sync:event", {
              type: "log",
              line: entry.msg,
            });
          }
        } catch {
          event.sender.send("sync:event", { type: "log", line });
        }
      },
    );
    completedBytes += phase.totalBytes;
    completedTransfers += phase.totalTransfers;
    combinedLog += result.stderr;
  }

  event.sender.send("sync:event", { type: "transfer-complete" });
  return { ok: true, log: combinedLog };
});
ipcMain.handle("sync:cancel", () => {
  if (!activeTransfer) return false;
  activeTransfer.kill();
  return true;
});
ipcMain.handle("folder:open", async (_event, folderPath) => {
  await fs.promises.mkdir(folderPath, { recursive: true });
  return shell.openPath(folderPath);
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
