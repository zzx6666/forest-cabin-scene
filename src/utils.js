/**
 * 小型确定性工具集合：保证每次打开页面时，森林的位置与形态一致。
 */

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomRange(random, min, max) {
  return min + (max - min) * random();
}

export function choose(random, values) {
  return values[Math.floor(random() * values.length)];
}

export function smoothstep(min, max, value) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

/**
 * 地形非常克制：林间空地保持平整，远处才出现柔和的起伏。
 */
export function terrainHeight(x, z) {
  const radius = Math.hypot(x, z);
  const clearing = smoothstep(5.5, 18, radius);
  const broad = Math.sin(x * 0.19 + 0.6) * Math.cos(z * 0.15 - 0.4) * 0.24;
  const fine = Math.sin(x * 0.47 - z * 0.29) * 0.08;
  const distantRise = Math.max(0, radius - 31) * 0.016;
  return (broad + fine) * clearing + distantRise;
}

export function angleDifference(a, b) {
  let difference = (a - b + Math.PI) % (Math.PI * 2);
  if (difference < 0) difference += Math.PI * 2;
  return difference - Math.PI;
}
