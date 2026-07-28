const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("alaTool", {
  getDestination: () => ipcRenderer.invoke("destination:get"),
  getServer: () => ipcRenderer.invoke("server:get"),
  scan: () => ipcRenderer.invoke("sync:scan"),
  sync: (destination) => ipcRenderer.invoke("sync:run", destination),
  cancelSync: () => ipcRenderer.invoke("sync:cancel"),
  onSyncEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("sync:event", listener);
    return () => ipcRenderer.removeListener("sync:event", listener);
  },
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath),
});
