# Sound Link · Waver Acoustic Data-Over-Sound Suite 🔊

[![Deploy to GitHub Pages](https://github.com/namanv2703/quantum-link/actions/workflows/deploy.yml/badge.svg)](https://github.com/namanv2703/quantum-link/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-ggwave_v0.4.0-654FF0?logo=webassembly&logoColor=white)](https://github.com/ggerganov/waver)
[![GitHub Pages Ready](https://img.shields.io/badge/GitHub_Pages-Automated_Deploy-22C55E?logo=github&logoColor=white)](https://pages.github.com/)
[![100% Offline](https://img.shields.io/badge/Air--Gapped-100%25_Offline-10B981)](#)

**Sound Link** is an air-gapped, 100% offline **Data-Over-Sound Acoustic Transceiver & Communication Suite** built with **Waver (`ggerganov/ggwave`) WebAssembly** and an **Android 16 Material You (M3 Expressive)** interface.

Once loaded in memory, the entire site and its C++ `ggwave` WebAssembly DSP engine (`48,000 Hz` FSK modulation + Reed-Solomon ECC) are cached immediately in RAM and browser `CacheStorage` (`app-cache-v1`)—requiring **zero internet connection, zero external CDN fonts, and zero backend servers**.

---

## ✨ Key Capabilities

- **Instant WebAssembly Pre-Caching**: Compiles the `ggwave` v0.4.0 WebAssembly binary in RAM on startup and persists it to `CacheStorage` (`app-cache-v1`) + offline Service Worker (`sw.js`).
- **9 Acoustic Modulation Protocols**:
  - **Audible FSK** (`Normal`, `Fast`, `Fastest` — `1.8 kHz – 6.3 kHz`, `8–16 B/s`)
  - **Ultrasonic Air-Gapped FSK** (`Normal`, `Fast`, `Fastest` — `15.0 kHz – 19.5 kHz`, near-silent proximity transfer)
  - **Dual-Tone Microcontroller FSK** (`DT Normal`, `DT Fast`, `DT Fastest` — `1.8 kHz – 4.8 kHz` for ESP32, Arduino & RP2040)
- **Direct Sequence Spread Spectrum (`DSS`) & Reed-Solomon ECC**: Resilient against room reverberation and ambient noise.
- **Multi-Frame File & Text Modulation**: Compresses payloads with LZ-String and splits them into CRC-16-CCITT verified acoustic frames (`WV1|idx/total|crc|chunk`) with automatic receiver reassembly.
- **Real-Time Acoustic Visualizer**: Live `48,000 Hz` **FFT Frequency Spectrum** (with highlighted Audible/Ultrasonic carrier bands), **Scrolling Waterfall Spectrogram**, and **Time-Domain Oscilloscope**.
- **WASM Loopback & `.WAV` Studio**: Test end-to-end acoustic encoding and decoding in memory without a physical microphone, export `16-bit PCM .wav` files, or decode recorded `.wav` audio files offline.
- **Android 16 Material You (M3 Expressive) UI**: Dynamic wallpaper color extraction, custom hex seed palettes, adaptive launcher icon shapes, and 100% offline vector iconography.

---

## 🚀 Automatic GitHub Pages Deployment

This repository is pre-configured for **automatic zero-server deployment to GitHub Pages** via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

### How It Deploys Automatically
1. Push your code to the `main` or `master` branch on GitHub:
   ```bash
   git add .
   git commit -m "Deploy Sound Link Waver Acoustic Suite"
   git push origin main
   ```
2. The **Deploy Sound Link to GitHub Pages** GitHub Action triggers automatically:
   - Auto-configures GitHub Pages (`actions/configure-pages@v5` with `enablement: true`).
   - Runs TypeScript verification (`npm run lint`).
   - Compiles the self-contained single-file production bundle (`npm run build:pages`), including `index.html`, `404.html` (SPA fallback), `.nojekyll`, `manifest.webmanifest`, and `sw.js` (Offline Service Worker).
   - Publishes directly to `https://<your-username>.github.io/<repository-name>/`.
   - Also attaches `SoundLink-Offline-Standalone-HTML` (`SoundLink_Offline.html`) as a downloadable workflow artifact on every build.

> **Note**: If deploying to a brand-new repository for the first time and GitHub Pages is not yet active, ensure **Settings → Pages → Build and deployment → Source** is set to **GitHub Actions**.

---

## 🛠️ Local Development & Offline Build

```bash
# Install dependencies
npm install

# Start development server on http://localhost:3000
npm run dev

# Build static GitHub Pages & standalone offline HTML bundle
npm run build:pages

# Full production build (copies standalone HTML to FINAL NEXUS/FinalNexus.html)
npm run build
```

---

## 📜 License

MIT License. Acoustic DSP engine powered by [`ggwave` / `waver`](https://github.com/ggerganov/ggwave) by Georgi Gerganov.
