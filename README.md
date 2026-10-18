# Bargueño

An offline-first writing studio for manuscripts and slide decks, built as a
pared-back JupyterLite PWA. See [SPEC.md](SPEC.md) for the full design.

**Status:** milestone 1 (spike). See [docs/spike.md](docs/spike.md) for what
it proves and what it found.

## Develop

```sh
make setup   # venv + pinned JupyterLite, jupyterlab-myst, -myst-revealjs, -vim
make build   # jupyter lite build -> dist/, then scripts/postbuild.py (PWA bits)
make serve   # http://localhost:8000/lab/index.html
npm ci && make test   # headless Chromium smoke tests (Playwright)
```

| Path | What it is |
| --- | --- |
| `lite/` | JupyterLite config: `jupyter-lite.json`, `overrides.json`, service worker template, icons |
| `content/` | Files seeded into the app's storage (the example project) |
| `scripts/postbuild.py` | Rebrands the manifest, adds iPad meta tags, writes the precaching service worker |
| `tests/` | Playwright checks for the milestone |

## Licence

Code is BSD-3-Clause. Bundled content (example project, templates, themes)
is CC-BY-4.0.
