const CHANNELS_PER_PIXEL = 4;

export const EFFECT_OPTIONS = [
  { id: "none", label: "None" },
  { id: "mirror", label: "Mirror Blend" },
  { id: "grayscale", label: "Grayscale Punch" },
  { id: "solarize", label: "Solarize" },
  { id: "edge", label: "Edge Pulse" },
  { id: "rgb-shift", label: "RGB Shift" },
  { id: "sepia", label: "Sepia Heat" },
  { id: "invert", label: "Invert Flash" },
  { id: "posterize", label: "Posterize Pop" },
  { id: "pixelate", label: "Pixel Melt" },
  { id: "vignette", label: "Vignette Tunnel" },
  { id: "comic-ink", label: "Comic Ink" },
];

const EFFECT_ID_SET = new Set(EFFECT_OPTIONS.map((effect) => effect.id));

export function clamp(value, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value));
}

function luminance(red, green, blue) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function precomputeLuminanceMap(source, width, height) {
  const lights = new Float32Array(width * height);
  for (let i = 0, p = 0; i < lights.length; i += 1, p += CHANNELS_PER_PIXEL) {
    lights[i] = luminance(source[p], source[p + 1], source[p + 2]);
  }
  return lights;
}

function applyNone(source, target) {
  target.set(source);
}

function applyMirror(source, target, { width, height, intensity }) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;
      const mirrorIdx = (y * width + (width - 1 - x)) * CHANNELS_PER_PIXEL;

      for (let c = 0; c < 3; c += 1) {
        target[idx + c] = clamp(
          source[idx + c] * (1 - intensity) + source[mirrorIdx + c] * intensity,
        );
      }

      target[idx + 3] = source[idx + 3];
    }
  }
}

function applyGrayscale(source, target, { width, height, intensity }) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;
      const light = luminance(source[idx], source[idx + 1], source[idx + 2]);

      target[idx] = clamp(source[idx] * (1 - intensity) + light * intensity);
      target[idx + 1] = clamp(source[idx + 1] * (1 - intensity) + light * intensity);
      target[idx + 2] = clamp(source[idx + 2] * (1 - intensity) + light * intensity);
      target[idx + 3] = source[idx + 3];
    }
  }
}

function applySolarize(source, target, { width, height, intensity }) {
  const threshold = 60 + (1 - intensity) * 150;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;

      for (let c = 0; c < 3; c += 1) {
        const base = source[idx + c];
        const transformed = base > threshold ? 255 - base : base;
        target[idx + c] = clamp(base * (1 - intensity) + transformed * intensity);
      }

      target[idx + 3] = source[idx + 3];
    }
  }
}

function applyEdge(source, target, { width, height, intensity }) {
  const lights = precomputeLuminanceMap(source, width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        target[idx] = source[idx];
        target[idx + 1] = source[idx + 1];
        target[idx + 2] = source[idx + 2];
        target[idx + 3] = source[idx + 3];
        continue;
      }

      const i = y * width + x;
      const gx =
        -lights[i - width - 1] -
        2 * lights[i - 1] -
        lights[i + width - 1] +
        lights[i - width + 1] +
        2 * lights[i + 1] +
        lights[i + width + 1];

      const gy =
        -lights[i - width - 1] -
        2 * lights[i - width] -
        lights[i - width + 1] +
        lights[i + width - 1] +
        2 * lights[i + width] +
        lights[i + width + 1];

      const edgeStrength = clamp(Math.hypot(gx, gy));
      const mixed = clamp(edgeStrength * intensity + lights[i] * (1 - intensity));

      target[idx] = mixed;
      target[idx + 1] = mixed;
      target[idx + 2] = mixed;
      target[idx + 3] = source[idx + 3];
    }
  }
}

