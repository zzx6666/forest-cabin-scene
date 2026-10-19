import * as THREE from 'three';
import { mulberry32, randomRange, terrainHeight } from './utils.js';

/**
 * 四季农田独立模块。
 *
 * 田地坐标：中心位于世界坐标 (7.9, 11.4)，宽 5.4 米、深 3.2 米，
 * 整体绕 Y 轴旋转 -0.12 弧度。这里位于木屋右前院边缘，默认镜头可见，
 * 与石径、池塘、草捆、夏季遮阳伞及秋季门前红枫保持距离。
 */
const FIELD = Object.freeze({
  centerX: 7.9,
  centerZ: 11.4,
  width: 5.4,
  depth: 3.2,
  rotation: -0.12,
});

const ROW_Z = Object.freeze([-1.14, -0.38, 0.38, 1.14]);
const ROW_LENGTH = 4.72;
const VALID_SEASONS = new Set(['spring', 'summer', 'autumn', 'winter']);
const FIELD_COS = Math.cos(FIELD.rotation);
const FIELD_SIN = Math.sin(FIELD.rotation);

/**
 * 将田地局部坐标转换为世界坐标。
 */
function localToWorld(x, z) {
  return {
    x: FIELD.centerX + x * FIELD_COS + z * FIELD_SIN,
    z: FIELD.centerZ - x * FIELD_SIN + z * FIELD_COS,
  };
}

/**
 * 读取田地局部坐标处的地形高度，并叠加指定抬升量。
 */
function fieldGround(x, z, lift = 0) {
  const world = localToWorld(x, z);
  return terrainHeight(world.x, world.z) + lift;
}

/**
 * 完成实例网格的静态矩阵和包围球设置。
 */
