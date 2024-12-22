<br /><div align="center"><a href="https://github.com/miroleon/CrossTag"><img src="src/icon/png/128x128.png" alt="Logo" width="80" height="80"></a><h3 align="center">CrossTag</h3>

  <p align="center">
 A cross platform tagging app built with Electron!
    <br />
    <a href="https://github.com/miroleon/CrossTag/releases"><strong>Download for Windows, MacOS, and Linux »</strong></a>
    <br />
    <br />
</div>

# About
CrossTag is an image tagging app heavily inspired by [TagGUI](https://github.com/jhc13/taggui). It is designed to prepare simple datasets for AI training applications. Since most beginner-friendly image tagging tools are not designed to be natively supported on all major OS, this app tries to offer a very simple alternative to other tools. This may be helpful for educators in the AI sector who are working with non-expert users on different OS.

# Install
Simply go to the [Releases](https://github.com/miroleon/CrossTag/releases) and download the latest CrossTag version for your system. CrossTag is portable, so it does not have to be installed. It should run by just starting the app, even from a USB stick.

# YouTube Tutorial
[Coming soon](https://www.youtube.com/@miroxleon)

# Usage
CrossTag has a small feature set to make it easy to use. Start by clicking on the folder icon and selecting the directory where you store the photos you want to tag.

**Tip:** Make a backup of your photos just in case you misname the images, etc.

Underneath the folder icon, you can also change the UI to dark or light mode.

When you have your folder loaded, CrossTag automatically creates a text file with the same filename as your source image (e.g. for "image-01.png/jpg", CrossTag creates the file "image-01.txt").

You can navigate between images by clicking on a specific filename or by using the arrow keys on your keyboard.

Under the image list, you will find a text box with a "Rename" button. You can bulk rename your images by putting a name into the textbox and pressing "Rename". The renaming pattern is as follows: [textinput]-01.png/jpg, counting up. **Warning: This is a permanent change!**

In the middle section, you see the image preview.

In the right section, you find the textbox, which shows and lets you edit the content of the text file of the image that you are currently seeing in the middle section.

**Tip: The content of the text file is being live-updated! There is no need to "save" the current state! It's always automatically saved!**

Below, you find a textbox with which you can append content to the top or end of all the images in your folder. **Tip: If you add a tag in front or at the end, include the separator and a space, e.g. "tag-01, " or " , tag-02"**.

One row below, you find the search and replace feature. This works like the search and replace in most other text editors. **Tip: This way, you can also bulk delete tags**.

Lastly, you find the "Clear" button, which deletes the content of all the text files in the directory. There will be a warning if you really want to delete all of your tags.

# Planned Features/Updates
* Overview of used tags
* Multi-selecting images for changes
* General beautification and optimisation of the code

# Explicitly Not Planned
* AI auto-tagging (makes the usage across OS unnecessarily complicated and is supported in other OS-specific apps)

# Support
You can find my [other projects on GitHub](https://github.com/miroleon) or watch my [YouTube Tutorials](https://www.youtube.com/@miroxleon).