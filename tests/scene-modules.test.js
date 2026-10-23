import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { measureSceneResources, optimizeStaticScene } from '../src/scene-optimization.js';
import { createCabin } from '../src/cabin.js';
import { createLandscape } from '../src/forest.js';
import { createInterior } from '../src/interior.js';

const textures = Object.fromEntries([
  'woodMap', 'woodBump', 'plankMap', 'plankBump', 'roofMap', 'roofBump',
  'stoneMap', 'stoneBump', 'barkMap', 'groundMap', 'grassMap', 'leaf', 'softGlow',
].map((key) => [key, new THREE.Texture()]));

// 只模拟构造场景用到的 Canvas 2D 和事件接口，不创建浏览器或 WebGL 上下文。
function createCanvasStub() {
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      return () => {};
    },
  });
  return {
    width: 1280,
    height: 720,
    clientWidth: 1280,
    clientHeight: 720,
    style: {},
    getContext: () => context,
    addEventListener() {},
    removeEventListener() {},
    getRootNode: () => globalThis.document,
  };
}

globalThis.document = { createElement: createCanvasStub, addEventListener() {}, removeEventListener() {} };
globalThis.window = { innerWidth: 1280, innerHeight: 720 };

function collect(root, predicate) {
  const objects = [];
  root.traverse((object) => { if (predicate(object)) objects.push(object); });
  return objects;
}

function triangleCount(root) {
  let count = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    count += (geometry.index?.count ?? geometry.attributes.position.count) / 3
      * (object.isInstancedMesh ? object.count : 1);
  });
  return count;
}