function finalizeInstances(mesh, castShadow = true, receiveShadow = true) {
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

/**
 * 创建贴合真实地形的矩形面片，避免田地边缘悬空。
 */
function createConformingPatch(width, depth, material, lift, segmentsX = 22, segmentsZ = 14) {
  const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(index, fieldGround(positions.getX(index), positions.getZ(index), lift));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/**
 * 生成带固定随机种子的木桩与两层横梁围边。
 */
function createWoodFence(woodMaterial) {
  const random = mulberry32(51817);
  const group = new THREE.Group();
  group.name = '农田木围边';

  const postPositions = [];
  const halfWidth = FIELD.width / 2 + 0.12;
  const halfDepth = FIELD.depth / 2 + 0.12;
  for (const x of [-halfWidth, 0, halfWidth]) {
    for (const z of [-halfDepth, halfDepth]) postPositions.push([x, z]);
  }
  for (const x of [-halfWidth, halfWidth]) postPositions.push([x, 0]);

  const postGeometry = new THREE.CylinderGeometry(0.062, 0.085, 0.58, 6);
  postGeometry.translate(0, 0.29, 0);
  const posts = new THREE.InstancedMesh(postGeometry, woodMaterial, postPositions.length);
  posts.name = '农田木桩';

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const postTops = [];
  postPositions.forEach(([x, z], index) => {
    const ground = fieldGround(x, z, 0);
    const heightScale = randomRange(random, 0.9, 1.12);
    dummy.position.set(x, ground, z);
    dummy.rotation.set(0, randomRange(random, -0.2, 0.2), randomRange(random, -0.025, 0.025));
    dummy.scale.set(1, heightScale, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(index, dummy.matrix);
    color.setHSL(0.09, randomRange(random, 0.25, 0.38), randomRange(random, 0.24, 0.35));
    posts.setColorAt(index, color);
    postTops.push({ x, z, y: ground + 0.58 * heightScale });
  });
  finalizeInstances(posts);
  group.add(posts);

  const railGeometry = new THREE.BoxGeometry(1, 1, 1);
  const railHeights = [0.17, 0.36];
  const rails = new THREE.InstancedMesh(railGeometry, woodMaterial, railHeights.length * 4);
  rails.name = '农田木横梁';
  let railIndex = 0;
  for (const height of railHeights) {
    for (const z of [-halfDepth, halfDepth]) {
      dummy.position.set(0, fieldGround(0, z, height), z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(FIELD.width + 0.32, 0.055, 0.075);
      dummy.updateMatrix();
      rails.setMatrixAt(railIndex, dummy.matrix);
      color.setHSL(0.09, randomRange(random, 0.25, 0.36), randomRange(random, 0.25, 0.33));
      rails.setColorAt(railIndex, color);
      railIndex += 1;
    }
    for (const x of [-halfWidth, halfWidth]) {
      dummy.position.set(x, fieldGround(x, 0, height), 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.075, 0.055, FIELD.depth + 0.32);
      dummy.updateMatrix();
      rails.setMatrixAt(railIndex, dummy.matrix);
      color.setHSL(0.09, randomRange(random, 0.25, 0.36), randomRange(random, 0.25, 0.33));
      rails.setColorAt(railIndex, color);
      railIndex += 1;
    }
  }
  finalizeInstances(rails);
  group.add(rails);

  return { group, postTops };
}

/**
 * 创建四排低多边形土垄，每排拆成多段以贴合微起伏地形。
 */
function createSoilRows(material) {
  const random = mulberry32(62003);
  const segmentsPerRow = 4;
  const segmentLength = (ROW_LENGTH + 0.2) / segmentsPerRow;
  const geometry = new THREE.CylinderGeometry(0.11, 0.155, 1, 6);
  geometry.rotateZ(Math.PI / 2);
  const rows = new THREE.InstancedMesh(
    geometry,
    material,
    ROW_Z.length * segmentsPerRow,
  );
  rows.name = '四季田垄';
  const dummy = new THREE.Object3D();
  let index = 0;
  for (const z of ROW_Z) {
    for (let segment = 0; segment < segmentsPerRow; segment += 1) {
      const x = -ROW_LENGTH / 2 + segmentLength * (segment + 0.5);
      dummy.position.set(x, fieldGround(x, z, 0.105), z);
      dummy.rotation.set(0, randomRange(random, -0.025, 0.025), 0);
      dummy.scale.set(
        segmentLength * 1.06,
        randomRange(random, 0.88, 1.12),
        randomRange(random, 0.92, 1.08),
      );
      dummy.updateMatrix();
      rows.setMatrixAt(index, dummy.matrix);
      index += 1;
    }
  }
  return finalizeInstances(rows);
}

/**
 * 给作物材质注入轻量顶点风摆，避免每帧重算大量实例矩阵。
 */
function createWindMaterial(parameters, mode, strength, registry) {
  const material = new THREE.MeshStandardMaterial(parameters);
  const bendExpression =
    mode === 'head'
      ? '1.0'
      : mode === 'leaf'
        ? 'clamp(position.y * 3.2, 0.0, 1.0)'
        : 'clamp(position.y, 0.0, 1.0)';
  const cacheKey = `seasonal-field-wind-${mode}-${strength}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = { value: 0 };
    shader.uniforms.uWindStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWindTime;
        uniform float uWindStrength;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float fieldWindPhase = uWindTime * 1.22 + instanceMatrix[3].x * 1.73 + instanceMatrix[3].z * 1.31;
        float fieldWindBend = (${bendExpression}) * sin(fieldWindPhase) * uWindStrength;
        transformed.x += fieldWindBend;
        transformed.z += cos(fieldWindPhase * 0.71) * fieldWindBend * 0.42;`,
      );
    material.userData.windShader = shader;
  };
  material.customProgramCacheKey = () => cacheKey;
  registry.push(material);
  return material;
}

/**
 * 春季：黑色翻耕土面、成排土垄、土块与清晰可见的种子点。
 */
function createSpringField() {
  const random = mulberry32(70429);
  const group = new THREE.Group();
  group.name = '春田';

  const seedCountPerRow = 24;
  const seedCount = ROW_Z.length * seedCountPerRow;
  const seedGeometry = new THREE.OctahedronGeometry(0.032, 0);
  const seedMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8d29d,
    emissive: 0x4b3514,
    emissiveIntensity: 0.16,
    roughness: 0.78,
    flatShading: true,
  });
  const seeds = new THREE.InstancedMesh(seedGeometry, seedMaterial, seedCount);
  seeds.name = '春季种子';
  const dummy = new THREE.Object3D();
  let index = 0;
  for (const z of ROW_Z) {
    for (let column = 0; column < seedCountPerRow; column += 1) {
      const x = -2.14 + (column / (seedCountPerRow - 1)) * 4.28 + randomRange(random, -0.035, 0.035);
      const seedZ = z + randomRange(random, -0.055, 0.055);
      dummy.position.set(x, fieldGround(x, seedZ, 0.258), seedZ);
      dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      dummy.scale.setScalar(randomRange(random, 0.7, 1.22));
      dummy.updateMatrix();
      seeds.setMatrixAt(index, dummy.matrix);
      index += 1;
    }
  }
  finalizeInstances(seeds, false, true);
  group.add(seeds);

  const clodCount = 44;
  const clodGeometry = new THREE.DodecahedronGeometry(1, 0);
  const clodMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b3e2a,
    roughness: 1,
    flatShading: true,
  });
  const clods = new THREE.InstancedMesh(clodGeometry, clodMaterial, clodCount);
  clods.name = '春季翻耕土块';
  for (let clod = 0; clod < clodCount; clod += 1) {
    const x = randomRange(random, -2.35, 2.35);
    let z = randomRange(random, -1.34, 1.34);
    const nearestRow = ROW_Z.reduce((best, rowZ) => (
      Math.abs(rowZ - z) < Math.abs(best - z) ? rowZ : best
    ), ROW_Z[0]);
    if (Math.abs(nearestRow - z) < 0.18) z += z >= nearestRow ? 0.21 : -0.21;
    dummy.position.set(x, fieldGround(x, z, 0.12), z);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    dummy.scale.set(
      randomRange(random, 0.035, 0.085),
      randomRange(random, 0.025, 0.055),
      randomRange(random, 0.04, 0.095),
    );
    dummy.updateMatrix();
    clods.setMatrixAt(clod, dummy.matrix);
  }
  finalizeInstances(clods, false, true);
  group.add(clods);

  return group;
}

