# Bargueño logo

A line drawing of a bargueño, the Spanish portable writing cabinet, with its
lid dropped to form the writing surface.

## Colours

| Name | Hex | Use |
| --- | --- | --- |
| Walnut | `#2A211C` | Ink: the full mark, text |
| Paper | `#F6F1E8` | Ground; lines on red |
| Lacquer red | `#A8322A` | App icon and favicon ground; accent |

The drawing itself stays monochrome; red is reserved for the icon tile and
for accent use in the app.

## Files

| File | Use |
| --- | --- |
| `bargueno-mark.svg` | Full mark, walnut on transparent. README, docs, about screen. |
| `bargueno-mark-reversed.svg` | Full mark, paper on transparent, for dark or red grounds. |
| `bargueno-icon.svg` | App icon: simplified mark, paper on red. |
| `bargueno-icon-light.svg` | App icon, red on paper. |
| `favicon.svg` | Browser favicon (drawer lines dropped for small sizes). |
| `png/icon-192.png`, `png/icon-512.png` | PWA manifest icons (`purpose: any`). |
| `png/icon-maskable-512.png` | PWA manifest icon (`purpose: maskable`), mark inside the safe zone. |
| `png/apple-touch-icon.png` | iOS Home Screen icon, 180 × 180, square (iOS rounds it). |
| `png/favicon-32.png`, `png/favicon-16.png` | Bitmap favicon fallbacks. |

The full mark is for 48 px and up; below that, use the icon or favicon
variants, which are drawn separately rather than scaled down.

The wordmark typeface is still to be chosen (EB Garamond, Libre Caslon Text
or IBM Plex Sans); a lockup will be added once it is.

Logo artwork is licensed under CC-BY-4.0, like the app's other bundled content.
