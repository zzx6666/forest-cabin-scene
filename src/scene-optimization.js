import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 用弱引用记住动态对象，主线再次优化同一场景时也不会误合并这些对象。
const protectedObjects = new WeakSet();
const supportedAttributes = new Set(['position', 'normal', 'tangent', 'uv', 'uv1', 'uv2', 'uv3', 'color']);
const renderCallbacks = ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow'];

function hasCallbacks(object) {
  return renderCallbacks.some((key) => object[key] !== THREE.Object3D.prototype[key]);
}

function exclusionPredicate(exclusions) {
  const entries = typeof exclusions === 'function' || exclusions?.isObject3D || typeof exclusions === 'string'
    ? [exclusions]
    : Array.from(exclusions ?? []);
  return (object) => entries.some((entry) => (
    typeof entry === 'function' ? entry(object) : typeof entry === 'string' ? object.name === entry : object === entry
  ));
}

function geometrySignature(geometry) {
  if (!geometry?.isBufferGeometry || geometry.isInstancedBufferGeometry) return null;
  if (Object.keys(geometry.morphAttributes).length > 0) return null;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return null;
  const position = geometry.attributes.position;
  if (!position || position.itemSize !== 3 || position.normalized) return null;
  if (!(position.array instanceof Float32Array || position.array instanceof Float64Array)) return null;
  if (geometry.index && (geometry.index.isInterleavedBufferAttribute || geometry.index.usage !== THREE.StaticDrawUsage)) return null;

  const signature = [geometry.index ? 'indexed' : 'nonindexed'];
  for (const key of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[key];
    if (!supportedAttributes.has(key) || attribute.isInterleavedBufferAttribute || attribute.isInstancedBufferAttribute) return null;
    if (attribute.usage !== THREE.StaticDrawUsage || attribute.count !== position.count) return null;
    // 法线和切线需要经法线矩阵变换，整数压缩属性会在烘焙时损失精度。
    if ((key === 'normal' || key === 'tangent') && !(attribute.array instanceof Float32Array || attribute.array instanceof Float64Array)) return null;
    signature.push(`${key}:${attribute.array.constructor.name}:${attribute.itemSize}:${attribute.normalized}:${attribute.gpuType}`);
  }
  return signature.join('|');
}

function batchKey(mesh) {
  if (mesh.type !== 'Mesh' || mesh.children.length > 0 || mesh.name || Object.keys(mesh.userData).length > 0) return null;
  if (mesh._listeners || !mesh.matrixWorldAutoUpdate || hasCallbacks(mesh) || mesh.raycast !== THREE.Mesh.prototype.raycast) return null;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return null;
  const material = mesh.material;
  if (!material?.isMaterial || material.isShaderMaterial || material.isNodeMaterial) return null;
  if (material.transparent || material.opacity < 1 || material.transmission > 0 || material.blending !== THREE.NormalBlending) return null;
  // 位移和随机透明度依赖原局部坐标，烘焙变换会改变其着色结果。
  if (material.displacementMap || material.alphaHash) return null;
  if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
    || material.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) return null;
  const signature = geometrySignature(mesh.geometry);
  if (!signature) return null;
  if (mesh.matrixAutoUpdate) mesh.updateMatrix();
  // 镜像会改变正反面绕序；退化矩阵也不能安全地变换法线。
  if (!mesh.matrix.elements.every(Number.isFinite) || mesh.matrix.determinant() <= 0) return null;
  return [material.uuid, signature, mesh.castShadow, mesh.receiveShadow, mesh.visible,
    mesh.layers.mask, mesh.renderOrder, mesh.frustumCulled].join('|');
}

/**
 * 统计场景树中的资源和预计提交数，不包含相机裁剪、阴影通道及后处理。
 * drawCalls 包括隐藏的季节层，visibleDrawCalls 只统计当前可见层。
 */