function applyRgbShift(source, target, { width, height, intensity, frame }) {
  const phase = Math.sin(frame * 0.08) * 0.5 + 0.5;
  const shift = Math.max(1, Math.round(2 + intensity * 8 * phase));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;
      const leftX = clamp(x - shift, 0, width - 1);
      const rightX = clamp(x + shift, 0, width - 1);
      const leftIdx = (y * width + leftX) * CHANNELS_PER_PIXEL;
      const rightIdx = (y * width + rightX) * CHANNELS_PER_PIXEL;

      target[idx] = source[leftIdx];
      target[idx + 1] = source[idx + 1];
      target[idx + 2] = source[rightIdx + 2];
      target[idx + 3] = source[idx + 3];
    }
  }
}

function applySepia(source, target, { width, height, intensity }) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;
      const red = source[idx];
      const green = source[idx + 1];
      const blue = source[idx + 2];

      const sepiaR = clamp(red * 0.393 + green * 0.769 + blue * 0.189);
      const sepiaG = clamp(red * 0.349 + green * 0.686 + blue * 0.168);
      const sepiaB = clamp(red * 0.272 + green * 0.534 + blue * 0.131);

      target[idx] = clamp(red * (1 - intensity) + sepiaR * intensity);
      target[idx + 1] = clamp(green * (1 - intensity) + sepiaG * intensity);
      target[idx + 2] = clamp(blue * (1 - intensity) + sepiaB * intensity);
      target[idx + 3] = source[idx + 3];
    }
  }
}

function applyInvert(source, target, { width, height, intensity }) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;
      target[idx] = clamp(source[idx] * (1 - intensity) + (255 - source[idx]) * intensity);
      target[idx + 1] = clamp(source[idx + 1] * (1 - intensity) + (255 - source[idx + 1]) * intensity);
      target[idx + 2] = clamp(source[idx + 2] * (1 - intensity) + (255 - source[idx + 2]) * intensity);
      target[idx + 3] = source[idx + 3];
    }
  }
}

function applyPosterize(source, target, { width, height, intensity }) {
  const levels = Math.max(2, Math.round(2 + intensity * 6));
  const step = 255 / (levels - 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;
      for (let c = 0; c < 3; c += 1) {
        const base = source[idx + c];
        const snapped = Math.round(base / step) * step;
        target[idx + c] = clamp(base * (1 - intensity) + snapped * intensity);
      }
      target[idx + 3] = source[idx + 3];
    }
  }
}

function applyPixelate(source, target, { width, height, intensity }) {
  const blockSize = Math.min(12, Math.max(2, Math.round(2 + intensity * 10)));
  const blend = 0.2 + intensity * 0.8;

  for (let by = 0; by < height; by += blockSize) {
    const maxY = Math.min(height, by + blockSize);
    for (let bx = 0; bx < width; bx += blockSize) {
      const maxX = Math.min(width, bx + blockSize);
      const sampleIdx = (by * width + bx) * CHANNELS_PER_PIXEL;

      const sampleR = source[sampleIdx];
      const sampleG = source[sampleIdx + 1];
      const sampleB = source[sampleIdx + 2];

      for (let y = by; y < maxY; y += 1) {
        for (let x = bx; x < maxX; x += 1) {
          const idx = (y * width + x) * CHANNELS_PER_PIXEL;

          target[idx] = clamp(source[idx] * (1 - blend) + sampleR * blend);
          target[idx + 1] = clamp(source[idx + 1] * (1 - blend) + sampleG * blend);
          target[idx + 2] = clamp(source[idx + 2] * (1 - blend) + sampleB * blend);
          target[idx + 3] = source[idx + 3];
        }
      }
    }
  }
}

function applyVignette(source, target, { width, height, intensity }) {
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const maxDistance = Math.hypot(centerX, centerY) || 1;
  const strength = 0.25 + intensity * 0.75;

  for (let y = 0; y < height; y += 1) {
    const dy = y - centerY;
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;
      const dx = x - centerX;
      const distanceRatio = Math.hypot(dx, dy) / maxDistance;
      const falloff = clamp(1 - Math.pow(distanceRatio, 1.45) * strength, 0.18, 1);

      target[idx] = clamp(source[idx] * falloff);
      target[idx + 1] = clamp(source[idx + 1] * falloff);
      target[idx + 2] = clamp(source[idx + 2] * falloff);
      target[idx + 3] = source[idx + 3];
    }
  }
}

