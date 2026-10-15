// GPU path for the booth. Each effect is the fragment-shader twin of the
// function with the same id in effects.js, which stays the reference (and
// the fallback when WebGL is missing). The CPU path copies a 720p frame
// three times and walks ~900k pixels in JS per effect; here the video is a
// texture and the work runs per pixel on the GPU.

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const EFFECT_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform float uIntensity;
uniform float uFrame;
uniform float uMirror;
uniform int uEffect;

vec2 src(vec2 uv) { return vec2(mix(uv.x, 1.0 - uv.x, uMirror), uv.y); }
vec3 at(vec2 uv) { return texture2D(uTex, src(clamp(uv, 0.0, 1.0))).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 px = 1.0 / uSize;
  vec3 c = at(vUv);
  float i = uIntensity;
  vec3 outc = c;

  if (uEffect == 1) {
    outc = mix(c, at(vec2(1.0 - vUv.x, vUv.y)), i);
  } else if (uEffect == 2) {
    outc = mix(c, vec3(lum(c)), i);
  } else if (uEffect == 3) {
    float th = (60.0 + (1.0 - i) * 150.0) / 255.0;
    vec3 t = vec3(c.r > th ? 1.0 - c.r : c.r, c.g > th ? 1.0 - c.g : c.g, c.b > th ? 1.0 - c.b : c.b);
    outc = mix(c, t, i);
  } else if (uEffect == 4) {
    float tl = lum(at(vUv + vec2(-px.x, px.y)));
    float l = lum(at(vUv + vec2(-px.x, 0.0)));
    float bl = lum(at(vUv + vec2(-px.x, -px.y)));
    float tr = lum(at(vUv + vec2(px.x, px.y)));
    float r = lum(at(vUv + vec2(px.x, 0.0)));
    float br = lum(at(vUv + vec2(px.x, -px.y)));
    float t = lum(at(vUv + vec2(0.0, px.y)));
    float b = lum(at(vUv + vec2(0.0, -px.y)));
    float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
    float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    float edge = clamp(length(vec2(gx, gy)), 0.0, 1.0);
    outc = vec3(clamp(edge * i + lum(c) * (1.0 - i), 0.0, 1.0));
  } else if (uEffect == 5) {
    float phase = sin(uFrame * 0.08) * 0.5 + 0.5;
    float shift = max(1.0, floor(2.0 + i * 8.0 * phase + 0.5)) * px.x;
    outc = vec3(at(vUv - vec2(shift, 0.0)).r, c.g, at(vUv + vec2(shift, 0.0)).b);
  } else if (uEffect == 6) {
    vec3 s = clamp(vec3(
      dot(c, vec3(0.393, 0.769, 0.189)),
      dot(c, vec3(0.349, 0.686, 0.168)),
      dot(c, vec3(0.272, 0.534, 0.131))), 0.0, 1.0);
    outc = mix(c, s, i);
  } else if (uEffect == 7) {
    outc = mix(c, 1.0 - c, i);
  } else if (uEffect == 8) {
    float levels = max(2.0, floor(2.0 + i * 6.0 + 0.5));
    float stepSize = 1.0 / (levels - 1.0);
    outc = mix(c, floor(c / stepSize + 0.5) * stepSize, i);
  } else if (uEffect == 9) {
    float block = clamp(floor(2.0 + i * 10.0 + 0.5), 2.0, 12.0);
    // Block origin in top-left pixel space, as the CPU version samples it.
    vec2 fromTop = vec2(vUv.x, 1.0 - vUv.y) * uSize;
    vec2 origin = floor(fromTop / block) * block + 0.5;
    vec3 sample = at(vec2(origin.x / uSize.x, 1.0 - origin.y / uSize.y));
    outc = mix(c, sample, 0.2 + i * 0.8);
  } else if (uEffect == 10) {
    vec2 d = (vUv - 0.5) * uSize;
    float ratio = length(d) / length(uSize * 0.5);
    float falloff = clamp(1.0 - pow(ratio, 1.45) * (0.25 + i * 0.75), 0.18, 1.0);
    outc = c * falloff;
  } else if (uEffect == 11) {
    float l0 = lum(c);
    float edge = abs(l0 - lum(at(vUv + vec2(px.x, 0.0)))) + abs(l0 - lum(at(vUv - vec2(0.0, px.y))));
    float th = (35.0 + (1.0 - i) * 90.0) / 255.0;
    float q = max(24.0, floor(96.0 - i * 56.0 + 0.5)) / 255.0;
    float ink = edge > th ? 0.08 : 1.0;
    outc = mix(c, floor(c / q + 0.5) * q * ink, 0.3 + i * 0.7);
  }

  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`;

const GLITCH_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform float uIntensity;
uniform float uFrame;
uniform float uOn;

void main() {
  vec2 uv = vUv;
  if (uOn > 0.5) {
    float row = floor((1.0 - vUv.y) * uSize.y);
    float maxShift = floor(2.0 + uIntensity * 14.0 + 0.5);
    float shift = floor(sin((row + uFrame * 1.2) * 0.17) * maxShift + 0.5);
    uv.x = clamp(uv.x + shift / uSize.x, 0.0, 1.0);
  }
  gl_FragColor = texture2D(uTex, uv);
}`;

const EFFECT_INDEX = {
  none: 0, mirror: 1, grayscale: 2, solarize: 3, edge: 4, "rgb-shift": 5,
  sepia: 6, invert: 7, posterize: 8, pixelate: 9, vignette: 10, "comic-ink": 11,
};

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "shader compile failed");
  }
  return shader;
}

