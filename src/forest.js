import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, randomRange, terrainHeight } from './utils.js';

const UP = new THREE.Vector3(0, 1, 0);

function composeCylinder(start, end, radius, target) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
  target.compose(midpoint, quaternion, new THREE.Vector3(radius, length, radius));
}


function createOrganicCrownGeometry(widthSegments = 18, heightSegments = 12) {
  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const wobble =
      1 +
      Math.sin(x * 5.2 + y * 3.7 + z * 1.9) * 0.075 +
      Math.cos(z * 5.8 - y * 4.1 + x * 1.3) * 0.055 +
      Math.sin((x + z) * 8.3) * 0.018;
    position.setXYZ(index, x * wobble, y * wobble, z * wobble);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createTerrain(textures) {
  const geometry = new THREE.PlaneGeometry(150, 150, 190, 190);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, terrainHeight(x, z));
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: textures.groundMap,
    color: 0xa6a58c,
    roughness: 1,
    metalness: 0,
  });
  const snowMaterial = new THREE.MeshStandardMaterial({
    color: 0xdae7e8,
    roughness: 0.94,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = '苔藓林地';

  const snowMesh = new THREE.Mesh(geometry, snowMaterial);
  snowMesh.position.y = 0.025;
  snowMesh.receiveShadow = true;
  snowMesh.visible = false;
  snowMesh.name = '积雪地面';

  const group = new THREE.Group();
  group.add(mesh, snowMesh);
  return { group, groundMesh: mesh, snowMesh, material };
}

function createPines(textures) {
  const random = mulberry32(771);
  const trees = [];
  const fixed = [
    [-29, 9, 1.16],
    [30, -7, 1.02],
    [-27, -18, 0.96],
    [34, 16, 0.86],
    [-35, -6, 0.94],
    [12, -31, 1.02],
    [-14, -32, 0.92],
    [3, -35, 1.08],
    [-31, 24, 0.9],
    [27, 27, 0.82],
    [39, 2, 0.9],
    [-39, 17, 0.84],
  ];
  for (const [x, z, size] of fixed) {
    trees.push({
      x,
      z,
      size,
      height: randomRange(random, 9.4, 13.8),
      phase: random() * Math.PI * 2,
    });
  }

  let attempts = 0;
  while (trees.length < 92 && attempts < 800) {
    attempts += 1;
    const radius = 26 + Math.pow(random(), 0.8) * 23;
    const angle = random() * Math.PI * 2;
    trees.push({
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius,
      size: randomRange(random, 0.58, 1.16),
      height: randomRange(random, 8.4, 15.2),
      phase: random() * Math.PI * 2,
    });
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.24, 1, 7);
  trunkGeometry.translate(0, 0.5, 0);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    map: textures.barkMap,
    color: 0x6f5b47,
    roughness: 1,
  });
  const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);

  const foliageGeometry = new THREE.ConeGeometry(1, 1, 8);
  foliageGeometry.translate(0, 0.5, 0);
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const layerCount = 5;
  const foliageMesh = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, trees.length * layerCount);
  const snowMaterial = new THREE.MeshStandardMaterial({
    color: 0xdce9ea,
    roughness: 0.92,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const snowMesh = new THREE.InstancedMesh(foliageGeometry, snowMaterial, trees.length * layerCount);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const layerMeta = [];
  trees.forEach((tree, treeIndex) => {
    const base = terrainHeight(tree.x, tree.z);
    const trunkHeight = tree.height * 0.68;
    dummy.position.set(tree.x, base, tree.z);
    dummy.rotation.set(0, tree.phase, 0);
    dummy.scale.set(tree.size, trunkHeight, tree.size);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(treeIndex, dummy.matrix);

    for (let layer = 0; layer < layerCount; layer += 1) {
      const layerIndex = treeIndex * layerCount + layer;
      const progress = layer / (layerCount - 1);
      const layerHeight = tree.height * (0.34 - progress * 0.07);
      const radius = tree.size * (2.02 - progress * 0.94) * (0.88 + random() * 0.2);
      const x = tree.x + Math.sin(tree.phase + layer) * 0.06;
      const y = base + tree.height * (0.24 + progress * 0.16);
      const z = tree.z + Math.cos(tree.phase + layer) * 0.06;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, tree.phase + layer * 0.63, 0);
      dummy.scale.set(radius, layerHeight, radius);
      dummy.updateMatrix();
      foliageMesh.setMatrixAt(layerIndex, dummy.matrix);

      dummy.position.y += layerHeight * 0.025;
      dummy.scale.set(radius * 1.015, layerHeight * 0.34, radius * 1.015);
      dummy.updateMatrix();
      snowMesh.setMatrixAt(layerIndex, dummy.matrix);

      layerMeta.push({
        treeIndex,
        layer,
        seed: random(),
        lightSeed: random(),
      });
    }
  });

  const setSeason = (season) => {
    layerMeta.forEach((meta, index) => {
      if (season === 'spring') {
        color.setHSL(0.285 + meta.seed * 0.035, 0.24 + meta.seed * 0.12, 0.135 + meta.lightSeed * 0.085);
      } else if (season === 'autumn') {
        const golden = meta.treeIndex % 4 === 0;
        color.setHSL(
          golden ? 0.095 + meta.seed * 0.04 : 0.265 + meta.seed * 0.04,
          golden ? 0.34 : 0.28,
          0.15 + meta.lightSeed * 0.09,
        );
      } else if (season === 'winter') {
        color.setHSL(0.35 + meta.seed * 0.03, 0.11 + meta.lightSeed * 0.06, 0.16 + meta.lightSeed * 0.08);
      } else {
        color.setHSL(0.285 + meta.seed * 0.035, 0.25 + meta.lightSeed * 0.13, 0.105 + meta.seed * 0.09);
      }
      foliageMesh.setColorAt(index, color);
    });
    if (foliageMesh.instanceColor) foliageMesh.instanceColor.needsUpdate = true;
    snowMesh.visible = season === 'winter';
  };

  trunkMesh.instanceMatrix.needsUpdate = true;
  foliageMesh.instanceMatrix.needsUpdate = true;
  snowMesh.instanceMatrix.needsUpdate = true;
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  foliageMesh.castShadow = true;
  foliageMesh.receiveShadow = true;
  snowMesh.castShadow = false;
  snowMesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(trunkMesh, foliageMesh, snowMesh);
  group.name = '针叶林';
  setSeason('summer');
  return { group, foliageMesh, snowMesh, setSeason };
}