function applyComicInk(source, target, { width, height, intensity }) {
  const lights = precomputeLuminanceMap(source, width, height);
  const threshold = 35 + (1 - intensity) * 90;
  const quantStep = Math.max(24, Math.round(96 - intensity * 56));
  const blend = 0.3 + intensity * 0.7;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * CHANNELS_PER_PIXEL;
      const i = y * width + x;

      const light = lights[i];
      const right = lights[y * width + Math.min(width - 1, x + 1)];
      const down = lights[Math.min(height - 1, y + 1) * width + x];
      const edgeStrength = Math.abs(light - right) + Math.abs(light - down);

      const inkFactor = edgeStrength > threshold ? 0.08 : 1;

      for (let c = 0; c < 3; c += 1) {
        const base = source[idx + c];
        const quantized = Math.round(base / quantStep) * quantStep;
        const comicValue = quantized * inkFactor;
        target[idx + c] = clamp(base * (1 - blend) + comicValue * blend);
      }

      target[idx + 3] = source[idx + 3];
    }
  }
}

function applyGlitchSweep(source, target, { width, height, intensity, frame }) {
  const maxShift = Math.round(2 + intensity * 14);

  for (let y = 0; y < height; y += 1) {
    const wave = Math.sin((y + frame * 1.2) * 0.17);
    const shift = Math.round(wave * maxShift);

    for (let x = 0; x < width; x += 1) {
      const sourceX = clamp(x + shift, 0, width - 1);
      const sourceIdx = (y * width + sourceX) * CHANNELS_PER_PIXEL;
      const targetIdx = (y * width + x) * CHANNELS_PER_PIXEL;

      target[targetIdx] = source[sourceIdx];
      target[targetIdx + 1] = source[sourceIdx + 1];
      target[targetIdx + 2] = source[sourceIdx + 2];
      target[targetIdx + 3] = source[targetIdx + 3];
    }
  }
}

const EFFECT_REGISTRY = {
  none: applyNone,
  mirror: applyMirror,
  grayscale: applyGrayscale,
  solarize: applySolarize,
  edge: applyEdge,
  "rgb-shift": applyRgbShift,
  sepia: applySepia,
  invert: applyInvert,
  posterize: applyPosterize,
  pixelate: applyPixelate,
  vignette: applyVignette,
  "comic-ink": applyComicInk,
};

export function applyEffectToPixels(
  pixels,
  {
    effect = "none",
    intensity = 0.65,
    width,
    height,
    frame = 0,
    glitchSweep = false,
    // Optional reusable buffers of pixels.length; a live view at 30 fps
    // otherwise allocates (and the GC frees) megabytes a second.
    scratch = null,
  } = {},
) {
  if (!width || !height) {
    throw new Error("width and height are required");
  }

  const safeIntensity = clamp(intensity, 0, 1);
  const selectedEffect = EFFECT_ID_SET.has(effect) ? effect : "none";
  // Effects only read their source, so the caller's pixels are used directly.
  const base = pixels;
  const fits = (buffer) => buffer instanceof Uint8ClampedArray && buffer.length === base.length && buffer !== base;
  const transformed = fits(scratch?.a) ? scratch.a : new Uint8ClampedArray(base.length);

  const effectContext = {
    width,
    height,
    intensity: safeIntensity,
    frame,
  };

  const effectHandler = EFFECT_REGISTRY[selectedEffect] ?? applyNone;
  effectHandler(base, transformed, effectContext);

  if (!glitchSweep) {
    return transformed;
  }

  const glitched = fits(scratch?.b) && scratch.b !== transformed ? scratch.b : new Uint8ClampedArray(transformed.length);
  applyGlitchSweep(transformed, glitched, effectContext);
  return glitched;
}
