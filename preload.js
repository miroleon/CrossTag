const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    updateTextFile: (txtPath, newContent) => ipcRenderer.invoke('update-text-file', txtPath, newContent),
    appendToAll: (folder, textToAppend) => ipcRenderer.invoke('append-to-all', folder, textToAppend)
});