function createDeciduousForest(textures) {
  const random = mulberry32(1907);
  const trees = [
    { x: -27, z: 10, height: 9.8, spread: 3.45, warm: 0.06 },
    { x: 28, z: -11, height: 8.4, spread: 3.4, warm: 0.14 },
    { x: -30, z: -15, height: 8.8, spread: 3.6, warm: 0.02 },
    { x: 31, z: 14, height: 9.1, spread: 3.9, warm: 0.12 },
    { x: -19, z: -29, height: 8.0, spread: 3.2, warm: 0.01 },
    { x: 19, z: -30, height: 7.7, spread: 3.2, warm: 0.08 },
    { x: -33, z: 2, height: 8.2, spread: 3.4, warm: 0.02 },
    { x: 36, z: -3, height: 9.4, spread: 4.0, warm: 0.04 },
    { x: 24, z: 27, height: 8.1, spread: 3.5, warm: 0.07 },
    { x: -25, z: 28, height: 8.7, spread: 3.7, warm: 0.04 },
    { x: -30, z: -1, height: 9.2, spread: 3.6, warm: 0.03 },
    { x: 30, z: 1, height: 9.0, spread: 3.5, warm: 0.05 },
    { x: -3, z: 31, height: 8.8, spread: 3.8, warm: 0.02 },
    { x: 8, z: 30, height: 8.4, spread: 3.5, warm: 0.08 },
    { x: -18, z: 26, height: 8.0, spread: 3.3, warm: 0.06 },
    { x: 19, z: 26, height: 8.2, spread: 3.4, warm: 0.1 },
    { x: -8, z: -25, height: 8.2, spread: 2.8, warm: 0.05 },
    { x: 10, z: -25, height: 8.6, spread: 3.0, warm: 0.03 },
    { x: -23, z: 11, height: 7.5, spread: 2.6, warm: 0.06 },
    { x: 23, z: 11, height: 7.8, spread: 2.7, warm: 0.08 },
  ];

  const trunkGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    map: textures.barkMap,
    color: 0x9a8066,
    roughness: 1,
  });
  const branchMaterial = new THREE.MeshStandardMaterial({
    map: textures.barkMap,
    color: 0x7a624d,
    roughness: 1,
  });
  const leafGeometry = createOrganicCrownGeometry(18, 12);
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    flatShading: false,
  });
  const snowMaterial = new THREE.MeshStandardMaterial({
    color: 0xe3edef,
    roughness: 0.9,
    flatShading: true,
  });

  const group = new THREE.Group();
  const leafMatrices = [];
  const leafMeta = [];
  const branchTransforms = [];

  trees.forEach((tree, treeIndex) => {
    const base = terrainHeight(tree.x, tree.z);
    const trunkStart = new THREE.Vector3(tree.x, base - 0.05, tree.z);
    const trunkEnd = new THREE.Vector3(
      tree.x + randomRange(random, -0.35, 0.35),
      base + tree.height * 0.7,
      tree.z + randomRange(random, -0.35, 0.35),
    );
    const trunkMatrix = new THREE.Matrix4();
    composeCylinder(trunkStart, trunkEnd, randomRange(random, 0.22, 0.34), trunkMatrix);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.matrix.copy(trunkMatrix);
    trunk.matrixAutoUpdate = false;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    for (let branchIndex = 0; branchIndex < 6; branchIndex += 1) {
      const angle = (branchIndex / 6) * Math.PI * 2 + randomRange(random, -0.4, 0.4);
      const start = trunkEnd.clone().add(new THREE.Vector3(0, randomRange(random, -1.4, -0.15), 0));
      const reach = tree.spread * randomRange(random, 0.58, 1.05);
      const end = new THREE.Vector3(
        tree.x + Math.cos(angle) * reach,
        base + tree.height * randomRange(random, 0.72, 0.96),
        tree.z + Math.sin(angle) * reach,
      );
      const branchMatrix = new THREE.Matrix4();
      composeCylinder(start, end, randomRange(random, 0.06, 0.13), branchMatrix);
      branchTransforms.push(branchMatrix);
    }

    for (let cluster = 0; cluster < 15; cluster += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * tree.spread;
      const position = new THREE.Vector3(
        tree.x + Math.cos(angle) * radius,
        base + tree.height * randomRange(random, 0.69, 1.02) + (1 - radius / tree.spread) * 0.8,
        tree.z + Math.sin(angle) * radius,
      );
      const scale = randomRange(random, 0.72, 1.52) * (0.8 + tree.spread * 0.08);
      leafMatrices.push({
        position,
        scale: new THREE.Vector3(scale * 1.15, scale * 0.76, scale),
        rotation: new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI),
      });
      leafMeta.push({
        treeIndex,
        seed: random(),
        lightSeed: random(),
        hueSeed: random(),
      });
    }
  });

  const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leafMatrices.length);
  const snowMesh = new THREE.InstancedMesh(leafGeometry, snowMaterial, Math.ceil(leafMatrices.length / 2));
  const dummy = new THREE.Object3D();
  let snowIndex = 0;
  leafMatrices.forEach((transform, index) => {
    dummy.position.copy(transform.position);
    dummy.rotation.copy(transform.rotation);
    dummy.scale.copy(transform.scale);
    dummy.updateMatrix();
    leafMesh.setMatrixAt(index, dummy.matrix);

    if (index % 2 === 0 && snowIndex < snowMesh.count) {
      dummy.position.y += transform.scale.y * 0.38;
      dummy.scale.set(transform.scale.x * 0.7, transform.scale.y * 0.24, transform.scale.z * 0.7);
      dummy.updateMatrix();
      snowMesh.setMatrixAt(snowIndex, dummy.matrix);
      snowIndex += 1;
    }
  });
  leafMesh.instanceMatrix.needsUpdate = true;
  leafMesh.castShadow = true;
  leafMesh.receiveShadow = true;
  snowMesh.count = snowIndex;
  snowMesh.instanceMatrix.needsUpdate = true;
  snowMesh.castShadow = false;
  snowMesh.receiveShadow = true;
  snowMesh.visible = false;

  const branchMesh = new THREE.InstancedMesh(trunkGeometry, branchMaterial, branchTransforms.length);
  branchTransforms.forEach((matrix, index) => branchMesh.setMatrixAt(index, matrix));
  branchMesh.instanceMatrix.needsUpdate = true;
  branchMesh.castShadow = true;
  branchMesh.receiveShadow = true;

  const color = new THREE.Color();
  const setSeason = (season) => {
    leafMesh.visible = season !== 'winter';
    snowMesh.visible = season === 'winter';
    if (season === 'winter') return;

    leafMeta.forEach((meta, index) => {
      if (season === 'spring') {
        const blossom = meta.treeIndex % 2 === 0;
        if (blossom) {
          color.setHSL(0.94 + meta.hueSeed * 0.045, 0.34 + meta.seed * 0.2, 0.61 + meta.lightSeed * 0.16);
        } else {
          color.setHSL(0.3 + meta.hueSeed * 0.045, 0.3 + meta.seed * 0.16, 0.36 + meta.lightSeed * 0.16);
        }
      } else if (season === 'autumn') {
        if (meta.treeIndex === 16 || meta.treeIndex === 19) {
          color.setHSL(0.12 + meta.hueSeed * 0.018, 0.78 + meta.seed * 0.12, 0.5 + meta.lightSeed * 0.12);
        } else if (meta.treeIndex === 17 || meta.treeIndex === 18) {
          color.setHSL(0.985 + meta.hueSeed * 0.02, 0.7 + meta.seed * 0.14, 0.33 + meta.lightSeed * 0.12);
        } else {
          color.setHSL(
            0.045 + meta.treeIndex * 0.005 + meta.hueSeed * 0.1,
            0.62 + meta.seed * 0.24,
            0.38 + meta.lightSeed * 0.2,
          );
        }
      } else {
        color.setHSL(0.245 + meta.hueSeed * 0.07, 0.24 + meta.seed * 0.16, 0.2 + meta.lightSeed * 0.16);
      }
      leafMesh.setColorAt(index, color);
    });
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  };

  group.add(branchMesh, leafMesh, snowMesh);
  group.name = '阔叶树';
  setSeason('summer');
  return { group, leafMesh, snowMesh, setSeason };
}