export function measureSceneResources(root) {
  const geometries = new Set();
  const result = { meshes: 0, geometries: 0, drawCalls: 0, visibleDrawCalls: 0 };
  const visit = (object, parentVisible) => {
    const visible = parentVisible && object.visible;
    if (object.isMesh) result.meshes += 1;
    if (object.geometry) geometries.add(object.geometry);
    if (object.isMesh || object.isLine || object.isPoints || object.isSprite) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const calls = Array.isArray(object.material)
        ? object.geometry.groups.filter((group) => materials[group.materialIndex]?.visible).length
        : Number(Boolean(materials[0]?.visible));
      result.drawCalls += calls;
      if (visible) result.visibleDrawCalls += calls;
    }
    object.children.forEach((child) => visit(child, visible));
  };
  let parentVisible = true;
  for (let parent = root.parent; parent; parent = parent.parent) parentVisible &&= parent.visible;
  visit(root, parentVisible);
  result.geometries = geometries.size;
  return result;
}

/**
 * 在首次上传 GPU 前调用。exclusions 支持对象/名字/判断函数或其可迭代集合，排除整个子树。
 * 调用方必须列出持有引用或会改变变换、可见性、几何的匿名对象；名字、回调、userData 自动保留。
 * 只合并同一父节点的静态不透明叶子，父节点与季节层边界、原材质及碰撞几何保持不变。
 * 原几何可能被树外对象共享，永不主动 dispose；临时克隆在合并后释放，新几何随场景管理。
 */
export function optimizeStaticScene(root, exclusions = []) {
  const before = measureSceneResources(root);
  const isExcluded = exclusionPredicate(exclusions);
  const stats = { batches: 0, mergedMeshes: 0, frozenMatrices: 0, skippedMeshes: 0, failedBatches: 0 };
  const freeze = (mesh) => {
    if (!mesh.matrixAutoUpdate) return;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    // 世界矩阵仍随父节点更新，保证移动木屋或切换场景根节点后位置正确。
    stats.frozenMatrices += 1;
  };
  const visit = (parent) => {
    if (isExcluded(parent)) protectedObjects.add(parent);
    if (protectedObjects.has(parent) || hasCallbacks(parent)
      || (!parent.isMesh && Object.keys(parent.userData).length > 0)) {
      parent.traverse((object) => { if (object.isMesh) stats.skippedMeshes += 1; });
      return;
    }
    const groups = new Map();
    for (const child of [...parent.children]) {
      if (isExcluded(child)) protectedObjects.add(child);
      if (protectedObjects.has(child)) {
        child.traverse((object) => { if (object.isMesh) stats.skippedMeshes += 1; });
        continue;
      }
      if (child.isMesh) {
        const key = batchKey(child);
        if (key) {
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(child);
          freeze(child);
        } else {
          stats.skippedMeshes += 1;
        }
      }
      visit(child);
    }
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const copies = [];
      let geometry;
      try {
        for (const mesh of meshes) {
          const copy = mesh.geometry.clone();
          copies.push(copy);
          copy.applyMatrix4(mesh.matrix);
          copy.clearGroups();
        }
        geometry = mergeGeometries(copies, false);
        if (!geometry) { stats.failedBatches += 1; continue; }
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
      } catch {
        geometry?.dispose();
        stats.failedBatches += 1;
        continue;
      } finally {
        copies.forEach((copy) => copy.dispose());
      }
      const source = meshes[0];
      const batch = new THREE.Mesh(geometry, source.material);
      batch.name = '静态批处理';
      batch.castShadow = source.castShadow;
      batch.receiveShadow = source.receiveShadow;
      batch.visible = source.visible;
      batch.layers.mask = source.layers.mask;
      batch.renderOrder = source.renderOrder;
      batch.frustumCulled = source.frustumCulled;
      freeze(batch);
      parent.add(batch);
      meshes.forEach((mesh) => parent.remove(mesh));
      stats.batches += 1;
      stats.mergedMeshes += meshes.length;
    }
  };
  visit(root);
  const after = measureSceneResources(root);
  for (const key of ['meshes', 'geometries', 'drawCalls', 'visibleDrawCalls']) {
    stats[`${key}Before`] = before[key];
    stats[`${key}After`] = after[key];
  }
  stats.drawCallsSaved = before.drawCalls - after.drawCalls;
  stats.visibleDrawCallsSaved = before.visibleDrawCalls - after.visibleDrawCalls;
  stats.drawCallReduction = before.drawCalls ? stats.drawCallsSaved / before.drawCalls : 0;
  stats.visibleDrawCallReduction = before.visibleDrawCalls ? stats.visibleDrawCallsSaved / before.visibleDrawCalls : 0;
  return stats;
}
