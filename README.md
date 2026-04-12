# Dual Dash (Web)

Arcade runner with Motion (hand pinch) and Audio (clap/shout) controllers. Built with React + Phaser + MediaPipe Tasks and served as a static site. Current source of truth is in `web/`.

<img width="1066" height="651" alt="image" src="https://github.com/user-attachments/assets/5045215f-c9a8-4b70-882e-a5e21eb591f5" />

## Quickstart (dev)
```powershell
cd web
npm install
npm run dev   # http://localhost:5173
```

## Build
```powershell
cd web
npm run build   # outputs dist/
npm run preview # serve the built bundle locally
```

## Deploy (GitHub Pages)
- Vite base is set to `/dual-dash/` for GitHub Pages.
- A workflow is provided at `.github/workflows/deploy-gh-pages.yml`.
- Steps:
  1. Push to `main` (or manually trigger the workflow).
  2. In repo settings → Pages, set Source to “GitHub Actions”.
  3. After the workflow finishes, your site will be live at `https://allynnae.github.io/dual-dash/`.

## Controls / Notes
- Motion: pinch thumb+index; camera permission required.
- Audio: clap/shout; mic permission required. Tune sensitivity in the Tuning modal.
- If a permission is denied, the UI shows a toast and falls back when possible.
- Autoplay: click/tap once to unlock audio per browser policy.

## Repo layout (relevant)
- `web/` – React/Phaser app
  - `src/game/` – Phaser runner scene
  - `src/input/` – Motion/Audio input bus
  - `public/assets/` – audio + icon
  - `vite.config.ts`, `tailwind.config.ts`, `index.html`
- `vercel.json` – static deploy config targeting `web/dist`