function createBirches(textures) {
  const random = mulberry32(3421);
  const group = new THREE.Group();
  const barkMaterial = new THREE.MeshStandardMaterial({
    color: 0xbdb9a7,
    roughness: 0.92,
  });
  const markingMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b3a2f,
    roughness: 1,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x718052,
    roughness: 0.92,
    flatShading: false,
  });
  const warmLeafMaterial = new THREE.MeshStandardMaterial({
    color: 0x9a8149,
    roughness: 0.94,
    flatShading: false,
  });

  const crownGeometry = createOrganicCrownGeometry(16, 12);
  const crowns = [];
  const trees = [
    [25.5, 10.5, 7.2],
    [27.2, 12.4, 8.0],
    [24.4, 14.0, 6.6],
  ];
  for (const [x, z, height] of trees) {
    const base = terrainHeight(x, z);
    const leanX = randomRange(random, -0.16, 0.16);
    const leanZ = randomRange(random, -0.16, 0.16);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.11, height, 7), barkMaterial);
    trunk.position.set(x, base + height * 0.5, z);
    trunk.rotation.set(leanX, 0, leanZ);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    for (let mark = 0; mark < 4; mark += 1) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.09 - mark * 0.006, 0.01, 4, 10), markingMaterial);
      band.position.set(
        x + leanZ * (mark - 1.5) * 0.8,
        base + height * (0.24 + mark * 0.14),
        z - leanX * (mark - 1.5) * 0.8,
      );
      band.rotation.x = Math.PI / 2;
      group.add(band);
    }

    for (let cluster = 0; cluster < 9; cluster += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 1.75;
      const crownRadius = randomRange(random, 0.38, 0.82);
      const crown = new THREE.Mesh(
        crownGeometry,
        random() > 0.38 ? leafMaterial : warmLeafMaterial,
      );
      crown.scale.set(crownRadius * 1.2, crownRadius * 0.82, crownRadius);
      crown.position.set(
        x + Math.cos(angle) * radius + leanX * height * 0.3,
        base + height * randomRange(random, 0.73, 1.02),
        z + Math.sin(angle) * radius + leanZ * height * 0.3,
      );

      crown.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      crown.castShadow = true;
      crown.userData.isCrown = true;
      crowns.push(crown);
      group.add(crown);
    }
  }

  const setSeason = (season) => {
    if (season === 'spring') {
      leafMaterial.color.setHex(0x83a85f);
      warmLeafMaterial.color.setHex(0xe0a9b8);
    } else if (season === 'autumn') {
      leafMaterial.color.setHex(0xa97032);
      warmLeafMaterial.color.setHex(0xc6933f);
    } else if (season === 'winter') {
      crowns.forEach((crown) => {
        crown.visible = false;
      });
      return;
    } else {
      leafMaterial.color.setHex(0x65774a);
      warmLeafMaterial.color.setHex(0x8f7844);
    }
    crowns.forEach((crown) => {
      crown.visible = true;
    });
  };

  group.name = '白桦';
  setSeason('summer');
  return { group, setSeason };
}

