# Cam Chaos Booth

## Description
Cam Chaos Booth is a webcam playground with real-time visual effects, glitch sweeps, and a downloadable snapshot strip.

## Features
- Live camera preview rendered on canvas, flipped like a mirror by default (toggle off for the true view); saved shots match the preview
- Twelve effect modes: none, mirror blend, grayscale, solarize, edge pulse, RGB shift, sepia, invert, posterize, pixelate, vignette, comic ink
- Adjustable intensity slider for every effect
- Optional glitch sweep layer
- Capture with a 3 or 10 second self-timer, or instantly; shots are JPEG blobs from `canvas.toBlob`, freed when cleared
- Make Photo Strip stacks the last four shots on a dated paper strip and downloads it as one JPEG
- Keyboard shortcuts for full effects map (`1-0`, `-`, `=`) and capture workflow, ignored while a form control has focus
- Effects run as WebGL fragment shaders (two passes: effect, then glitch sweep); the JavaScript versions in `src/effects.js` are the tested reference and the fallback without WebGL. Add `?cpu` to the URL to force the CPU path
- Unit tests for core pixel effect utilities
- Static Vercel-ready deployment config

## Run
```bash
cd cam-chaos-booth
npm run dev
```
Open `http://127.0.0.1:8101/cam-chaos-booth/index.html`.

## Test
```bash
cd cam-chaos-booth
npm test
```

## Deploy (Vercel)
```bash
cd cam-chaos-booth
npx vercel --prod
```

## Inspiration Repos
- https://github.com/wesbos/JavaScript30
- https://github.com/google-ai-edge/mediapipe
- https://github.com/brownhci/WebGazer

## Project Structure
```text
cam-chaos-booth/
  index.html
  styles.css
  app.js
  src/
    effects.js
  tests/
    effects.test.js
  package.json
  vercel.json
  README.md
```
