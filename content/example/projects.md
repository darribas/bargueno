---
title: Projects in Bargueño
subtitle: Folders, settings and moving work in and out
authors:
  - name: Bargueño
abstract: |
  A project is an ordinary folder of text files. This guide explains how
  Bargueño finds projects, what the bargueno.yml settings file does, and how
  to move a project between Bargueño and git (Working Copy on iPad) with a
  zip file. Open the preview to read it typeset.
---

# What a project is

Every folder at the top of the file browser is a **project**. A project is
the unit Bargueño imports, exports and configures. It holds your manuscripts,
decks, references and figures, and nothing else:

```text
my-paper/
├── bargueno.yml      project settings (optional)
├── paper.md          a manuscript
├── talk.ipynb        a slide deck
├── references.bib    the project's references
├── assets/           images and figures
└── _exports/         PDFs and other outputs (never synced)
```

The status bar shows the project of the document you are editing. Files at
the very top level, outside any folder, belong to no project and use the
default settings.

Because a project is just a folder of plain text, it round-trips cleanly
through git: what you see in Bargueño is exactly what you commit.

# Settings: `bargueno.yml`

Each project can carry a `bargueno.yml` at its root. Every key is optional;
anything missing takes its default.

```yaml
compute: false        # true loads a Python kernel for code cells
template: article     # default manuscript template
citation-style: apa   # how citations are formatted
```

`compute`
: Off by default. While it is off, notebooks open without a kernel and code
  cells show their stored outputs. Turning it on matters once Bargueño ships
  a Python kernel.

`template`
: The template manuscripts use when their own frontmatter does not name one.
  A `template:` line in a document always wins over the project setting.
  Only *article* exists so far; other names fall back to it, with a warning
  in the preview.

`citation-style`
: Reserved for citations, which arrive in a later version.

Edits to `bargueno.yml` take effect as soon as the file is saved; there is no
need to reload. If the file cannot be read (for example, a YAML typo), the
project quietly uses the defaults.

# Starting a project

Run **New Project…** from the command palette (category *Bargueño*) and give
it a name. Bargueño creates the folder with a `bargueno.yml`, an empty
`paper.md` and `references.bib`, and a `.gitignore` that keeps `_exports/` out
of git, then opens `paper.md` for you.

# Moving projects in and out

Bargueño keeps your files in the browser's own storage, on this device only.
Nothing leaves it unless you export it. Projects travel as zip files.

## Exporting

**Export Project as Zip** packs the current project, meaning the one whose
document is open or whose folder is open in the file browser:

- On iPad the share sheet opens: choose *Save to Files* (for example into
  Working Copy's folder), or send it anywhere else.
- Elsewhere the zip downloads.

The zip contains one folder named after the project, so unzipping it
recreates the folder. Paths stay relative, `_exports/` is left out, and
notebooks are written the way Jupyter writes them, so git shows small,
readable diffs.

## Importing

**Import Project from Zip…** asks for a zip and unpacks it:

- If everything in the zip sits inside one folder, that folder's name becomes
  the project name; otherwise the zip's file name does.
- `.git/` folders and macOS clutter (`__MACOSX/`, `.DS_Store`, `._*` files)
  are skipped, so a zip of a git checkout imports cleanly.
- If a project with that name already exists, Bargueño asks before replacing
  it. Replacing removes the old files completely and closes their open
  documents, so the project matches the zip exactly.

:::{warning}
Replacing a project cannot be undone. Export it first if you might want the
current version back.
:::

## Round trip with Working Copy

On iPad, git lives in Working Copy and the two apps meet in the Files app.

1. **Into Bargueño.** In Files, open *Working Copy*, long-press the
   repository folder and choose *Compress*. In Bargueño, run *Import Project
   from Zip…* and pick the new zip.
2. **Write.** Edit, preview and export as usual.
3. **Back to git.** In Bargueño, run *Export Project as Zip* and save the zip
   to Files. Unzip it there and copy its files over the repository folder in
   *Working Copy*. In Working Copy, review the changes and commit.

Single files can also go in and out with the file browser's *Upload* and
*Download*, which is handy for a quick edit.

# Keeping work safe

Browser storage is reliable but not a backup. Bargueño asks the browser to
keep its storage persistent, and an app added to the Home Screen is the least
likely to be cleared. Still, export projects you care about regularly; the
zip in Working Copy is your real copy.

# The example project

This folder is the example project. You can edit, rename or delete it like
any other. **Restore Example Project** puts a fresh copy back (asking before
replacing yours), which is also how to get guides added in newer versions.

# When something looks wrong

Bargueño updates itself in the background. When a new version is ready, a
notice says so with a *Reload* button; until you reload, the page keeps
running the version it started with.

**About Bargueño** (command palette) shows which build is running, which
version of the offline cache is active, and whether storage is persistent.
Include it when reporting a problem.
