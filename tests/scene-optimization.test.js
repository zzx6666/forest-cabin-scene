import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { measureSceneResources, optimizeStaticScene } from '../src/scene-optimization.js';

function makeMesh(material = new THREE.MeshStandardMaterial(), geometry = new THREE.BoxGeometry()) {
  return new THREE.Mesh(geometry, material);
}

function worldBounds(root) {
  root.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(root, true);
}

function assertVectorClose(actual, expected) {
  assert.ok(actual.distanceTo(expected) < 1e-5, `${actual.toArray()} != ${expected.toArray()}`);
}

test('烘焙保留共享几何、材质、边界和碰撞，移动父节点仍能更新世界矩阵', () => {
  const root = new THREE.Group();
  root.position.set(4, 2, -3);
  root.rotation.y = 0.27;
  const material = new THREE.MeshStandardMaterial();
  const geometry = new THREE.BoxGeometry();
  const meshes = [makeMesh(material, geometry), makeMesh(material, geometry)];
  meshes[0].position.set(-2, 0, 0);
  meshes[1].position.set(2, 1, 0);
  meshes[1].rotation.z = 0.4;
  meshes[1].scale.set(1.3, 0.8, 0.9);
  root.add(...meshes);
  const boundsBefore = worldBounds(root);
  const positionsBefore = geometry.attributes.position.array.slice();
  const uvsBefore = geometry.attributes.uv.array.slice();
  const target = meshes[0].getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(target.clone().add(new THREE.Vector3(0, 5, 0)), new THREE.Vector3(0, -1, 0));
  const hitBefore = ray.intersectObject(root, true)[0];
  let disposed = 0;
  geometry.addEventListener('dispose', () => { disposed += 1; });

  const stats = optimizeStaticScene(root);
  assert.equal(stats.meshesBefore, 2);
  assert.equal(stats.meshesAfter, 1);
  assert.equal(stats.drawCallsSaved, 1);
  assert.equal(stats.failedBatches, 0);
  const batch = root.children[0];
  assert.equal(batch.material, material);
  assert.equal(batch.matrixAutoUpdate, false);
  assert.equal(batch.matrixWorldAutoUpdate, true);
  assert.notEqual(batch.geometry, geometry);
  assert.equal(disposed, 0);
  assert.deepEqual(geometry.attributes.position.array, positionsBefore);
  assert.deepEqual(geometry.attributes.uv.array, uvsBefore);
  const boundsAfter = worldBounds(root);
  assertVectorClose(boundsAfter.min, boundsBefore.min);
  assertVectorClose(boundsAfter.max, boundsBefore.max);
  const hitAfter = ray.intersectObject(root, true)[0];
  assertVectorClose(hitAfter.point, hitBefore.point);
  const offset = new THREE.Vector3(8, -1, 3);
  root.position.add(offset);
  const movedBounds = worldBounds(root);
  assertVectorClose(movedBounds.min, boundsAfter.min.clone().add(offset));
  assertVectorClose(movedBounds.max, boundsAfter.max.clone().add(offset));
  assert.equal(optimizeStaticScene(root).batches, 0);
});

test('投影、层、排序、可见性、材质引用和顶点属性不同的对象不混批', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const changes = [
    (mesh) => { mesh.castShadow = true; },
    (mesh) => { mesh.receiveShadow = true; },
    (mesh) => { mesh.layers.set(1); },
    (mesh) => { mesh.renderOrder = 2; },
    (mesh) => { mesh.visible = false; },
    (mesh) => { mesh.frustumCulled = false; },
    (mesh) => { mesh.material = material.clone(); },
    (mesh) => { mesh.geometry.deleteAttribute('uv'); },
    (mesh) => { mesh.geometry = mesh.geometry.toNonIndexed(); },
    (mesh) => { mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(24 * 3).fill(1), 3)); },
  ];
  root.add(makeMesh(material));
  for (const change of changes) {
    const mesh = makeMesh(material);
    change(mesh);
    root.add(mesh);
  }
  assert.equal(optimizeStaticScene(root).batches, 0);
  assert.equal(root.children.length, changes.length + 1);
});