function createGrass(textures) {
  const random = mulberry32(5129);
  const planeA = new THREE.PlaneGeometry(0.42, 0.58);
  planeA.translate(0, 0.29, 0);
  const planeB = planeA.clone();
  planeB.rotateY(Math.PI / 2);
  const geometry = mergeGeometries([planeA, planeB], false);
  const material = new THREE.MeshStandardMaterial({
    map: textures.grassMap,
    color: 0xa8b98a,
    roughness: 1,
    side: THREE.DoubleSide,
    alphaTest: 0.28,
    transparent: false,
  });

  const windUniform = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader = `uniform float uWindTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         float grassSeed = instanceMatrix[3].x * 0.73 + instanceMatrix[3].z * 0.51;
         float grassWave = sin(uWindTime * 1.18 + grassSeed) * 0.045 + sin(uWindTime * 2.1 + grassSeed * 1.7) * 0.014;
         transformed.x += grassWave * position.y;
         transformed.z += cos(uWindTime * 0.88 + grassSeed) * 0.019 * position.y;
       #endif`,
    );
  };
  material.customProgramCacheKey = () => 'forest-grass-wind-v2';

  const count = 2900;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 10) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = 4.8 + Math.pow(random(), 1.28) * 24;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    if (Math.abs(x) < 4.5 && z > -3.7 && z < 2.8) continue;
    if (Math.abs(x) < 4.05 && z >= 2.8 && z < 5.4) continue;
    if (Math.abs(x) < 1.65 && z > 5.25 && z < 14.8) continue;
    if (((x - 9.8) / 5.15) ** 2 + ((z - 4.2) / 3.9) ** 2 < 1.02) continue;

    dummy.position.set(x, terrainHeight(x, z) + 0.01, z);
    dummy.rotation.set(0, random() * Math.PI, 0);
    const scale = randomRange(random, 0.68, 1.68);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    color.setHSL(
      randomRange(random, 0.2, 0.32),
      randomRange(random, 0.24, 0.4),
      randomRange(random, 0.32, 0.54),
    );
    mesh.setColorAt(placed, color);
    placed += 1;
  }
  mesh.count = placed;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.name = '风中的野草';

  const setSeason = (season) => {
    mesh.visible = season !== 'winter';
    if (season === 'spring') material.color.setHex(0xd1e0a5);
    else if (season === 'autumn') material.color.setHex(0xcab777);
    else if (season === 'winter') material.color.setHex(0xb8c5b8);
    else material.color.setHex(0xb9c996);
  };

  setSeason('summer');
  return { mesh, windUniform, setSeason };
}