/**
 * 创建一片简单叶片几何，供夏季幼苗和秋季作物共用。
 */
function createLeafGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      -0.105, 0, 0,
      0, 0.12, 0,
      0.105, 0, 0,
      0, 0.35, 0,
    ], 3),
  );
  geometry.setIndex([0, 1, 3, 1, 2, 3]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 夏季：成排青色幼苗、浅绿叶片和轻微风摆。
 */
function createSummerField(windRegistry) {
  const random = mulberry32(82139);
  const group = new THREE.Group();
  group.name = '夏田';
  const plantsPerRow = 16;
  const plantCount = ROW_Z.length * plantsPerRow;

  const stemGeometry = new THREE.CylinderGeometry(0.017, 0.028, 1, 5);
  stemGeometry.translate(0, 0.5, 0);
  const stemMaterial = createWindMaterial(
    {
      color: 0xffffff,
      roughness: 0.9,
      flatShading: true,
    },
    'stem',
    0.045,
    windRegistry,
  );
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, plantCount);
  stems.name = '夏季幼苗茎';

  const leafGeometry = createLeafGeometry();
  const leafMaterial = createWindMaterial(
    {
      color: 0xffffff,
      roughness: 0.86,
      flatShading: true,
      side: THREE.DoubleSide,
    },
    'leaf',
    0.055,
    windRegistry,
  );
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, plantCount * 3);
  leaves.name = '夏季幼苗叶';

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let stemIndex = 0;
  let leafIndex = 0;
  for (const z of ROW_Z) {
    for (let column = 0; column < plantsPerRow; column += 1) {
      const x = -2.08 + (column / (plantsPerRow - 1)) * 4.16 + randomRange(random, -0.055, 0.055);
      const plantZ = z + randomRange(random, -0.045, 0.045);
      const ground = fieldGround(x, plantZ, 0.145);
      const height = randomRange(random, 0.36, 0.66);

      dummy.position.set(x, ground, plantZ);
      dummy.rotation.set(0, random() * Math.PI * 2, randomRange(random, -0.035, 0.035));
      dummy.scale.set(randomRange(random, 0.9, 1.14), height, randomRange(random, 0.9, 1.14));
      dummy.updateMatrix();
      stems.setMatrixAt(stemIndex, dummy.matrix);
      color.setHSL(
        randomRange(random, 0.255, 0.31),
        randomRange(random, 0.42, 0.64),
        randomRange(random, 0.29, 0.42),
      );
      stems.setColorAt(stemIndex, color);
      stemIndex += 1;

      for (let leaf = 0; leaf < 3; leaf += 1) {
        const angle = (leaf / 3) * Math.PI * 2 + randomRange(random, -0.35, 0.35);
        const leafHeight = ground + height * randomRange(random, 0.44, 0.78);
        dummy.position.set(
          x + Math.cos(angle) * 0.018,
          leafHeight,
          plantZ + Math.sin(angle) * 0.018,
        );
        dummy.rotation.set(
          randomRange(random, -0.18, 0.12),
          angle,
          randomRange(random, -0.98, -0.52),
        );
        const leafScale = randomRange(random, 0.72, 1.08);
        dummy.scale.set(leafScale, randomRange(random, 0.68, 1.02), leafScale);
        dummy.updateMatrix();
        leaves.setMatrixAt(leafIndex, dummy.matrix);
        color.setHSL(
          randomRange(random, 0.255, 0.335),
          randomRange(random, 0.48, 0.72),
          randomRange(random, 0.4, 0.56),
        );
        leaves.setColorAt(leafIndex, color);
        leafIndex += 1;
      }
    }
  }

  group.add(finalizeInstances(stems), finalizeInstances(leaves));
  return group;
}

