const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

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
