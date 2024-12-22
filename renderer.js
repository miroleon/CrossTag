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

const searchInput = document.getElementById('search-input');
const replaceInput = document.getElementById('replace-input');
const replaceAllBtn = document.getElementById('replace-all-btn');

const renameBaseInput = document.getElementById('rename-base-input');
const renameAllBtn = document.getElementById('rename-all-btn');

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

        // Apply 'selected' class if this is the current index
        if (idx === currentIndex) {
            li.classList.add('selected');
        }

        li.addEventListener('click', () => {
            loadImageAndText(idx);
            // Update the selected class
            updateSelectedClass();
        });
        imagesList.appendChild(li);
    });
}

function loadImageAndText(index) {
    if (index < 0 || index >= imagesData.length) return;
    currentIndex = index;
    const data = imagesData[index];
    imageContainer.src = data.imagePath;
    textContainer.value = data.content;

    // After updating currentIndex, update the selected class
    updateSelectedClass();
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

replaceAllBtn.addEventListener('click', async () => {
    if (!currentFolder) {
        statusMessage.textContent = 'No folder selected.';
        return;
    }

    const searchFor = searchInput.value;
    const replaceWith = replaceInput.value;

    if (!searchFor) {
        statusMessage.textContent = 'Please enter a search term.';
        return;
    }

    const result = await window.electronAPI.searchAndReplace(currentFolder, searchFor, replaceWith);
    if (result.success) {
        // Update local imageData content
        imagesData = imagesData.map(item => {
            const regex = new RegExp(searchFor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            const newContent = item.content.replace(regex, replaceWith);
            item.content = newContent;
            return item;
        });

        // If an image is currently loaded, update its content
        if (currentIndex !== -1) {
            textContainer.value = imagesData[currentIndex].content;
        }

        statusMessage.textContent = 'Search and replace completed successfully.';
    } else {
        statusMessage.textContent = 'Error in search and replace: ' + result.error;
    }
});

function showModal() {
    modalOverlay.style.display = 'flex';
}

function hideModal() {
    modalOverlay.style.display = 'none';
}

renameAllBtn.addEventListener('click', async () => {
    if (!currentFolder) {
        statusMessage.textContent = 'No folder selected.';
        return;
    }

    const baseName = renameBaseInput.value;
    if (!baseName.trim()) {
        statusMessage.textContent = 'Please enter a base name.';
        return;
    }

    const result = await window.electronAPI.renameAll(currentFolder, baseName);
    if (result.success) {
        // After renaming, re-select the folder to refresh image list and data
        const reloadResult = await window.electronAPI.selectFolder();
        if (!reloadResult.canceled) {
            currentFolder = reloadResult.folder;
            imagesData = reloadResult.images;
            displayImageList();
            if (imagesData.length > 0) {
                loadImageAndText(0);
            } else {
                clearDisplay();
            }
            statusMessage.textContent = 'All images renamed successfully.';
        }
    } else {
        statusMessage.textContent = 'Error renaming files: ' + result.error;
    }
});

/**
 * Updates the 'selected' class on the <li> elements based on the currentIndex.
 */
function updateSelectedClass() {
    const listItems = imagesList.getElementsByTagName('li');
    for (let i = 0; i < listItems.length; i++) {
        if (i === currentIndex) {
            listItems[i].classList.add('selected');
        } else {
            listItems[i].classList.remove('selected');
        }
    }
}

function handleArrowNavigation(event) {
    const { key } = event;

    // Ignore key events if focus is on input or textarea elements
    const tagName = document.activeElement.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea') {
        return;
    }

    if (key === 'ArrowUp' || key === 'ArrowLeft') {
        // Navigate to the previous image with wrapping
        const newIndex = (currentIndex > 0) ? currentIndex - 1 : imagesData.length - 1;
        loadImageAndText(newIndex);
        event.preventDefault();
    } else if (key === 'ArrowDown' || key === 'ArrowRight') {
        // Navigate to the next image with wrapping
        const newIndex = (currentIndex < imagesData.length - 1) ? currentIndex + 1 : 0;
        loadImageAndText(newIndex);
        event.preventDefault();
    }
}

document.addEventListener('keydown', handleArrowNavigation);