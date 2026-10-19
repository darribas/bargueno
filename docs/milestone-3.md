# Milestone 3 — Projects and sync

**Goal (SPEC.md):** project folders, `bargueno.yml`, zip import/export via
the share sheet, and a full round trip through Working Copy.

## What's new

A third plugin, `bargueno:projects`, provides the `IProjects` service that
the other plugins now use.

- **Projects are the top-level folders** of the app's storage. Each may
  have a `bargueno.yml`; the parsed settings are cached and reloaded as soon
  as the file (or a project folder) changes.

  ```yaml
  compute: false        # true loads a Python kernel for code cells
  template: article     # default manuscript template; frontmatter `template:` wins
  citation-style: apa   # used from milestone 6
  ```

  An invalid file falls back to these defaults.
- **The settings are used:**
  - The kernel policy now follows `compute:` and only lets a notebook start
    a kernel when the project has `compute: true` *and* a kernel exists.
  - Preview and exports use the project's `template:` unless the document
    names one.
- **Status bar** shows the project of the active document.
- **Commands** (palette category *Bargueño*):
  - *New Project…* creates a folder with `bargueno.yml`, `paper.md`,
    `references.bib` and a `.gitignore` for `_exports/`, then opens
    `paper.md`.
  - *Export Project as Zip* zips the current project. On iPad it opens the
    share sheet; elsewhere it downloads.
  - *Import Project from Zip…* asks for a `.zip` and unpacks it into a
    project folder. If the project exists, it asks before replacing it.
- **Persistent storage:** the app calls `navigator.storage.persist()` at
  startup.
- **The example project is unpacked on first launch** from
  `bargueno/example.zip` instead of being shipped as JupyterLite contents
  (see finding 1). After that it is an ordinary project that you can edit,
  replace or delete.

### Zip format

- Entries sit under `<project>/`, so unzipping in Files recreates the
  folder, and paths are relative, so the archive mirrors the git checkout.
- `_exports/` is left out by default.
- Notebooks are written the way Jupyter writes them (JSON, indent 1), so
  git diffs stay small.
- Junk is dropped both ways: `.git/`, `__MACOSX/`, `._*`, `.DS_Store`,
  `.ipynb_checkpoints/`.
- **Import naming:** if every entry shares one top folder, that folder
  becomes the project name; otherwise the zip's file name does.
- **Text vs binary:** text files are stored as text (so they open in the
  editor), and anything that isn't UTF-8 is stored as binary.

## Round trip with Working Copy (iPad)

Not yet tested on a device. This is the intended flow:

1. **Into Bargueño:**
   1. In Working Copy, long-press the repository and choose *Share → Save
      to Files*. Or, in Files, long-press the repo folder (under *Working
      Copy*) and choose *Compress*.
   2. In Bargueño, run *Import Project from Zip…* and pick the `.zip`.
2. **Back to git:**
   1. In Bargueño, run *Export Project as Zip* and choose *Save to Files*
      in the share sheet.
   2. In Files, tap the zip to unpack it and copy the files over the repo
      folder in *Working Copy*.
   3. In Working Copy, review the diff and commit.

`.git/` is never imported, so the repository's history stays in Working
Copy.

## Verified headlessly (`make test`, 20 tests)

New in `tests/projects.spec.mjs` (9 tests):

- [x] Status bar shows the active document's project.
- [x] `bargueno.yml` `template:` reaches the preview, and editing the file
      takes effect without a reload.
- [x] *New Project* creates the starter files and opens `paper.md`.
- [x] Export zips under `example/`, leaves out `_exports/`, and writes
      notebooks with indent 1.
- [x] Import unpacks into a new project and drops `.git/`, `__MACOSX/` and
      `.DS_Store`.
- [x] A zip with no top folder is named after the file.
- [x] Importing over an existing project asks first. *Replace* removes the
      old files and closes their editors; *Cancel* changes nothing.
- [x] Export → import → export gives identical files.

## Findings

1. **Files shipped as JupyterLite contents can't be deleted.** They live in
   the static build, and browser storage only layers edits over them, so a
   deleted file reappears. That made the bundled example impossible to
   replace or remove. That's why it is now seeded from a zip.

   Upgrade note: if you edited the example before this change, only your
   edited files are in browser storage. Delete the `example` folder and
   clear the site data (or run *Import Project from Zip…* with a fresh
   export) to get a clean copy.
2. Single-file import and export are the stock file browser *Upload* and
   *Download*. Nothing new was needed.
3. On Chromium desktop, the share sheet is used when the platform supports
   sharing files (macOS, Windows); otherwise the zip downloads.
4. Still open from the spec: real local folders through the File System
   Access API (desktop Chromium, "Later").
