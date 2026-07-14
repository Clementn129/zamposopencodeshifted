const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update-available", (_event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on("update-not-available", () => callback());
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on("update-download-progress", (_event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("update-downloaded", () => callback());
  },
});