// 在内存中替换创建函数末尾的优化调用，得到相同程序化造型的结构基线。
// 相对导入改为文件 URL；不改仓库源文件、不生成构建产物。
async function baselineFactory(filename, exportName) {
  const url = new URL(`../src/${filename}`, import.meta.url);
  const source = (await readFile(url, 'utf8'))
    .replace(/from '([^']+)'/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)}'`)
    .replace(/const optimizationStats = optimizeStaticScene\([\s\S]*?\n  \]\);/, 'const optimizationStats = null;');
  assert.ok(source.includes('const optimizationStats = null;'));
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return module[exportName];
}

test('森林和木屋减少提交且保留三角形、季节层和主线动态引用', async () => {
  const baselineLandscape = (await baselineFactory('forest.js', 'createLandscape'))(textures);
  const baselineCabin = (await baselineFactory('cabin.js', 'createCabin'))(textures);
  const landscape = createLandscape(textures);
  const cabin = createCabin(textures);
  for (const [baseline, optimized] of [[baselineLandscape, landscape], [baselineCabin, cabin]]) {
    assert.equal(triangleCount(optimized.group), triangleCount(baseline.group));
    assert.ok(optimized.optimizationStats.visibleDrawCallReduction >= 0.25);
    assert.equal(optimized.optimizationStats.failedBatches, 0);
    assert.equal(optimized.optimizationStats.meshesBefore, measureSceneResources(baseline.group).meshes);
  }

  const dynamic = [
    ...cabin.windows.flatMap(({ pane, light, glow }) => [pane, light, glow]),
    ...cabin.stringLights.bulbs.flatMap(({ bulb, glow }) => [bulb, glow]),
    cabin.lantern.pivot, cabin.lantern.body, cabin.lantern.glass,
  ];
  const members = new Set(collect(cabin.group, () => true));
  for (const object of dynamic) {
    assert.ok(members.has(object));
    assert.equal(object.matrixAutoUpdate, true);
  }
  optimizeStaticScene(cabin.group);
  const optimizedMembers = new Set(collect(cabin.group, () => true));
  assert.ok(dynamic.every((object) => optimizedMembers.has(object) && object.matrixAutoUpdate));
  for (const season of ['spring', 'summer', 'autumn', 'winter', 'summer']) {
    baselineLandscape.setSeason(season);
    landscape.setSeason(season);
    assert.equal(triangleCount(landscape.group), triangleCount(baselineLandscape.group));
    const crowns = collect(landscape.group, (object) => object.userData.isCrown);
    assert.equal(crowns.length, 27);
    assert.ok(crowns.every((object) => object.visible === (season !== 'winter') && object.matrixAutoUpdate));
    assert.equal(landscape.group.getObjectByName('积雪地面').visible, season === 'winter');
    const stats = measureSceneResources(landscape.group);
    const baselineStats = measureSceneResources(baselineLandscape.group);
    assert.ok(1 - stats.visibleDrawCalls / baselineStats.visibleDrawCalls >= 0.25);
    console.log(`森林 ${season}：结构可见提交 ${baselineStats.visibleDrawCalls} → ${stats.visibleDrawCalls}`);
  }
  console.log(`木屋：结构可见提交 ${cabin.optimizationStats.visibleDrawCallsBefore} → ${cabin.optimizationStats.visibleDrawCallsAfter}；几何 ${cabin.optimizationStats.geometriesBefore} → ${cabin.optimizationStats.geometriesAfter}`);
});

test('室内四季造型、睡猫和灯光保留，主线质量字段重建正确阴影目标', async () => {
  const baseline = (await baselineFactory('interior.js', 'createInterior'))(textures, createCanvasStub());
  const interior = createInterior(textures, createCanvasStub());
  const { scene, optimizationStats } = interior;
  assert.equal(optimizationStats.failedBatches, 0);
  assert.ok(optimizationStats.visibleDrawCallReduction >= 0.25);
  assert.equal(optimizationStats.meshesBefore, measureSceneResources(baseline.scene).meshes);
  const sleepingCat = scene.getObjectByName('睡猫');
  const bulbs = collect(scene, (object) => object.isMesh && object.material.isMeshBasicMaterial && !object.material.map);
  assert.ok(bulbs.length >= 10);
  assert.ok(bulbs.every((object) => object.matrixAutoUpdate));
  const shadowLights = collect(scene, (object) => object.isLight && object.castShadow);
  assert.equal(shadowLights.length, 3);
  assert.ok(shadowLights.every((light) => light.shadow.autoUpdate));

  const profiles = [
    { name: 'high', interiorShadowSize: 2048, pointShadowSize: 1024 },
    { name: 'balanced', interiorShadowSize: 1536, pointShadowSize: 512 },
    { name: 'mobile', interiorShadowSize: 1024, pointShadowSize: 512 },
    { name: 'low', interiorShadowSize: 512, pointShadowSize: 256 },
    { name: 'high', interiorShadowSize: 2048, pointShadowSize: 1024 },
  ];
  for (const profile of profiles) {
    let disposed = 0;
    const expectedChanges = shadowLights.filter((light) => light.shadow.mapSize.x !== (
      light.isPointLight ? profile.pointShadowSize : profile.interiorShadowSize
    ));
    for (const light of shadowLights) {
      light.shadow.map = { dispose: () => { disposed += 1; } };
      light.shadow.mapPass = { dispose: () => { disposed += 1; } };
    }
    interior.setQuality(profile);
    assert.equal(disposed, expectedChanges.length * 2);
    for (const light of shadowLights) {
      const size = light.isPointLight ? profile.pointShadowSize : profile.interiorShadowSize;
      assert.deepEqual(light.shadow.mapSize.toArray(), [size, size]);
      assert.equal(light.castShadow, true);
      assert.equal(light.shadow.autoUpdate, true);
      if (expectedChanges.includes(light)) {
        assert.equal(light.shadow.map, null);
        assert.equal(light.shadow.mapPass, null);
        assert.equal(light.shadow.needsUpdate, true);
      }
    }
    interior.setQuality(profile);
    assert.equal(disposed, expectedChanges.length * 2);
  }
  interior.setQuality({ interiorShadowSize: NaN, pointShadowSize: -1 });
  assert.deepEqual(shadowLights.find((light) => light.isDirectionalLight).shadow.mapSize.toArray(), [2048, 2048]);

  // 禁止帧更新执行名字查询，验证睡猫引用缓存确实覆盖了动画路径。
  scene.getObjectByName = () => { throw new Error('帧更新不应遍历睡猫'); };
  interior.update(1, 0.016);
  assert.equal(sleepingCat.matrixAutoUpdate, true);
  assert.ok(Math.abs(sleepingCat.scale.y - (1 + Math.sin(1.2) * 0.018)) < 1e-12);
  optimizeStaticScene(scene);
  assert.equal(sleepingCat.parent, scene);
  assert.ok(bulbs.every((object) => object.parent && object.matrixAutoUpdate));
  assert.ok(sleepingCat.children.every((object) => object.matrixAutoUpdate));
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    shadowLights.forEach((light) => { light.shadow.needsUpdate = false; });
    baseline.setSeason(season);
    interior.setSeason(season);
    assert.ok(shadowLights.every((light) => light.shadow.needsUpdate));
    for (const name of ['四季座椅', '四季床品', '室内季节陈设']) {
      const optimizedLayer = collect(scene, (object) => object.name === name)[0];
      const baselineLayer = baseline.scene.getObjectByName(name);
      assert.deepEqual(optimizedLayer.children.map((child) => child.visible), baselineLayer.children.map((child) => child.visible));
      assert.equal(triangleCount(optimizedLayer), triangleCount(baselineLayer));
    }
    const stats = measureSceneResources(scene);
    const baselineStats = measureSceneResources(baseline.scene);
    assert.ok(1 - stats.visibleDrawCalls / baselineStats.visibleDrawCalls >= 0.25);
    console.log(`室内 ${season}：结构可见提交 ${baselineStats.visibleDrawCalls} → ${stats.visibleDrawCalls}`);
  }
  baseline.controls.dispose();
  interior.controls.dispose();
  console.log(`室内：几何 ${optimizationStats.geometriesBefore} → ${optimizationStats.geometriesAfter}；静态矩阵冻结 ${optimizationStats.frozenMatrices}`);
});
