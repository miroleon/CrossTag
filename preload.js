const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    updateTextFile: (txtPath, newContent) => ipcRenderer.invoke('update-text-file', txtPath, newContent),
    appendToAll: (folder, textToAppend, position) => ipcRenderer.invoke('append-to-all', folder, textToAppend, position),
    clearAll: (folder) => ipcRenderer.invoke('clear-all', folder),
    searchAndReplace: (folder, searchFor, replaceWith) => ipcRenderer.invoke('search-and-replace', folder, searchFor, replaceWith),
    renameAll: (folder, baseName) => ipcRenderer.invoke('rename-all', folder, baseName)
});