/**
 * 秋季：高密度金黄麦穗、茎叶和成熟的低多边形穗头。
 */
function createAutumnField(windRegistry) {
  const random = mulberry32(93811);
  const group = new THREE.Group();
  group.name = '秋田';
  const clumpsPerRow = 18;
  const clumpCount = ROW_Z.length * clumpsPerRow;
  const stemsPerClump = 3;
  const stemCount = clumpCount * stemsPerClump;

  const stemGeometry = new THREE.CylinderGeometry(0.009, 0.014, 1, 4);
  stemGeometry.translate(0, 0.5, 0);
  const stemMaterial = createWindMaterial(
    {
      color: 0xffffff,
      roughness: 0.9,
      flatShading: true,
    },
    'stem',
    0.046,
    windRegistry,
  );
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, stemCount);
  stems.name = '秋季麦秆';

  const headGeometry = new THREE.ConeGeometry(0.069, 0.28, 5);
  headGeometry.translate(0, 0.14, 0);
  const headMaterial = createWindMaterial(
    {
      color: 0xffffff,
      roughness: 0.8,
      flatShading: true,
    },
    'head',
    0.05,
    windRegistry,
  );
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, stemCount);
  heads.name = '秋季麦穗';

  const leafGeometry = createLeafGeometry();
  const leafMaterial = createWindMaterial(
    {
      color: 0xffffff,
      roughness: 0.88,
      flatShading: true,
      side: THREE.DoubleSide,
    },
    'leaf',
    0.052,
    windRegistry,
  );
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, stemCount);
  leaves.name = '秋季麦叶';

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let stemIndex = 0;
  let leafIndex = 0;
  for (const z of ROW_Z) {
    for (let column = 0; column < clumpsPerRow; column += 1) {
      const clumpX = -2.12 + (column / (clumpsPerRow - 1)) * 4.24 + randomRange(random, -0.05, 0.05);
      const clumpZ = z + randomRange(random, -0.055, 0.055);
      const baseY = fieldGround(clumpX, clumpZ, 0.145);

      for (let stem = 0; stem < stemsPerClump; stem += 1) {
        const angle = (stem / stemsPerClump) * Math.PI * 2 + randomRange(random, -0.5, 0.5);
        const radius = randomRange(random, 0.018, 0.075);
        const x = clumpX + Math.cos(angle) * radius;
        const stemZ = clumpZ + Math.sin(angle) * radius;
        const height = randomRange(random, 0.84, 1.18);
        const ground = fieldGround(x, stemZ, 0.145);
        const tiltX = randomRange(random, -0.035, 0.035);
        const tiltZ = randomRange(random, -0.055, 0.055);

        dummy.position.set(x, ground, stemZ);
        dummy.rotation.set(tiltX, random() * Math.PI * 2, tiltZ);
        dummy.scale.set(1, height, 1);
        dummy.updateMatrix();
        stems.setMatrixAt(stemIndex, dummy.matrix);
        color.setHSL(
          randomRange(random, 0.105, 0.13),
          randomRange(random, 0.75, 0.88),
          randomRange(random, 0.28, 0.38),
        );
        stems.setColorAt(stemIndex, color);

        dummy.position.set(x, baseY + height, stemZ);
        dummy.rotation.set(tiltX, random() * Math.PI * 2, tiltZ);
        dummy.scale.set(
          randomRange(random, 0.82, 1.08),
          randomRange(random, 0.92, 1.16),
          randomRange(random, 0.82, 1.08),
        );
        dummy.updateMatrix();
        heads.setMatrixAt(stemIndex, dummy.matrix);
        color.setHSL(
          randomRange(random, 0.09, 0.12),
          randomRange(random, 0.92, 0.99),
          randomRange(random, 0.36, 0.48),
        );
        heads.setColorAt(stemIndex, color);

        const leafAngle = random() * Math.PI * 2;
        dummy.position.set(x, ground + height * randomRange(random, 0.42, 0.68), stemZ);
        dummy.rotation.set(
          randomRange(random, -0.22, 0.1),
          leafAngle,
          randomRange(random, -1.08, -0.58),
        );
        const leafScale = randomRange(random, 0.72, 1.05);
        dummy.scale.set(leafScale, randomRange(random, 0.55, 0.78), leafScale);
        dummy.updateMatrix();
        leaves.setMatrixAt(leafIndex, dummy.matrix);
        color.setHSL(
          randomRange(random, 0.12, 0.15),
          randomRange(random, 0.7, 0.85),
          randomRange(random, 0.25, 0.34),
        );
        leaves.setColorAt(leafIndex, color);
        leafIndex += 1;
        stemIndex += 1;
      }
    }
  }

  group.add(
    finalizeInstances(stems),
    finalizeInstances(heads),
    finalizeInstances(leaves),
  );
  return group;
}

