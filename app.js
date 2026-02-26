import { applyEffectToPixels, EFFECT_OPTIONS } from "./src/effects.js";

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
  statusPill: document.getElementById("statusPill"),
  fpsPill: document.getElementById("fpsPill"),
  shotStrip: document.getElementById("shotStrip"),
  shotCount: document.getElementById("shotCount"),
};

const state = {
  stream: null,
  rafId: null,
  effect: "none",
  intensity: 0.65,
  glitchSweep: false,
  frame: 0,
  shotId: 0,
  fps: {
    count: 0,
    sampleStartedAt: performance.now(),
    value: 0,
  },
};

const context = elements.canvas.getContext("2d", { willReadFrequently: true });

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
    elements.fpsPill.textContent = `FPS: ${state.fps.value}`;
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

  if (elements.canvas.width !== videoWidth || elements.canvas.height !== videoHeight) {
    elements.canvas.width = videoWidth;
    elements.canvas.height = videoHeight;
  }

  context.drawImage(elements.video, 0, 0, videoWidth, videoHeight);
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

function captureShot() {
  if (!state.stream) {
    return;
  }

  const url = elements.canvas.toDataURL("image/jpeg", 0.92);
  state.shotId += 1;

  const card = document.createElement("article");
  card.className = "shot-card";

  const image = document.createElement("img");
  image.loading = "lazy";
  image.src = url;
  image.alt = `Captured frame ${state.shotId}`;

  const download = document.createElement("a");
  download.href = url;
  download.download = `cam-chaos-${state.shotId}.jpg`;
  download.textContent = "Download";

  card.append(image, download);
  elements.shotStrip.prepend(card);

  while (elements.shotStrip.children.length > 16) {
    elements.shotStrip.lastElementChild.remove();
  }

  updateShotCount();
}

function clearShots() {
  elements.shotStrip.replaceChildren();
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

elements.glitchToggle.addEventListener("change", (event) => {
  state.glitchSweep = event.target.checked;
});

document.addEventListener("keydown", (event) => {
  if (event.repeat) {
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
