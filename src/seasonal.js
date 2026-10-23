import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mulberry32, randomRange, terrainHeight } from './utils.js';
import { optimizeStaticScene } from './scene-optimization.js';

// 木屋、门廊与烟囱的关键尺寸，与 cabin.js 的建筑坐标保持一致。
const CABIN_LAYOUT = Object.freeze({
  roofEaveY: 4.24,
  roofRidgeY: 6.7,
  roofHalfSpan: 4.46,
  roofFootprintHalfSpan: 4.62,
  roofHalfDepth: 3.52,
  roofFootprintHalfDepth: 3.56,
  porchCenterZ: 3.87,
  porchCenterY: 3.72,
  porchHalfWidth: 3.84,
  porchHalfDepth: 1.44,
  porchTilt: 0.17,
  chimneyX: 2.98,
  chimneyZ: -1.24,
  chimneyHalfWidth: 0.62,
  chimneyTopY: 7.05,
});

// 蝴蝶翼展会占据一小圈空间，飞行轨迹与建筑之间额外预留安全距离。
function isButterflyAirspaceClear(x, z, clearance = 0.65) {
  const roofOverlap =
    Math.abs(x) < CABIN_LAYOUT.roofFootprintHalfSpan + clearance &&
    Math.abs(z) < CABIN_LAYOUT.roofFootprintHalfDepth + clearance;
  const porchOverlap =
    Math.abs(x) < CABIN_LAYOUT.porchHalfWidth + clearance &&
    z > CABIN_LAYOUT.porchCenterZ - CABIN_LAYOUT.porchHalfDepth - clearance &&
    z < CABIN_LAYOUT.porchCenterZ + CABIN_LAYOUT.porchHalfDepth + clearance;
  return !roofOverlap && !porchOverlap;
}