/**
 * 冬季：雪层覆盖田面，同时保留深色田埂、裸露沟线、木围边和雪帽。
 */
function createWinterField(postTops) {
  const random = mulberry32(104729);
  const group = new THREE.Group();
  group.name = '冬田';

  const snowCoverMaterial = new THREE.MeshStandardMaterial({
    color: 0xe6eff1,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const snowCover = createConformingPatch(
    FIELD.width - 0.16,
    FIELD.depth - 0.14,
    snowCoverMaterial,
    0.125,
    20,
    12,
  );
  snowCover.name = '冬季田面雪层';
  group.add(snowCover);

  const snowRandom = mulberry32(105143);
  const ridgeGeometry = new THREE.CylinderGeometry(0.105, 0.15, 1, 6);
  ridgeGeometry.rotateZ(Math.PI / 2);
  const snowRidges = new THREE.InstancedMesh(
    ridgeGeometry,
    snowCoverMaterial,
    ROW_Z.length * 4,
  );
  snowRidges.name = '冬季雪垄';
  const dummy = new THREE.Object3D();
  const segmentsPerRow = 4;
  const segmentLength = (ROW_LENGTH + 0.18) / segmentsPerRow;
  let ridgeIndex = 0;
  for (const z of ROW_Z) {
    for (let segment = 0; segment < segmentsPerRow; segment += 1) {
      const x = -ROW_LENGTH / 2 + segmentLength * (segment + 0.5);
      dummy.position.set(x, fieldGround(x, z, 0.145), z);
      dummy.rotation.set(0, randomRange(snowRandom, -0.025, 0.025), 0);
      dummy.scale.set(
        segmentLength * 1.04,
        randomRange(snowRandom, 0.76, 1.02),
        randomRange(snowRandom, 0.9, 1.06),
      );
      dummy.updateMatrix();
      snowRidges.setMatrixAt(ridgeIndex, dummy.matrix);
      ridgeIndex += 1;
    }
  }
  group.add(finalizeInstances(snowRidges, false, true));

  const furrowMaterial = new THREE.MeshStandardMaterial({
    color: 0x332218,
    roughness: 1,
    flatShading: true,
  });
  const furrowZ = [(-ROW_Z[0] - ROW_Z[1]) / 2, 0, (ROW_Z[2] + ROW_Z[3]) / 2];
  const furrowSegments = 5;
  const furrows = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    furrowMaterial,
    furrowZ.length * furrowSegments,
  );
  furrows.name = '冬季裸露田沟';
  let furrowIndex = 0;
  for (const z of furrowZ) {
    for (let segment = 0; segment < furrowSegments; segment += 1) {
      const length = 0.7 + (segment % 2) * 0.14;
      const x = -2.02 + segment * 1.01;
      dummy.position.set(x, fieldGround(x, z, 0.153), z + randomRange(snowRandom, -0.018, 0.018));
      dummy.rotation.set(0, randomRange(snowRandom, -0.018, 0.018), 0);
      dummy.scale.set(length, 0.012, randomRange(snowRandom, 0.04, 0.07));
      dummy.updateMatrix();
      furrows.setMatrixAt(furrowIndex, dummy.matrix);
      furrowIndex += 1;
    }
  }
  group.add(finalizeInstances(furrows, false, true));

  const driftCount = 34;
  const driftGeometry = new THREE.DodecahedronGeometry(1, 0);
  const drifts = new THREE.InstancedMesh(driftGeometry, snowCoverMaterial, driftCount);
  drifts.name = '冬季散雪堆';
  for (let index = 0; index < driftCount; index += 1) {
    const x = randomRange(random, -2.36, 2.36);
    const z = randomRange(random, -1.34, 1.34);
    dummy.position.set(x, fieldGround(x, z, 0.15), z);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    dummy.scale.set(
      randomRange(random, 0.075, 0.21),
      randomRange(random, 0.025, 0.065),
      randomRange(random, 0.06, 0.17),
    );
    dummy.updateMatrix();
    drifts.setMatrixAt(index, dummy.matrix);
  }
  group.add(finalizeInstances(drifts, false, true));

  const capGeometry = new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const postCaps = new THREE.InstancedMesh(capGeometry, snowCoverMaterial, postTops.length);
  postCaps.name = '冬季木桩雪帽';
  postTops.forEach((post, index) => {
    dummy.position.set(post.x, post.y + 0.015, post.z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(
      randomRange(random, 0.092, 0.118),
      randomRange(random, 0.035, 0.052),
      randomRange(random, 0.092, 0.118),
    );
    dummy.updateMatrix();
    postCaps.setMatrixAt(index, dummy.matrix);
  });
  group.add(finalizeInstances(postCaps, false, true));

  return group;
}

/**
 * 创建完整四季农田。
 */
export function createSeasonalField() {
  const group = new THREE.Group();
  group.name = '四季农田';
  group.position.set(FIELD.centerX, 0, FIELD.centerZ);
  group.rotation.y = FIELD.rotation;
  group.userData.field = {
    centerX: FIELD.centerX,
    centerZ: FIELD.centerZ,
    width: FIELD.width,
    depth: FIELD.depth,
    rotation: FIELD.rotation,
  };

  const soilRimMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b1b12,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const soilMaterial = new THREE.MeshStandardMaterial({
    color: 0x24170f,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ridgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d281a,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
  });

  const rim = createConformingPatch(
    FIELD.width + 0.52,
    FIELD.depth + 0.48,
    soilRimMaterial,
    0.045,
    24,
    15,
  );
  rim.name = '农田深色田埂';
  group.add(rim);

  const soil = createConformingPatch(
    FIELD.width,
    FIELD.depth,
    soilMaterial,
    0.072,
    22,
    14,
  );
  soil.name = '农田翻耕土面';
  group.add(soil);

  const rows = createSoilRows(ridgeMaterial);
  group.add(rows);

  const fence = createWoodFence(woodMaterial);
  group.add(fence.group);

  const summerWindMaterials = [];
  const autumnWindMaterials = [];
  const springField = createSpringField();
  const summerField = createSummerField(summerWindMaterials);
  const autumnField = createAutumnField(autumnWindMaterials);
  const winterField = createWinterField(fence.postTops);
  group.add(springField, summerField, autumnField, winterField);

  let currentSeason = 'summer';

  const setSeason = (season) => {
    currentSeason = VALID_SEASONS.has(season) ? season : 'spring';
    springField.visible = currentSeason === 'spring';
    summerField.visible = currentSeason === 'summer';
    autumnField.visible = currentSeason === 'autumn';
    winterField.visible = currentSeason === 'winter';

    if (currentSeason === 'spring') {
      soilMaterial.color.setHex(0x24170f);
      ridgeMaterial.color.setHex(0x3a2619);
      soilRimMaterial.color.setHex(0x2b1b12);
    } else if (currentSeason === 'summer') {
      soilMaterial.color.setHex(0x2b1d13);
      ridgeMaterial.color.setHex(0x432c1c);
      soilRimMaterial.color.setHex(0x302016);
    } else if (currentSeason === 'autumn') {
      soilMaterial.color.setHex(0x342117);
      ridgeMaterial.color.setHex(0x4a2d1b);
      soilRimMaterial.color.setHex(0x352218);
    } else {
      soilMaterial.color.setHex(0x2b1d15);
      ridgeMaterial.color.setHex(0x3b281c);
      soilRimMaterial.color.setHex(0x2d2119);
    }

    group.userData.field.season = currentSeason;
  };

  const update = (elapsed) => {
    if (currentSeason !== 'summer' && currentSeason !== 'autumn') return;
    const time = Number.isFinite(elapsed) ? elapsed : 0;
    const materials = currentSeason === 'summer' ? summerWindMaterials : autumnWindMaterials;
    for (const material of materials) {
      const shader = material.userData.windShader;
      if (shader) shader.uniforms.uWindTime.value = time;
    }
  };

  setSeason('summer');
  return { group, setSeason, update };
}
