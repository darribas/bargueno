"""Turn a `jupyter lite build` output into the Bargueño PWA.

Run after the build:  python scripts/postbuild.py dist

- rewrites the web manifest with Bargueño's name and icons
- adds iPad Home Screen meta tags to every app page
- copies the Typst WASM modules and bundled fonts into bargueno/typst/
- replaces JupyterLite's service worker with one that precaches the app
  shell (so it opens offline) while keeping JupyterLite's drive broadcast
"""

import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SW_TEMPLATE = ROOT / "lite" / "service-worker.js"
ICONS = ROOT / "lite" / "icons"
NODE_MODULES = ROOT / "extension" / "node_modules"

# Served from bargueno/typst/ and loaded by extension/src/engine.ts.
TYPST_ASSETS = {
    "typst_ts_web_compiler_bg.wasm": "@myriaddreamin/typst-ts-web-compiler/pkg",
    "typst_ts_renderer_bg.wasm": "@myriaddreamin/typst-ts-renderer/pkg",
}
TYPST_FONT_DIR = "@typst-wasm/fonts/dist/files"
TYPST_FONTS = [
    "LibertinusSerif-Regular.otf",
    "LibertinusSerif-Italic.otf",
    "LibertinusSerif-Bold.otf",
    "LibertinusSerif-BoldItalic.otf",
    "NewCMMath-Regular.otf",
    "DejaVuSansMono.ttf",
    "DejaVuSansMono-Bold.ttf",
]

# Apps JupyterLite builds that Bargueño never opens.
UNUSED_APPS = {"consoles", "doc", "edit", "notebooks", "repl", "tree"}
# Not worth precaching: every browser we target uses woff2, and the rest is
# build tooling or licence text.
SKIP_SUFFIXES = {".ttf", ".woff", ".eot", ".map", ".txt", ".ipynb"}
SKIP_NAMES = {"service-worker.js", "package.json", "jupyterlite.schema.v0.json"}

HEAD_TAGS = """
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Bargueño">
    <meta name="theme-color" content="#f6f1e7" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#1f1b16" media="(prefers-color-scheme: dark)">
    <link rel="apple-touch-icon" href="{root}apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="192x192" href="{root}icon-192.png">
"""
MARKER = "<!-- bargueno:head -->"


def precache_list(dist: Path) -> list[str]:
    paths = []
    for path in sorted(dist.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(dist)
        if rel.parts[0] in UNUSED_APPS or rel.name.startswith("rspack.config"):
            continue
        # Everything Typst needs is precached, whatever its type.
        if rel.parts[0] == "bargueno":
            paths.append(rel.as_posix())
            continue
        if path.suffix in SKIP_SUFFIXES or rel.name in SKIP_NAMES:
            continue
        # Icon fonts that ship as SVG next to their woff2 twins.
        if rel.parts[0] == "build" and path.suffix == ".svg" and rel.name.startswith("fa-"):
            continue
        paths.append(rel.as_posix())
    return paths


def write_manifest(dist: Path) -> None:
    manifest = {
        "name": "Bargueño",
        "short_name": "Bargueño",
        "description": "An offline-first writing studio for manuscripts and slide decks.",
        "start_url": "./lab/index.html",
        "scope": "./",
        "display": "standalone",
        "background_color": "#f6f1e7",
        "theme_color": "#f6f1e7",
        "icons": [
            {"src": "./icon-192.png", "type": "image/png", "sizes": "192x192"},
            {"src": "./icon-512.png", "type": "image/png", "sizes": "512x512"},
            {"src": "./icon-512.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable"},
        ],
    }
    (dist / "manifest.webmanifest").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    for icon in ICONS.glob("*.png"):
        shutil.copy(icon, dist / icon.name)


def patch_pages(dist: Path) -> None:
    for page in dist.glob("*/index.html"):
        if page.parent.name in UNUSED_APPS:
            continue
        html = page.read_text()
        if MARKER in html:
            continue
        html = re.sub(r"<title>.*?</title>", "<title>Bargueño</title>", html, count=1)
        tags = MARKER + HEAD_TAGS.format(root="../")
        html = html.replace("</head>", tags + "</head>", 1)
        page.write_text(html)


def copy_typst_assets(dist: Path) -> None:
    out = dist / "bargueno" / "typst"
    out.mkdir(parents=True, exist_ok=True)
    for name, pkg in TYPST_ASSETS.items():
        shutil.copy(NODE_MODULES / pkg / name, out / name)
    for name in TYPST_FONTS:
        shutil.copy(NODE_MODULES / TYPST_FONT_DIR / name, out / name)
    shutil.copy(NODE_MODULES / TYPST_FONT_DIR.rsplit("/", 1)[0] / "NOTICE", out / "FONTS-NOTICE.txt")


def write_service_worker(dist: Path) -> int:
    paths = precache_list(dist)
    digest = hashlib.sha256()
    for rel in paths:
        digest.update(rel.encode())
        digest.update((dist / rel).read_bytes())
    sw = SW_TEMPLATE.read_text()
    sw = sw.replace("__BARGUENO_VERSION__", digest.hexdigest()[:12])
    sw = sw.replace("__BARGUENO_PRECACHE__", json.dumps(paths))
    (dist / "service-worker.js").write_text(sw)
    return len(paths)


def main(dist: Path) -> None:
    write_manifest(dist)
    patch_pages(dist)
    copy_typst_assets(dist)
    count = write_service_worker(dist)
    print(f"bargueno: patched {dist} ({count} files precached)")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "dist").resolve())
