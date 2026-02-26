import test from "node:test";
import assert from "node:assert/strict";
import { applyEffectToPixels, clamp } from "../src/effects.js";

test("clamp limits values into range", () => {
  assert.equal(clamp(-20), 0);
  assert.equal(clamp(42), 42);
  assert.equal(clamp(333), 255);
});

test("grayscale effect fully desaturates with full intensity", () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
  ]);

  const output = applyEffectToPixels(pixels, {
    effect: "grayscale",
    intensity: 1,
    width: 2,
    height: 1,
  });

  assert.equal(output[0], output[1]);
  assert.equal(output[1], output[2]);
  assert.equal(output[4], output[5]);
  assert.equal(output[5], output[6]);
});

test("mirror blends opposite pixels", () => {
  const pixels = new Uint8ClampedArray([
    20, 30, 40, 255,
    200, 210, 220, 255,
  ]);

  const output = applyEffectToPixels(pixels, {
    effect: "mirror",
    intensity: 1,
    width: 2,
    height: 1,
  });

  assert.equal(output[0], 200);
  assert.equal(output[1], 210);
  assert.equal(output[2], 220);
  assert.equal(output[4], 20);
  assert.equal(output[5], 30);
  assert.equal(output[6], 40);
});

test("edge effect highlights sharp transitions", () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255,
    0, 0, 0, 255,
    0, 0, 0, 255,

    0, 0, 0, 255,
    255, 255, 255, 255,
    0, 0, 0, 255,

    0, 0, 0, 255,
    0, 0, 0, 255,
    0, 0, 0, 255,
  ]);

  const output = applyEffectToPixels(pixels, {
    effect: "edge",
    intensity: 1,
    width: 3,
    height: 3,
  });

  const center = output[(1 * 3 + 1) * 4];
  assert.ok(center <= 80, `expected low center value, got ${center}`);

  const topMiddle = output[(0 * 3 + 1) * 4];
  assert.ok(topMiddle <= 5, `expected unchanged border pixel, got ${topMiddle}`);
});

test("glitch sweep keeps data length and alpha channel", () => {
  const pixels = new Uint8ClampedArray([
    10, 20, 30, 200,
    40, 50, 60, 201,
    70, 80, 90, 202,
    100, 110, 120, 203,
  ]);

  const output = applyEffectToPixels(pixels, {
    effect: "none",
    intensity: 0.7,
    width: 2,
    height: 2,
    glitchSweep: true,
    frame: 9,
  });

  assert.equal(output.length, pixels.length);
  assert.equal(output[3], 200);
  assert.equal(output[7], 201);
  assert.equal(output[11], 202);
  assert.equal(output[15], 203);
});

test("invert effect transforms channels when intensity is full", () => {
  const pixels = new Uint8ClampedArray([
    10, 30, 60, 255,
  ]);

  const output = applyEffectToPixels(pixels, {
    effect: "invert",
    intensity: 1,
    width: 1,
    height: 1,
  });

  assert.equal(output[0], 245);
  assert.equal(output[1], 225);
  assert.equal(output[2], 195);
  assert.equal(output[3], 255);
});

test("posterize reduces color precision", () => {
  const pixels = new Uint8ClampedArray([
    81, 126, 211, 255,
  ]);

  const output = applyEffectToPixels(pixels, {
    effect: "posterize",
    intensity: 1,
    width: 1,
    height: 1,
  });

  assert.notEqual(output[0], pixels[0]);
  assert.notEqual(output[1], pixels[1]);
  assert.notEqual(output[2], pixels[2]);
});

test("pixelate blends neighboring pixels into shared block color", () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 0, 255,
  ]);

  const output = applyEffectToPixels(pixels, {
    effect: "pixelate",
    intensity: 1,
    width: 2,
    height: 2,
  });

  assert.equal(output[0], output[4]);
  assert.equal(output[1], output[5]);
  assert.equal(output[2], output[6]);
});

test("vignette darkens corner pixels more than center", () => {
  const pixels = new Uint8ClampedArray([
    200, 200, 200, 255,
    200, 200, 200, 255,
    200, 200, 200, 255,

    200, 200, 200, 255,
    200, 200, 200, 255,
    200, 200, 200, 255,

    200, 200, 200, 255,
    200, 200, 200, 255,
    200, 200, 200, 255,
  ]);

  const output = applyEffectToPixels(pixels, {
    effect: "vignette",
    intensity: 1,
    width: 3,
    height: 3,
  });

  const corner = output[0];
  const center = output[(1 * 3 + 1) * 4];
  assert.ok(corner < center, `expected corner ${corner} to be darker than center ${center}`);
});

test("comic ink preserves alpha and applies stylized contrast", () => {
  const pixels = new Uint8ClampedArray([
    255, 255, 255, 190,
    255, 255, 255, 191,
    20, 20, 20, 192,
    20, 20, 20, 193,
  ]);

  const output = applyEffectToPixels(pixels, {
    effect: "comic-ink",
    intensity: 1,
    width: 2,
    height: 2,
  });

  assert.equal(output[3], 190);
  assert.equal(output[7], 191);
  assert.equal(output[11], 192);
  assert.equal(output[15], 193);
  assert.ok(output[0] !== output[8] || output[1] !== output[9] || output[2] !== output[10]);
});
