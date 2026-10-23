import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAtmosphere } from '../src/atmosphere.js';

function createFixture(t) {
  const scene = new THREE.Scene();
  const texture = new THREE.Texture();
  const atmosphere = createAtmosphere(scene, {
    softGlow: texture, smoke: texture, leaf: texture,
  }, new THREE.Vector3(0, 5, 0));
  t.after(() => {
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    texture.dispose();
  });
  return { scene, atmosphere, leaves: scene.getObjectByName('飘落的树叶') };
}

function compileDust(scene) {
  const dust = scene.getObjectByName('浮尘');
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.points.vertexShader,
    fragmentShader: THREE.ShaderLib.points.fragmentShader,
  };
  dust.material.onBeforeCompile(shader);
  return { dust, shader };
}

test('落叶仅秋季更新，冬季萤火时间不推进，重新显示后正常恢复', (t) => {
  const { atmosphere, leaves } = createFixture(t);
  const { fireflies } = atmosphere;
  const version = leaves.instanceMatrix.version;
  const initialMatrices = leaves.instanceMatrix.array.slice();
  let fireflyUpdates = 0;
  const updateFireflies = fireflies.update;
  fireflies.update = (elapsed) => {
    fireflyUpdates += 1;
    updateFireflies(elapsed);
  };

  for (const season of ['spring', 'summer', 'winter']) {
    atmosphere.setSeason(season);
    atmosphere.update(8, 0.05);
    assert.equal(leaves.visible, false);
    assert.equal(leaves.instanceMatrix.version, version);
    assert.deepEqual(leaves.instanceMatrix.array, initialMatrices);
  }
  assert.equal(fireflyUpdates, 2);
  assert.equal(fireflies.points.visible, false);
  assert.equal(fireflies.material.uniforms.uTime.value, 8);

  atmosphere.setSeason('autumn');
  atmosphere.update(9, 0.05);
  assert.equal(leaves.visible, true);
  assert.ok(leaves.instanceMatrix.version > version);
  assert.notDeepEqual(leaves.instanceMatrix.array, initialMatrices);
  assert.equal(fireflyUpdates, 3);
  assert.equal(fireflies.material.uniforms.uTime.value, 9);
});

test('不可见粒子不推进，落叶仍保留 CPU 下落及触地重生', (t) => {
  const { atmosphere, leaves } = createFixture(t);
  const initialMatrices = leaves.instanceMatrix.array.slice();
  leaves.visible = false;
  atmosphere.fireflies.points.visible = false;
  atmosphere.update(5, 0.05);
  assert.deepEqual(leaves.instanceMatrix.array, initialMatrices);
  assert.equal(atmosphere.fireflies.material.uniforms.uTime.value, 0);

  atmosphere.setSeason('autumn');
  atmosphere.update(10, 100);
  for (let index = 0; index < leaves.count; index += 1) {
    const y = leaves.instanceMatrix.array[index * 16 + 13];
    assert.ok(y >= 9.5 && y <= 15.5, `第 ${index} 片落叶触地后应重生`);
  }
});

test('周期粒子只更新 uniform，首次更新前保持初始位置，暂停不依赖渲染时钟', (t) => {
  const { atmosphere, scene } = createFixture(t);
  const { dust, shader } = compileDust(scene);
  const { fireflies } = atmosphere;
  const particles = [fireflies.points, dust];
  const initial = particles.map((points) => Object.values(points.geometry.attributes)
    .map((attribute) => ({ attribute, version: attribute.version, data: attribute.array.slice() })));
  assert.equal(shader.uniforms.uMotionEnabled.value, 0);
  assert.equal(fireflies.material.uniforms.uMotionEnabled.value, 0);

  for (const elapsed of [0, 1, 30, 1800]) atmosphere.update(elapsed, 0.016);
  for (const attributes of initial) {
    for (const { attribute, version, data } of attributes) {
      assert.equal(attribute.version, version);
      assert.deepEqual(attribute.array, data);
    }
  }
  assert.equal(shader.uniforms.uTime.value, 1800);
  assert.equal(fireflies.material.uniforms.uTime.value, 1800);
  assert.equal(shader.uniforms.uMotionEnabled.value, 1);

  // 多次编译、渲染准备与像素比修改都不能自行推进场景时间。
  const recompiled = compileDust(scene).shader;
  atmosphere.setPixelRatio(1.5);
  assert.equal(recompiled.uniforms.uTime, shader.uniforms.uTime);
  assert.equal(recompiled.uniforms.uTime.value, 1800);
  assert.equal(fireflies.material.uniforms.uTime.value, 1800);
  assert.equal(fireflies.material.uniforms.uPixelRatio.value, 1.5);
  atmosphere.update(1800.016, 0.016);
  assert.equal(recompiled.uniforms.uTime.value, 1800.016);
});

test('浮尘保留原生点材质渲染管线，运动参数属于静态顶点属性', (t) => {
  const { atmosphere, scene } = createFixture(t);
  const { dust, shader } = compileDust(scene);
  assert.equal(dust.material.isPointsMaterial, true);
  assert.equal(dust.material.fog, true);
  assert.equal(dust.material.size, 0.03);
  assert.equal(dust.material.opacity, 0.16);
  assert.equal(shader.fragmentShader, THREE.ShaderLib.points.fragmentShader);
  for (const chunk of ['begin_vertex', 'project_vertex', 'fog_vertex']) {
    assert.ok(shader.vertexShader.includes(`#include <${chunk}>`));
  }
  assert.ok(shader.vertexShader.indexOf('transformed +=') < shader.vertexShader.indexOf('#include <project_vertex>'));
  for (const [name, size] of [['aAmplitude', 3], ['aSpeed', 1], ['aPhase', 1]]) {
    const attribute = atmosphere.fireflies.points.geometry.getAttribute(name);
    assert.equal(attribute.itemSize, size);
    assert.equal(attribute.count, 92);
    assert.equal(attribute.usage, THREE.StaticDrawUsage);
  }
  assert.equal(dust.geometry.getAttribute('aPhase').count, 190);
});
