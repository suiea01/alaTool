const { app, BrowserWindow, ipcMain, shell } = require("electron");
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

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (onLine) onLine(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (onLine) onLine(text);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      activeTransfer = null;
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
  const window = new BrowserWindow({
    width: 780,
    height: 610,
    minWidth: 720,
    minHeight: 560,
    show: false,
    center: true,
    backgroundColor: "#f6f7fb",
    title: "alaTool",
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
  return { mode: config.mode, serverName: config.serverName };
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
  return {
    files: files.map((file) => ({
      path: file.Path,
      name: file.Name,
      size: file.Size,
    })),
    totalBytes: files.reduce(
      (sum, file) => sum + Math.max(0, file.Size || 0),
      0,
    ),
  };
});
ipcMain.handle("sync:run", async (event, destination) => {
  const config = loadRuntimeConfig();
  event.sender.send("sync:event", { type: "transfer-started" });
  const result = await runRclone(
    [
      "copy",
      ":webdav:",
      destination,
      ...webdavArgs(config),
      "--create-empty-src-dirs",
      "--stats",
      "250ms",
      "--log-level",
      "INFO",
    ],
    (line) => event.sender.send("sync:event", { type: "log", line }),
  );
  event.sender.send("sync:event", { type: "transfer-complete" });
  return { ok: true, log: result.stderr };
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
