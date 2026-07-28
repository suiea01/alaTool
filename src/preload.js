const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("alaTool", {
  getDestination: () => ipcRenderer.invoke("destination:get"),
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath),
});