function addMesh(parent, geometry, material, position, options = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
  if (options.scale) mesh.scale.set(options.scale[0], options.scale[1], options.scale[2]);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function addBox(parent, size, position, material, options = {}) {
  return addMesh(
    parent,
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material,
    position,
    options,
  );
}

function addCylinder(parent, radiusTop, radiusBottom, height, position, material, options = {}) {
  const { segments = 10, ...meshOptions } = options;
  return addMesh(
    parent,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
    position,
    meshOptions,
  );
}

const WaterReflectionShader = {
  name: 'WaterReflectionShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x173e3e) },
    uShallow: { value: new THREE.Color(0x7ea395) },
    uFoam: { value: new THREE.Color(0xd9e7dd) },
    uOpacity: { value: 0.92 },
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 vReflectUv;
    varying vec2 vLocalUv;
    varying vec3 vWorldPosition;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vLocalUv = uv;
      vReflectUv = textureMatrix * vec4(position, 1.0);
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec3 uDeep;
    uniform vec3 uShallow;
    uniform vec3 uFoam;
    uniform float uOpacity;
    varying vec4 vReflectUv;
    varying vec2 vLocalUv;
    varying vec3 vWorldPosition;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec2 centered = vLocalUv - 0.5;
      float radial = length(centered) * 2.0;

      float waveA = sin(vWorldPosition.x * 4.7 + vWorldPosition.z * 3.2 + uTime * 0.62) * 0.0034;
      float waveB = sin(vWorldPosition.x * -7.1 + vWorldPosition.z * 5.9 - uTime * 0.41) * 0.0023;
      vec4 reflectedUv = vReflectUv;
      reflectedUv.xy += vec2(waveA, waveB) * reflectedUv.w;
      vec3 reflection = texture2DProj(tDiffuse, reflectedUv).rgb;

      vec3 waterTint = mix(uDeep, uShallow, 0.32 + radial * 0.23);
      float fresnel = pow(1.0 - clamp(dot(normalize(cameraPosition - vWorldPosition), vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 2.2);
      vec3 color = mix(waterTint, reflection * 0.73, clamp(0.1 + fresnel * 0.18, 0.0, 0.28));

      float rippleA = sin(vWorldPosition.x * 19.0 + vWorldPosition.z * 13.0 + uTime * 1.15);
      float rippleB = sin(vWorldPosition.x * -11.0 + vWorldPosition.z * 23.0 - uTime * 0.8);
      float shimmer = smoothstep(0.88, 1.0, (rippleA + rippleB) * 0.5);
      color += uFoam * shimmer * 0.12;

      float shore = smoothstep(0.82, 0.995, radial);
      color = mix(color, uFoam * 0.7, shore * 0.12);
      gl_FragColor = vec4(color, uOpacity);
    }
  `,
};

function createWater(textures, center, quality = {}) {
  const geometry = new THREE.CircleGeometry(1, 96);
  const water = new Reflector(geometry, {
    clipBias: 0.003,
    textureWidth: quality.reflectionSize ?? (window.innerWidth < 760 ? 512 : 1024),
    textureHeight: quality.reflectionSize ?? (window.innerWidth < 760 ? 512 : 1024),
    color: 0x9bb3aa,
    multisample: quality.reflectionSamples ?? 4,
    shader: WaterReflectionShader,
  });
  water.rotation.x = -Math.PI / 2;
  water.scale.set(4.5, 3.25, 1);
  water.position.set(center.x, center.y + 0.07, center.z);
  water.material.transparent = true;
  water.material.depthWrite = false;
  water.renderOrder = 3;
  water.name = '四季水面';
  return { water, material: water.material };
}

function createPond(textures, quality) {
  const random = mulberry32(38119);
  const group = new THREE.Group();
  const center = new THREE.Vector3(9.8, 0, 4.2);
  let maximumGround = -Infinity;
  for (let index = 0; index < 48; index += 1) {
    const angle = (index / 48) * Math.PI * 2;
    const sampleX = center.x + Math.cos(angle) * 4.45;
    const sampleZ = center.z + Math.sin(angle) * 3.25;
    maximumGround = Math.max(maximumGround, terrainHeight(sampleX, sampleZ));
  }
  center.y = maximumGround + 0.03;

  const stoneMaterial = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.055,
    color: 0x9f9c87,
    roughness: 1,
  });
  const darkStoneMaterial = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.06,
    color: 0x62685b,
    roughness: 1,
  });
  const woodMaterial = new THREE.MeshStandardMaterial({
    map: textures.plankMap,
    bumpMap: textures.plankBump,
    bumpScale: 0.04,
    color: 0x8f6847,
    roughness: 0.9,
  });
  const darkWoodMaterial = new THREE.MeshStandardMaterial({
    map: textures.plankMap,
    color: 0x5a402d,
    roughness: 0.96,
  });
  const snowMaterial = new THREE.MeshStandardMaterial({ color: 0xe0ebed, roughness: 0.92 });

  const basin = new THREE.Mesh(
    new THREE.CircleGeometry(1, 72),
    new THREE.MeshStandardMaterial({ color: 0x202a25, roughness: 1 }),
  );
  basin.rotation.x = -Math.PI / 2;
  basin.scale.set(4.7, 3.45, 1);
  basin.position.set(center.x, center.y + 0.035, center.z);
  basin.receiveShadow = true;
  group.add(basin);

  const water = createWater(textures, center, quality);
  group.add(water.water);

  const ripples = [];
  for (let index = 0; index < 5; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xd4e2d8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 48), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(
      center.x + randomRange(random, -2.2, 2.2),
      center.y + 0.105,
      center.z + randomRange(random, -1.3, 1.3),
    );
    ring.userData.phase = index * 0.19 + randomRange(random, 0, 0.12);
    ring.userData.driftX = randomRange(random, -0.16, 0.16);
    ring.userData.driftZ = randomRange(random, -0.12, 0.12);
    ring.userData.baseX = ring.position.x;
    ring.userData.baseZ = ring.position.z;
    group.add(ring);
    ripples.push(ring);
  }

  const snowCaps = [];
  for (let index = 0; index < 34; index += 1) {
    const angle = (index / 34) * Math.PI * 2 + randomRange(random, -0.06, 0.06);
    const radius = randomRange(random, 0.94, 1.12);
    const x = center.x + Math.cos(angle) * 4.55 * radius;
    const z = center.z + Math.sin(angle) * 3.32 * radius;
    const base = terrainHeight(x, z);
    const size = randomRange(random, 0.18, 0.46);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), index % 3 === 0 ? darkStoneMaterial : stoneMaterial);
    rock.position.set(x, base + size * 0.35, z);
    rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    rock.scale.set(randomRange(random, 1.1, 1.65), randomRange(random, 0.62, 0.95), randomRange(random, 0.85, 1.3));
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);

    if (index % 2 === 0) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(size * 0.78, 10, 6), snowMaterial);
      cap.position.set(x, rock.position.y + size * 0.35, z);
      cap.scale.set(1.35, 0.3, 1.1);
      cap.visible = false;
      cap.userData.isSnowCap = true;
      group.add(cap);
      snowCaps.push(cap);
    }
  }

  // 小木码头
  const deck = new THREE.Group();
  deck.position.set(center.x - 4.45, center.y + 0.18, center.z + 0.65);
  deck.rotation.y = -0.18;
  for (let index = 0; index < 7; index += 1) {
    addBox(deck, [2.5, 0.11, 0.22], [0, 0, -0.74 + index * 0.24], index % 2 ? woodMaterial : darkWoodMaterial);
  }
  for (const x of [-0.92, 0.92]) {
    addBox(deck, [0.11, 1.4, 0.11], [x, 0.7, -0.72], darkWoodMaterial);
    addBox(deck, [0.11, 1.4, 0.11], [x, 0.7, 0.72], darkWoodMaterial);
    addBox(deck, [0.12, 0.12, 1.65], [x, 1.37, 0], darkWoodMaterial);
  }
  group.add(deck);

  const lanternGlassMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.1, 1.25, 0.48),
    toneMapped: false,
  });
  const lanternPositions = [
    [center.x - 5.35, center.y + 1.58, center.z - 0.05],
    [center.x - 3.62, center.y + 1.58, center.z + 1.3],
  ];
  lanternPositions.forEach((position) => {
    addBox(group, [0.2, 0.28, 0.2], position, darkWoodMaterial);
    addMesh(group, new THREE.SphereGeometry(0.09, 9, 6), lanternGlassMaterial, [position[0], position[1] - 0.02, position[2]], {
      castShadow: false,
    });
  });
  const dockLight = new THREE.PointLight(0xffb367, 9, 8, 2);
  dockLight.position.set(center.x - 4.5, center.y + 1.55, center.z + 0.5);
  group.add(dockLight);

  const steamGroup = new THREE.Group();
  for (let index = 0; index < 30; index += 1) {
    const material = new THREE.SpriteMaterial({
      map: textures.softGlow,
      color: index % 3 === 0 ? 0xe1eee8 : 0xc8d9d2,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(
      center.x + randomRange(random, -2.8, 2.8),
      center.y + randomRange(random, 0.3, 3.7),
      center.z + randomRange(random, -2.0, 2.0),
    );
    const baseX = sprite.position.x;
    const baseZ = sprite.position.z;
    const scale = randomRange(random, 1.0, 2.8);
    sprite.scale.set(scale * 1.4, scale, 1);
    sprite.userData = {
      baseX,
      baseY: sprite.position.y,
      baseZ,
      phase: random() * Math.PI * 2,
      speed: randomRange(random, 0.08, 0.2),
      scale,
    };
    steamGroup.add(sprite);
  }
  group.add(steamGroup);

  const snowBankMaterial = new THREE.MeshStandardMaterial({ color: 0xe4edef, roughness: 0.92 });
  const snowBanks = [];
  for (let index = 0; index < 16; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = randomRange(random, 3.9, 5.4);
    const x = center.x + Math.cos(angle) * radius;
    const z = center.z + Math.sin(angle) * radius * 0.72;
    const bank = new THREE.Mesh(new THREE.SphereGeometry(randomRange(random, 0.7, 1.8), 12, 7), snowBankMaterial);
    bank.position.set(x, terrainHeight(x, z) + 0.04, z);
    bank.scale.y = 0.18;
    bank.visible = false;
    bank.userData.isWinterBank = true;
    group.add(bank);
    snowBanks.push(bank);
  }

  const optimizationStats = optimizeStaticScene(group, [water.water, steamGroup, ...snowCaps, ...snowBanks, ...ripples]);
  return {
    group,
    optimizationStats,
    center,
    water: water.material,
    reflector: water.water,
    steamGroup,
    snowCaps,
    snowBanks,
    ripples,
  };
}

function createFlowerField() {
  const random = mulberry32(41711);
  const group = new THREE.Group();
  const count = 280;
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x4e713e, roughness: 1 });
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    emissive: 0x1a120c,
    emissiveIntensity: 0.08,
    flatShading: true,
  });
  const stemGeometry = new THREE.CylinderGeometry(0.008, 0.012, 0.22, 5);
  stemGeometry.translate(0, 0.11, 0);
  const headGeometry = new THREE.IcosahedronGeometry(0.085, 1);
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, count);
  const heads = new THREE.InstancedMesh(headGeometry, petalMaterial, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 12) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const radius = randomRange(random, 5.8, 23);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    if (Math.abs(x) < 4.2 && Math.abs(z) < 3.4) continue;
    if (Math.abs(x) < 3 && z > 4.5 && z < 9) continue;
    if (Math.hypot(x - 9.8, z - 4.2) < 5.7) continue;

    const scale = randomRange(random, 0.7, 1.65);
    const base = terrainHeight(x, z);
    dummy.position.set(x, base, z);
    dummy.rotation.set(0, random() * Math.PI, randomRange(random, -0.08, 0.08));
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    stems.setMatrixAt(placed, dummy.matrix);

    dummy.position.y = base + 0.22 * scale;
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.scale.set(scale * randomRange(random, 0.85, 1.25), scale * 0.72, scale);
    dummy.updateMatrix();
    heads.setMatrixAt(placed, dummy.matrix);

    const palette = [
      [0.955, 0.78, 0.61],
      [0.12, 0.9, 0.58],
      [0.59, 0.76, 0.62],
      [0.75, 0.7, 0.61],
      [0.04, 0.88, 0.58],
      [0.01, 0.82, 0.55],
    ];
    const pick = palette[Math.floor(random() * palette.length)];
    color.setHSL(pick[0], pick[1], pick[2] + randomRange(random, -0.08, 0.08));
    heads.setColorAt(placed, color);
    placed += 1;
  }
  stems.count = placed;
  heads.count = placed;
  stems.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  stems.castShadow = false;
  stems.receiveShadow = true;
  heads.castShadow = false;
  heads.receiveShadow = true;
  group.add(stems, heads);
  group.name = '春日花丛';
  return group;
}

// 检查庭院地面是否避开木屋、门廊和池塘，供小动物及脚印布点使用。
function isCourtyardGroundClear(x, z, margin = 0.55) {
  const insideCabin =
    x > -4.05 - margin &&
    x < 4.05 + margin &&
    z > -3.35 - margin &&
    z < 6.15 + margin;
  const pondDistance = Math.hypot(
    (x - 9.8) / (4.95 + margin),
    (z - 4.2) / (3.72 + margin),
  );
  return !insideCabin && pondDistance > 1;
}

function createRabbit(furColor = 0xd4b996) {
  const random = mulberry32(Math.floor(furColor + 31));
  const rabbit = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: furColor, roughness: 1 });
  const furLight = new THREE.MeshStandardMaterial({ color: 0xeadbc4, roughness: 1 });
  const innerEar = new THREE.MeshStandardMaterial({ color: 0xc98d8b, roughness: 0.95 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x17130e, roughness: 0.4 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), fur);
  body.scale.set(1.15, 0.84, 1.32);
  body.position.y = 0.3;
  body.castShadow = true;
  rabbit.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), furLight);
  chest.scale.set(0.9, 1.05, 0.55);
  chest.position.set(0, 0.33, 0.2);
  rabbit.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), fur);
  head.scale.set(0.95, 0.92, 0.92);
  head.position.set(0, 0.62, 0.18);
  head.castShadow = true;
  rabbit.add(head);

  const ears = [];
  for (const side of [-1, 1]) {
    const earPivot = new THREE.Group();
    earPivot.position.set(side * 0.085, 0.77, 0.18);
    earPivot.rotation.z = side * -0.12;
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.3, 4, 7), fur);
    ear.position.y = 0.16;
    ear.castShadow = true;
    earPivot.add(ear);
    const inside = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.22, 4, 6), innerEar);
    inside.position.set(0, 0.14, 0.046);
    inside.scale.z = 0.42;
    earPivot.add(inside);
    rabbit.add(earPivot);
    ears.push(earPivot);
  }

  for (const side of [-1, 1]) {
    const eyeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.023, 8, 6), eye);
    eyeMesh.position.set(side * 0.078, 0.65, 0.345);
    rabbit.add(eyeMesh);
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.12, 4, 6), furLight);
    foot.rotation.z = Math.PI / 2;
    foot.position.set(side * 0.16, 0.12, 0.21);
    rabbit.add(foot);
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), innerEar);
  nose.position.set(0, 0.58, 0.365);
  rabbit.add(nose);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 7), furLight);
  tail.position.set(0, 0.32, -0.28);
  rabbit.add(tail);

  rabbit.userData = {
    ears,
    head,
    phase: randomRange(random, 0, Math.PI * 2),
    baseY: 0,
  };
  return rabbit;
}

function createDeer() {
  const random = mulberry32(44813);
  const deer = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xa8774e, roughness: 0.95 });
  const lightFur = new THREE.MeshStandardMaterial({ color: 0xd7b892, roughness: 0.95 });
  const darkFur = new THREE.MeshStandardMaterial({ color: 0x56402e, roughness: 1 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x14100b, roughness: 0.4 });

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), fur);
  torso.scale.set(0.92, 0.74, 1.45);
  torso.position.y = 0.88;
  torso.castShadow = true;
  deer.add(torso);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.78, 10), fur);
  neck.position.set(0, 1.35, 0.36);
  neck.rotation.x = -0.28;
  neck.castShadow = true;
  deer.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.72, 0.51);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10), fur);
  head.scale.set(0.9, 0.85, 1.15);
  head.castShadow = true;
  headPivot.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), lightFur);
  muzzle.scale.set(0.85, 0.65, 1.2);
  muzzle.position.set(0, -0.08, 0.2);
  headPivot.add(muzzle);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 5), fur);
    ear.position.set(side * 0.16, 0.17, -0.03);
    ear.rotation.z = side * -0.65;
    headPivot.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMaterial);
    eye.position.set(side * 0.13, 0.03, 0.24);
    headPivot.add(eye);
  }
  deer.add(headPivot);

  const legs = [];
  for (const x of [-0.28, 0.28]) {
    for (const z of [-0.34, 0.35]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.76, 7), x < 0 ? fur : darkFur);
      leg.position.set(x, 0.42, z);
      leg.castShadow = true;
      deer.add(leg);
      legs.push(leg);
    }
  }

  for (let index = 0; index < 7; index += 1) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(randomRange(random, 0.025, 0.045), 7, 5), lightFur);
    spot.position.set(
      randomRange(random, -0.22, 0.22),
      0.94 + randomRange(random, -0.11, 0.16),
      randomRange(random, -0.28, 0.25),
    );
    deer.add(spot);
  }

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lightFur);
  tail.position.set(0, 0.95, -0.63);
  deer.add(tail);

  deer.userData = {
    headPivot,
    phase: random() * Math.PI * 2,
    legs,
  };
  return deer;
}

function createButterflyGeometry(side = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(0.02, 0.015);
  shape.bezierCurveTo(0.15, 0.06, 0.42, 0.08, 0.52, 0.24);
  shape.bezierCurveTo(0.6, 0.38, 0.45, 0.48, 0.27, 0.44);
  shape.bezierCurveTo(0.14, 0.41, 0.04, 0.27, 0.02, 0.015);
  shape.moveTo(0.02, 0.005);
  shape.bezierCurveTo(0.18, -0.12, 0.36, -0.16, 0.42, -0.3);
  shape.bezierCurveTo(0.44, -0.44, 0.24, -0.44, 0.11, -0.31);
  shape.bezierCurveTo(0.04, -0.23, 0.015, -0.11, 0.02, 0.005);
  const geometry = new THREE.ShapeGeometry(shape, 16);
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(side, 1, 1);
  geometry.computeVertexNormals();
  return geometry;
}

function createButterflies() {
  const random = mulberry32(49103);
  const group = new THREE.Group();
  const butterflies = [];
  const colors = [0xe9a84e, 0xf1cd73, 0xd98298, 0xc2a0d4, 0xeb9d67];
  const wingGeometries = {
    left: createButterflyGeometry(-1),
    right: createButterflyGeometry(1),
  };
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2e2417, roughness: 0.72 });
  const antennaMaterial = new THREE.MeshStandardMaterial({ color: 0x3c2f1d, roughness: 0.8 });
  // 全部飞行椭圆都位于建筑安全区之外，并按前院、两侧与后院分散布点。
  const flightZones = [
    { x: 0.0, z: 9.3, radiusX: 4.1, radiusZ: 1.45, count: 4, height: [1.35, 2.7] },
    { x: -7.8, z: 10.2, radiusX: 2.2, radiusZ: 1.7, count: 4, height: [1.25, 2.55] },
    { x: 7.2, z: 10.4, radiusX: 2.5, radiusZ: 1.8, count: 4, height: [1.3, 2.75] },
    { x: -9.2, z: 2.1, radiusX: 2.2, radiusZ: 2.0, count: 4, height: [1.35, 2.8] },
    { x: 8.8, z: 0.8, radiusX: 2.0, radiusZ: 2.2, count: 4, height: [1.25, 2.65] },
    { x: 0.0, z: -7.4, radiusX: 4.8, radiusZ: 1.65, count: 3, height: [1.4, 2.85] },
    { x: -8.2, z: -6.2, radiusX: 2.3, radiusZ: 1.8, count: 3, height: [1.3, 2.7] },
    { x: 8.4, z: -6.4, radiusX: 2.2, radiusZ: 1.8, count: 3, height: [1.35, 2.75] },
  ];

  let butterflyIndex = 0;
  for (const zone of flightZones) {
    for (let zoneIndex = 0; zoneIndex < zone.count; zoneIndex += 1) {
    const butterfly = new THREE.Group();
    const wingMaterial = new THREE.MeshBasicMaterial({
      color: colors[butterflyIndex % colors.length],
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const leftPivot = new THREE.Group();
    const rightPivot = new THREE.Group();
    const leftWing = new THREE.Mesh(wingGeometries.left, wingMaterial);
    const rightWing = new THREE.Mesh(wingGeometries.right, wingMaterial);
    leftWing.castShadow = true;
    rightWing.castShadow = true;
    leftPivot.add(leftWing);
    rightPivot.add(rightWing);
    butterfly.add(leftPivot, rightPivot);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.027, 0.21, 4, 7), bodyMaterial);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0.006, 0.03);
    body.castShadow = true;
    butterfly.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bodyMaterial);
    head.position.set(0, 0.02, -0.12);
    butterfly.add(head);

    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.015, 0.03, -0.15),
        new THREE.Vector3(side * 0.05, 0.11, -0.24),
        new THREE.Vector3(side * 0.085, 0.17, -0.32),
      ]);
      const antenna = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.0035, 3, false), antennaMaterial);
      butterfly.add(antenna);
      const spot = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 8),
        new THREE.MeshBasicMaterial({ color: 0x6c4c26, transparent: true, opacity: 0.48, side: THREE.DoubleSide }),
      );
      spot.rotation.x = -Math.PI / 2;
      spot.position.set(side * 0.22, 0.006, -0.23);
      butterfly.add(spot);
    }

    const radiusX = zone.radiusX * randomRange(random, 0.82, 1.08);
    const radiusZ = zone.radiusZ * randomRange(random, 0.82, 1.08);
    const flightHeight = randomRange(random, zone.height[0], zone.height[1]);
    const phase = random() * Math.PI * 2;
    const initialX = zone.x + Math.cos(phase) * radiusX;
    const initialZ = zone.z + Math.sin(phase * 1.26) * radiusZ;
    butterfly.position.set(initialX, terrainHeight(initialX, initialZ) + flightHeight, initialZ);
    butterfly.scale.setScalar(randomRange(random, 0.72, 1.0));
    butterfly.userData = {
      centerX: zone.x,
      centerZ: zone.z,
      radiusX,
      radiusZ,
      flightHeight,
      phase,
      speed: randomRange(random, 0.56, 0.86),
      tilt: randomRange(random, -0.2, 0.2),
      leftPivot,
      rightPivot,
    };
    group.add(butterfly);
    butterflies.push(butterfly);
    butterflyIndex += 1;
    }
  }
  group.name = '春日蝴蝶';
  return { group, butterflies };
}

function createSpringFlowerBorders() {
  const random = mulberry32(51893);
  const group = new THREE.Group();
  const zones = [
    { x: -4.6, z: 8.2, radiusX: 2.4, radiusZ: 2.6, count: 14 },
    { x: -7.6, z: 11.4, radiusX: 2.2, radiusZ: 1.9, count: 10 },
    { x: 4.8, z: 10.2, radiusX: 2.5, radiusZ: 2.2, count: 14 },
    { x: -6.8, z: 3.4, radiusX: 2.4, radiusZ: 2.0, count: 9 },
    { x: 2.8, z: 15.4, radiusX: 2.8, radiusZ: 1.2, count: 9 },
  ];
  const flowerCount = zones.reduce((total, zone) => total + zone.count, 0);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x4f703e, roughness: 1 });
  const petalMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xe7b73d, toneMapped: false });
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.016, 1, 5), stemMaterial, flowerCount);
  const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 7, 5), petalMaterial, flowerCount * 5);
  const centers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.052, 8, 5), centerMaterial, flowerCount);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const palette = [
    [0.96, 0.76, 0.65],
    [0.12, 0.88, 0.61],
    [0.59, 0.72, 0.66],
    [0.76, 0.68, 0.66],
    [0.04, 0.86, 0.63],
    [0.01, 0.78, 0.59],
  ];
  let flowerIndex = 0;
  let petalIndex = 0;
  for (const zone of zones) {
    for (let index = 0; index < zone.count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random());
      const x = zone.x + Math.cos(angle) * zone.radiusX * radius;
      const z = zone.z + Math.sin(angle) * zone.radiusZ * radius;
      if (Math.hypot(x - 9.8, z - 4.2) < 5.6) continue;
      const ground = terrainHeight(x, z);
      const height = randomRange(random, 0.4, 0.72);
      dummy.position.set(x, ground + height / 2, z);
      dummy.rotation.set(randomRange(random, -0.05, 0.05), random() * Math.PI, randomRange(random, -0.05, 0.05));
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(flowerIndex, dummy.matrix);

      const pick = palette[flowerIndex % palette.length];
      color.setHSL(pick[0], Math.min(1, pick[1] + 0.06), Math.max(0.42, pick[2] - 0.09));
      for (let petal = 0; petal < 5; petal += 1) {
        const petalAngle = (petal / 5) * Math.PI * 2 + randomRange(random, -0.08, 0.08);
        dummy.position.set(
          x + Math.cos(petalAngle) * 0.11,
          ground + height + 0.025,
          z + Math.sin(petalAngle) * 0.11,
        );
        dummy.rotation.set(0, -petalAngle, randomRange(random, -0.08, 0.08));
        dummy.scale.set(1.35, 0.38, 0.72);
        dummy.updateMatrix();
        petals.setMatrixAt(petalIndex, dummy.matrix);
        petals.setColorAt(petalIndex, color);
        petalIndex += 1;
      }
      dummy.position.set(x, ground + height + 0.035, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 0.7, 1);
      dummy.updateMatrix();
      centers.setMatrixAt(flowerIndex, dummy.matrix);
      flowerIndex += 1;
    }
  }
  stems.count = flowerIndex;
  centers.count = flowerIndex;
  petals.count = petalIndex;
  stems.instanceMatrix.needsUpdate = true;
  centers.instanceMatrix.needsUpdate = true;
  petals.instanceMatrix.needsUpdate = true;
  if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
  stems.receiveShadow = true;
  petals.receiveShadow = true;
  group.add(stems, petals, centers);
  group.name = '春日彩色花带';
  return group;
}

function createSpringWorld() {
  const random = mulberry32(42197);
  const group = new THREE.Group();
  group.add(createFlowerField());
  group.add(createSpringFlowerBorders());
  const butterflies = createButterflies();
  group.add(butterflies.group);

  const rabbits = [];
  const rabbitZones = [
    { x: -6.7, z: 6.2, radiusX: 1.7, radiusZ: 1.1, scale: 1.5 },
    { x: 6.2, z: -0.8, radiusX: 1.8, radiusZ: 1.3, scale: 1.4 },
    { x: -8.2, z: 2.2, radiusX: 1.7, radiusZ: 1.6, scale: 1.25 },
    { x: 10.0, z: -2.5, radiusX: 1.6, radiusZ: 1.2, scale: 1.2 },
    { x: 1.4, z: 12.2, radiusX: 3.2, radiusZ: 1.4, scale: 1.35 },
    { x: -11.2, z: 8.0, radiusX: 1.4, radiusZ: 1.5, scale: 1.25 },
  ];
  rabbitZones.forEach((zone, index) => {
    const rabbit = createRabbit(index % 2 === 0 ? 0xd2b48d : 0xbfa98f);
    const startX = zone.x + zone.radiusX * 0.45;
    const startZ = zone.z;
    rabbit.position.set(startX, terrainHeight(startX, startZ), startZ);
    rabbit.scale.setScalar(zone.scale);
    rabbit.rotation.y = random() * Math.PI * 2;
    rabbit.userData.phase = random() * Math.PI * 2;
    rabbit.userData.baseY = rabbit.position.y;
    rabbit.userData.hopRate = randomRange(random, 3.8, 5.2);
    rabbit.userData.wander = {
      homeX: zone.x,
      homeZ: zone.z,
      radiusX: zone.radiusX,
      radiusZ: zone.radiusZ,
      speed: randomRange(random, 0.34, 0.52),
    };
    group.add(rabbit);
    rabbits.push(rabbit);
  });

  // 小鹿沿庭院外圈巡游，路径绕开木屋和池塘，成年鹿与幼鹿前后同行。
  const deerPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-8.8, 0, 8.2),
    new THREE.Vector3(-10.5, 0, 14.5),
    new THREE.Vector3(-4.5, 0, 18.0),
    new THREE.Vector3(3.8, 0, 17.8),
    new THREE.Vector3(10.8, 0, 15.2),
    new THREE.Vector3(14.3, 0, 10.4),
    new THREE.Vector3(15.8, 0, 2.3),
    new THREE.Vector3(11.5, 0, -6.0),
    new THREE.Vector3(2.0, 0, -8.5),
    new THREE.Vector3(-6.5, 0, -6.2),
    new THREE.Vector3(-10.8, 0, 0.2),
  ], true, 'centripetal', 0.45);
  const deerPathLength = deerPath.getLength();
  const deerActors = [
    { scale: 1.18, pathSpeed: 1.5, offset: 0.86 },
    { scale: 0.82, pathSpeed: 1.48, offset: 0.36 },
  ].map((config) => {
    const deer = createDeer();
    deer.scale.setScalar(config.scale);
    deer.userData.pathSpeed = config.pathSpeed;
    deer.userData.pathOffset = config.offset;
    deer.userData.pathPoint = new THREE.Vector3();
    deer.userData.pathTangent = new THREE.Vector3();
    group.add(deer);
    return deer;
  });

  group.name = '春之花境';
  const optimizationStats = optimizeStaticScene(group, [butterflies.group, ...rabbits, ...deerActors]);
  return {
    group,
    optimizationStats,
    update(elapsed) {
      rabbits.forEach((rabbit) => {
        const data = rabbit.userData;
        const wander = data.wander;
        const angle = elapsed * wander.speed + data.phase;
        const x = wander.homeX + Math.cos(angle) * wander.radiusX;
        const z = wander.homeZ + Math.sin(angle) * wander.radiusZ;
        const hop = Math.max(0, Math.sin(elapsed * data.hopRate + data.phase)) * 0.14;
        rabbit.position.set(x, terrainHeight(x, z) + hop, z);
        rabbit.rotation.y = Math.atan2(-Math.sin(angle) * wander.radiusX, Math.cos(angle) * wander.radiusZ);
        data.ears[0].rotation.x = Math.sin(elapsed * 2.8 + data.phase) * 0.16;
        data.ears[1].rotation.x = Math.cos(elapsed * 2.45 + data.phase) * 0.16;
      });

      deerActors.forEach((deer) => {
        const data = deer.userData;
        const progress = (elapsed * data.pathSpeed / deerPathLength + data.pathOffset) % 1;
        deerPath.getPointAt(progress, data.pathPoint);
        deerPath.getTangentAt(progress, data.pathTangent);
        deer.position.set(
          data.pathPoint.x,
          terrainHeight(data.pathPoint.x, data.pathPoint.z),
          data.pathPoint.z,
        );
        deer.rotation.y = Math.atan2(data.pathTangent.x, data.pathTangent.z);
        data.legs.forEach((leg, index) => {
          leg.rotation.x = Math.sin(elapsed * 4.6 + data.phase + index * Math.PI * 0.5) * 0.24;
        });
        data.headPivot.rotation.y = Math.sin(elapsed * 0.52 + data.phase) * 0.26;
        data.headPivot.rotation.x = Math.sin(elapsed * 0.74 + data.phase) * 0.07;
      });

      butterflies.butterflies.forEach((butterfly) => {
        const data = butterfly.userData;
        const angle = elapsed * data.speed + data.phase;
        let x = data.centerX + Math.cos(angle) * data.radiusX;
        let z = data.centerZ + Math.sin(angle * 0.86 + data.phase * 0.4) * data.radiusZ;
        // 防御性兜底：即使未来调整椭圆参数，也不会让蝴蝶进入建筑安全区。
        if (!isButterflyAirspaceClear(x, z)) {
          x = data.centerX;
          z = data.centerZ;
        }
        const ground = terrainHeight(x, z);
        const y = ground + Math.max(
          0.95,
          data.flightHeight + Math.sin(angle * 1.8 + data.phase) * 0.3,
        );
        butterfly.position.set(x, y, z);
        const velocityX = -Math.sin(angle) * data.radiusX;
        const velocityZ = Math.cos(angle * 0.86) * data.radiusZ * 0.86;
        butterfly.rotation.y = Math.atan2(-velocityX, -velocityZ);
        butterfly.rotation.z = data.tilt + Math.sin(angle * 2.1) * 0.17;
        const flap = 0.14 + Math.sin(elapsed * 10.5 + data.phase) * 0.64;
        data.leftPivot.rotation.z = -flap;
        data.rightPivot.rotation.z = flap;
      });
    },
  };
}

function createFrogMaterials(bodyColor = 0x627d42, bellyColor = 0x8ca35b) {
  return {
    body: new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.82, flatShading: true }),
    belly: new THREE.MeshStandardMaterial({ color: bellyColor, roughness: 0.85, flatShading: true }),
    eye: new THREE.MeshStandardMaterial({ color: 0x11140c, roughness: 0.35 }),
  };
}

function createFrogModel(scale, materials) {
  const frog = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 7), materials.body);
  body.scale.set(1.25, 0.72, 1.05);
  body.castShadow = true;
  frog.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 6), materials.belly);
  belly.scale.set(1.2, 0.45, 0.8);
  belly.position.set(0, -0.07, 0.08);
  frog.add(belly);

  for (const side of [-1, 1]) {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), materials.belly);
    eyeWhite.position.set(side * 0.1, 0.16, 0.08);
    frog.add(eyeWhite);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 7, 5), materials.eye);
    pupil.position.set(side * 0.1, 0.18, 0.125);
    frog.add(pupil);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 3, 5), materials.body);
    leg.rotation.z = side * 0.95;
    leg.position.set(side * 0.21, -0.06, -0.04);
    frog.add(leg);
  }

  frog.scale.setScalar(scale);
  frog.userData = {
    phase: 0,
    baseY: 0,
    baseScale: scale,
  };
  return frog;
}

function createSummerWorld(textures, pondCenter) {
  const random = mulberry32(72317);
  const group = new THREE.Group();
  group.name = '夏日庭院';

  const woodMaterial = new THREE.MeshStandardMaterial({
    map: textures.plankMap,
    color: 0xb78958,
    roughness: 0.9,
  });
  const darkWoodMaterial = new THREE.MeshStandardMaterial({
    map: textures.plankMap,
    color: 0x6e4a30,
    roughness: 0.96,
  });
  const creamMaterial = new THREE.MeshStandardMaterial({ color: 0xead8b8, roughness: 0.94 });
  const coralMaterial = new THREE.MeshStandardMaterial({ color: 0xc85e4e, roughness: 0.9, side: THREE.DoubleSide });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x41613a, roughness: 0.96, flatShading: true });
  const sunflowerMaterial = new THREE.MeshStandardMaterial({ color: 0xe3ac35, roughness: 0.82, flatShading: true });
  const sunflowerCenterMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3820, roughness: 0.95 });

  // 夏季野餐区移到前院亮处，伞面从中心向四周自然下垂展开。
  const umbrellaX = -7.8;
  const umbrellaZ = 6.2;
  const umbrellaBase = terrainHeight(umbrellaX, umbrellaZ);
  const patio = addMesh(
    group,
    new THREE.CircleGeometry(3.08, 40),
    new THREE.MeshStandardMaterial({
      map: textures.stoneMap,
      color: 0xcbb68f,
      roughness: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
    [umbrellaX, umbrellaBase + 0.055, umbrellaZ],
    { rotation: [-Math.PI / 2, 0, 0], castShadow: false },
  );
  patio.receiveShadow = true;

  const umbrella = new THREE.Group();
  umbrella.position.set(umbrellaX, umbrellaBase, umbrellaZ);
  umbrella.rotation.z = 0.018;
  umbrella.scale.setScalar(1.08);
  addCylinder(umbrella, 0.04, 0.055, 2.82, [0, 1.41, 0], darkWoodMaterial, { segments: 8 });

  const canopyMaterial = coralMaterial.clone();
  canopyMaterial.color.setHex(0xdf6955);
  canopyMaterial.side = THREE.DoubleSide;
  canopyMaterial.roughness = 0.88;
  const canopyProfile = [
    new THREE.Vector2(0.08, 2.8),
    new THREE.Vector2(0.32, 2.73),
    new THREE.Vector2(0.76, 2.56),
    new THREE.Vector2(1.26, 2.35),
    new THREE.Vector2(1.78, 2.12),
  ];
  const canopy = addMesh(
    umbrella,
    new THREE.LatheGeometry(canopyProfile, 20),
    canopyMaterial,
    [0, 0, 0],
    { castShadow: true },
  );
  canopy.receiveShadow = true;

  const canopyRim = addMesh(
    umbrella,
    new THREE.TorusGeometry(1.75, 0.032, 5, 48),
    creamMaterial,
    [0, 2.11, 0],
    { rotation: [Math.PI / 2, 0, 0], castShadow: false },
  );
  canopyRim.castShadow = false;

  const ribGeometry = new THREE.CylinderGeometry(0.018, 0.022, 1, 5);
  const ribUp = new THREE.Vector3(0, 1, 0);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const start = new THREE.Vector3(0, 2.71, 0);
    const end = new THREE.Vector3(Math.cos(angle) * 1.73, 2.1, Math.sin(angle) * 1.73);
    const direction = new THREE.Vector3().subVectors(end, start);
    const rib = new THREE.Mesh(ribGeometry, creamMaterial);
    rib.position.copy(start).add(end).multiplyScalar(0.5);
    rib.quaternion.setFromUnitVectors(ribUp, direction.clone().normalize());
    rib.scale.y = direction.length();
    rib.castShadow = false;
    umbrella.add(rib);
  }
  addMesh(umbrella, new THREE.SphereGeometry(0.11, 10, 7), creamMaterial, [0, 2.89, 0], { castShadow: false });
  group.add(umbrella);

  const blanketCanvas = document.createElement('canvas');
  blanketCanvas.width = 256;
  blanketCanvas.height = 192;
  const blanketContext = blanketCanvas.getContext('2d');
  const stripeColors = ['#d76e58', '#f0d5ad', '#7f9f79', '#f0d5ad'];
  for (let index = 0; index < 12; index += 1) {
    blanketContext.fillStyle = stripeColors[index % stripeColors.length];
    blanketContext.fillRect(index * 22, 0, 22, 192);
  }
  const blanketTexture = new THREE.CanvasTexture(blanketCanvas);
  blanketTexture.colorSpace = THREE.SRGBColorSpace;
  const blanket = addMesh(
    group,
    new THREE.PlaneGeometry(2.45, 1.8),
    new THREE.MeshStandardMaterial({
      map: blanketTexture,
      roughness: 1,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
    [-7.4, terrainHeight(-7.4, 7.0) + 0.07, 7.0],
    { rotation: [-Math.PI / 2, 0.1, 0], castShadow: false },
  );
  blanket.receiveShadow = true;

  const basket = new THREE.Group();
  basket.position.set(-6.9, terrainHeight(-6.9, 7.5), 7.5);
  addBox(basket, [0.78, 0.34, 0.54], [0, 0.2, 0], woodMaterial);
  const basketHandle = addMesh(
    basket,
    new THREE.TorusGeometry(0.31, 0.025, 5, 18, Math.PI),
    darkWoodMaterial,
    [0, 0.38, 0],
    { rotation: [0, 0, 0] },
  );
  basketHandle.castShadow = false;
  group.add(basket);

  const watermelon = new THREE.Group();
  watermelon.position.set(-8.2, terrainHeight(-8.2, 7.2) + 0.1, 7.2);
  watermelon.rotation.y = -0.45;
  addMesh(
    watermelon,
    new THREE.CylinderGeometry(0.28, 0.28, 0.055, 18, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x477a3c, roughness: 0.86 }),
    [0, 0, 0],
  );
  addMesh(
    watermelon,
    new THREE.CylinderGeometry(0.245, 0.245, 0.066, 18, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xd95c62, roughness: 0.8 }),
    [0, 0.008, 0],
  );
  for (let index = 0; index < 4; index += 1) {
    const seed = addMesh(
      watermelon,
      new THREE.SphereGeometry(0.012, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0x40241a, roughness: 0.7 }),
      [randomRange(random, -0.15, 0.15), 0.045, randomRange(random, 0.03, 0.16)],
      { castShadow: false },
    );
    seed.scale.set(1.4, 0.45, 0.8);
  }
  group.add(watermelon);

  const lemonade = new THREE.Group();
  lemonade.position.set(-7.0, terrainHeight(-7.0, 6.8), 6.8);
  addMesh(
    lemonade,
    new THREE.CylinderGeometry(0.16, 0.14, 0.42, 14, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: 0xc9e2dd,
      transparent: true,
      opacity: 0.32,
      roughness: 0.08,
      depthWrite: false,
    }),
    [0, 0.28, 0],
    { castShadow: false },
  );
  addCylinder(lemonade, 0.135, 0.12, 0.27, [0, 0.225, 0], new THREE.MeshPhysicalMaterial({
    color: 0xe7c95e,
    transparent: true,
    opacity: 0.72,
    roughness: 0.25,
    depthWrite: false,
  }), { segments: 12, castShadow: false });
  addCylinder(lemonade, 0.012, 0.012, 0.42, [0.07, 0.4, 0], coralMaterial, {
    segments: 5,
    rotation: [0, 0, -0.18],
    castShadow: false,
  });
  group.add(lemonade);

  // 藤编躺椅与夏季花盆
  const lounger = new THREE.Group();
  const loungerX = -10.1;
  const loungerZ = 7.4;
  lounger.position.set(loungerX, terrainHeight(loungerX, loungerZ), loungerZ);
  lounger.rotation.y = 0.42;
  addBox(lounger, [1.05, 0.12, 1.85], [0, 0.48, 0], woodMaterial, { rotation: [0.08, 0, 0] });
  addBox(lounger, [1.05, 0.72, 0.1], [0, 0.76, -0.86], woodMaterial, { rotation: [-0.58, 0, 0] });
  addBox(lounger, [0.91, 0.1, 1.58], [0, 0.58, 0.06], new THREE.MeshStandardMaterial({ color: 0x6f9788, roughness: 1 }), {
    rotation: [0.08, 0, 0],
    castShadow: false,
  });
  for (const x of [-0.4, 0.4]) {
    addCylinder(lounger, 0.035, 0.045, 0.5, [x, 0.25, 0.62], darkWoodMaterial, { segments: 6 });
    addCylinder(lounger, 0.035, 0.045, 0.5, [x, 0.25, -0.55], darkWoodMaterial, { segments: 6 });
  }
  group.add(lounger);

  const pots = [
    [6.0, 1.0, 0.3],
    [7.1, 0.5, 0.24],
    [-4.8, 7.2, 0.27],
  ];
  for (const [x, z, scale] of pots) {
    const base = terrainHeight(x, z);
    const pot = addCylinder(
      group,
      0.25 * scale / 0.22,
      0.19 * scale / 0.22,
      0.36 * scale / 0.22,
      [x, base + 0.18 * scale / 0.22, z],
      new THREE.MeshStandardMaterial({ color: 0xa85e3f, roughness: 0.92 }),
      { segments: 12 },
    );
    pot.castShadow = true;
    addCylinder(group, 0.025, 0.035, 1.2 * scale / 0.22, [x, base + 0.86 * scale / 0.22, z], leafMaterial, { segments: 5 });
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      addMesh(
        group,
        new THREE.SphereGeometry(0.105 * scale / 0.22, 8, 5),
        sunflowerMaterial,
        [x + Math.cos(angle) * 0.16 * scale / 0.22, base + 1.5 * scale / 0.22, z + Math.sin(angle) * 0.16 * scale / 0.22],
        { scale: [1.35, 0.55, 1], castShadow: false },
      );
    }
    addMesh(
      group,
      new THREE.SphereGeometry(0.13 * scale / 0.22, 9, 6),
      sunflowerCenterMaterial,
      [x, base + 1.5 * scale / 0.22, z],
      { scale: [1, 0.68, 1], castShadow: false },
    );
  }

  // 门廊彩旗为夏季增加明显的节庆感。
  const buntingCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.1, 2.92, 4.82),
    new THREE.Vector3(0, 2.58, 4.92),
    new THREE.Vector3(3.1, 2.92, 4.82),
  ]);
  addMesh(group, new THREE.TubeGeometry(buntingCurve, 24, 0.012, 4, false), creamMaterial, [0, 0, 0], {
    castShadow: false,
  });
  const flagColors = [coralMaterial, creamMaterial, new THREE.MeshStandardMaterial({ color: 0x6f9e83, roughness: 0.9, side: THREE.DoubleSide })];
  const flags = [];
  for (let index = 0; index < 11; index += 1) {
    const t = 0.08 + (index / 10) * 0.84;
    const point = buntingCurve.getPoint(t);
    const flagShape = new THREE.Shape();
    flagShape.moveTo(-0.12, 0);
    flagShape.lineTo(0.12, 0);
    flagShape.lineTo(0, -0.28);
    flagShape.closePath();
    const flag = addMesh(
      group,
      new THREE.ShapeGeometry(flagShape),
      flagColors[index % flagColors.length],
      [point.x, point.y - 0.02, point.z + 0.025],
      { castShadow: false },
    );
    flag.userData.baseRotationZ = Math.sin(index) * 0.04;
    flags.push(flag);
  }

  // 池塘岸边的青蛙分散在西岸、北岸和东岸，不进入水面或木屋。
  const shoreFrogs = [];
  const shoreFrogMaterials = createFrogMaterials(0x718b4d, 0xb0c078);
  const shoreFrogPositions = [
    [5.8, 2.2, 1.18, -1.2],
    [-4.8, 4.3, 1.02, 0.7],
    [3.4, 5.6, 0.9, -2.1],
    [-4.6, -2.8, 0.88, 1.3],
    [5.4, -4.8, 0.78, -0.8],
  ];
  shoreFrogPositions.forEach(([offsetX, offsetZ, scale, rotationY], index) => {
    const x = pondCenter.x + offsetX;
    const z = pondCenter.z + offsetZ;
    const frog = createFrogModel(scale, shoreFrogMaterials);
    frog.position.set(
      x,
      terrainHeight(x, z) + 0.16 * scale,
      z,
    );
    frog.rotation.y = rotationY;
    frog.userData.phase = random() * Math.PI * 2;
    frog.userData.baseY = frog.position.y;
    frog.userData.baseScale = scale;
    frog.userData.idleSpeed = 1.2 + index * 0.11;
    group.add(frog);
    shoreFrogs.push(frog);
  });

  group.name = '夏日庭院';
  const optimizationStats = optimizeStaticScene(group, [umbrella, ...flags, ...shoreFrogs]);
  return {
    group,
    optimizationStats,
    update(elapsed) {
      umbrella.rotation.y = Math.sin(elapsed * 0.08) * 0.08;
      flags.forEach((flag, index) => {
        flag.rotation.z = flag.userData.baseRotationZ + Math.sin(elapsed * 1.35 + index * 0.7) * 0.055;
      });
      shoreFrogs.forEach((frog) => {
        const pulse = Math.max(0, Math.sin(elapsed * frog.userData.idleSpeed + frog.userData.phase));
        frog.position.y = frog.userData.baseY + pulse * 0.012;
        frog.scale.y = frog.userData.baseScale * (0.97 + pulse * 0.035);
      });
    },
  };
}

function createPondLilies(center) {
  const random = mulberry32(52901);
  const group = new THREE.Group();
  const padMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d7444,
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x3b6138, roughness: 1 });
  const lotusMaterial = new THREE.MeshStandardMaterial({ color: 0xe5a0b7, roughness: 0.82 });
  const lotusInnerMaterial = new THREE.MeshStandardMaterial({ color: 0xf0d39a, roughness: 0.85 });
  const padGeometry = new THREE.CircleGeometry(1, 18, 0.18, Math.PI * 2 - 0.36);

  for (let index = 0; index < 22; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 0.88;
    const x = center.x + Math.cos(angle) * 4.15 * radius;
    const z = center.z + Math.sin(angle) * 2.94 * radius;
    const pad = new THREE.Mesh(padGeometry, padMaterial);
    const size = randomRange(random, 0.24, 0.56);
    pad.scale.set(size * 1.15, size, 1);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = random() * Math.PI * 2;
    pad.position.set(x, center.y + 0.12, z);
    group.add(pad);
  }

  for (let index = 0; index < 7; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = randomRange(random, 0.25, 0.75);
    const x = center.x + Math.cos(angle) * 4.0 * radius;
    const z = center.z + Math.sin(angle) * 2.8 * radius;
    const lotus = new THREE.Group();
    lotus.position.set(x, center.y + 0.14, z);
    for (let petal = 0; petal < 8; petal += 1) {
      const petalAngle = (petal / 8) * Math.PI * 2;
      const petalMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), lotusMaterial);
      petalMesh.scale.set(1.5, 0.32, 0.7);
      petalMesh.position.set(Math.cos(petalAngle) * 0.13, 0.05, Math.sin(petalAngle) * 0.13);
      petalMesh.rotation.y = -petalAngle;
      petalMesh.rotation.z = 0.35;
      lotus.add(petalMesh);
    }
    const centerDot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lotusInnerMaterial);
    centerDot.position.y = 0.12;
    lotus.add(centerDot);
    group.add(lotus);
  }

  // 芦苇
  for (let index = 0; index < 34; index += 1) {
    const angle = random() * Math.PI * 2;
    const x = center.x + Math.cos(angle) * randomRange(random, 4.1, 5.2);
    const z = center.z + Math.sin(angle) * randomRange(random, 2.85, 3.7);
    const base = terrainHeight(x, z);
    const height = randomRange(random, 0.65, 1.45);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, height, 5), stemMaterial);
    stem.position.set(x, base + height * 0.5, z);
    stem.rotation.z = randomRange(random, -0.1, 0.1);
    group.add(stem);
    if (index % 4 === 0) {
      const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.15, 3, 6), stemMaterial);
      head.position.set(x, base + height + 0.05, z);
      group.add(head);
    }
  }

  const frogs = [];
  const frogMaterial = new THREE.MeshStandardMaterial({ color: 0x627d42, roughness: 0.82, flatShading: true });
  const frogLight = new THREE.MeshStandardMaterial({ color: 0x8ca35b, roughness: 0.85, flatShading: true });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x11140c, roughness: 0.35 });
  const frogPositions = [
    [center.x - 1.5, center.z + 0.8, 0.96],
    [center.x + 1.25, center.z - 0.6, 0.84],
    [center.x + 2.15, center.z + 1.65, 1.02],
    [center.x - 2.7, center.z - 1.5, 0.76],
  ];
  for (const [x, z, scale] of frogPositions) {
    const frog = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 7), frogMaterial);
    body.scale.set(1.25, 0.72, 1.05);
    frog.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 6), frogLight);
    belly.scale.set(1.2, 0.45, 0.8);
    belly.position.set(0, -0.07, 0.08);
    frog.add(belly);
    for (const side of [-1, 1]) {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), frogLight);
      eyeWhite.position.set(side * 0.1, 0.16, 0.08);
      frog.add(eyeWhite);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 7, 5), eyeMaterial);
      pupil.position.set(side * 0.1, 0.18, 0.125);
      frog.add(pupil);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 3, 5), frogMaterial);
      leg.rotation.z = side * 0.95;
      leg.position.set(side * 0.21, -0.06, -0.04);
      frog.add(leg);
    }
    frog.position.set(x, center.y + 0.19, z);
    frog.scale.setScalar(scale);
    frog.rotation.y = random() * Math.PI * 2;
    frog.userData = {
      baseY: frog.position.y,
      phase: random() * Math.PI * 2,
    };
    group.add(frog);
    frogs.push(frog);
  }

  group.name = '睡莲与青蛙';
  const optimizationStats = optimizeStaticScene(group, frogs);
  return {
    group,
    optimizationStats,
    frogs,
    update(elapsed) {
      frogs.forEach((frog) => {
        const pulse = Math.max(0, Math.sin(elapsed * 1.7 + frog.userData.phase));
        frog.position.y = frog.userData.baseY + pulse * 0.025;
        frog.scale.y = frog.scale.x * (0.96 + pulse * 0.06);
      });
    },
  };
}

function createPumpkin(scale = 1, color = 0xb86129) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.86,
    flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), material);
  body.scale.set(scale, scale * 0.7, scale);
  body.position.y = scale * 0.55;
  body.castShadow = true;
  group.add(body);

  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * Math.PI * 2;
    const ridge = new THREE.Mesh(
      new THREE.SphereGeometry(0.43 * scale, 10, 7),
      new THREE.MeshStandardMaterial({ color: index % 2 ? 0xa95425 : 0xc36a2e, roughness: 0.9 }),
    );
    ridge.scale.set(0.35 * scale, 0.72 * scale, 0.6 * scale);
    ridge.position.set(Math.cos(angle) * 0.34 * scale, scale * 0.53, Math.sin(angle) * 0.34 * scale);
    ridge.rotation.y = -angle;
    group.add(ridge);
  }

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045 * scale, 0.06 * scale, 0.22 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a4323, roughness: 1 }),
  );
  stem.position.y = scale * 1.05;
  stem.rotation.z = 0.12;
  group.add(stem);
  return group;
}

function createAutumnRoofLeaves(texture) {
  const random = mulberry32(58431);
  const count = 76;
  const geometry = new THREE.PlaneGeometry(0.17, 0.25);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.9,
    emissive: 0x2a0a02,
    emissiveIntensity: 0.08,
    side: THREE.DoubleSide,
    alphaTest: 0.26,
  });
  const leaves = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const planeNormal = new THREE.Vector3(0, 0, 1);
  const roofNormal = new THREE.Vector3();
  const roofQuaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  const rise = CABIN_LAYOUT.roofRidgeY - CABIN_LAYOUT.roofEaveY;
  const slope = rise / CABIN_LAYOUT.roofHalfSpan;
  const palette = [
    [0.995, 0.84, 0.4],
    [0.025, 0.88, 0.45],
    [0.055, 0.9, 0.49],
    [0.105, 0.86, 0.55],
  ];
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 8) {
    attempts += 1;
    const side = random() < 0.5 ? -1 : 1;
    const x = side * randomRange(random, 0.48, 4.16);
    const z = randomRange(random, -3.22, 3.22);
    const nearChimney =
      Math.abs(x - CABIN_LAYOUT.chimneyX) < CABIN_LAYOUT.chimneyHalfWidth + 0.2 &&
      Math.abs(z - CABIN_LAYOUT.chimneyZ) < CABIN_LAYOUT.chimneyHalfWidth + 0.2;
    if (nearChimney) continue;

    // 叶片落在屋顶上表面，法线随左右坡面倾斜，并保留随机叶面朝向。
    dummy.position.set(
      x,
      CABIN_LAYOUT.roofRidgeY - Math.abs(x) * slope + 0.135,
      z,
    );
    roofNormal.set(side * slope, 1, 0).normalize();
    roofQuaternion.setFromUnitVectors(planeNormal, roofNormal);
    dummy.quaternion.copy(roofQuaternion);
    dummy.rotateZ(random() * Math.PI * 2);
    dummy.scale.setScalar(randomRange(random, 0.78, 1.15));
    dummy.updateMatrix();
    leaves.setMatrixAt(placed, dummy.matrix);

    const pick = palette[Math.floor(random() * palette.length)];
    color.setHSL(pick[0], pick[1], pick[2] + randomRange(random, -0.04, 0.04));
    leaves.setColorAt(placed, color);
    placed += 1;
  }

  leaves.count = placed;
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  leaves.castShadow = false;
  leaves.receiveShadow = true;
  leaves.computeBoundingSphere();
  leaves.name = '秋日屋瓦落叶';
  return leaves;
}

function createAutumnWorld(textures) {
  const random = mulberry32(58423);
  const group = new THREE.Group();
  const pumpkins = [
    [-5.35, 4.35, 0.82, 0xb75b26],
    [-4.62, 4.9, 0.56, 0xc26b2d],
    [5.5, 4.65, 0.72, 0xa95024],
    [6.2, 5.05, 0.46, 0xd17a31],
    [5.2, -3.45, 0.62, 0xb35b26],
    [-7.3, 9.7, 0.48, 0xc96f2b],
  ];
  for (const [x, z, scale, color] of pumpkins) {
    const pumpkin = createPumpkin(scale, color);
    pumpkin.position.set(x, terrainHeight(x, z), z);
    pumpkin.rotation.y = random() * Math.PI * 2;
    group.add(pumpkin);
  }

  const hayMaterial = new THREE.MeshStandardMaterial({ color: 0xb49a60, roughness: 1, flatShading: true });
  const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.34, 24), hayMaterial);
  hay.position.set(5.9, 0.58, 9.25);
  hay.rotation.set(0, 0.35, Math.PI / 2);
  hay.castShadow = true;
  hay.receiveShadow = true;
  group.add(hay);
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0x725f3f, roughness: 0.9 });
  for (const offset of [-0.36, 0.36]) {
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.565, 0.018, 5, 28), ropeMaterial);
    rope.position.set(5.9 + offset, 0.58, 9.25);
    rope.rotation.y = Math.PI / 2;
    group.add(rope);
  }
  for (let index = 0; index < 18; index += 1) {
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, randomRange(random, 0.42, 1.15), 4), hayMaterial);
    strand.position.set(5.55 + random() * 1.35, 0.58 + randomRange(random, -0.38, 0.38), 9.25 + randomRange(random, -0.38, 0.38));
    strand.rotation.z = Math.PI / 2 + randomRange(random, -0.16, 0.16);
    strand.rotation.y = randomRange(random, -0.3, 0.3);
    group.add(strand);
  }

  const pileMaterial = new THREE.MeshStandardMaterial({ color: 0xa66c34, roughness: 1, flatShading: true });
  for (let index = 0; index < 5; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = randomRange(random, 7, 13);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const pile = new THREE.Mesh(new THREE.SphereGeometry(randomRange(random, 0.6, 1.2), 12, 7), pileMaterial);
    pile.position.set(x, terrainHeight(x, z) + 0.08, z);
    pile.scale.y = 0.18;
    group.add(pile);
  }

  const ginkgoTexture = createTreeLeafTexture('ginkgo');
  const mapleTexture = createTreeLeafTexture('maple');
  // 门前主景改为更高大的红枫，树冠越过屋顶，旋转时仍能看到上部枝冠。
  const heroMaple = createFeatureTree('maple', -10.0, 5.2, 10.8, 4.6, mapleTexture, textures.barkMap, {
    leafCount: 620,
    fallenCount: 170,
    canopyRadius: 1.55,
    leafScale: 1.12,
    branchTiers: [11, 9, 7],
    trunkThickness: 1.3,
  });
  heroMaple.name = '门前红枫主景';
  group.add(heroMaple);
  group.add(createAutumnRoofLeaves(textures.leaf));
  group.add(createFeatureTree('ginkgo', -24, 10, 9.6, 3.8, ginkgoTexture, textures.barkMap));
  group.add(createFeatureTree('ginkgo', 15, -24, 8.8, 3.5, ginkgoTexture, textures.barkMap));
  group.add(createFeatureTree('maple', 24, 8, 9.1, 3.6, mapleTexture, textures.barkMap));
  group.add(createFeatureTree('maple', -17, -23, 8.5, 3.4, mapleTexture, textures.barkMap));
  group.add(createFeatureTree('ginkgo', -18, -16, 8.8, 2.8, ginkgoTexture, textures.barkMap));
  group.add(createFeatureTree('maple', 18, -17, 9.2, 2.9, mapleTexture, textures.barkMap));

  const pathLeafGeometry = new THREE.PlaneGeometry(0.12, 0.21);
  const pathLeafMaterial = new THREE.MeshStandardMaterial({
    map: textures.leaf,
    color: 0xffffff,
    roughness: 0.86,
    emissive: 0x251100,
    emissiveIntensity: 0.18,
    side: THREE.DoubleSide,
    alphaTest: 0.22,
  });
  const pathLeaves = new THREE.InstancedMesh(pathLeafGeometry, pathLeafMaterial, 160);
  const pathLeafDummy = new THREE.Object3D();
  const pathLeafColor = new THREE.Color();
  for (let index = 0; index < 160; index += 1) {
    const t = random();
    const z = 4.9 + t * 8.4;
    const x = Math.sin(t * 2.4) * 0.8 + randomRange(random, -4.4, 4.4);
    pathLeafDummy.position.set(x, terrainHeight(x, z) + 0.022, z);
    pathLeafDummy.rotation.set(-Math.PI / 2 + randomRange(random, -0.16, 0.16), random() * Math.PI, random() * Math.PI);
    pathLeafDummy.scale.setScalar(randomRange(random, 0.9, 1.75));
    pathLeafDummy.updateMatrix();
    pathLeaves.setMatrixAt(index, pathLeafDummy.matrix);
    const palette = [
      [0.055, 0.76, 0.47],
      [0.1, 0.74, 0.5],
      [0.015, 0.7, 0.38],
      [0.13, 0.65, 0.54],
    ];
    const pick = palette[Math.floor(random() * palette.length)];
    pathLeafColor.setHSL(pick[0], pick[1], pick[2] + randomRange(random, -0.06, 0.06));
    pathLeaves.setColorAt(index, pathLeafColor);
  }
  if (pathLeaves.instanceColor) pathLeaves.instanceColor.needsUpdate = true;
  group.add(pathLeaves);
  group.name = '秋收庭院';
  return { group };
}

function createSnowman(options = {}) {
  const group = new THREE.Group();
  const snowMaterial = new THREE.MeshStandardMaterial({ color: 0xe4edef, roughness: 0.92 });
  const coalMaterial = new THREE.MeshStandardMaterial({ color: 0x242520, roughness: 0.65 });
  const carrotMaterial = new THREE.MeshStandardMaterial({ color: 0xd57430, roughness: 0.9 });
  const scarfMaterial = new THREE.MeshStandardMaterial({ color: options.scarfColor ?? 0x8f3d35, roughness: 0.95 });
  const hatMaterial = new THREE.MeshStandardMaterial({ color: options.hatColor ?? 0x2d2f2a, roughness: 0.9 });

  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 12), snowMaterial);
  bottom.position.y = 0.48;
  bottom.castShadow = true;
  group.add(bottom);
  const middle = new THREE.Mesh(new THREE.SphereGeometry(0.39, 16, 11), snowMaterial);
  middle.position.y = 1.05;
  middle.castShadow = true;
  group.add(middle);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 11), snowMaterial);
  head.position.y = 1.53;
  head.castShadow = true;
  group.add(head);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 7, 5), coalMaterial);
    eye.position.set(side * 0.1, 1.61, 0.255);
    group.add(eye);
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.025, 7, 5), coalMaterial);
    button.position.set(0, 1.08 + side * 0.1, 0.39);
    group.add(button);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.72, 5), new THREE.MeshStandardMaterial({ color: 0x493829, roughness: 1 }));
    arm.position.set(side * 0.58, 1.12, 0);
    arm.rotation.z = side * 1.02;
    group.add(arm);
  }

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 7), carrotMaterial);
  nose.position.set(0, 1.54, 0.39);
  nose.rotation.x = Math.PI / 2;
  group.add(nose);

  if (options.hasHat ?? true) {
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), hatMaterial);
    hatBrim.position.y = 1.78;
    group.add(hatBrim);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.36, 16), hatMaterial);
    hat.position.y = 1.97;
    group.add(hat);
  }

  if (options.hasScarf ?? true) {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.055, 6, 18), scarfMaterial);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.31;
    group.add(scarf);
    const scarfTail = addBox(group, [0.12, 0.42, 0.05], [0.26, 1.12, 0.17], scarfMaterial, {
      rotation: [0, 0.1, 0.18],
    });
    scarfTail.castShadow = true;
  }
  return group;
}


function createSnowflakeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 128);
  context.translate(64, 64);
  context.strokeStyle = '#f8fdff';
  context.fillStyle = '#f8fdff';
  context.lineWidth = 5;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.shadowColor = 'rgba(221, 246, 255, 0.9)';
  context.shadowBlur = 3;

  // 六条主枝与两段侧枝形成清晰可辨的六角雪花。
  for (let arm = 0; arm < 6; arm += 1) {
    context.save();
    context.rotate((arm / 6) * Math.PI * 2);
    context.beginPath();
    context.moveTo(0, -7);
    context.lineTo(0, -51);
    context.moveTo(0, -24);
    context.lineTo(-12, -35);
    context.moveTo(0, -24);
    context.lineTo(12, -35);
    context.moveTo(0, -38);
    context.lineTo(-7, -46);
    context.moveTo(0, -38);
    context.lineTo(7, -46);
    context.stroke();
    context.restore();
  }

  context.beginPath();
  for (let corner = 0; corner < 6; corner += 1) {
    const angle = (corner / 6) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * 8;
    const y = Math.sin(angle) * 8;
    if (corner === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

// 根据落点返回雪花应当消失的高度：地面、两侧屋顶、门廊雨棚或烟囱顶部。
function getSnowStopHeight(x, z) {
  let stopHeight = terrainHeight(x, z) + 0.08;
  const roofRise = CABIN_LAYOUT.roofRidgeY - CABIN_LAYOUT.roofEaveY;
  const roofSlope = roofRise / CABIN_LAYOUT.roofHalfSpan;

  if (
    Math.abs(x) <= CABIN_LAYOUT.roofFootprintHalfSpan &&
    Math.abs(z) <= CABIN_LAYOUT.roofFootprintHalfDepth
  ) {
    const roofSurface = CABIN_LAYOUT.roofRidgeY - Math.abs(x) * roofSlope + 0.16;
    stopHeight = Math.max(stopHeight, roofSurface);
  }

  if (Math.abs(x) <= CABIN_LAYOUT.porchHalfWidth + 0.04) {
    const porchCos = Math.cos(CABIN_LAYOUT.porchTilt);
    const localZ = (z - CABIN_LAYOUT.porchCenterZ) / porchCos;
    if (Math.abs(localZ) <= CABIN_LAYOUT.porchHalfDepth + 0.08) {
      const porchSurface =
        CABIN_LAYOUT.porchCenterY +
        0.08 * porchCos -
        localZ * Math.sin(CABIN_LAYOUT.porchTilt) +
        0.045;
      stopHeight = Math.max(stopHeight, porchSurface);
    }
  }

  if (
    Math.abs(x - CABIN_LAYOUT.chimneyX) <= CABIN_LAYOUT.chimneyHalfWidth &&
    Math.abs(z - CABIN_LAYOUT.chimneyZ) <= CABIN_LAYOUT.chimneyHalfWidth
  ) {
    stopHeight = Math.max(stopHeight, CABIN_LAYOUT.chimneyTopY + 0.04);
  }

  return stopHeight;
}

function resetSnowflake(random, positions, index, state) {
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * 29;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  const minimumY = Math.min(18.2, getSnowStopHeight(x, z) + 1.2);
  positions[index * 3] = x;
  positions[index * 3 + 1] = randomRange(random, minimumY, 19);
  positions[index * 3 + 2] = z;
  state.drift = randomRange(random, -0.24, 0.24);
  state.phase = random() * Math.PI * 2;
}

function createSnowfall() {
  const random = mulberry32(61987);
  const count = 640;
  const positions = new Float32Array(count * 3);
  const states = [];
  for (let index = 0; index < count; index += 1) {
    const state = {
      speed: randomRange(random, 0.42, 1.3),
      drift: randomRange(random, -0.24, 0.24),
      phase: random() * Math.PI * 2,
    };
    resetSnowflake(random, positions, index, state);
    states.push(state);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const snowflakeTexture = createSnowflakeTexture();
  const material = new THREE.PointsMaterial({
    map: snowflakeTexture,
    color: 0xf3fbff,
    size: 0.94,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    alphaTest: 0.16,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = '落雪';
  return {
    points,
    update(delta, elapsed) {
      const attribute = geometry.attributes.position;
      for (let index = 0; index < count; index += 1) {
        const state = states[index];
        let x = attribute.array[index * 3];
        let y = attribute.array[index * 3 + 1];
        let z = attribute.array[index * 3 + 2];
        y -= delta * state.speed;
        x += Math.sin(elapsed * 0.38 + state.phase) * delta * 0.12 + state.drift * delta;
        z += Math.cos(elapsed * 0.29 + state.phase) * delta * 0.08;
        if (y <= getSnowStopHeight(x, z)) {
          // 雪花抵达屋面、雨棚或地面后直接从高空重生，不继续穿过建筑体。
          resetSnowflake(random, attribute.array, index, state);
          continue;
        }
        attribute.array[index * 3] = x;
        attribute.array[index * 3 + 1] = y;
        attribute.array[index * 3 + 2] = z;
      }
      attribute.needsUpdate = true;
    },
  };
}

function createWinterWorld(textures) {
  const random = mulberry32(65203);
  const group = new THREE.Group();
  const snowMaterial = new THREE.MeshStandardMaterial({ color: 0xe2edef, roughness: 0.92 });
  const iceMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xbdd8dd,
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.62,
    transmission: 0.18,
    depthWrite: false,
  });

  const roofAngle = Math.atan2(2.46, 4.46);
  const roofSlope = Math.hypot(2.46, 4.46);
  for (const side of [-1, 1]) {
    addBox(group, [roofSlope + 0.22, 0.055, 7.08], [side * 2.23, 5.72, 0], snowMaterial, {
      rotation: [0, 0, side === 1 ? -roofAngle : roofAngle],
      castShadow: false,
    });
  }
  addBox(group, [0.46, 0.06, 7.15], [0, 6.84, 0], snowMaterial, { castShadow: false });
  addBox(group, [7.7, 0.05, 2.92], [0, 3.84, 3.87], snowMaterial, {
    rotation: [0.17, 0, 0],
    castShadow: false,
  });

  // 门廊栏杆和台阶上的薄雪
  addBox(group, [2.2, 0.035, 0.15], [-2.31, 1.43, 4.9], snowMaterial, { castShadow: false });
  addBox(group, [2.2, 0.035, 0.15], [2.31, 1.43, 4.9], snowMaterial, { castShadow: false });
  addBox(group, [2.35, 0.035, 0.5], [0, 0.36, 5.18], snowMaterial, { castShadow: false });
  addBox(group, [2.57, 0.035, 0.5], [0, 0.24, 5.55], snowMaterial, { castShadow: false });
  addBox(group, [2.77, 0.035, 0.5], [0, 0.15, 5.9], snowMaterial, { castShadow: false });

  for (let index = 0; index < 18; index += 1) {
    const x = randomRange(random, -3.45, 3.45);
    const height = randomRange(random, 0.12, 0.34);
    const icicle = new THREE.Mesh(new THREE.ConeGeometry(randomRange(random, 0.022, 0.05), height, 6), iceMaterial);
    icicle.position.set(x, 3.37 - height / 2, 5.23 + randomRange(random, -0.03, 0.03));
    icicle.rotation.x = Math.PI;
    icicle.castShadow = false;
    group.add(icicle);
  }

  for (let index = 0; index < 18; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = randomRange(random, 4.5, 6.8);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const bank = new THREE.Mesh(new THREE.SphereGeometry(randomRange(random, 0.45, 1.2), 12, 7), snowMaterial);
    bank.position.set(x, terrainHeight(x, z) + 0.03, z);
    bank.scale.y = 0.2;
    bank.castShadow = false;
    bank.receiveShadow = true;
    group.add(bank);
  }

  // 大小和配饰不同的雪人散落在前院、侧院与池塘外缘。
  const snowmen = [];
  const snowmanConfigs = [
    [-7.4, 5.4, 1.38, 0.22, 0x8f3d35, 0x2d2f2a, true],
    [-8.8, 6.3, 0.9, -0.5, 0x567b8d, 0x3e352a, true],
    [6.5, 0.6, 1.02, 0.8, 0xc77a45, 0x3a423e, true],
    [-6.8, 2.7, 0.68, 1.1, 0x9f5160, 0x4a342d, false],
    [12.4, -0.5, 0.76, -0.9, 0x6d884f, 0x4d4637, true],
  ];
  snowmanConfigs.forEach(([x, z, scale, rotationY, scarfColor, hatColor, hasHat]) => {
    const snowman = createSnowman({ scarfColor, hatColor, hasHat });
    snowman.position.set(x, terrainHeight(x, z), z);
    snowman.rotation.y = rotationY;
    snowman.scale.setScalar(scale);
    group.add(snowman);
    snowmen.push(snowman);
  });

  const footprintShape = new THREE.Shape();
  footprintShape.moveTo(-0.075, 0.19);
  footprintShape.bezierCurveTo(-0.15, 0.11, -0.13, -0.04, -0.065, -0.12);
  footprintShape.bezierCurveTo(-0.02, -0.18, 0.03, -0.18, 0.075, -0.1);
  footprintShape.bezierCurveTo(0.13, 0.01, 0.12, 0.12, 0.07, 0.19);
  footprintShape.bezierCurveTo(0.03, 0.24, -0.03, 0.24, -0.075, 0.19);
  const footprintGeometry = new THREE.ShapeGeometry(footprintShape, 12);
  footprintGeometry.rotateX(-Math.PI / 2);
  const footprintMaterial = new THREE.MeshBasicMaterial({
    color: 0x4f6971,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const footprintAnchors = [
    [-6.6, 6.0],
    [-8.1, 5.0],
    [-5.4, 7.0],
    [-9.6, 7.1],
    [5.8, -0.2],
    [11.8, 1.0],
    [-3.5, 9.0],
  ];
  const printsPerTrail = 6;
  const footprints = new THREE.InstancedMesh(
    footprintGeometry,
    footprintMaterial,
    footprintAnchors.length * printsPerTrail,
  );
  const footprintDummy = new THREE.Object3D();
  let footprintIndex = 0;
  footprintAnchors.forEach(([anchorX, anchorZ]) => {
    const heading = randomRange(random, -Math.PI, Math.PI);
    for (let step = 0; step < printsPerTrail; step += 1) {
      const sideOffset = step % 2 === 0 ? -0.12 : 0.12;
      const x =
        anchorX +
        Math.sin(heading) * step * randomRange(random, 0.34, 0.42) +
        Math.cos(heading) * sideOffset;
      const z =
        anchorZ +
        Math.cos(heading) * step * randomRange(random, 0.34, 0.42) -
        Math.sin(heading) * sideOffset;
      if (!isCourtyardGroundClear(x, z, 0.1)) continue;
      footprintDummy.position.set(x, terrainHeight(x, z) + 0.045, z);
      footprintDummy.rotation.set(0, heading + randomRange(random, -0.13, 0.13), 0);
      footprintDummy.scale.set(randomRange(random, 0.85, 1.06), 1, randomRange(random, 1.08, 1.34));
      footprintDummy.updateMatrix();
      footprints.setMatrixAt(footprintIndex, footprintDummy.matrix);
      footprintIndex += 1;
    }
  });
  footprints.count = footprintIndex;
  footprints.instanceMatrix.needsUpdate = true;
  footprints.receiveShadow = false;
  group.add(footprints);

  const snowfall = createSnowfall();
  group.add(snowfall.points);

  group.name = '冬日雪境';
  const optimizationStats = optimizeStaticScene(group, [...snowmen, snowfall.points]);
  return {
    group,
    optimizationStats,
    update(elapsed, delta) {
      snowfall.update(delta, elapsed);
      snowmen.forEach((snowman, index) => {
        snowman.rotation.z = Math.sin(elapsed * 0.38 + index * 0.91) * 0.006;
      });
    },
  };
}


function createFloatingLeaves(center, texture) {
  const random = mulberry32(63713);
  const geometry = new THREE.PlaneGeometry(0.11, 0.19);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.86,
    side: THREE.DoubleSide,
    alphaTest: 0.24,
    depthWrite: false,
  });
  const count = 44;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 0.9;
    dummy.position.set(
      center.x + Math.cos(angle) * 4.0 * radius,
      center.y + 0.105,
      center.z + Math.sin(angle) * 2.85 * radius,
    );
    dummy.rotation.set(-Math.PI / 2 + randomRange(random, -0.1, 0.1), random() * Math.PI, random() * Math.PI);
    dummy.scale.setScalar(randomRange(random, 0.7, 1.5));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    color.setHSL(randomRange(random, 0.04, 0.14), randomRange(random, 0.58, 0.82), randomRange(random, 0.34, 0.52));
    mesh.setColorAt(index, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = '池塘浮叶';
  return mesh;
}

export function createSeasonalWorld(textures, initialQuality = {}) {
  const group = new THREE.Group();
  group.name = '四季场景';
  const pond = createPond(textures, initialQuality);
  group.add(pond.group);
  const lilies = createPondLilies(pond.center);
  group.add(lilies.group);
  const worlds = new Map();
  const pending = new Map();
  let disposed = false;
  const factories = {
    spring: createSpringWorld,
    summer: () => createSummerWorld(textures, pond.center),
    autumn: () => {
      const world = createAutumnWorld(textures);
      world.group.add(createFloatingLeaves(pond.center, textures.leaf));
      world.optimizationStats = optimizeStaticScene(world.group);
      return world;
    },
    winter: () => createWinterWorld(textures),
  };
  const createSeason = season => {
    if (disposed) return null;
    if (worlds.has(season)) return worlds.get(season);
    const world = factories[season]();
    world.group.visible = season === currentSeason;
    world.group.userData.season = season;
    group.add(world.group);
    worlds.set(season, world);
    return world;
  };
  let currentSeason = 'spring';
  createSeason('spring');
  let quality = initialQuality;
  let reflectionDirty = true;
  let reflectionElapsed = 0;
  let lastReflection = -Infinity;
  let reflectionFrozen = false;
  const lastCamera = new THREE.Matrix4();
  const lastProjection = new THREE.Matrix4();
  const reflect = pond.reflector.onBeforeRender;
  pond.reflector.onBeforeRender = function(renderer, scene, camera, ...args) {
    const cameraMoved = !camera.matrixWorld.equals(lastCamera) || !camera.projectionMatrix.equals(lastProjection);
    const interval = 1 / (quality.reflectionHz ?? 60);
    if (!reflectionDirty && !cameraMoved && (reflectionFrozen || reflectionElapsed - lastReflection < interval)) return;
    // 播放时反射按画质频率更新；暂停时仅在镜头变化后更新静态倒影。
    if (!reflectionDirty && !reflectionFrozen && reflectionElapsed - lastReflection < interval) return;
    reflect.call(this, renderer, scene, camera, ...args);
    lastCamera.copy(camera.matrixWorld);
    lastProjection.copy(camera.projectionMatrix);
    reflectionDirty = false;
    lastReflection = reflectionElapsed;
  };
  const colors = {
    spring: { deep: 0x204a44, shallow: 0x8eb9a4, foam: 0xe4efe3 },
    summer: { deep: 0x143d3b, shallow: 0x6c9e8c, foam: 0xcce2d5 },
    autumn: { deep: 0x203c33, shallow: 0x6e8064, foam: 0xd5ddc6 },
    winter: { deep: 0x244a44, shallow: 0x789b8d, foam: 0xe7f1ea },
  };
  const collisionSets = {
    spring: [],
    summer: [{ x: -7.8, z: 6.2, radius: 1.9 }],
    autumn: [{ x: -10.0, z: 5.2, radius: 3.4 }],
    winter: [
      { x: -7.4, z: 5.4, radius: 0.9 },
      { x: -8.8, z: 6.3, radius: 0.65 },
      { x: 6.5, z: 0.6, radius: 0.7 },
      { x: -6.8, z: 2.7, radius: 0.55 },
      { x: 12.4, z: -0.5, radius: 0.6 },
    ],
  };
  const ensureSeason = season => {
    if (!Object.hasOwn(factories, season)) return Promise.reject(new Error('未知季节'));
    if (worlds.has(season)) return Promise.resolve(worlds.get(season));
    if (!pending.has(season)) {
      pending.set(season, new Promise(resolve => setTimeout(resolve, 0)).then(() => createSeason(season)).finally(() => pending.delete(season)));
    }
    return pending.get(season);
  };
  const setSeason = season => {
    if (!worlds.has(season)) createSeason(season);
    currentSeason = season;
    for (const [key, world] of worlds) world.group.visible = key === season;
    lilies.group.visible = season === 'spring' || season === 'summer';
    lilies.frogs.forEach(frog => { frog.visible = season === 'summer'; });
    pond.snowCaps.forEach(cap => { cap.visible = season === 'winter'; });
    pond.snowBanks.forEach(bank => { bank.visible = season === 'winter'; });
    pond.ripples.forEach(ring => { ring.visible = season !== 'winter'; });
    pond.steamGroup.visible = season === 'winter';
    const palette = colors[season];
    pond.water.uniforms.uDeep.value.setHex(palette.deep);
    pond.water.uniforms.uShallow.value.setHex(palette.shallow);
    pond.water.uniforms.uFoam.value.setHex(palette.foam);
    pond.water.uniforms.uOpacity.value = season === 'winter' ? 0.88 : 0.82;
    reflectionDirty = true;
  };
  setSeason('spring');
  return {
    group, setSeason, ensureSeason,
    getSeason: () => currentSeason,
    getCollisionCircles: () => collisionSets[currentSeason] ?? [],
    getReadySeasons: () => [...worlds.keys()],
    setQuality(profile) {
      const target = pond.reflector.getRenderTarget();
      const size = profile.reflectionSize;
      if (size && (target.width !== size || target.samples !== profile.reflectionSamples)) {
        target.samples = profile.reflectionSamples;
        target.setSize(size, size);
        target.dispose();
      }
      quality = profile;
      reflectionDirty = true;
    },
    setFrozen(frozen) { reflectionFrozen = frozen; },
    invalidateReflection() { reflectionDirty = true; },
    dispose() { disposed = true; pond.reflector.dispose(); },
    update(elapsed, delta) {
      reflectionElapsed = elapsed;
      pond.water.uniforms.uTime.value = elapsed;
      const active = worlds.get(currentSeason);
      active?.update?.(elapsed, delta);
      if (currentSeason === 'summer') lilies.update(elapsed);
      if (currentSeason !== 'winter') pond.ripples.forEach(ring => {
        const progress = (elapsed * 0.085 + ring.userData.phase) % 1;
        const scale = 0.35 + progress * 3.1;
        ring.scale.set(scale * 0.82, scale, 1);
        ring.position.x = ring.userData.baseX + Math.sin(elapsed * 0.17 + ring.userData.phase * 9) * ring.userData.driftX;
        ring.position.z = ring.userData.baseZ + Math.cos(elapsed * 0.13 + ring.userData.phase * 7) * ring.userData.driftZ;
        ring.material.opacity = Math.sin(progress * Math.PI) * 0.09;
      });
      if (currentSeason === 'winter') pond.steamGroup.children.forEach(sprite => {
        const data = sprite.userData;
        const rise = (elapsed * data.speed + data.phase) % 1;
        sprite.position.x = data.baseX + Math.sin(elapsed * 0.3 + data.phase) * 0.35;
        sprite.position.y = data.baseY + rise * 3.1;
        sprite.position.z = data.baseZ + Math.cos(elapsed * 0.21 + data.phase) * 0.24;
        sprite.material.opacity = Math.sin(rise * Math.PI) * 0.22;
        const driftScale = data.scale * (0.85 + rise * 0.55);
        sprite.scale.set(driftScale * 1.4, driftScale, 1);
      });
    },
  };
}
function createTreeLeafTexture(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 128);
  context.translate(64, 64);
  context.fillStyle = '#ffffff';

  if (type === 'ginkgo') {
    context.beginPath();
    context.moveTo(0, 42);
    context.bezierCurveTo(-12, 24, -48, 12, -52, -18);
    context.bezierCurveTo(-43, -54, -15, -50, 0, -28);
    context.bezierCurveTo(15, -50, 43, -54, 52, -18);
    context.bezierCurveTo(48, 12, 12, 24, 0, 42);
    context.closePath();
    context.fill();
    context.strokeStyle = 'rgba(73, 63, 35, 0.28)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 43);
    context.lineTo(0, -23);
    context.stroke();
    for (let index = -3; index <= 3; index += 1) {
      context.beginPath();
      context.moveTo(0, 18);
      context.lineTo(index * 13, -27 - Math.abs(index) * 2);
      context.stroke();
    }
  } else {
    const points = [
      [0, -54], [14, -22], [40, -30], [35, -3], [57, 12], [27, 24],
      [18, 50], [0, 32], [-18, 50], [-27, 24], [-57, 12], [-35, -3],
      [-40, -30], [-14, -22],
    ];
    context.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.fill();
    context.strokeStyle = 'rgba(72, 30, 21, 0.24)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 42);
    context.lineTo(0, -34);
    for (const [x, y] of [[0, -34], [-34, -18], [-43, 2], [34, -18], [43, 2]]) {
      context.moveTo(0, 5);
      context.lineTo(x, y);
    }
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

function composeBranch(start, end, radius, matrix) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  matrix.compose(midpoint, quaternion, new THREE.Vector3(radius, length, radius));
}

function createFeatureTree(type, x, z, height, spread, texture, barkTexture, options = {}) {
  const random = mulberry32(type === 'ginkgo' ? Math.round(x * 31 + z * 13) : Math.round(x * 17 + z * 29));
  const group = new THREE.Group();
  const leafCount = options.leafCount ?? 300;
  const fallenCount = options.fallenCount ?? 90;
  const canopyRadius = options.canopyRadius ?? 1.18;
  const leafScale = options.leafScale ?? 1;
  const branchTiers = options.branchTiers ?? [8, 7, 5];
  const trunkThickness = options.trunkThickness ?? 1;
  const trunkMaterial = new THREE.MeshStandardMaterial({
    map: barkTexture,
    color: type === 'ginkgo' ? 0x8d7557 : 0x71533e,
    roughness: 1,
  });
  const branchMaterial = new THREE.MeshStandardMaterial({
    color: type === 'ginkgo' ? 0x806a50 : 0x664837,
    roughness: 1,
  });
  const trunkGeometry = new THREE.CylinderGeometry(0.72, 1, 1, 9);
  const branchGeometry = new THREE.CylinderGeometry(0.58, 1, 1, 7);
  const base = terrainHeight(x, z);
  const trunkStart = new THREE.Vector3(x, base - 0.05, z);
  const trunkEnd = new THREE.Vector3(
    x + randomRange(random, -0.3, 0.3),
    base + height * 0.78,
    z + randomRange(random, -0.3, 0.3),
  );
  const trunkMatrix = new THREE.Matrix4();
  composeBranch(trunkStart, trunkEnd, (0.2 + height * 0.012) * trunkThickness, trunkMatrix);
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.matrix.copy(trunkMatrix);
  trunk.matrixAutoUpdate = false;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const tips = [];
  const tierCounts = branchTiers;
  for (let tier = 0; tier < tierCounts.length; tier += 1) {
    const branchCount = tierCounts[tier];
    const heightRatio = 0.43 + tier * 0.14;
    const start = new THREE.Vector3().lerpVectors(trunkStart, trunkEnd, heightRatio);
    for (let index = 0; index < branchCount; index += 1) {
      const angle = (index / branchCount) * Math.PI * 2 + tier * 0.41 + randomRange(random, -0.22, 0.22);
      const reach = spread * (1 - tier * 0.1) * randomRange(random, 0.72, 1.05);
      const end = new THREE.Vector3(
        x + Math.cos(angle) * reach,
        base + height * (0.66 + tier * 0.095 + randomRange(random, -0.035, 0.035)),
        z + Math.sin(angle) * reach,
      );
      const matrix = new THREE.Matrix4();
      composeBranch(start, end, randomRange(random, 0.052, 0.092), matrix);
      const branch = new THREE.Mesh(branchGeometry, branchMaterial);
      branch.matrix.copy(matrix);
      branch.matrixAutoUpdate = false;
      branch.castShadow = true;
      branch.receiveShadow = true;
      group.add(branch);

      // 次级枝条让叶片真正挂在树冠上，而不是悬在四个角。
      const twigEnd = end.clone().add(new THREE.Vector3(
        Math.cos(angle + randomRange(random, -0.32, 0.32)) * randomRange(random, 0.2, 0.62),
        randomRange(random, 0.32, 0.82),
        Math.sin(angle + randomRange(random, -0.32, 0.32)) * randomRange(random, 0.2, 0.62),
      ));
      const twigMatrix = new THREE.Matrix4();
      composeBranch(end, twigEnd, randomRange(random, 0.022, 0.042), twigMatrix);
      const twig = new THREE.Mesh(branchGeometry, branchMaterial);
      twig.matrix.copy(twigMatrix);
      twig.matrixAutoUpdate = false;
      twig.castShadow = true;
      group.add(twig);
      tips.push(twigEnd);
    }
  }

  const leafGeometry = new THREE.PlaneGeometry(
    (type === 'ginkgo' ? 0.34 : 0.39) * leafScale,
    (type === 'ginkgo' ? 0.34 : 0.4) * leafScale,
  );
  const leafMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.82,
    side: THREE.DoubleSide,
    alphaTest: 0.3,
    emissive: type === 'ginkgo' ? 0x2d2104 : 0x2d0b08,
    emissiveIntensity: type === 'maple' ? 0.2 : 0.14,
  });
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, leafCount);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let index = 0; index < leafCount; index += 1) {
    const tip = tips[index % tips.length];
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), 0.58) * canopyRadius;
    dummy.position.set(
      tip.x + Math.cos(angle) * radius,
      tip.y + randomRange(random, -0.42, 0.68),
      tip.z + Math.sin(angle) * radius,
    );
    dummy.rotation.set(
      randomRange(random, -0.9, 0.9),
      random() * Math.PI * 2,
      randomRange(random, -0.65, 0.65),
    );
    dummy.scale.setScalar(randomRange(random, 0.7, 1.15) * leafScale);
    dummy.updateMatrix();
    leaves.setMatrixAt(index, dummy.matrix);
    if (type === 'ginkgo') {
      color.setHSL(randomRange(random, 0.115, 0.14), randomRange(random, 0.72, 0.94), randomRange(random, 0.48, 0.64));
    } else {
      color.setHSL(randomRange(random, 0.985, 1.025) % 1, randomRange(random, 0.68, 0.88), randomRange(random, 0.35, 0.52));
    }
    leaves.setColorAt(index, color);
  }
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  group.add(leaves);

  const fallen = new THREE.InstancedMesh(leafGeometry, leafMaterial, fallenCount);
  for (let index = 0; index < fallenCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = randomRange(random, 1.1, 5.4);
    const fx = x + Math.cos(angle) * radius;
    const fz = z + Math.sin(angle) * radius;
    dummy.position.set(fx, terrainHeight(fx, fz) + 0.022, fz);
    dummy.rotation.set(-Math.PI / 2 + randomRange(random, -0.12, 0.12), random() * Math.PI, random() * Math.PI);
    dummy.scale.setScalar(randomRange(random, 0.7, 1.25));
    dummy.updateMatrix();
    fallen.setMatrixAt(index, dummy.matrix);
    if (type === 'ginkgo') {
      color.setHSL(randomRange(random, 0.115, 0.14), randomRange(random, 0.7, 0.92), randomRange(random, 0.48, 0.65));
    } else {
      color.setHSL(randomRange(random, 0.985, 1.02) % 1, randomRange(random, 0.66, 0.86), randomRange(random, 0.34, 0.52));
    }
    fallen.setColorAt(index, color);
  }
  fallen.instanceMatrix.needsUpdate = true;
  if (fallen.instanceColor) fallen.instanceColor.needsUpdate = true;
  fallen.receiveShadow = true;
  group.add(fallen);
  group.name = type === 'ginkgo' ? '金色银杏' : '红色枫树';
  return group;
}