function program(gl, fragment) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || "program link failed");
  }
  const uniforms = {};
  const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let n = 0; n < count; n += 1) {
    const name = gl.getActiveUniform(prog, n).name;
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, uniforms };
}

function makeTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Video sizes are rarely powers of two: clamp and no mipmaps.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return texture;
}

// Returns null when WebGL is unavailable or a shader fails, so the caller
// can fall back to the CPU path.
export function createGlRenderer(canvas) {
  // preserveDrawingBuffer keeps the last frame readable for canvas.toBlob.
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;

  let effectPass;
  let glitchPass;
  try {
    effectPass = program(gl, EFFECT_FRAGMENT);
    glitchPass = program(gl, GLITCH_FRAGMENT);
  } catch (error) {
    console.warn("WebGL effects unavailable, using the CPU path:", error);
    return null;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const videoTexture = makeTexture(gl);
  const passTexture = makeTexture(gl);
  const framebuffer = gl.createFramebuffer();
  let passWidth = 0;
  let passHeight = 0;

  function ensurePassTarget(width, height) {
    if (width === passWidth && height === passHeight) return;
    passWidth = width;
    passHeight = height;
    gl.bindTexture(gl.TEXTURE_2D, passTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, passTexture, 0);
  }

  return {
    kind: "webgl",
    render(video, { effect, intensity, frame, glitchSweep, mirror }) {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ensurePassTarget(width, height);

      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
      gl.useProgram(effectPass.prog);
      gl.uniform1i(effectPass.uniforms.uTex, 0);
      gl.uniform2f(effectPass.uniforms.uSize, width, height);
      gl.uniform1f(effectPass.uniforms.uIntensity, intensity);
      gl.uniform1f(effectPass.uniforms.uFrame, frame);
      gl.uniform1f(effectPass.uniforms.uMirror, mirror ? 1 : 0);
      gl.uniform1i(effectPass.uniforms.uEffect, EFFECT_INDEX[effect] ?? 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, passTexture);
      gl.useProgram(glitchPass.prog);
      gl.uniform1i(glitchPass.uniforms.uTex, 0);
      gl.uniform2f(glitchPass.uniforms.uSize, width, height);
      gl.uniform1f(glitchPass.uniforms.uIntensity, intensity);
      gl.uniform1f(glitchPass.uniforms.uFrame, frame);
      gl.uniform1f(glitchPass.uniforms.uOn, glitchSweep ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

export const GL_EFFECT_IDS = Object.keys(EFFECT_INDEX);