function createFernGeometry() {
  const positions = [];
  const indices = [];
  const fronds = 9;
  const segments = 4;
  for (let frond = 0; frond < fronds; frond += 1) {
    const angle = (frond / fronds) * Math.PI * 2 + 0.18;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const px = -dz;
    const pz = dx;
    const length = 0.58 + (frond % 3) * 0.08;
    const baseIndex = positions.length / 3;
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const radius = t * length;
      const width = 0.085 * Math.sin(t * Math.PI) * (1 - t * 0.55) + 0.012;
      const centerX = dx * radius;
      const centerZ = dz * radius;
      const y = 0.055 + Math.sin(t * Math.PI) * 0.32 - t * 0.06;
      positions.push(centerX + px * width, y, centerZ + pz * width);
      positions.push(centerX - px * width, y, centerZ - pz * width);
      if (segment < segments) {
        const a = baseIndex + segment * 2;
        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFerns() {
  const random = mulberry32(5521);
  const geometry = createFernGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const count = 230;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < 1800) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = 5.5 + Math.pow(random(), 1.1) * 19;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    if (Math.abs(x) < 4.6 && z > -3.7 && z < 5.2) continue;
    if (Math.abs(x) < 1.6 && z > 5.2 && z < 14.4) continue;
    if (((x - 9.8) / 5.2) ** 2 + ((z - 4.2) / 4.0) ** 2 < 0.95) continue;
    const scale = randomRange(random, 0.55, 1.28);
    dummy.position.set(x, terrainHeight(x, z) + 0.01, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * randomRange(random, 0.8, 1.15), scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    color.setHSL(
      randomRange(random, 0.22, 0.34),
      randomRange(random, 0.22, 0.4),
      randomRange(random, 0.16, 0.32),
    );
    mesh.setColorAt(placed, color);
    placed += 1;
  }
  mesh.count = placed;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = '林下蕨类';
  return mesh;
}

function createMossPatches() {
  const random = mulberry32(5749);
  const geometry = new THREE.CircleGeometry(0.5, 12);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const count = 180;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 4.2 + Math.pow(random(), 1.1) * 21;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    dummy.position.set(x, terrainHeight(x, z) + 0.015, z);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.scale.set(randomRange(random, 0.5, 2.2), 1, randomRange(random, 0.35, 1.5));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    color.setHSL(randomRange(random, 0.2, 0.31), randomRange(random, 0.18, 0.35), randomRange(random, 0.14, 0.28));
    mesh.setColorAt(index, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.name = '苔藓地衣';
  return mesh;
}

function createShrubs(textures) {
  const random = mulberry32(6713);
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
    flatShading: true,
  });
  const count = 190;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < 1500) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = randomRange(random, 5.8, 26);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    if (Math.abs(x) < 4.7 && z > -3.8 && z < 5.4) continue;
    if (((x - 9.8) / 5.3) ** 2 + ((z - 4.2) / 4.05) ** 2 < 1) continue;
    if (Math.hypot(x - 11, z - 15) < 3.6) continue;
    let scale = randomRange(random, 0.18, 0.72);
    if (z > 4 && z < 14 && x > -5 && x < 8.5) scale *= 0.6;
    dummy.position.set(x, terrainHeight(x, z) + scale * 0.45, z);
    dummy.rotation.set(random() * 0.6, random() * Math.PI, random() * 0.4);
    dummy.scale.set(scale * randomRange(random, 0.9, 1.6), scale * 0.65, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    color.setHSL(
      randomRange(random, 0.22, 0.34),
      randomRange(random, 0.22, 0.42),
      randomRange(random, 0.15, 0.29),
    );
    mesh.setColorAt(placed, color);
    placed += 1;
  }
  mesh.count = placed;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = '林下灌木';
  return mesh;
}

