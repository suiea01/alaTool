const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("alaTool", {
  getDestination: () => ipcRenderer.invoke("destination:get"),
  chooseDestination: () => ipcRenderer.invoke("destination:choose"),
  checkStorage: (request) => ipcRenderer.invoke("storage:check", request),
  getServer: () => ipcRenderer.invoke("server:get"),
  scan: () => ipcRenderer.invoke("sync:scan"),
  sync: (request) => ipcRenderer.invoke("sync:run", request),
  cancelSync: () => ipcRenderer.invoke("sync:cancel"),
  onSyncEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("sync:event", listener);
    return () => ipcRenderer.removeListener("sync:event", listener);
  },
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath),
});
