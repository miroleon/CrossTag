let currentFolder = null;
let imagesData = [];
let currentIndex = -1;

const selectFolderBtn = document.getElementById('select-folder-btn');
const imageContainer = document.getElementById('image-container');
const textContainer = document.getElementById('text-container');
const imagesList = document.getElementById('images-list');
const addToAllBtn = document.getElementById('add-to-all-btn');

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
});

function displayImageList() {
    imagesList.innerHTML = '';
    imagesData.forEach((img, idx) => {
        const li = document.createElement('li');
        li.textContent = img.imageName;
        li.style.cursor = 'pointer';
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
    if (result.success) {
        imagesData[currentIndex].content = newContent;
    } else {
        console.error('Failed to update text file', result.error);
    }
});

function clearDisplay() {
    imageContainer.src = '';
    textContainer.value = '';
}

addToAllBtn.addEventListener('click', async () => {
    if (!currentFolder) {
        alert('No folder selected.');
        return;
    }
    const textToAppend = prompt('Enter the text to append to all .txt files:');
    if (textToAppend == null) return;

    const result = await window.electronAPI.appendToAll(currentFolder, textToAppend);
    if (result.success) {
        // Update local data as well
        imagesData = imagesData.map(item => {
            item.content += textToAppend;
            return item;
        });
        if (currentIndex !== -1) {
            textContainer.value = imagesData[currentIndex].content;
        }
        alert('Text appended to all files successfully.');
    } else {
        alert('Error appending text: ' + result.error);
    }
});