function createPath(textures) {
  const random = mulberry32(8231);
  const group = new THREE.Group();
  const stoneMaterials = [
    new THREE.MeshStandardMaterial({
      map: textures.stoneMap,
      bumpMap: textures.stoneBump,
      bumpScale: 0.045,
      color: 0xd0c8b2,
      roughness: 1,
    }),
    new THREE.MeshStandardMaterial({
      map: textures.stoneMap,
      bumpMap: textures.stoneBump,
      bumpScale: 0.04,
      color: 0x8f9182,
      roughness: 1,
    }),
  ];
  const mossMaterial = new THREE.MeshStandardMaterial({ color: 0x455d31, roughness: 1 });

  const stoneGeometry = new THREE.CylinderGeometry(1, 1, 0.11, 7);
  for (let index = 0; index < 25; index += 1) {
    const t = index / 24;
    const z = 6.32 + t * 10.5;
    const x = Math.sin(t * Math.PI * 1.7 - 0.35) * 0.58 + Math.sin(t * 5.3) * 0.22;
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterials[index % 2]);
    const scale = randomRange(random, 0.38, 0.62) * (0.86 + Math.sin(t * Math.PI) * 0.18);
    stone.position.set(x, terrainHeight(x, z) + 0.055, z);
    stone.scale.set(scale * randomRange(random, 0.85, 1.4), 1, scale * randomRange(random, 0.72, 1.08));
    stone.rotation.y = random() * Math.PI;
    stone.receiveShadow = true;
    stone.castShadow = true;
    group.add(stone);

    if (index % 3 === 0) {
      const moss = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.025, 9), mossMaterial);
      moss.position.set(
        x + randomRange(random, -0.46, 0.46),
        terrainHeight(x, z) + 0.018,
        z + randomRange(random, -0.25, 0.25),
      );
      moss.scale.set(randomRange(random, 0.11, 0.26), 1, randomRange(random, 0.08, 0.18));
      group.add(moss);
    }
  }

  for (let index = 0; index < 24; index += 1) {
    const t = random();
    const z = 6.1 + t * 10.8;
    const x = randomRange(random, -2.2, 2.2);
    const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(randomRange(random, 0.035, 0.09), 0), stoneMaterials[1]);
    pebble.position.set(x, terrainHeight(x, z) + 0.03, z);
    pebble.scale.y = 0.42;
    group.add(pebble);
  }

  group.name = '石径';
  return group;
}

