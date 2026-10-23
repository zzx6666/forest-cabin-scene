import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTextures } from '../src/textures.js';

const dimensions = {
  woodMap: [512, 512], woodBump: [512, 512],
  plankMap: [512, 512], plankBump: [512, 512],
  roofMap: [1024, 1024], roofBump: [1024, 1024],
  stoneMap: [512, 512], stoneBump: [512, 512],
  groundMap: [1024, 1024], barkMap: [256, 512], grassMap: [256, 256],
  softGlow: [128, 128], smoke: [128, 128], leaf: [128, 128],
};
const repeats = {
  woodMap: [1.7, 1], woodBump: [1.7, 1],
  plankMap: [2.2, 1], plankBump: [2.2, 1],
  roofMap: [1, 1.3], roofBump: [1, 1.3],
  stoneMap: [2, 2], stoneBump: [2, 2],
  groundMap: [8, 8], barkMap: [2, 3],
};

function createFixture(t, options, maxAnisotropy = 8) {
  const canvases = [];
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement(name) {
        assert.equal(name, 'canvas');
        const canvas = { width: 0, height: 0, scales: [], images: [], operations: [] };
        const context = new Proxy({
          canvas,
          scale(x, y) { canvas.scales.push([x, y]); },
          createImageData(width, height) {
            canvas.images.push([width, height]);
            return { width, height, data: new Uint8ClampedArray(width * height * 4) };
          },
          putImageData(image) {
            assert.equal(image.width, canvas.width);
            assert.equal(image.height, canvas.height);
          },
        }, {
          get(target, property) {
            if (property in target) return target[property];
            if (property === 'createLinearGradient' || property === 'createRadialGradient') {
              return (...args) => {
                canvas.operations.push([property, ...args]);
                return { addColorStop() {} };
              };
            }
            return (...args) => { canvas.operations.push([property, ...args]); };
          },
        });
        canvas.getContext = (kind) => {
          assert.equal(kind, '2d');
          return context;
        };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  const renderer = { capabilities: { getMaxAnisotropy: () => maxAnisotropy } };
  let textures;
  try {
    // 仅替代 Canvas 绘制环境，纹理属性和释放行为使用真实 Three.js。
    textures = createTextures(renderer, options);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  }
  t.after(() => textures.dispose());
  return { textures, canvases };
}

test('默认桌面画质、纹理键、repeat、颜色空间及环绕契约保持不变', (t) => {
  const { textures, canvases } = createFixture(t);
  assert.deepEqual(Object.keys(textures), Object.keys(dimensions));
  assert.equal(canvases.length, 14);
  for (const [name, texture] of Object.entries(textures)) {
    assert.deepEqual([texture.image.width, texture.image.height], dimensions[name]);
    assert.deepEqual(texture.repeat.toArray(), repeats[name] ?? [1, 1]);
    const particle = ['softGlow', 'smoke', 'leaf'].includes(name);
    const wrapping = particle ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    assert.equal(texture.wrapS, wrapping);
    assert.equal(texture.wrapT, wrapping);
    assert.equal(texture.anisotropy, particle ? 1 : 8);
    assert.equal(texture.colorSpace, name.endsWith('Bump') ? THREE.NoColorSpace : THREE.SRGBColorSpace);
  }
});

for (const [profile, textureScale] of [['高档', 1], ['均衡', 1], ['移动端', 0.75], ['低档', 0.5]]) {
  test(`${profile}配置缩放全部纹理，地面像素按实际分辨率生成`, (t) => {
    const { textures } = createFixture(t, { textureScale, anisotropy: 4 });
    for (const [name, texture] of Object.entries(textures)) {
      const [width, height] = dimensions[name];
      assert.deepEqual([texture.image.width, texture.image.height], [width * textureScale, height * textureScale]);
      // 木结另有纵向缩放；只核对工厂设置的等比画布缩放。
      assert.deepEqual(texture.image.scales.filter(([x, y]) => x === y), textureScale === 1 ? [] : [[textureScale, textureScale]]);
      assert.equal(texture.anisotropy, ['softGlow', 'smoke', 'leaf'].includes(name) ? 1 : 4);
    }
    assert.deepEqual(textures.groundMap.image.images, [[1024 * textureScale, 1024 * textureScale]]);
  });
}

test('降低分辨率仍以原始坐标绘制木纹、瓦片和其他矢量图案', (t) => {
  const full = createFixture(t, { textureScale: 1 }).textures;
  const low = createFixture(t, { textureScale: 0.5 }).textures;
  for (const name of Object.keys(dimensions)) {
    if (name !== 'groundMap') assert.deepEqual(low[name].image.operations, full[name].image.operations);
  }
});

test('选项夹紧到合法范围，anisotropy 可在创建后更新且不重建纹理', (t) => {
  const clamped = createFixture(t, { anisotropy: 32, textureScale: 2 }, 4).textures;
  assert.equal(clamped.woodMap.anisotropy, 4);
  assert.equal(clamped.roofMap.image.width, 1024);
  const minimum = createFixture(t, { anisotropy: 0, textureScale: 0 }).textures;
  assert.equal(minimum.woodMap.anisotropy, 1);
  assert.equal(minimum.roofMap.image.width, 1024);
  const invalid = createFixture(t, { anisotropy: NaN, textureScale: NaN }).textures;
  assert.equal(invalid.woodMap.anisotropy, 8);
  assert.equal(invalid.roofMap.image.width, 1024);
  const low = createFixture(t, { anisotropy: 1, textureScale: 0.5 }).textures;
  const image = low.woodMap.image;
  const repeat = low.woodMap.repeat;
  const version = low.woodMap.version;
  for (const texture of Object.values(low)) {
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }
  assert.equal(low.woodMap.image, image);
  assert.equal(low.woodMap.repeat, repeat);
  assert.equal(low.woodMap.version, version + 1);
  assert.equal(low.woodMap.anisotropy, 4);
});

test('dispose 不参与纹理枚举且幂等，各次创建独立拥有资源', (t) => {
  const first = createFixture(t, { textureScale: 0.5 }).textures;
  const second = createFixture(t, { textureScale: 0.5 }).textures;
  assert.equal(Object.getOwnPropertyDescriptor(first, 'dispose').enumerable, false);
  assert.ok(Object.values(first).every((texture) => texture.isTexture));
  assert.equal('dispose' in { ...first }, false);
  const disposals = new Map();
  for (const texture of Object.values(first)) {
    texture.addEventListener('dispose', () => disposals.set(texture, (disposals.get(texture) ?? 0) + 1));
  }
  let secondDisposals = 0;
  second.woodMap.addEventListener('dispose', () => { secondDisposals += 1; });
  first.dispose();
  first.dispose();
  assert.equal(disposals.size, 14);
  assert.ok([...disposals.values()].every((count) => count === 1));
  assert.equal(secondDisposals, 0);
  assert.notEqual(first.woodMap, second.woodMap);
  assert.notEqual(first.woodMap.image, second.woodMap.image);
});
