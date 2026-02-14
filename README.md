# Universe Sim

Real-time Solar System sim (Three.js + Astronomy Engine).

A tiny real-time Solar System visualizer built with **Three.js** and **Astronomy Engine**.

## Features
- Real-time heliocentric planet positions (Mercury → Neptune)
- Time scale control (fast-forward / rewind)
- Click a planet to see live data
- Optional motion trails

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Notes
- This is a visualization: radii and distances are scaled for readability.
- Positions are computed from Astronomy Engine (no external API key required).
