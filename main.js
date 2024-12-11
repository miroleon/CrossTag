const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        icon: path.join(__dirname, 'src/icon/png/1024x1024.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.setMenu(null);
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

// Existing handlers omitted for brevity

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

// New IPC handler for Search and Replace
ipcMain.handle('search-and-replace', (event, folder, searchFor, replaceWith) => {
    try {
        if (!searchFor) {
            // If no search term is provided, do nothing
            return { success: true };
        }

        const files = fs.readdirSync(folder);
        const txtFiles = files.filter((file) => path.extname(file).toLowerCase() === '.txt');

        for (const file of txtFiles) {
            const txtPath = path.join(folder, file);
            const oldContent = fs.readFileSync(txtPath, 'utf8');
            // Replace all occurrences of searchFor with replaceWith
            // Use a global regular expression
            const regex = new RegExp(searchFor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            const newContent = oldContent.replace(regex, replaceWith);
            if (newContent !== oldContent) {
                fs.writeFileSync(txtPath, newContent, 'utf8');
            }
        }

        return { success: true };
    } catch (err) {
        console.error(err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('rename-all', (event, folder, baseName) => {
    try {
        if (!baseName || !baseName.trim()) {
            return { success: false, error: 'Base name cannot be empty.' };
        }
        baseName = baseName.trim();

        const files = fs.readdirSync(folder);
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif'];
        // Filter only images that have corresponding txt (assume txt always exist from previous logic)
        let imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            if (!imageExtensions.includes(ext)) return false;
            const base = path.basename(file, ext);
            const txtPath = path.join(folder, base + '.txt');
            return fs.existsSync(txtPath);
        });

        // Sort images by original filename for consistent ordering
        imageFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        // Rename each image and its corresponding txt file
        for (let i = 0; i < imageFiles.length; i++) {
            const oldImageName = imageFiles[i];
            const ext = path.extname(oldImageName);
            const oldBase = path.basename(oldImageName, ext);
            const oldTxtName = oldBase + '.txt';

            const newNumber = (i + 1).toString().padStart(2, '0'); // 2-digit numbering
            const newImageName = `${baseName}-${newNumber}${ext}`;
            const newTxtName = `${baseName}-${newNumber}.txt`;

            const oldImagePath = path.join(folder, oldImageName);
            const oldTxtPath = path.join(folder, oldTxtName);
            const newImagePath = path.join(folder, newImageName);
            const newTxtPath = path.join(folder, newTxtName);

            fs.renameSync(oldImagePath, newImagePath);
            fs.renameSync(oldTxtPath, newTxtPath);
        }

        return { success: true };
    } catch (err) {
        console.error(err);
        return { success: false, error: err.message };
    }
});