function createRocks(textures) {
  const random = mulberry32(9187);
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.07,
    color: 0xffffff,
    roughness: 1,
    flatShading: true,
  });
  const count = 32;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    let x = 0;
    let z = 0;
    do {
      const angle = random() * Math.PI * 2;
      const radius = randomRange(random, 6.8, 26);
      x = Math.sin(angle) * radius;
      z = Math.cos(angle) * radius;
    } while (Math.abs(x) < 2.8 && z > 5.5 && z < 12);

    const size = randomRange(random, 0.14, 0.72);
    dummy.position.set(x, terrainHeight(x, z) + size * 0.32, z);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    dummy.scale.set(size * randomRange(random, 0.8, 1.5), size * randomRange(random, 0.45, 0.85), size);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    color.setHSL(0.15, 0.04, randomRange(random, 0.24, 0.4));
    mesh.setColorAt(index, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = '散落山石';
  return mesh;
}

function createFallenLog(textures) {
  const group = new THREE.Group();
  const random = mulberry32(10831);
  const base = terrainHeight(-4.4, 8.5);
  const barkMaterial = new THREE.MeshStandardMaterial({
    map: textures.barkMap,
    color: 0x8b7158,
    roughness: 1,
  });
  const cutMaterial = new THREE.MeshStandardMaterial({ color: 0x9b7a55, roughness: 1 });
  const log = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.31, 3.9, 10),
    [barkMaterial, cutMaterial, cutMaterial],
  );
  log.position.set(-4.4, base + 0.3, 8.5);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = -0.11;
  log.castShadow = true;
  log.receiveShadow = true;
  group.add(log);

  const mossMaterial = new THREE.MeshStandardMaterial({ color: 0x526738, roughness: 1 });
  for (let index = 0; index < 12; index += 1) {
    const patch = new THREE.Mesh(new THREE.IcosahedronGeometry(randomRange(random, 0.08, 0.18), 0), mossMaterial);
    patch.position.set(
      -5.8 + random() * 2.9,
      base + 0.54 + randomRange(random, -0.02, 0.04),
      8.45 + randomRange(random, -0.12, 0.12),
    );
    patch.scale.set(randomRange(random, 0.9, 1.8), 0.24, randomRange(random, 0.65, 1.3));
    group.add(patch);
  }
  group.name = '倒木';
  return group;
}

function createMushrooms() {
  const random = mulberry32(12289);
  const group = new THREE.Group();
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0xd3c6a0, roughness: 0.95 });
  const capMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x8d4e32, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0xb88655, roughness: 0.9 }),
  ];
  const spots = [
    [-4.8, 8.1],
    [-3.8, 8.9],
    [-5.4, 9.1],
    [-2.1, 9.7],
    [4.6, 10.4],
    [7.1, 6.8],
    [-7.2, 5.8],
  ];
  for (const [baseX, baseZ] of spots) {
    for (let index = 0; index < 3; index += 1) {
      const x = baseX + randomRange(random, -0.35, 0.35);
      const z = baseZ + randomRange(random, -0.25, 0.25);
      const height = randomRange(random, 0.11, 0.24);
      const base = terrainHeight(x, z);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.038, height, 7), stemMaterial);
      stem.position.set(x, base + height / 2, z);
      group.add(stem);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(randomRange(random, 0.07, 0.14), 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.51),
        capMaterials[index % 2],
      );
      cap.position.set(x, base + height, z);
      cap.scale.y = 0.55;
      cap.castShadow = true;
      group.add(cap);
    }
  }
  group.name = '林间菌菇';
  return group;
}

