# CrossTag web

The caption editor of CrossTag as a web page, published at https://miroleon.github.io/CrossTag/ by the
workflow in `.github/workflows/pages.yml`. It is plain HTML, CSS and JavaScript modules, with no build
step and no dependencies.

## Files

| Path | Contents |
|---|---|
| `index.html` | The page. |
| `app.js` | Connects the page to the library: list, preview, caption box, tags, bulk edits, renaming, checks, dataset card, export. |
| `styles.css` | The look of the desktop app, in a dark and a light theme. |
| `lib/tagger/` | The tagger library: caption rules, the two stores, checks, dataset card, export layouts, training files. |
| `lib/zip.js` | Writes and reads ZIP files without a library. |

The page also loads the icon and the Material Symbols font from `../src/`, the same files the desktop
app uses. The Pages workflow copies them next to `web/`.

## Where captions are saved

- Folder mode (Chrome and Edge on a computer): the File System Access API gives the page a folder, and
  each caption is saved as a .txt file next to its picture while you type. The dataset information
  (trigger word, model, dataset card, picture sources) goes into `tagger.json` in the same folder.
- Browser mode (every browser): pictures and captions stay in this browser's IndexedDB, in a database
  named `crosstag`, and survive a reload. The export saves them as a ZIP, and the layout "CrossTag, to
  continue later" can be added again in any browser.

Unlike the desktop app, folder mode does not create empty .txt files when a folder opens; it writes a
caption file on the first edit.

## Running it locally

Modules do not load from `file://` addresses, so the page needs a small web server. From the
repository root (not from `web/`, since the page loads `../src/`):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000/web/.

## Where the library comes from

The files in `lib/` are copies from the owner's ai-showcase project (`src/lib/tagger/` and
`src/lib/studio/zip.js`, commit 6065cf3), where the same library runs in a workshop page. Each file
names its source in its first lines. To keep the two copies the same, change a file there first and
copy it here again. `app.js` and `index.html` are written for this repository.

## License

MIT, like the rest of the repository (see `LICENSE`).
