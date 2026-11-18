# ClipForge

**ClipForge** is a private-by-design browser video studio that shares [ceskacan.com](https://ceskacan.com)'s visual language (warm off-white, deep navy, cobalt accent, minimal typography, bilingual UI and dark mode).

## Development phases
| Phase | Scope | Status |
|---|---|---|
| 01 | Fully responsive editorial UI, mobile-first, TR/EN, themes | Implemented |
| 02 | Local media import, preview, clip trimming and MP4 / WebM conversion | Implemented — browser capabilities vary |
| 03 | Optional size reduction, MP3/WAV audio extraction, short GIF, rotation | Implemented — browser capabilities vary |
| 04 | Metadata, cancel/progress, input validation, testing and Pages CI | Initial implementation |
| 05 | Multiple-video joins, precise interactive timeline, broader device QA | Planned |

## Design and architecture
- Built with vanilla JavaScript + Vite + CSS, no framework or hosted backend.
- The [Mediabunny](https://mediabunny.dev) Conversion API powers MP4/WebM conversion, trimming, compression, rotation and audio extraction. A licensed LAME/WASM extension handles MP3 encoding where the browser cannot.
- [gifenc](https://github.com/mattdesl/gifenc) creates short GIFs from the local video preview (up to 8 seconds, 480px, 8 FPS).
- Input files stay on the user's device. No server uploads, accounts, analytics or conversion API keys.
- No promise of universal format support: a supported container is not the same as an available codec. Transcoding requires compatible hardware/browser codecs.
- Large outputs are buffered in memory before download. Files are limited to **180 MiB** and GIF length/size are capped to limit mobile memory consumption.
- The website's source and open-source dependencies remain subject to their respective licenses.

## Run / test
\`\`\`sh
npm install
npm run dev
npm run check
npm run build
\`\`\`
Preview at \`http://localhost:5173/ClipForge/\` (Vite may redirect to base path).

## GitHub Pages
GitHub Pages must be enabled **once** in repository Settings → Pages → Build and deployment → Source: **GitHub Actions**. Only the owner can enable this if a GitHub Actions integration is not authorized to configure the repository. After activation, every push to \`main\` runs verification and publishes \`dist/\`. Until then the workflow still builds and validates and skips publishing without failing.

URL after publishing: https://ceskasc.github.io/ClipForge/

© 2026 Sadık Can Çeşka. MIT.

## First live release

The first public release is version 0.1.0. Release checks cover in-browser WebM conversion, MP3 extraction, GIF generation, locale switching and mobile layout. Other codecs depend on native browser support. Successful CI verifies the implementation but does not guarantee every user-provided format is supported.