function createWildflowers() {
  const random = mulberry32(15131);
  const geometry = new THREE.IcosahedronGeometry(0.042, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.8,
    emissive: 0x342c20,
    emissiveIntensity: 0.12,
  });
  const count = 260;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const palette = [
    [0.965, 0.72, 0.63],
    [0.12, 0.84, 0.6],
    [0.58, 0.7, 0.64],
    [0.74, 0.64, 0.65],
    [0.04, 0.8, 0.61],
    [0.01, 0.76, 0.58],
  ];
  for (let index = 0; index < count; index += 1) {
    let x;
    let z;
    do {
      x = randomRange(random, -19, 19);
      z = randomRange(random, -14, 21);
    } while (Math.abs(x) < 3 && z > 5 && z < 12);
    dummy.position.set(x, terrainHeight(x, z) + randomRange(random, 0.2, 0.5), z);
    dummy.scale.setScalar(randomRange(random, 0.65, 1.35));
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    const pick = palette[Math.floor(random() * palette.length)];
    color.setHSL(
      pick[0],
      Math.min(1, pick[1] + randomRange(random, -0.05, 0.08)),
      Math.max(0.42, pick[2] + randomRange(random, -0.08, 0.02)),
    );
    mesh.setColorAt(index, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = '细碎野花';
  return mesh;
}

function createFallenLeaves(textures) {
  const random = mulberry32(17393);
  const geometry = new THREE.PlaneGeometry(0.14, 0.24);
  const material = new THREE.MeshStandardMaterial({
    map: textures.leaf,
    color: 0xffffff,
    roughness: 1,
    side: THREE.DoubleSide,
    alphaTest: 0.22,
  });
  const count = 650;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 5) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = 5 + Math.pow(random(), 0.9) * 19;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    if (Math.abs(x) < 4.65 && z > -3.8 && z < 5.3) continue;
    if (((x - 9.8) / 4.8) ** 2 + ((z - 4.2) / 3.7) ** 2 < 0.75) continue;
    dummy.position.set(x, terrainHeight(x, z) + 0.018, z);
    dummy.rotation.set(
      -Math.PI / 2 + randomRange(random, -0.16, 0.16),
      random() * Math.PI,
      random() * Math.PI,
    );
    dummy.scale.setScalar(randomRange(random, 0.9, 2.0));
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    const palette = [
      [0.07, 0.75, 0.48],
      [0.1, 0.68, 0.43],
      [0.045, 0.7, 0.38],
      [0.14, 0.6, 0.52],
    ];
    const pick = palette[Math.floor(random() * palette.length)];
    color.setHSL(pick[0], pick[1], pick[2] + randomRange(random, -0.08, 0.08));
    mesh.setColorAt(placed, color);
    placed += 1;
  }
  mesh.count = placed;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.name = '满地落叶';
  return mesh;
}

export function createLandscape(textures) {
  const group = new THREE.Group();
  group.name = '森林地形';

  const terrain = createTerrain(textures);
  const pines = createPines(textures);
  const deciduous = createDeciduousForest(textures);
  const birches = createBirches(textures);
  const grass = createGrass(textures);
  const ferns = createFerns();
  const moss = createMossPatches();
  const shrubs = createShrubs(textures);
  const path = createPath(textures);
  const rocks = createRocks(textures);
  const fallenLog = createFallenLog(textures);
  const mushrooms = createMushrooms();
  const wildflowers = createWildflowers();
  const fallenLeaves = createFallenLeaves(textures);

  group.add(terrain.group);
  group.add(pines.group);
  group.add(deciduous.group);
  group.add(birches.group);
  group.add(grass.mesh);
  group.add(ferns);
  group.add(moss);
  group.add(shrubs);
  group.add(path);
  group.add(rocks);
  group.add(fallenLog);
  group.add(mushrooms);
  group.add(wildflowers);
  group.add(fallenLeaves);

  let currentSeason = 'summer';
  const setSeason = (season) => {
    currentSeason = season;
    pines.setSeason(season);
    deciduous.setSeason(season);
    birches.setSeason(season);
    grass.setSeason(season);
    ferns.visible = season !== 'winter';
    moss.visible = season !== 'winter';
    terrain.snowMesh.visible = season === 'winter';
    fallenLeaves.visible = season === 'autumn';

    if (season === 'spring') {
      terrain.material.color.setHex(0xaab89a);
      shrubs.material.color.setHex(0xc1d49a);
      ferns.material.color.setHex(0xa8c085);
      moss.material.color.setHex(0xc4d3a8);
      wildflowers.visible = true;
      wildflowers.count = 260;
    } else if (season === 'autumn') {
      terrain.material.color.setHex(0xc0a477);
      shrubs.material.color.setHex(0xc5a376);
      ferns.material.color.setHex(0xb69c68);
      moss.material.color.setHex(0xb9a16e);
      wildflowers.visible = true;
      wildflowers.count = 64;
    } else if (season === 'winter') {
      terrain.material.color.setHex(0x9aa8a4);
      shrubs.material.color.setHex(0x9facab);
      ferns.material.color.setHex(0xffffff);
      moss.material.color.setHex(0xffffff);
      wildflowers.visible = false;
    } else {
      terrain.material.color.setHex(0xa6a58c);
      shrubs.material.color.setHex(0xffffff);
      ferns.material.color.setHex(0xffffff);
      moss.material.color.setHex(0xffffff);
      wildflowers.visible = true;
      wildflowers.count = 170;
    }
  };
  setSeason('summer');

  return {
    group,
    setSeason,
    getSeason: () => currentSeason,
    update(elapsed) {
      grass.windUniform.value = elapsed;
    },
  };
}