test('透明、透射、回调、名字、动态属性和手动世界矩阵保持原对象', () => {
  const root = new THREE.Group();
  const changes = [
    (mesh) => { mesh.material.transparent = true; },
    (mesh) => { mesh.material.opacity = 0.8; },
    (mesh) => { mesh.material = new THREE.MeshPhysicalMaterial({ transmission: 0.2 }); },
    (mesh) => { mesh.material.blending = THREE.AdditiveBlending; },
    (mesh) => { mesh.name = '保留名字'; },
    (mesh) => { mesh.userData.dynamic = true; },
    (mesh) => { mesh.onBeforeRender = () => {}; },
    (mesh) => { mesh.onAfterShadow = () => {}; },
    (mesh) => { mesh.raycast = () => {}; },
    (mesh) => { mesh.customDepthMaterial = new THREE.MeshDepthMaterial(); },
    (mesh) => { mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial(); },
    (mesh) => { mesh.addEventListener('removed', () => {}); },
    (mesh) => { mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage); },
    (mesh) => { mesh.geometry.morphAttributes.position = [mesh.geometry.attributes.position.clone()]; },
    (mesh) => { mesh.geometry.setDrawRange(0, 6); },
    (mesh) => { mesh.material.onBeforeCompile = () => {}; },
    (mesh) => { mesh.material = new THREE.ShaderMaterial(); },
    (mesh) => { mesh.material.displacementMap = new THREE.Texture(); },
    (mesh) => { mesh.material.alphaHash = true; },
    (mesh) => { mesh.geometry.setAttribute('offset', new THREE.Float32BufferAttribute(new Float32Array(24 * 3), 3)); },
    (mesh) => { mesh.scale.x = -1; },
    (mesh) => { mesh.scale.y = 0; },
    (mesh) => { mesh.matrixWorldAutoUpdate = false; },
  ];
  const protectedMeshes = changes.flatMap((change) => Array.from({ length: 2 }, () => {
    const mesh = makeMesh();
    change(mesh);
    return mesh;
  }));
  root.add(...protectedMeshes);
  const stats = optimizeStaticScene(root);
  assert.equal(stats.batches, 0);
  assert.deepEqual(root.children, protectedMeshes);
  protectedMeshes.forEach((mesh) => assert.equal(mesh.matrixAutoUpdate, true));
});

test('隐藏季节组独立优化，动态子树排除可跨再次优化保留', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const summer = new THREE.Group();
  const winter = new THREE.Group();
  winter.visible = false;
  summer.add(makeMesh(material), makeMesh(material));
  winter.add(makeMesh(material), makeMesh(material));
  const dynamic = new THREE.Group();
  dynamic.name = '动态父节点';
  const animatedChild = makeMesh(material);
  dynamic.add(animatedChild, makeMesh(material));
  root.add(summer, winter, dynamic);
  const stats = optimizeStaticScene(root, [dynamic]);
  assert.equal(stats.batches, 2);
  assert.equal(summer.children.length, 1);
  assert.equal(winter.children.length, 1);
  assert.equal(dynamic.children.length, 2);
  assert.equal(animatedChild.matrixAutoUpdate, true);
  assert.equal(dynamic.matrixAutoUpdate, true);
  assert.equal(measureSceneResources(root).visibleDrawCalls, 3);
  summer.visible = false;
  winter.visible = true;
  assert.equal(measureSceneResources(root).visibleDrawCalls, 3);
  optimizeStaticScene(root);
  assert.equal(dynamic.children.length, 2);
  assert.equal(animatedChild.matrixAutoUpdate, true);
});

test('排除参数支持单个引用、名字、Set 和判断函数', () => {
  for (const mode of ['object', 'name', 'set', 'predicate']) {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const keep = makeMesh(material);
    const other = makeMesh(material);
    root.add(keep, other);
    if (mode === 'name') keep.name = '查询目标';
    const exclusions = mode === 'object' ? keep
      : mode === 'name' ? '查询目标'
        : mode === 'set' ? new Set([keep]) : (object) => object === keep;
    optimizeStaticScene(root, exclusions);
    assert.equal(root.children.length, 2);
    assert.equal(keep.matrixAutoUpdate, true);
    assert.equal(other.matrixAutoUpdate, false);
  }
});

test('手动局部矩阵与多材质倒木保留，不误更新已冻结的变换', () => {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const manual = makeMesh(material);
  manual.matrixAutoUpdate = false;
  manual.matrix.makeTranslation(4, 5, 6);
  const other = makeMesh(material);
  other.position.set(-2, 0, 0);
  const multi = makeMesh([material, material.clone(), material.clone()], new THREE.CylinderGeometry());
  root.add(manual, other, multi);
  const bounds = worldBounds(root);
  const stats = optimizeStaticScene(root);
  assert.equal(stats.batches, 1);
  assert.equal(multi.parent, root);
  assert.equal(multi.matrixAutoUpdate, true);
  assertVectorClose(worldBounds(root).min, bounds.min);
  assertVectorClose(worldBounds(root).max, bounds.max);
});
