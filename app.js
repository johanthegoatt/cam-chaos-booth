import { applyEffectToPixels, EFFECT_OPTIONS } from "./src/effects.js";
import { createGlRenderer } from "./src/glRenderer.js";

const EFFECT_SHORTCUT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
const EFFECT_SHORTCUT_MAP = new Map(
  EFFECT_OPTIONS.map((effect, index) => [EFFECT_SHORTCUT_KEYS[index], effect.id]).filter(([key]) => Boolean(key)),
);

const elements = {
  video: document.getElementById("cameraFeed"),
  canvas: document.getElementById("outputCanvas"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  captureBtn: document.getElementById("captureBtn"),
  clearBtn: document.getElementById("clearBtn"),
  effectSelect: document.getElementById("effectSelect"),
  intensityRange: document.getElementById("intensityRange"),
  intensityValue: document.getElementById("intensityValue"),
  glitchToggle: document.getElementById("glitchToggle"),
  mirrorToggle: document.getElementById("mirrorToggle"),
  statusPill: document.getElementById("statusPill"),
  fpsPill: document.getElementById("fpsPill"),
  shotStrip: document.getElementById("shotStrip"),
  shotCount: document.getElementById("shotCount"),
  timerSelect: document.getElementById("timerSelect"),
  countdown: document.getElementById("countdown"),
};

const state = {
  stream: null,
  rafId: null,
  effect: "none",
  intensity: 0.65,
  glitchSweep: false,
  // Front cameras show a mirror image by default on phones, because that is
  // what people expect to see when they move. An unflipped view makes you
  // lean the wrong way to get in frame. The saved shot matches what you saw.
  mirror: true,
  frame: 0,
  shotId: 0,
  countdownTimer: null,
  fps: {
    count: 0,
    sampleStartedAt: performance.now(),
    value: 0,
  },
};

// A canvas gets one context type for life, so WebGL is tried first and the
// 2D context (CPU effects) is only taken when WebGL is not there.
const glRenderer = new URLSearchParams(location.search).has("cpu") ? null : createGlRenderer(elements.canvas);
const context = glRenderer ? null : elements.canvas.getContext("2d", { willReadFrequently: true });

function renderEffectOptions() {
  const fragment = document.createDocumentFragment();

  for (const effect of EFFECT_OPTIONS) {
    const option = document.createElement("option");
    option.value = effect.id;
    option.textContent = effect.label;
    fragment.append(option);
  }

  elements.effectSelect.replaceChildren(fragment);
}

function syncControls() {
  elements.intensityValue.textContent = `${Math.round(state.intensity * 100)}%`;
  elements.effectSelect.value = state.effect;
  elements.glitchToggle.checked = state.glitchSweep;
  elements.mirrorToggle.checked = state.mirror;
}

function updateStatus(message) {
  elements.statusPill.textContent = message;
}

function updateFps() {
  state.fps.count += 1;
  const elapsed = performance.now() - state.fps.sampleStartedAt;

  if (elapsed >= 1000) {
    state.fps.value = Math.round((state.fps.count * 1000) / elapsed);
    state.fps.count = 0;
    state.fps.sampleStartedAt = performance.now();
    elements.fpsPill.textContent = `FPS: ${state.fps.value} · ${glRenderer ? "GPU" : "CPU"}`;
  }
}

function drawFrame() {
  if (!state.stream) {
    return;
  }

  const { videoWidth, videoHeight } = elements.video;
  if (!videoWidth || !videoHeight) {
    state.rafId = requestAnimationFrame(drawFrame);
    return;
  }

  if (glRenderer) {
    glRenderer.render(elements.video, {
      effect: state.effect,
      intensity: state.intensity,
      frame: state.frame,
      glitchSweep: state.glitchSweep,
      mirror: state.mirror,
    });
    state.frame += 1;
    updateFps();
    state.rafId = requestAnimationFrame(drawFrame);
    return;
  }

  if (elements.canvas.width !== videoWidth || elements.canvas.height !== videoHeight) {
    elements.canvas.width = videoWidth;
    elements.canvas.height = videoHeight;
  }

  if (state.mirror) {
    context.setTransform(-1, 0, 0, 1, videoWidth, 0);
  }
  context.drawImage(elements.video, 0, 0, videoWidth, videoHeight);
  context.setTransform(1, 0, 0, 1, 0, 0);
  const frame = context.getImageData(0, 0, videoWidth, videoHeight);

  const processedPixels = applyEffectToPixels(frame.data, {
    effect: state.effect,
    intensity: state.intensity,
    width: videoWidth,
    height: videoHeight,
    frame: state.frame,
    glitchSweep: state.glitchSweep,
  });

  frame.data.set(processedPixels);
  context.putImageData(frame, 0, 0);

  state.frame += 1;
  updateFps();
  state.rafId = requestAnimationFrame(drawFrame);
}

function stopRenderLoop() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

async function startCamera() {
  if (state.stream) {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
      },
      audio: false,
    });

    state.stream = stream;
    elements.video.srcObject = stream;
    await elements.video.play();

    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
    elements.captureBtn.disabled = false;

    updateStatus("Camera live");
    state.fps.count = 0;
    state.fps.sampleStartedAt = performance.now();
    state.fps.value = 0;
    elements.fpsPill.textContent = "FPS: 0";

    drawFrame();
  } catch (error) {
    updateStatus("Camera blocked");
    console.error(error);
  }
}

