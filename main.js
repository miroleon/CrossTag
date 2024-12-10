const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools(); // Uncomment to debug
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('select-folder', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled || filePaths.length === 0) {
        return { canceled: true };
    }

    const folder = filePaths[0];
    const files = fs.readdirSync(folder);
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif'];
    const imageData = [];

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (imageExtensions.includes(ext)) {
            const baseName = path.basename(file, ext);
            const txtPath = path.join(folder, baseName + '.txt');
            // Ensure txt file exists
            if (!fs.existsSync(txtPath)) {
                fs.writeFileSync(txtPath, '', 'utf8');
            }
            const content = fs.readFileSync(txtPath, 'utf8');
            imageData.push({
                imageName: file,
                imagePath: path.join(folder, file),
                txtPath: txtPath,
                content: content
            });
        }
    }

    return { canceled: false, folder, images: imageData };
});

ipcMain.handle('update-text-file', (event, txtPath, newContent) => {
    try {
        fs.writeFileSync(txtPath, newContent, 'utf8');
        return { success: true };
    } catch (err) {
        console.error(err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('append-to-all', (event, folder, textToAppend, position) => {
    try {
        const files = fs.readdirSync(folder);
        const txtFiles = files.filter((file) => path.extname(file).toLowerCase() === '.txt');

        for (const file of txtFiles) {
            const txtPath = path.join(folder, file);
            const oldContent = fs.readFileSync(txtPath, 'utf8');
            let newContent;
            if (position === 'start') {
                newContent = textToAppend + oldContent;
            } else {
                // Default to end
                newContent = oldContent + textToAppend;
            }
            fs.writeFileSync(txtPath, newContent, 'utf8');
        }

        return { success: true };
    } catch (err) {
        console.error(err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('clear-all', (event, folder) => {
    try {
        const files = fs.readdirSync(folder);
        const txtFiles = files.filter((file) => path.extname(file).toLowerCase() === '.txt');

        for (const file of txtFiles) {
            const txtPath = path.join(folder, file);
            fs.writeFileSync(txtPath, '', 'utf8'); // Clear content
        }

        return { success: true };
    } catch (err) {
        console.error(err);
        return { success: false, error: err.message };
    }
});