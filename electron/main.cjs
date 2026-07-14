const { app, BrowserWindow, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const { spawn } = require("child_process");

const isDev = process.env.ELECTRON_DEV === "1";
const isWin = process.platform === "win32";

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: "ZamPOS",
    icon: path.join(__dirname, "..", "public", "icon-512.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:8080");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Build app menu (minimal, just Quit on macOS / Exit on win/linux)
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        isWin
          ? { role: "quit", label: "Exit" }
          : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ])
);

// Auto-updater — uses GitHub Releases from electron-builder publish config
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on("update-available", (info) => {
  if (mainWindow) {
    mainWindow.webContents.send("update-available", info);
  }
});

autoUpdater.on("update-not-available", () => {
  if (mainWindow) {
    mainWindow.webContents.send("update-not-available");
  }
});

autoUpdater.on("download-progress", (progress) => {
  if (mainWindow) {
    mainWindow.webContents.send("update-download-progress", progress);
  }
});

autoUpdater.on("update-downloaded", () => {
  if (mainWindow) {
    mainWindow.webContents.send("update-downloaded");
  }
});

autoUpdater.on("error", (err) => {
  console.error("Auto-updater error:", err);
});

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!isWin) app.quit();
});
