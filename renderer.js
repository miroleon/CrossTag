let currentFolder = null;
let imagesData = [];
let currentIndex = -1;

const selectFolderBtn = document.getElementById('select-folder-btn');
const imageContainer = document.getElementById('image-container');
const textContainer = document.getElementById('text-container');
const imagesList = document.getElementById('images-list');
const addToAllBtn = document.getElementById('add-to-all-btn');
const addToAllInput = document.getElementById('add-to-all-input');
const appendPositionStart = document.getElementById('append-position-start');
const appendPositionEnd = document.getElementById('append-position-end');
const statusMessage = document.getElementById('status-message');
const clearAllBtn = document.getElementById('clear-all-btn');

// Modal elements
const modalOverlay = document.getElementById('modal-overlay');
const modalYesBtn = document.getElementById('modal-yes');
const modalNoBtn = document.getElementById('modal-no');

selectFolderBtn.addEventListener('click', async () => {
    const result = await window.electronAPI.selectFolder();
    if (result.canceled) return;
    currentFolder = result.folder;
    imagesData = result.images;

    displayImageList();
    if (imagesData.length > 0) {
        loadImageAndText(0);
    } else {
        clearDisplay();
    }

    statusMessage.textContent = '';
});

function displayImageList() {
    imagesList.innerHTML = '';
    imagesData.forEach((img, idx) => {
        const li = document.createElement('li');
        li.textContent = img.imageName;
        li.addEventListener('click', () => loadImageAndText(idx));
        imagesList.appendChild(li);
    });
}

function loadImageAndText(index) {
    if (index < 0 || index >= imagesData.length) return;
    currentIndex = index;
    const data = imagesData[index];
    imageContainer.src = data.imagePath;
    textContainer.value = data.content;
}

textContainer.addEventListener('input', async () => {
    if (currentIndex === -1) return;
    const data = imagesData[currentIndex];
    const newContent = textContainer.value;
    const result = await window.electronAPI.updateTextFile(data.txtPath, newContent);
    if (!result.success) {
        console.error('Failed to update text file', result.error);
    } else {
        imagesData[currentIndex].content = newContent;
    }
});

function clearDisplay() {
    imageContainer.src = '';
    textContainer.value = '';
}

addToAllBtn.addEventListener('click', async () => {
    if (!currentFolder) {
        statusMessage.textContent = 'No folder selected.';
        return;
    }

    const textToAppend = addToAllInput.value;
    if (!textToAppend) {
        statusMessage.textContent = 'Please enter the text to append.';
        return;
    }

    const position = appendPositionStart.checked ? 'start' : 'end';

    const result = await window.electronAPI.appendToAll(currentFolder, textToAppend, position);
    if (result.success) {
        imagesData = imagesData.map(item => {
            if (position === 'start') {
                item.content = textToAppend + item.content;
            } else {
                item.content = item.content + textToAppend;
            }
            return item;
        });

        if (currentIndex !== -1) {
            textContainer.value = imagesData[currentIndex].content;
        }

        addToAllInput.value = '';
        statusMessage.textContent = 'Text appended to all files successfully.';
        addToAllInput.focus();
    } else {
        statusMessage.textContent = 'Error appending text: ' + result.error;
    }
});

clearAllBtn.addEventListener('click', () => {
    if (!currentFolder) {
        statusMessage.textContent = 'No folder selected.';
        return;
    }
    // Show modal
    showModal();
});

modalYesBtn.addEventListener('click', async () => {
    hideModal();
    const result = await window.electronAPI.clearAll(currentFolder);
    if (result.success) {
        imagesData = imagesData.map(item => {
            item.content = '';
            return item;
        });

        if (currentIndex !== -1) {
            textContainer.value = '';
        }

        statusMessage.textContent = 'All text files have been cleared.';
        addToAllInput.focus();
    } else {
        statusMessage.textContent = 'Error clearing files: ' + result.error;
    }
});

modalNoBtn.addEventListener('click', () => {
    hideModal();
});

function showModal() {
    modalOverlay.style.display = 'flex';
}

function hideModal() {
    modalOverlay.style.display = 'none';
}