function stopCamera() {
  if (!state.stream) {
    return;
  }

  cancelCountdown();
  state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  elements.video.srcObject = null;
  stopRenderLoop();

  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  elements.captureBtn.disabled = true;

  updateStatus("Camera idle");
}

function updateShotCount() {
  const count = elements.shotStrip.children.length;
  elements.shotCount.textContent = `${count} ${count === 1 ? "capture" : "captures"}`;
}

// Each capture is a Blob behind an object URL. toDataURL encoded every
// 1280x720 JPEG to a base64 string on the main thread (a visible hitch in
// the live view) and kept two copies of it in the page, in the <img> and
// the download link. toBlob encodes off the main thread, and the URL is
// revoked when the card goes so the memory comes back.
function removeCard(card) {
  URL.revokeObjectURL(card.dataset.url);
  card.remove();
}

function saveShot() {
  if (!state.stream) {
    return;
  }

  state.shotId += 1;
  const id = state.shotId;
  elements.canvas.toBlob(
    (blob) => {
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);

      const card = document.createElement("article");
      card.className = "shot-card";
      card.dataset.url = url;

      const image = document.createElement("img");
      image.src = url;
      image.alt = `Captured frame ${id}`;

      const download = document.createElement("a");
      download.href = url;
      download.download = `cam-chaos-${id}.jpg`;
      download.textContent = "Download";

      card.append(image, download);
      elements.shotStrip.prepend(card);

      while (elements.shotStrip.children.length > 16) {
        removeCard(elements.shotStrip.lastElementChild);
      }

      updateShotCount();
    },
    "image/jpeg",
    0.92,
  );
}

// A booth needs a self-timer: with one hand on the mouse or the C key you
// can't pose, and on a laptop the button is right under the camera.
function captureShot() {
  if (!state.stream) {
    return;
  }

  if (state.countdownTimer) {
    cancelCountdown();
    return;
  }

  let left = Number.parseInt(elements.timerSelect.value, 10) || 0;
  if (left === 0) {
    saveShot();
    return;
  }

  elements.captureBtn.textContent = "Cancel Timer";
  const tick = () => {
    if (left === 0) {
      cancelCountdown();
      saveShot();
      return;
    }
    elements.countdown.hidden = false;
    elements.countdown.textContent = String(left);
    left -= 1;
    state.countdownTimer = setTimeout(tick, 1000);
  };
  tick();
}

function cancelCountdown() {
  clearTimeout(state.countdownTimer);
  state.countdownTimer = null;
  elements.countdown.hidden = true;
  elements.captureBtn.textContent = "Capture Frame";
}

function clearShots() {
  for (const card of [...elements.shotStrip.children]) {
    removeCard(card);
  }
  updateShotCount();
}

function setEffect(effectId) {
  state.effect = EFFECT_OPTIONS.some((effect) => effect.id === effectId) ? effectId : "none";
  syncControls();
}

function selectEffectByShortcut(key) {
  const effectId = EFFECT_SHORTCUT_MAP.get(key);
  if (!effectId) {
    return;
  }

  setEffect(effectId);
}

elements.startBtn.addEventListener("click", startCamera);
elements.stopBtn.addEventListener("click", stopCamera);
elements.captureBtn.addEventListener("click", captureShot);
elements.clearBtn.addEventListener("click", clearShots);

elements.effectSelect.addEventListener("change", (event) => {
  setEffect(event.target.value);
});

elements.intensityRange.addEventListener("input", (event) => {
  state.intensity = Number.parseFloat(event.target.value);
  elements.intensityValue.textContent = `${Math.round(state.intensity * 100)}%`;
});

elements.mirrorToggle.addEventListener("change", (event) => {
  state.mirror = event.target.checked;
});

elements.glitchToggle.addEventListener("change", (event) => {
  state.glitchSweep = event.target.checked;
});

document.addEventListener("keydown", (event) => {
  // Typing a number into a field, or pressing C on the timer menu, should
  // not swap the effect or take a photo.
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.("input, select, textarea")) {
    return;
  }

  if (event.key.toLowerCase() === "g") {
    state.glitchSweep = !state.glitchSweep;
    syncControls();
  }

  if (event.key.toLowerCase() === "c") {
    captureShot();
  }

  selectEffectByShortcut(event.key);
});

window.addEventListener("beforeunload", stopCamera);

renderEffectOptions();
syncControls();
updateShotCount();
