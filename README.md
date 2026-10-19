# Bargueño

An offline-first writing studio for manuscripts and slide decks, built as a
pared-back JupyterLite PWA. See [SPEC.md](SPEC.md) for the full design.

**Status:** milestone 2 (Typst preview). Notes per milestone:
[1 spike](docs/spike.md), [2 Typst preview](docs/milestone-2.md).

## Develop

```sh
make setup   # venv + pinned JupyterLite and extensions; npm ci in extension/
make build   # build extension/, jupyter lite build -> dist/, then scripts/postbuild.py
make serve   # http://localhost:8000/lab/index.html
npm ci && make test   # headless Chromium smoke tests (Playwright)
```

| Path | What it is |
| --- | --- |
| `lite/` | JupyterLite config: `jupyter-lite.json`, `overrides.json`, service worker template, icons |
| `extension/` | The Bargueño JupyterLab extension (TypeScript): Typst preview, exports, kernel policy |
| `content/` | Files seeded into the app's storage (the example project) |
| `scripts/postbuild.py` | Rebrands the manifest, adds iPad meta tags, copies Typst WASM and fonts, writes the precaching service worker |
| `tests/` | Playwright checks for the milestone |

## Licence

Code is BSD-3-Clause. Bundled content (example project, templates, themes)
is CC-BY-4.0.
