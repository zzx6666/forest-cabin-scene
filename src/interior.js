import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mulberry32, randomRange } from './utils.js';

// 阁楼床的垂直基准统一维护，避免床架、床垫、床品和护栏出现错层。
const LOFT_BED = Object.freeze({
  centerX: 2.45,
  centerZ: -2.24,
  platformTopY: 2.82,
  mattressTopY: 3.06,
  quiltTopY: 3.18,
  canopyTopY: 4.42,
});

function addBox(parent, size, position, material, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radiusTop, radiusBottom, height, position, material, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, options.segments ?? 12),
    material,
  );
  mesh.position.set(position[0], position[1], position[2]);
  if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function createWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return { canvas, context, texture };
}

function drawWindowSeason(windowCanvas, season) {
  const { canvas, context } = windowCanvas;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  const gradients = {
    spring: ['#6b8793', '#e4b6ad', '#526551'],
    summer: ['#1b3b45', '#52796e', '#1e3029'],
    autumn: ['#5e4e49', '#d09461', '#4d432c'],
    winter: ['#304c5b', '#96b3bf', '#dce7e7'],
  };
  const palette = gradients[season];
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, palette[0]);
  sky.addColorStop(0.58, palette[1]);
  sky.addColorStop(1, palette[2]);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const random = mulberry32(season === 'spring' ? 1 : season === 'summer' ? 2 : season === 'autumn' ? 3 : 4);
  for (let index = 0; index < 75; index += 1) {
    const alpha = randomRange(random, 0.2, 0.8);
    context.fillStyle = `rgba(255, 243, 208, ${alpha})`;
    context.beginPath();
    context.arc(random() * width, random() * height * 0.55, randomRange(random, 0.6, 2), 0, Math.PI * 2);
    context.fill();
  }

  if (season !== 'winter') {
    const moonGlow = context.createRadialGradient(375, 105, 0, 375, 105, 84);
    moonGlow.addColorStop(0, 'rgba(255, 236, 191, 0.92)');
    moonGlow.addColorStop(0.2, 'rgba(255, 224, 166, 0.48)');
    moonGlow.addColorStop(1, 'rgba(255, 213, 149, 0)');
    context.fillStyle = moonGlow;
    context.fillRect(280, 10, 190, 190);
  }

  const treeBase = height * 0.76;
  for (let layer = 0; layer < 3; layer += 1) {
    const y = treeBase + layer * 42;
    context.fillStyle = layer === 0 ? 'rgba(33, 48, 34, 0.72)' : layer === 1 ? 'rgba(27, 41, 32, 0.9)' : 'rgba(19, 31, 26, 0.98)';
    for (let index = 0; index < 19; index += 1) {
      const x = index * 31 + randomRange(random, -14, 14);
      const treeHeight = randomRange(random, 90, 185);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 34, y + treeHeight);
      context.lineTo(x + 34, y + treeHeight);
      context.closePath();
      context.fill();
    }
  }

  if (season === 'spring') {
    for (let index = 0; index < 75; index += 1) {
      context.fillStyle = index % 2 ? 'rgba(241, 183, 195, 0.8)' : 'rgba(255, 225, 220, 0.75)';
      context.beginPath();
      context.arc(random() * width, 240 + random() * 220, randomRange(random, 2, 6), 0, Math.PI * 2);
      context.fill();
    }
  } else if (season === 'autumn') {
    for (let index = 0; index < 110; index += 1) {
      context.fillStyle = index % 3 === 0 ? 'rgba(197, 109, 48, 0.8)' : 'rgba(220, 164, 78, 0.7)';
      context.save();
      context.translate(random() * width, 160 + random() * 310);
      context.rotate(random() * Math.PI);
      context.fillRect(-3, -7, 6, 14);
      context.restore();
    }
  } else if (season === 'winter') {
    for (let index = 0; index < 140; index += 1) {
      context.fillStyle = `rgba(238, 248, 250, ${randomRange(random, 0.35, 0.9)})`;
      context.beginPath();
      context.arc(random() * width, random() * height, randomRange(random, 1, 4), 0, Math.PI * 2);
      context.fill();
    }
  } else {
    for (let index = 0; index < 30; index += 1) {
      context.fillStyle = `rgba(255, 216, 112, ${randomRange(random, 0.2, 0.75)})`;
      context.beginPath();
      context.arc(random() * width, 220 + random() * 220, randomRange(random, 1.5, 3.3), 0, Math.PI * 2);
      context.fill();
    }
  }

  const vignette = context.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.72);
  vignette.addColorStop(0, 'rgba(10, 14, 13, 0)');
  vignette.addColorStop(1, 'rgba(8, 12, 11, 0.48)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  windowCanvas.texture.needsUpdate = true;
}

function makeInteriorMaterials(textures) {
  const plank = new THREE.MeshStandardMaterial({
    map: textures.plankMap,
    bumpMap: textures.plankBump,
    bumpScale: 0.035,
    color: 0xb78861,
    roughness: 0.9,
  });
  const plankDark = new THREE.MeshStandardMaterial({
    map: textures.plankMap,
    bumpMap: textures.plankBump,
    bumpScale: 0.04,
    color: 0x755039,
    roughness: 0.94,
  });
  const plaster = new THREE.MeshStandardMaterial({
    color: 0xbda884,
    roughness: 0.96,
  });
  const plasterWarm = new THREE.MeshStandardMaterial({
    color: 0xa98d6b,
    roughness: 0.96,
  });
  const stone = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.06,
    color: 0xa9a18e,
    roughness: 1,
  });
  const iron = new THREE.MeshStandardMaterial({ color: 0x24251f, roughness: 0.45, metalness: 0.68 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb48642, roughness: 0.32, metalness: 0.75 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xe1d1b5, roughness: 0.98 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x8f4f38, roughness: 0.98 });
  const forest = new THREE.MeshStandardMaterial({ color: 0x4c5b3d, roughness: 0.98 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb78a4a, roughness: 0.4, metalness: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xd9e8dd,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const glow = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.1, 1.25, 0.45),
    toneMapped: false,
  });
  return { plank, plankDark, plaster, plasterWarm, stone, iron, brass, linen, rust, forest, gold, glass, glow };
}

function createRoom(materials) {
  const group = new THREE.Group();
  addBox(group, [11.8, 0.18, 6.8], [0, -0.09, 0], materials.plankDark);

  const boardMaterials = [materials.plank, materials.plank.clone(), materials.plank.clone()];
  boardMaterials[1].color.setHex(0xa87a55);
  boardMaterials[2].color.setHex(0x926947);
  for (let index = 0; index < 54; index += 1) {
    addBox(group, [0.212, 0.075, 6.25], [-5.64 + index * 0.212, 0.04, 0.05], boardMaterials[index % 3], {
      castShadow: false,
    });
  }

  addBox(group, [11.8, 4.75, 0.3], [0, 2.38, -3.28], materials.plasterWarm);
  addBox(group, [0.3, 4.35, 3.35], [-5.72, 2.18, -1.57], materials.plankDark);
  addBox(group, [0.3, 4.35, 3.35], [5.72, 2.18, -1.57], materials.plankDark);

  addBox(group, [11.8, 0.84, 0.12], [0, 0.52, -3.09], materials.plank);
  addBox(group, [11.8, 0.18, 0.16], [0, 0.98, -3.07], materials.plankDark);
  addBox(group, [0.14, 4.3, 0.14], [-5.58, 2.2, -3.04], materials.plankDark);
  addBox(group, [0.14, 4.3, 0.14], [5.58, 2.2, -3.04], materials.plankDark);
  addBox(group, [11.1, 0.16, 0.16], [0, 4.32, -3.02], materials.plankDark);

  // 屋架与横梁
  for (const z of [-2.8, -1.05, 0.7, 2.45]) {
    addBox(group, [11.75, 0.18, 0.22], [0, 4.55, z], materials.plankDark);
  }
  for (const x of [-4.9, -1.65, 1.65, 4.9]) {
    addBox(group, [0.16, 3.75, 0.16], [x, 4.42, -3.15], materials.plankDark);
  }
  for (const side of [-1, 1]) {
    addBox(
      group,
      [6.55, 0.14, 0.16],
      [side * 2.83, 4.5, -3.12],
      materials.plankDark,
      { rotation: [0, 0, side * -0.37] },
    );
  }

  // 大圆窗
  const windowCanvas = createWindowTexture();
  const windowMaterial = new THREE.MeshBasicMaterial({ map: windowCanvas.texture, toneMapped: true });
  const windowMesh = new THREE.Mesh(new THREE.CircleGeometry(1.22, 48), windowMaterial);
  windowMesh.position.set(0.25, 2.9, -3.105);
  group.add(windowMesh);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.23, 0.085, 8, 40), materials.plankDark);
  frame.position.set(0.25, 2.9, -3.03);
  frame.castShadow = true;
  group.add(frame);
  addBox(group, [0.055, 2.32, 0.05], [0.25, 2.9, -2.99], materials.plankDark, { castShadow: false });
  addBox(group, [2.32, 0.055, 0.05], [0.25, 2.9, -2.99], materials.plankDark, { castShadow: false });

  group.name = '木屋室内结构';
  return { group, windowCanvas };
}

function createRug() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  context.fillStyle = '#743f30';
  context.fillRect(0, 0, 512, 384);
  context.strokeStyle = '#d2ac76';
  context.lineWidth = 14;
  context.strokeRect(18, 18, 476, 348);
  context.strokeStyle = '#40513d';
  context.lineWidth = 6;
  context.strokeRect(40, 40, 432, 304);
  const random = mulberry32(7137);
  for (let index = 0; index < 30; index += 1) {
    const x = randomRange(random, 54, 458);
    const y = randomRange(random, 54, 330);
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = index % 2 ? 'rgba(208, 170, 112, 0.55)' : 'rgba(77, 95, 66, 0.55)';
    context.fillRect(-10, -10, 20, 20);
    context.restore();
  }
  context.beginPath();
  context.ellipse(256, 192, 112, 76, 0, 0, Math.PI * 2);
  context.fillStyle = '#af7a52';
  context.fill();
  context.strokeStyle = '#ddbf8d';
  context.lineWidth = 8;
  context.stroke();
  context.beginPath();
  context.ellipse(256, 192, 55, 38, 0, 0, Math.PI * 2);
  context.fillStyle = '#42513b';
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 64), material);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(3.65, 2.4, 1);
  rug.position.set(0.25, 0.09, 0.35);
  rug.receiveShadow = true;
  rug.name = '编织地毯';
  return rug;
}

function createChair(materials, colorMaterial = materials.plank) {
  const chair = new THREE.Group();
  addBox(chair, [0.82, 0.12, 0.78], [0, 0.62, 0], colorMaterial);
  addBox(chair, [0.82, 1.05, 0.12], [0, 1.15, -0.34], colorMaterial);
  for (const x of [-0.31, 0.31]) {
    addBox(chair, [0.1, 0.62, 0.1], [x, 0.31, -0.27], materials.plankDark);
    addBox(chair, [0.1, 0.62, 0.1], [x, 0.31, 0.27], materials.plankDark);
  }
  const cushion = addBox(chair, [0.68, 0.07, 0.61], [0, 0.71, 0.01], materials.rust);
  cushion.castShadow = false;
  return chair;
}

function createDiningTable(materials, textures) {
  const group = new THREE.Group();
  group.position.set(0.2, 0, 0.4);
  const tableTop = addCylinder(group, 1.08, 1.08, 0.14, [0, 1.02, 0], materials.plank, { segments: 40 });
  tableTop.receiveShadow = true;
  addCylinder(group, 0.18, 0.26, 0.88, [0, 0.5, 0], materials.plankDark, { segments: 12 });
  addCylinder(group, 0.68, 0.78, 0.1, [0, 0.08, 0], materials.plankDark, { segments: 24 });

  const chairAngle = [0.25, 2.34, 4.39];
  chairAngle.forEach((angle) => {
    const chair = createChair(materials);
    const distance = 1.65;
    chair.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    // 椅背朝外，座面始终朝向餐桌中心。
    chair.rotation.y = -angle - Math.PI / 2;
    group.add(chair);
  });

  // 茶具
  const teapotBody = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), materials.linen);
  teapotBody.scale.set(1.1, 0.78, 0.9);
  teapotBody.position.set(-0.22, 1.23, 0.02);
  group.add(teapotBody);
  addCylinder(group, 0.055, 0.07, 0.14, [-0.22, 1.35, 0.02], materials.linen, { segments: 10 });
  const teapotHandle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 16), materials.linen);
  teapotHandle.position.set(-0.42, 1.23, 0.02);
  teapotHandle.rotation.y = Math.PI / 2;
  group.add(teapotHandle);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 10), materials.linen);
  spout.rotation.z = -Math.PI / 2.4;
  spout.position.set(0.02, 1.28, 0.02);
  group.add(spout);

  for (let index = 0; index < 3; index += 1) {
    const angle = -0.4 + index * 1.1;
    const cup = addCylinder(
      group,
      0.075,
      0.06,
      0.12,
      [Math.cos(angle) * 0.56, 1.15, Math.sin(angle) * 0.56],
      materials.linen,
      { segments: 14 },
    );
    cup.castShadow = false;
    const saucer = addCylinder(
      group,
      0.13,
      0.13,
      0.025,
      [cup.position.x, 1.08, cup.position.z],
      materials.plank,
      { segments: 16, castShadow: false },
    );
    saucer.receiveShadow = true;
  }

  const candleMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8d9b5,
    roughness: 0.9,
    emissive: 0x2a1d0f,
    emissiveIntensity: 0.15,
  });
  for (let index = 0; index < 2; index += 1) {
    addCylinder(group, 0.035, 0.045, 0.28 + index * 0.05, [0.3 - index * 0.48, 1.25, -0.18], candleMaterial, {
      segments: 10,
    });
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: null,
      color: 0xffb34f,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    flame.position.set(0.3 - index * 0.48, 1.46 + index * 0.05, -0.18);
    flame.scale.set(0.08, 0.18, 1);
    group.add(flame);
  }

  group.name = '圆桌与茶具';
  return group;
}

function createFireplace(materials, textures) {
  const random = mulberry32(6917);
  const group = new THREE.Group();
  addBox(group, [2.5, 4.1, 0.34], [-2.58, 2.28, -3.02], materials.stone);
  addBox(group, [2.74, 0.28, 0.92], [-2.58, 0.15, -2.62], materials.stone);
  addBox(group, [1.28, 1.15, 0.38], [-2.58, 0.86, -2.88], materials.iron, { receiveShadow: false });
  addBox(group, [2.25, 0.16, 0.48], [-2.58, 1.58, -2.72], materials.plankDark);

  const logMaterial = new THREE.MeshStandardMaterial({
    map: textures.barkMap,
    color: 0x8f6a48,
    roughness: 1,
  });
  for (let index = 0; index < 4; index += 1) {
    addCylinder(group, 0.08, 0.09, 0.9, [-2.58, 0.4 + index * 0.02, -2.59 + index * 0.13], logMaterial, {
      rotation: [0, 0, Math.PI / 2],
      segments: 8,
    });
  }

  const flameGroup = new THREE.Group();
  const flameMaterials = [
    new THREE.MeshBasicMaterial({ color: 0xffb13c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0xff6f24, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0xffe48a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  ];
  const flames = [];
  for (let index = 0; index < 8; index += 1) {
    const material = flameMaterials[index % 3].clone();
    const sprite = new THREE.Sprite(material);
    sprite.material.map = textures.softGlow;
    sprite.position.set(-2.92 + randomRange(random, 0.0, 0.7) + (index - 4) * 0.12, 0.58 + randomRange(random, 0, 0.2), -2.52);
    const baseScale = randomRange(random, 0.26, 0.5);
    sprite.scale.set(baseScale * 0.8, baseScale * 1.8, 1);
    sprite.userData = {
      baseX: sprite.position.x,
      baseY: sprite.position.y,
      phase: random() * Math.PI * 2,
      baseScale,
    };
    flameGroup.add(sprite);
    flames.push(sprite);
  }
  group.add(flameGroup);

  const fireLight = new THREE.PointLight(0xff8e3d, 18, 8, 2);
  fireLight.position.set(-2.58, 1.0, -2.1);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(1024, 1024);
  fireLight.shadow.bias = -0.0004;
  group.add(fireLight);

  const coals = [];
  const coalMaterial = new THREE.MeshStandardMaterial({ color: 0x2d1c13, roughness: 0.8, emissive: 0x8b2c0b, emissiveIntensity: 0.8 });
  for (let index = 0; index < 12; index += 1) {
    const coal = new THREE.Mesh(new THREE.DodecahedronGeometry(randomRange(random, 0.04, 0.08), 0), coalMaterial);
    coal.position.set(-2.95 + random() * 0.78, 0.3 + random() * 0.08, -2.56 + randomRange(random, -0.06, 0.08));
    group.add(coal);
    coals.push(coal);
  }

  group.name = '石砌壁炉';
  return { group, fireLight, flames, coals };
}

function createMushroomDecor() {
  const random = mulberry32(7319);
  const group = new THREE.Group();
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0xe0d4b7, roughness: 0.92 });
  const capMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xb3503f, roughness: 0.8, emissive: 0x3a0f07, emissiveIntensity: 0.4 }),
    new THREE.MeshStandardMaterial({ color: 0xc98553, roughness: 0.88 }),
  ];
  const spots = [
    [3.65, 0.12, 2.25],
    [3.35, 0.1, 2.0],
    [-3.7, 0.12, 1.7],
  ];
  for (let index = 0; index < 13; index += 1) {
    const anchor = spots[index % spots.length];
    const height = randomRange(random, 0.12, 0.32);
    const x = anchor[0] + randomRange(random, -0.45, 0.45);
    const z = anchor[2] + randomRange(random, -0.28, 0.28);
    addCylinder(group, 0.025, 0.04, height, [x, height / 2, z], stemMaterial, { segments: 7 });
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(randomRange(random, 0.08, 0.16), 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52),
      capMaterials[index % 2],
    );
    cap.scale.y = 0.62;
    cap.position.set(x, height, z);
    cap.castShadow = true;
    group.add(cap);
  }
  group.name = '蘑菇摆件';
  return group;
}

function createBookshelf(materials) {
  const random = mulberry32(7433);
  const group = new THREE.Group();
  group.position.set(5.34, 0, 0.8);
  group.rotation.y = -Math.PI / 2;
  addBox(group, [2.3, 3.15, 0.34], [0, 1.58, -0.18], materials.plankDark);
  addBox(group, [2.14, 2.95, 0.18], [0, 1.58, 0], materials.plank);
  for (let shelf = 0; shelf < 4; shelf += 1) {
    addBox(group, [2.18, 0.08, 0.42], [0, 0.25 + shelf * 0.78, 0.1], materials.plankDark);
  }
  const bookColors = [0x6f4433, 0x41533d, 0x7d6642, 0x5b4450, 0xa07a4a, 0x314b4b];
  for (let shelf = 0; shelf < 3; shelf += 1) {
    let cursor = -0.92;
    while (cursor < 0.9) {
      const width = randomRange(random, 0.08, 0.17);
      const height = randomRange(random, 0.32, 0.56);
      const mat = new THREE.MeshStandardMaterial({ color: bookColors[Math.floor(random() * bookColors.length)], roughness: 0.9 });
      addBox(group, [width, height, 0.24], [cursor, 0.25 + shelf * 0.78 + height / 2, 0.16], mat, { castShadow: false });
      cursor += width + 0.025;
    }
  }
  addCylinder(group, 0.14, 0.1, 0.26, [0.56, 2.48, 0.17], materials.brass, { segments: 12 });
  const tinyPlant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 1), materials.forest);
  tinyPlant.position.set(-0.6, 2.52, 0.1);
  group.add(tinyPlant);
  group.name = '书柜';
  return group;
}

function createPantryShelf(materials, textures) {
  const random = mulberry32(7489);
  const group = new THREE.Group();
  group.position.set(-5.24, 0, -0.95);
  group.rotation.y = Math.PI / 2;
  addBox(group, [1.8, 0.16, 0.55], [0, 0.82, 0.08], materials.plank);
  addBox(group, [1.8, 0.9, 0.48], [0, 0.43, 0], materials.plankDark);
  for (let shelf = 0; shelf < 3; shelf += 1) {
    addBox(group, [1.75, 0.08, 0.42], [0, 1.22 + shelf * 0.65, 0.05], materials.plank);
  }
  for (let index = 0; index < 9; index += 1) {
    const jarMaterial = new THREE.MeshPhysicalMaterial({
      color: index % 2 ? 0xb7a06d : 0x8f6c49,
      roughness: 0.18,
      transmission: 0.12,
      transparent: true,
      opacity: 0.8,
    });
    const jar = addCylinder(
      group,
      randomRange(random, 0.08, 0.13),
      randomRange(random, 0.09, 0.14),
      randomRange(random, 0.18, 0.34),
      [randomRange(random, -0.7, 0.7), 1.4 + random() * 1.1, 0.2],
      jarMaterial,
      { segments: 10 },
    );
    jar.castShadow = false;
  }
  const herbMaterial = new THREE.MeshStandardMaterial({ color: 0x59633f, roughness: 1 });
  for (let index = 0; index < 5; index += 1) {
    for (let leaf = 0; leaf < 5; leaf += 1) {
      const herb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), herbMaterial);
      herb.position.set(
        -0.6 + index * 0.3,
        2.4 + randomRange(random, 0.0, 0.5),
        randomRange(random, 0.1, 0.3),
      );
      herb.scale.set(1.8, 0.45, 0.7);
      group.add(herb);
    }
  }
  group.name = '香料与陶罐架子';
  return group;
}


function createLoftBed(materials, textures) {
  const group = new THREE.Group();
  const {
    centerX: bedCenterX,
    centerZ: bedCenterZ,
    platformTopY,
    mattressTopY,
    quiltTopY,
    canopyTopY,
  } = LOFT_BED;
  const platformWidth = 3.25;
  const platformDepth = 1.8;
  const platformHeight = 0.2;
  const platformBottomY = platformTopY - platformHeight;
  const mattressWidth = 3.0;
  const mattressDepth = 1.55;
  const mattressHeight = mattressTopY - platformTopY;
  const mattressCenterZ = bedCenterZ + 0.04;
  const frontFaceZ = bedCenterZ + platformDepth / 2;

  // 床板、床垫与底被按同一组高度连续叠放，不再互相下沉或悬空。
  const platform = addBox(
    group,
    [platformWidth, platformHeight, platformDepth],
    [bedCenterX, platformBottomY + platformHeight / 2, bedCenterZ],
    materials.plankDark,
  );
  platform.receiveShadow = true;
  addBox(
    group,
    [mattressWidth, mattressHeight, mattressDepth],
    [bedCenterX, mattressTopY - mattressHeight / 2, mattressCenterZ],
    materials.linen,
  );
  const baseQuiltHeight = quiltTopY - mattressTopY;
  addBox(
    group,
    [3.08, baseQuiltHeight, 1.62],
    [bedCenterX, mattressTopY + baseQuiltHeight / 2, mattressCenterZ],
    materials.rust,
  );

  const quiltColors = [materials.rust, materials.forest, materials.linen, materials.gold];
  for (let index = 0; index < 9; index += 1) {
    const mat = quiltColors[index % quiltColors.length].clone();
    mat.color.offsetHSL(0, 0, (index % 3) * 0.04);
    addBox(
      group,
      [0.38, 0.045, 0.5],
      [1.28 + (index % 3) * 0.43, quiltTopY + 0.0225, -2.52 + Math.floor(index / 3) * 0.39],
      mat,
      { castShadow: false },
    );
  }

  // 床沿挡板与平台顶面齐平，正面装饰不再与床垫发生穿插。
  const fasciaHeight = 0.56;
  addBox(
    group,
    [2.82, fasciaHeight, 0.07],
    [bedCenterX, platformTopY - fasciaHeight / 2, frontFaceZ],
    materials.rust,
  );
  for (let index = 0; index < 5; index += 1) {
    const patch = addBox(
      group,
      [0.5, 0.16, 0.012],
      [1.28 + index * 0.55, 2.4 + (index % 2) * 0.16, frontFaceZ + 0.034],
      quiltColors[(index + 1) % quiltColors.length],
      { castShadow: false },
    );
    patch.receiveShadow = true;
  }

  // 枕头底部压入底被少量，保持自然承托，不会悬在床垫上方。
  for (let index = 0; index < 3; index += 1) {
    const pillow = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), index === 1 ? materials.linen : materials.plank);
    pillow.scale.set(1.2, 0.55, 0.8);
    pillow.position.set(1.3 + index * 0.56, mattressTopY + 0.25, -2.75);
    pillow.rotation.x = -0.18;
    pillow.castShadow = true;
    group.add(pillow);
  }

  // 四角立柱从地面贯通至床帘顶架，同时承托床板和护栏。
  const postHeight = canopyTopY;
  for (const x of [0.9, 4.0]) {
    for (const z of [bedCenterZ - 0.68, bedCenterZ + 0.76]) {
      addBox(group, [0.13, postHeight, 0.13], [x, postHeight / 2, z], materials.plankDark);
    }
  }

  // 上下横杆与竖向栏杆闭合连接，顶面高度低于床帘，避免护栏悬空。
  const guardrailZ = frontFaceZ - 0.09;
  const lowerRailY = 3.1;
  const topRailY = 3.47;
  addBox(group, [3.28, 0.12, 0.11], [bedCenterX, lowerRailY, guardrailZ], materials.plankDark);
  addBox(group, [3.28, 0.09, 0.09], [bedCenterX, topRailY, guardrailZ], materials.plankDark);
  const spindleHeight = topRailY - lowerRailY - 0.12;
  for (let index = 0; index < 6; index += 1) {
    addBox(
      group,
      [0.07, spindleHeight, 0.07],
      [1.05 + index * 0.55, (lowerRailY + topRailY) / 2, guardrailZ],
      materials.plankDark,
      { castShadow: false },
    );
  }

  // 正面床梯：两根边梁共同斜靠床沿，底脚落地，踏步保持水平且间距一致。
  const ladder = new THREE.Group();
  const ladderCenterX = 3.38;
  const ladderWidth = 0.86;
  const ladderHeight = 2.79;
  const ladderBottomZ = bedCenterZ + platformDepth / 2 + 0.42;
  const ladderTopZ = frontFaceZ + 0.08;
  const ladderDepth = ladderTopZ - ladderBottomZ;
  const ladderAngle = Math.atan2(ladderDepth, ladderHeight);
  const ladderRailLength = Math.hypot(ladderHeight, ladderDepth);
  const ladderRailZ = (ladderTopZ + ladderBottomZ) / 2;
  for (const side of [-1, 1]) {
    const ladderX = ladderCenterX + side * (ladderWidth / 2);
    addBox(
      ladder,
      [0.08, ladderRailLength, 0.08],
      [ladderX, ladderHeight / 2, ladderRailZ],
      materials.plankDark,
      { rotation: [ladderAngle, 0, 0] },
    );
    addBox(ladder, [0.12, 0.05, 0.16], [ladderX, 0.025, ladderBottomZ], materials.plankDark);
  }
  for (let index = 0; index < 8; index += 1) {
    const stepY = 0.34 + index * 0.33;
    const stepZ = ladderBottomZ + ladderDepth * (stepY / ladderHeight);
    addBox(ladder, [ladderWidth + 0.08, 0.075, 0.18], [ladderCenterX, stepY, stepZ], materials.plank);
  }
  for (const side of [-1, 1]) {
    addBox(
      ladder,
      [0.14, 0.09, 0.18],
      [ladderCenterX + side * (ladderWidth / 2), ladderHeight - 0.02, ladderTopZ - 0.045],
      materials.brass,
      { castShadow: false },
    );
  }
  ladder.name = '床梯';
  group.add(ladder);

  // 床帘
  const curtainMaterial = new THREE.MeshStandardMaterial({
    color: 0xa95b43,
    roughness: 0.98,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });
  const curtainHeight = 1.76;
  for (const x of [0.88, 4.02]) {
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.6, curtainHeight, 8, 8), curtainMaterial);
    const position = curtain.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      position.setZ(index, Math.sin(position.getY(index) * 5.2) * 0.045);
    }
    curtain.geometry.computeVertexNormals();
    curtain.position.set(x, canopyTopY - curtainHeight / 2, -2.2);
    curtain.rotation.y = Math.PI / 2;
    group.add(curtain);
  }
  addBox(group, [3.25, 0.08, 1.75], [bedCenterX, canopyTopY + 0.04, -2.2], curtainMaterial, { castShadow: false });

  // 床边串灯与玩偶
  const bulbs = [];
  for (let index = 0; index < 10; index += 1) {
    const x = 1.02 + index * 0.31;
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.2, 0.45), toneMapped: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), material);
    bulb.position.set(x, topRailY + 0.07 - Math.sin((index / 9) * Math.PI) * 0.1, guardrailZ + 0.08);
    group.add(bulb);
    const glowMaterial = new THREE.SpriteMaterial({
      map: textures.softGlow,
      color: 0xffb35d,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.position.copy(bulb.position);
    glow.scale.setScalar(0.26);
    group.add(glow);
    bulbs.push({ bulb, glow, phase: index * 1.13 });
  }

  const bunny = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xc5ad90, roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 7), fur);
  body.scale.set(0.8, 1.2, 0.8);
  body.position.y = 0.17;
  bunny.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 7), fur);
  head.position.set(0, 0.38, 0.01);
  bunny.add(head);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.2, 3, 6), fur);
    ear.position.set(side * 0.06, 0.56, 0);
    ear.rotation.z = side * -0.18;
    bunny.add(ear);
  }
  bunny.position.set(3.55, quiltTopY + 0.02, -2.55);
  bunny.rotation.y = -0.3;
  group.add(bunny);

  group.name = '阁楼床';
  return { group, bulbs };
}

function createArmchair(materials) {
  const group = new THREE.Group();
  group.position.set(4.22, 0, 1.82);
  group.rotation.y = -0.6;
  addBox(group, [1.45, 0.34, 1.12], [0, 0.55, 0], materials.forest);
  addBox(group, [1.4, 1.1, 0.22], [0, 1.2, -0.45], materials.forest, { rotation: [-0.12, 0, 0] });
  addBox(group, [0.22, 0.72, 1.1], [-0.64, 0.82, 0], materials.forest);
  addBox(group, [0.22, 0.72, 1.1], [0.64, 0.82, 0], materials.forest);
  addBox(group, [0.98, 0.14, 0.82], [0, 0.78, 0.08], materials.rust, { castShadow: false });
  const pillow = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 9), materials.gold);
  pillow.scale.set(1.1, 0.65, 0.55);
  pillow.position.set(-0.22, 1.17, -0.28);
  group.add(pillow);
  for (const x of [-0.52, 0.52]) {
    for (const z of [-0.38, 0.38]) {
      addBox(group, [0.1, 0.42, 0.1], [x, 0.21, z], materials.plankDark);
    }
  }
  const throwBlanket = addBox(group, [0.52, 0.04, 0.8], [0.39, 0.82, 0.12], materials.linen, {
    rotation: [0, 0.04, 0],
    castShadow: false,
  });
  throwBlanket.receiveShadow = true;
  group.name = '扶手椅';
  return group;
}

function createSeasonalSeating(materials) {
  const root = new THREE.Group();
  root.position.set(4.22, 0, 1.82);
  root.rotation.y = -0.6;
  const seasons = {
    spring: new THREE.Group(),
    summer: new THREE.Group(),
    autumn: new THREE.Group(),
    winter: new THREE.Group(),
  };
  root.add(seasons.spring, seasons.summer, seasons.autumn, seasons.winter);

  const addLegs = (parent, material, width, depth, height = 0.36) => {
    for (const x of [-width, width]) {
      for (const z of [-depth, depth]) {
        addBox(parent, [0.1, height, 0.1], [x, height / 2, z], material);
      }
    }
  };

  const springWood = new THREE.MeshStandardMaterial({ color: 0xc5a77a, roughness: 0.92 });
  const springCushion = new THREE.MeshStandardMaterial({ color: 0xc98691, roughness: 0.96 });
  const springThrow = new THREE.MeshStandardMaterial({ color: 0xead8c7, roughness: 1 });
  addBox(seasons.spring, [1.45, 0.13, 1.08], [0, 0.53, 0], springWood);
  addLegs(seasons.spring, materials.plankDark, 0.54, 0.38, 0.45);
  addBox(seasons.spring, [1.38, 0.92, 0.09], [0, 1.08, -0.46], springWood, { rotation: [-0.09, 0, 0] });
  for (let index = 0; index < 7; index += 1) {
    addBox(seasons.spring, [0.07, 0.72, 0.055], [-0.5 + index * 0.167, 1.08, -0.5], materials.gold, {
      castShadow: false,
    });
  }
  addBox(seasons.spring, [1.08, 0.13, 0.84], [0, 0.68, 0.02], springCushion, { castShadow: false });
  const springPillow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), springThrow);
  springPillow.scale.set(1.05, 0.62, 0.52);
  springPillow.position.set(-0.25, 1.12, -0.27);
  springPillow.rotation.z = 0.16;
  seasons.spring.add(springPillow);
  addBox(seasons.spring, [0.58, 0.035, 0.84], [0.34, 0.77, 0.08], springThrow, { castShadow: false });

  const bamboo = new THREE.MeshStandardMaterial({ color: 0xb58d55, roughness: 0.9 });
  const summerCushion = new THREE.MeshStandardMaterial({ color: 0x8fb9a7, roughness: 0.94 });
  addBox(seasons.summer, [1.54, 0.11, 1.18], [0, 0.49, 0], bamboo, { rotation: [0.03, 0, 0] });
  addLegs(seasons.summer, bamboo, 0.56, 0.43, 0.42);
  addBox(seasons.summer, [1.42, 0.84, 0.085], [0, 1.02, -0.5], bamboo, { rotation: [-0.23, 0, 0] });
  for (let index = 0; index < 8; index += 1) {
    addBox(seasons.summer, [0.045, 0.69, 0.045], [-0.52 + index * 0.148, 1.02, -0.54], bamboo, {
      rotation: [-0.23, 0, 0],
      castShadow: false,
    });
  }
  addBox(seasons.summer, [1.1, 0.08, 0.86], [0, 0.6, 0.04], summerCushion, { castShadow: false });
  const towel = addCylinder(seasons.summer, 0.12, 0.12, 0.78, [0.54, 0.71, 0.18], materials.linen, {
    segments: 12,
    rotation: [Math.PI / 2, 0, 0],
  });
  towel.castShadow = false;

  const autumnLeather = new THREE.MeshStandardMaterial({ color: 0x8b533b, roughness: 0.86 });
  addBox(seasons.autumn, [1.5, 0.34, 1.14], [0, 0.55, 0], autumnLeather);
  addBox(seasons.autumn, [1.43, 1.1, 0.24], [0, 1.2, -0.47], autumnLeather, { rotation: [-0.12, 0, 0] });
  addBox(seasons.autumn, [0.22, 0.72, 1.12], [-0.67, 0.82, 0], autumnLeather);
  addBox(seasons.autumn, [0.22, 0.72, 1.12], [0.67, 0.82, 0], autumnLeather);
  addBox(seasons.autumn, [1.02, 0.14, 0.84], [0, 0.79, 0.08], materials.rust, { castShadow: false });
  const autumnPillowMaterial = new THREE.MeshStandardMaterial({ color: 0xc4934f, roughness: 0.94 });
  const autumnPillow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 9), autumnPillowMaterial);
  autumnPillow.scale.set(1.08, 0.62, 0.55);
  autumnPillow.position.set(-0.22, 1.17, -0.27);
  seasons.autumn.add(autumnPillow);
  addBox(seasons.autumn, [0.6, 0.055, 0.86], [0.32, 0.84, 0.1], materials.linen, { castShadow: false });

  const plushBlue = new THREE.MeshStandardMaterial({ color: 0x526d76, roughness: 0.98 });
  const plushCream = new THREE.MeshStandardMaterial({ color: 0xd8c9ae, roughness: 1 });
  addBox(seasons.winter, [1.82, 0.5, 1.34], [0, 0.55, 0], plushBlue);
  addBox(seasons.winter, [1.72, 1.18, 0.36], [0, 1.24, -0.56], plushBlue, { rotation: [-0.08, 0, 0] });
  addBox(seasons.winter, [0.34, 0.86, 1.3], [-0.78, 0.86, 0], plushBlue);
  addBox(seasons.winter, [0.34, 0.86, 1.3], [0.78, 0.86, 0], plushBlue);
  addBox(seasons.winter, [1.12, 0.24, 0.9], [0, 0.88, 0.03], plushCream, { castShadow: false });
  const winterPillow = new THREE.Mesh(new THREE.SphereGeometry(0.36, 13, 9), plushCream);
  winterPillow.scale.set(1.14, 0.72, 0.58);
  winterPillow.position.set(-0.25, 1.37, -0.34);
  winterPillow.rotation.z = -0.1;
  seasons.winter.add(winterPillow);
  addBox(seasons.winter, [0.82, 0.1, 1.04], [0.34, 1.03, 0.12], plushCream, { rotation: [0, 0.03, 0] });
  for (let index = 0; index < 5; index += 1) {
    addBox(seasons.winter, [0.07, 0.18, 0.025], [-0.02 + index * 0.16, 0.94, 0.65], materials.rust, { castShadow: false });
  }

  root.name = '四季座椅';
  const setSeason = (season) => {
    for (const [key, group] of Object.entries(seasons)) group.visible = key === season;
  };
  setSeason('autumn');
  return { group: root, setSeason };
}

function createSeasonalBedding(materials) {
  const root = new THREE.Group();
  const seasons = {
    spring: new THREE.Group(),
    summer: new THREE.Group(),
    autumn: new THREE.Group(),
    winter: new THREE.Group(),
  };
  root.add(seasons.spring, seasons.summer, seasons.autumn, seasons.winter);

  const bedX = LOFT_BED.centerX;
  const layerBaseY = LOFT_BED.quiltTopY;

  // 四季床品统一从底被上表面开始叠放，避让床沿护栏并保持厚度连续。
  const springQuilt = new THREE.MeshStandardMaterial({ color: 0xe9c5c4, roughness: 0.98 });
  const springHeight = 0.08;
  addBox(
    seasons.spring,
    [2.72, springHeight, 1.28],
    [bedX, layerBaseY + springHeight / 2, -2.15],
    springQuilt,
    { castShadow: false },
  );
  addBox(
    seasons.spring,
    [1.04, 0.06, 1.2],
    [1.72, layerBaseY + springHeight + 0.03, -2.13],
    materials.linen,
    { castShadow: false },
  );
  for (let index = 0; index < 5; index += 1) {
    const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 1), new THREE.MeshStandardMaterial({
      color: [0xd67893, 0xe4b95d, 0x8f9fcf][index % 3],
      roughness: 0.86,
    }));
    flower.position.set(1.42 + index * 0.45, layerBaseY + springHeight + 0.045, -2.33 + (index % 2) * 0.22);
    seasons.spring.add(flower);
  }

  const summerQuilt = new THREE.MeshStandardMaterial({ color: 0xa9c5bd, roughness: 0.98 });
  const summerHeight = 0.035;
  addBox(
    seasons.summer,
    [2.64, summerHeight, 1.08],
    [bedX, layerBaseY + summerHeight / 2, -2.32],
    summerQuilt,
    { castShadow: false },
  );
  addBox(
    seasons.summer,
    [2.52, 0.055, 0.52],
    [bedX, layerBaseY + summerHeight + 0.0275, -1.63],
    materials.linen,
    { castShadow: false },
  );

  const autumnQuilt = new THREE.MeshStandardMaterial({ color: 0xa95c3e, roughness: 0.98 });
  const autumnHeight = 0.16;
  addBox(
    seasons.autumn,
    [2.78, autumnHeight, 1.34],
    [bedX, layerBaseY + autumnHeight / 2, -2.14],
    autumnQuilt,
    { castShadow: false },
  );
  for (let index = 0; index < 7; index += 1) {
    addBox(
      seasons.autumn,
      [0.34, 0.018, 1.3],
      [1.25 + index * 0.38, layerBaseY + autumnHeight + 0.009, -2.14],
      index % 2 ? materials.gold : materials.rust,
      {
        rotation: [0, 0.07 * (index % 2 ? 1 : -1), 0],
        castShadow: false,
      },
    );
  }

  const winterDuvet = new THREE.MeshStandardMaterial({ color: 0xcac3b1, roughness: 1 });
  const winterFold = new THREE.MeshStandardMaterial({ color: 0x718b93, roughness: 1 });
  const winterHeight = 0.3;
  addBox(
    seasons.winter,
    [2.86, winterHeight, 1.42],
    [bedX, layerBaseY + winterHeight / 2, -2.1],
    winterDuvet,
    { castShadow: false },
  );
  addBox(
    seasons.winter,
    [2.82, 0.12, 0.64],
    [bedX, layerBaseY + winterHeight + 0.06, -1.52],
    winterFold,
  );
  for (let index = 0; index < 8; index += 1) {
    addBox(
      seasons.winter,
      [0.24, 0.06, 0.24],
      [1.25 + index * 0.33, layerBaseY + winterHeight + 0.03, -2.77],
      materials.linen,
      { castShadow: false },
    );
  }
  const winterCushion = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 9), winterFold);
  winterCushion.scale.set(1.22, 0.62, 0.6);
  winterCushion.position.set(3.22, layerBaseY + winterHeight + 0.2, -2.67);
  seasons.winter.add(winterCushion);

  root.name = '四季床品';
  const setSeason = (season) => {
    for (const [key, group] of Object.entries(seasons)) group.visible = key === season;
  };
  setSeason('autumn');
  return { group: root, setSeason };
}

function createSideTable(materials, textures) {
  const group = new THREE.Group();
  group.position.set(5.08, 0, 3.02);
  addCylinder(group, 0.46, 0.5, 0.08, [0, 0.68, 0], materials.plank, { segments: 24 });
  addCylinder(group, 0.08, 0.1, 0.62, [0, 0.35, 0], materials.plankDark, { segments: 8 });
  addCylinder(group, 0.28, 0.32, 0.06, [0, 0.04, 0], materials.plankDark, { segments: 16 });
  const lampBase = addCylinder(group, 0.06, 0.09, 0.34, [0, 0.88, 0], materials.brass, { segments: 10 });
  lampBase.castShadow = false;
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, 0.26, 18, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xe7c694,
      emissive: 0xd78238,
      emissiveIntensity: 0.9,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
  );
  shade.position.set(0, 1.14, 0);
  group.add(shade);
  const light = new THREE.PointLight(0xffba6e, 5, 4, 2);
  light.position.set(0, 1.04, 0);
  group.add(light);
  const glowMaterial = new THREE.SpriteMaterial({
    map: textures.softGlow,
    color: 0xffba6e,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.position.set(0, 1.06, 0);
  glow.scale.set(0.9, 0.9, 1);
  group.add(glow);
  const book = addBox(group, [0.33, 0.04, 0.24], [-0.2, 0.76, 0.08], materials.rust, { rotation: [0, 0.18, 0] });
  book.castShadow = false;
  group.name = '边桌与台灯';
  return { group, light, glow };
}

function createChandelier(materials, textures) {
  const group = new THREE.Group();
  group.position.set(0.18, 4.12, 0.15);
  addCylinder(group, 0.012, 0.012, 0.55, [0, 0.35, 0], materials.iron, { segments: 5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 32), materials.iron);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const bulbs = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const x = Math.cos(angle) * 0.58;
    const z = Math.sin(angle) * 0.58;
    addCylinder(group, 0.03, 0.04, 0.18, [x, 0.02, z], materials.linen, { segments: 8 });
    const glowMaterial = new THREE.SpriteMaterial({
      map: textures.softGlow,
      color: 0xffcf7e,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.position.set(x, 0.15, z);
    glow.scale.setScalar(0.35);
    group.add(glow);
    bulbs.push({ glow, phase: index * 0.9 });
  }
  const light = new THREE.PointLight(0xffbc74, 22, 11, 2);
  light.position.set(0, -0.05, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  group.add(light);
  group.name = '吊灯';
  return { group, light, bulbs };
}

function createSleepingCat() {
  const cat = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xa36b42, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x6b432b, roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), fur);
  body.scale.set(1.5, 0.62, 0.95);
  cat.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), fur);
  head.position.set(-0.25, 0.06, 0.03);
  cat.add(head);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), dark);
    ear.position.set(-0.3, 0.2, side * 0.06);
    cat.add(ear);
  }
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.23, 0.02, 0),
    new THREE.Vector3(0.4, -0.05, 0.12),
    new THREE.Vector3(0.31, -0.08, 0.25),
    new THREE.Vector3(0.13, -0.07, 0.21),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 12, 0.03, 5, false), dark);
  cat.add(tail);
  cat.position.set(-1.18, 0.2, -2.0);
  cat.rotation.y = -0.35;
  cat.name = '睡猫';
  return cat;
}

function createInteriorMotes(textures) {
  const random = mulberry32(8213);
  const count = 110;
  const positions = new Float32Array(count * 3);
  const base = [];
  const phases = [];
  for (let index = 0; index < count; index += 1) {
    const x = randomRange(random, -3.9, 3.9);
    const y = randomRange(random, 0.4, 4.1);
    const z = randomRange(random, -2.8, 2.7);
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    base.push(new THREE.Vector3(x, y, z));
    phases.push(random() * Math.PI * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    map: textures.softGlow,
    color: 0xffd49b,
    size: 0.032,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    points,
    update(elapsed) {
      const attribute = geometry.attributes.position;
      for (let index = 0; index < count; index += 1) {
        const phase = phases[index];
        attribute.array[index * 3] = base[index].x + Math.sin(elapsed * 0.12 + phase) * 0.18;
        attribute.array[index * 3 + 1] = base[index].y + Math.sin(elapsed * 0.1 + phase * 1.7) * 0.14;
        attribute.array[index * 3 + 2] = base[index].z + Math.cos(elapsed * 0.11 + phase) * 0.16;
      }
      attribute.needsUpdate = true;
    },
  };
}

function createWindowDrapes(color, accentColor, heavy = false) {
  const group = new THREE.Group();
  const drapeMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.96,
    transparent: !heavy,
    opacity: heavy ? 1 : 0.82,
    side: THREE.DoubleSide,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.72, metalness: heavy ? 0.08 : 0 });
  const width = heavy ? 0.54 : 0.4;
  for (const side of [-1, 1]) {
    const x = 0.25 + side * 1.58;
    addBox(group, [width, 2.78, 0.07], [x, 2.88, -3.01], drapeMaterial, {
      rotation: [0, 0, side * 0.018],
    });
    addBox(group, [width + 0.08, 0.09, 0.085], [x, 2.35, -2.99], accentMaterial, { castShadow: false });
  }
  addBox(group, [3.26, heavy ? 0.42 : 0.32, 0.08], [0.25, 4.16, -3.01], drapeMaterial, {
    castShadow: false,
  });
  group.name = '季节窗幔';
  return group;
}

function createSeasonDecor(materials, textures) {
  const root = new THREE.Group();
  const spring = new THREE.Group();
  const summer = new THREE.Group();
  const autumn = new THREE.Group();
  const winter = new THREE.Group();
  root.add(spring, summer, autumn, winter);
  spring.add(createWindowDrapes(0xe7b5c2, 0xc88978));
  summer.add(createWindowDrapes(0x9fbaa1, 0x65845f));
  autumn.add(createWindowDrapes(0xb97645, 0x6f4a2d));
  winter.add(createWindowDrapes(0x75434a, 0xc49b61, true));

  // 春天：桌上的野花与壁炉常春藤
  const vase = addCylinder(spring, 0.13, 0.16, 0.36, [0.92, 1.28, -0.12], materials.rust, { segments: 14 });
  vase.castShadow = true;
  const flowerColors = [0xe6a0b4, 0xf0ce82, 0xc9a4dd];
  for (let index = 0; index < 9; index += 1) {
    const angle = (index / 9) * Math.PI * 2;
    const height = 0.34 + (index % 3) * 0.08;
    addCylinder(
      spring,
      0.008,
      0.01,
      height,
      [0.92 + Math.cos(angle) * 0.06, 1.45 + height / 2, -0.12 + Math.sin(angle) * 0.06],
      materials.forest,
      { segments: 4, castShadow: false },
    );
    const flower = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.055, 1),
      new THREE.MeshStandardMaterial({ color: flowerColors[index % 3], roughness: 0.82 }),
    );
    flower.position.set(
      0.92 + Math.cos(angle) * 0.11,
      1.45 + height,
      -0.12 + Math.sin(angle) * 0.11,
    );
    spring.add(flower);
  }
  for (let index = 0; index < 18; index += 1) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), materials.forest);
    leaf.position.set(
      -3.55 + index * 0.11,
      1.68 + Math.sin(index * 0.8) * 0.08,
      -2.63 + Math.sin(index * 1.7) * 0.06,
    );
    leaf.scale.set(1.65, 0.4, 0.8);
    leaf.rotation.set(0, index, index * 0.7);
    spring.add(leaf);
  }

  const blossomColors = [0xe8a5b8, 0xf0d0d4, 0xd9b2dd];
  for (let index = 0; index < 30; index += 1) {
    const x = -4.75 + index * 0.33;
    const y = 4.06 + Math.sin(index * 0.55) * 0.12;
    const z = -2.9 + Math.sin(index * 1.25) * 0.06;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 0), materials.forest);
    leaf.position.set(x, y, z);
    leaf.scale.set(1.7, 0.32, 0.7);
    leaf.rotation.z = index * 0.8;
    spring.add(leaf);
    if (index % 2 === 0) {
      const flower = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.055, 1),
        new THREE.MeshStandardMaterial({ color: blossomColors[index % 3], roughness: 0.82 }),
      );
      flower.position.set(x, y - 0.06, z + 0.04);
      spring.add(flower);
    }
  }
  for (const x of [-2.05, -1.62]) {
    addCylinder(spring, 0.09, 0.12, 0.22, [x, 0.84, -2.66], materials.rust, { segments: 10 });
    const stem = addCylinder(spring, 0.008, 0.01, 0.26, [x, 1.04, -2.66], materials.forest, { segments: 4, castShadow: false });
    stem.castShadow = false;
    const bloom = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.07, 1),
      new THREE.MeshStandardMaterial({ color: x < -1.8 ? 0xe4a9bd : 0xf0cf8a, roughness: 0.82 }),
    );
    bloom.position.set(x, 1.19, -2.66);
    spring.add(bloom);
  }
  // 夏天：莓果碗与萤火虫罐
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.16, 0.12, 18),
    new THREE.MeshStandardMaterial({ color: 0x516b4d, roughness: 0.82 }),
  );
  bowl.position.set(-0.6, 1.12, 0.28);
  summer.add(bowl);
  for (let index = 0; index < 10; index += 1) {
    const berry = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 7, 5),
      new THREE.MeshStandardMaterial({ color: index % 2 ? 0x7d2f3c : 0x4f3b3c, roughness: 0.75 }),
    );
    berry.position.set(
      -0.7 + (index % 4) * 0.07,
      1.18 + Math.sin(index) * 0.02,
      0.22 + Math.floor(index / 4) * 0.06,
    );
    summer.add(berry);
  }
  const jarGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.14, 0.42, 14, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: 0xb9d4c8,
      transparent: true,
      opacity: 0.25,
      roughness: 0.1,
      transmission: 0.2,
      depthWrite: false,
    }),
  );
  jarGlass.position.set(5.08, 0.94, 3.02);
  summer.add(jarGlass);
  addCylinder(summer, 0.16, 0.17, 0.05, [5.08, 0.72, 3.02], materials.plankDark, { segments: 14 });
  for (let index = 0; index < 6; index += 1) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures.softGlow,
      color: 0xd6e57c,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    glow.position.set(5.0 + (index % 3) * 0.07, 0.8 + (index % 2) * 0.12, 2.98 + Math.floor(index / 3) * 0.06);
    glow.scale.setScalar(0.2);
    summer.add(glow);
  }

  const vineMaterial = new THREE.MeshStandardMaterial({ color: 0x455f3b, roughness: 1, flatShading: true });
  for (let index = 0; index < 34; index += 1) {
    const x = -4.75 + index * 0.29;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 0), vineMaterial);
    leaf.position.set(x, 4.02 + Math.sin(index * 0.9) * 0.13, -2.91);
    leaf.scale.set(1.8, 0.36, 0.72);
    leaf.rotation.set(index * 0.3, index, index * 0.7);
    summer.add(leaf);
    if (index % 5 === 0) {
      const firefly = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textures.softGlow,
        color: 0xdceb85,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }));
      firefly.position.set(x, 3.9 + Math.sin(index) * 0.1, -2.82);
      firefly.scale.setScalar(0.18);
      summer.add(firefly);
    }
  }
  // 秋天：南瓜与桌边落叶
  const miniPumpkinMaterial = new THREE.MeshStandardMaterial({ color: 0xba612b, roughness: 0.88, flatShading: true });
  for (const [x, y, z, scale] of [
    [-1.9, 0.18, -1.35, 0.26],
    [-1.32, 0.16, -1.16, 0.2],
    [0.78, 1.13, 0.18, 0.15],
    [3.1, 0.17, 1.72, 0.22],
    [-3.55, 0.16, 2.05, 0.23],
    [4.65, 0.15, 2.55, 0.18],
  ]) {
    const pumpkin = new THREE.Mesh(new THREE.SphereGeometry(scale, 12, 8), miniPumpkinMaterial);
    pumpkin.scale.y = 0.64;
    pumpkin.position.set(x, y, z);
    autumn.add(pumpkin);
    const stem = addCylinder(autumn, 0.018, 0.024, 0.1, [x, y + scale * 0.63, z], materials.forest, { segments: 5 });
    stem.castShadow = false;
  }
  for (let index = 0; index < 23; index += 1) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), materials.rust);
    leaf.position.set(
      -3.7 + index * 0.31,
      0.13 + (index % 2) * 0.01,
      -0.2 + Math.sin(index * 1.8) * 0.85,
    );
    leaf.scale.set(1.6, 0.08, 0.8);
    leaf.rotation.y = index * 1.2;
    autumn.add(leaf);
  }

  const autumnLeafColors = [0xc75f29, 0xa93c2d, 0xd49a3a, 0x7c5430];
  for (let index = 0; index < 38; index += 1) {
    const x = -4.75 + index * 0.26;
    const leaf = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.065, 0),
      new THREE.MeshStandardMaterial({ color: autumnLeafColors[index % autumnLeafColors.length], roughness: 0.9 }),
    );
    leaf.position.set(x, 4.02 + Math.sin(index * 0.8) * 0.14, -2.91);
    leaf.scale.set(1.9, 0.3, 0.75);
    leaf.rotation.set(index * 0.4, index, index * 0.5);
    autumn.add(leaf);
  }
  // 冬天：圆窗花环、松枝与烛光
  const wreathMaterial = new THREE.MeshStandardMaterial({ color: 0x33452f, roughness: 0.96, flatShading: true });
  const wreath = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.075, 7, 36), wreathMaterial);
  wreath.position.set(0.25, 2.9, -2.95);
  wreath.castShadow = true;
  winter.add(wreath);
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), wreathMaterial);
    leaf.position.set(
      0.25 + Math.cos(angle) * 1.28,
      2.9 + Math.sin(angle) * 1.28,
      -2.91,
    );
    leaf.scale.set(1.9, 0.34, 0.65);
    leaf.rotation.z = angle;
    winter.add(leaf);
    if (index % 3 === 0) {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 5), materials.rust);
      berry.position.set(
        0.25 + Math.cos(angle + 0.1) * 1.28,
        2.9 + Math.sin(angle + 0.1) * 1.28,
        -2.86,
      );
      winter.add(berry);
    }
  }
  for (let index = 0; index < 18; index += 1) {
    const twig = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), wreathMaterial);
    twig.position.set(
      -3.55 + index * 0.11,
      1.68 + Math.sin(index * 0.9) * 0.1,
      -2.62,
    );
    twig.scale.set(1.8, 0.4, 0.7);
    twig.rotation.z = index * 0.6;
    winter.add(twig);
  }
  const mugMaterial = new THREE.MeshStandardMaterial({ color: 0xd8c3a2, roughness: 0.9 });
  for (const [x, z] of [[-0.05, 0.17], [0.35, 0.36]]) {
    addCylinder(winter, 0.07, 0.06, 0.14, [x, 1.14, z], mugMaterial, { segments: 12 });
  }
  const stockingColors = [materials.rust, materials.linen, materials.forest];
  for (let index = 0; index < 3; index += 1) {
    const x = -3.16 + index * 0.62;
    const stocking = addCylinder(
      winter,
      0.075,
      0.115,
      0.46,
      [x, 1.26, -2.57],
      stockingColors[index],
      { segments: 9, rotation: [0, 0, index % 2 === 0 ? 0.05 : -0.05] },
    );
    stocking.castShadow = false;
    addBox(winter, [0.28, 0.08, 0.16], [x, 1.49, -2.57], materials.linen, { castShadow: false });
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 12), materials.brass);
    loop.position.set(x, 1.57, -2.56);
    winter.add(loop);
  }

  const giftRed = new THREE.MeshStandardMaterial({ color: 0x8b352c, roughness: 0.82 });
  const giftGreen = new THREE.MeshStandardMaterial({ color: 0x43583d, roughness: 0.88 });
  const giftCream = new THREE.MeshStandardMaterial({ color: 0xcdbb94, roughness: 0.9 });
  const giftData = [
    [2.55, 0.22, -1.02, 0.46, 0.4, 0.38, giftRed],
    [3.16, 0.17, -0.82, 0.34, 0.3, 0.32, giftGreen],
    [3.72, 0.24, -1.08, 0.52, 0.44, 0.4, giftCream],
  ];
  for (const [x, y, z, width, height, depth, material] of giftData) {
    addBox(winter, [width, height, depth], [x, y, z], material);
    addBox(winter, [width * 0.12, height + 0.02, depth + 0.02], [x, y + 0.01, z], materials.gold, { castShadow: false });
    addBox(winter, [width + 0.02, height + 0.02, depth * 0.12], [x, y + 0.01, z], materials.gold, { castShadow: false });
  }

  const setSeason = (season) => {
    spring.visible = season === 'spring';
    summer.visible = season === 'summer';
    autumn.visible = season === 'autumn';
    winter.visible = season === 'winter';
  };
  setSeason('autumn');
  root.name = '室内季节陈设';
  return { group: root, setSeason };
}

export function createInterior(textures, canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0907);
  scene.fog = new THREE.FogExp2(0x160f0a, 0.012);
  const materials = makeInteriorMaterials(textures);

  const room = createRoom(materials);
  scene.add(room.group);
  const rug = createRug();
  scene.add(rug);
  scene.add(createDiningTable(materials, textures));
  scene.add(createKitchenNook(materials, textures));
  scene.add(createWindowSeat(materials));
  scene.add(createToyChest(materials));
  scene.add(createLargePlant(materials));

  const fireplace = createFireplace(materials, textures);
  scene.add(fireplace.group);
  scene.add(createSleepingCat());
  scene.add(createMushroomDecor());
  scene.add(createBookshelf(materials));
  scene.add(createPantryShelf(materials, textures));
  const seasonalSeating = createSeasonalSeating(materials);
  scene.add(seasonalSeating.group);
  const sideTable = createSideTable(materials, textures);
  scene.add(sideTable.group);
  const loftBed = createLoftBed(materials, textures);
  scene.add(loftBed.group);
  const seasonalBedding = createSeasonalBedding(materials);
  scene.add(seasonalBedding.group);
  const chandelier = createChandelier(materials, textures);
  scene.add(chandelier.group);
  const seasonalDecor = createSeasonDecor(materials, textures);
  scene.add(seasonalDecor.group);
  const motes = createInteriorMotes(textures);
  scene.add(motes.points);

  const basket = new THREE.Group();
  basket.position.set(-1.68, 0, -2.45);
  addCylinder(basket, 0.42, 0.32, 0.5, [0, 0.25, 0], materials.plankDark, { segments: 16 });
  const firewoodMaterial = new THREE.MeshStandardMaterial({
    map: textures.barkMap,
    color: 0x987657,
    roughness: 1,
  });
  for (let index = 0; index < 6; index += 1) {
    const log = addCylinder(
      basket,
      0.055,
      0.07,
      0.74,
      [-0.18 + (index % 3) * 0.16, 0.46 + Math.floor(index / 3) * 0.12, 0],
      firewoodMaterial,
      { rotation: [0, 0, Math.PI / 2], segments: 7 },
    );
    log.rotation.y = index * 0.3;
  }
  scene.add(basket);

  const hemisphere = new THREE.HemisphereLight(0xffd9b0, 0x37251a, 1.62);
  scene.add(hemisphere);
  const frontKey = new THREE.DirectionalLight(0xffd2a1, 1.92);
  frontKey.position.set(4, 8, 9);
  frontKey.target.position.set(0, 2, -0.4);
  frontKey.castShadow = true;
  frontKey.shadow.mapSize.set(2048, 2048);
  frontKey.shadow.camera.left = -8;
  frontKey.shadow.camera.right = 8;
  frontKey.shadow.camera.top = 8;
  frontKey.shadow.camera.bottom = -8;
  frontKey.shadow.camera.near = 1;
  frontKey.shadow.camera.far = 28;
  frontKey.shadow.bias = -0.00025;
  frontKey.shadow.normalBias = 0.035;
  scene.add(frontKey, frontKey.target);

  const windowLight = new THREE.PointLight(0x9dc9d4, 9, 7, 2);
  windowLight.position.set(0.25, 2.9, -2.35);
  scene.add(windowLight);

  const kitchenLight = new THREE.PointLight(0xffb96e, 10, 6, 2);
  kitchenLight.position.set(-4.75, 2.65, 0.9);
  scene.add(kitchenLight);
  const kitchenPendant = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.2, 0.2, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xd8af71,
      emissive: 0xc47a34,
      emissiveIntensity: 0.82,
      roughness: 0.82,
      side: THREE.DoubleSide,
    }),
  );
  kitchenPendant.position.set(-4.75, 2.68, 0.9);
  scene.add(kitchenPendant);
  const kitchenGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textures.softGlow,
    color: 0xffb86c,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }));
  kitchenGlow.position.set(-4.75, 2.62, 0.9);
  kitchenGlow.scale.set(1.35, 1.35, 1);
  scene.add(kitchenGlow);

  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(
    aspect < 0.7 ? 64 : aspect < 0.95 ? 56 : 46,
    aspect,
    0.1,
    60,
  );
  camera.position.set(0, 4.35, 11.95);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2.22, -0.25);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 9.35;
  controls.maxDistance = 16.2;
  controls.minPolarAngle = 0.82;
  controls.maxPolarAngle = 1.43;
  controls.minAzimuthAngle = -1.0;
  controls.maxAzimuthAngle = 1.0;
  controls.rotateSpeed = 0.4;
  controls.zoomSpeed = 0.58;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.12;
  controls.enabled = false;
  controls.update();

  const interiorPalettes = {
    spring: { wall: 0xd9c8b2, rug: 0xf2e4d8, sky: 0xffe6d8, key: 0xffd8bd },
    summer: { wall: 0xb7c5a8, rug: 0xe6f0df, sky: 0xffefc4, key: 0xffddaa },
    autumn: { wall: 0xc7a17d, rug: 0xf1d2b0, sky: 0xffd1a0, key: 0xffc181 },
    winter: { wall: 0xaab8c1, rug: 0xd8e7ed, sky: 0xd9e9f1, key: 0xc7deea },
  };

  let currentSeason = 'autumn';
  const setSeason = (season) => {
    currentSeason = season;
    drawWindowSeason(room.windowCanvas, season);
    seasonalDecor.setSeason(season);
    seasonalSeating.setSeason(season);
    seasonalBedding.setSeason(season);
    const palette = interiorPalettes[season];
    materials.plasterWarm.color.setHex(palette.wall);
    rug.material.color.setHex(palette.rug);
    hemisphere.color.setHex(palette.sky);
    frontKey.color.setHex(palette.key);
    windowLight.color.setHex(season === 'winter' ? 0xa8cfde : season === 'autumn' ? 0x91b8c1 : 0xa6c8ca);
  };
  setSeason('autumn');

  return {
    scene,
    camera,
    controls,
    setSeason,
    getSeason: () => currentSeason,
    update(elapsed, delta) {
      const flicker =
        0.82 +
        Math.sin(elapsed * 7.2) * 0.08 +
        Math.sin(elapsed * 13.7 + 1.7) * 0.04;
      fireplace.fireLight.intensity = 18 * flicker;
      fireplace.flames.forEach((flame, index) => {
        const data = flame.userData;
        const pulse = 0.78 + Math.sin(elapsed * 8.2 + data.phase + index) * 0.16;
        flame.scale.set(data.baseScale * 0.8 * pulse, data.baseScale * 1.8 * pulse, 1);
        flame.position.x = data.baseX + Math.sin(elapsed * 4.1 + data.phase) * 0.025;
      });
      fireplace.coals.forEach((coal, index) => {
        coal.material.emissiveIntensity = 0.68 + Math.sin(elapsed * 3.2 + index) * 0.16;
      });

      chandelier.light.intensity = 22 * (0.96 + Math.sin(elapsed * 2.2) * 0.03);
      chandelier.bulbs.forEach(({ glow, phase }) => {
        const pulse = 0.62 + Math.sin(elapsed * 2.8 + phase) * 0.12;
        glow.material.opacity = pulse;
      });
      loftBed.bulbs.forEach(({ bulb, glow, phase }) => {
        const pulse = 0.55 + Math.sin(elapsed * 2.1 + phase) * 0.2;
        glow.material.opacity = pulse * 0.65;
        bulb.scale.setScalar(0.9 + pulse * 0.15);
      });

      kitchenLight.intensity = 10 * (0.95 + Math.sin(elapsed * 2.4) * 0.04);
      sideTable.light.intensity = 5 * (0.95 + Math.sin(elapsed * 3.4) * 0.05);
      const cat = scene.getObjectByName('睡猫');
      if (cat) cat.scale.y = 1 + Math.sin(elapsed * 1.2) * 0.018;
      motes.update(elapsed);
    },
  };
}

function createKitchenNook(materials, textures) {
  const random = mulberry32(7621);
  const group = new THREE.Group();
  group.position.set(-5.26, 0, 1.05);
  group.rotation.y = Math.PI / 2;

  addBox(group, [2.85, 0.88, 0.72], [0, 0.45, 0], materials.plankDark);
  addBox(group, [2.96, 0.08, 0.88], [0, 0.93, 0.03], materials.plank);
  for (const x of [-0.94, 0, 0.94]) {
    addBox(group, [0.86, 0.66, 0.04], [x, 0.46, 0.38], materials.plank, { castShadow: false });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 7, 5), materials.brass);
    knob.position.set(x + 0.3, 0.48, 0.43);
    group.add(knob);
  }

  addBox(group, [0.76, 0.025, 0.48], [-0.53, 0.984, 0.03], materials.iron, { castShadow: false });
  const faucet = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 5, 14, Math.PI), materials.brass);
  faucet.position.set(-0.53, 1.11, -0.11);
  faucet.rotation.x = Math.PI / 2;
  group.add(faucet);
  addCylinder(group, 0.018, 0.018, 0.2, [-0.66, 1.03, -0.11], materials.brass, { segments: 7 });

  const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 9), materials.brass);
  kettle.scale.set(1.05, 0.8, 0.9);
  kettle.position.set(0.53, 1.17, 0.03);
  kettle.castShadow = true;
  group.add(kettle);
  const kettleHandle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 5, 14, Math.PI), materials.iron);
  kettleHandle.position.set(0.53, 1.34, 0.03);
  group.add(kettleHandle);
  addCylinder(group, 0.045, 0.06, 0.12, [0.53, 1.31, 0.03], materials.brass, { segments: 8 });

  for (let shelf = 0; shelf < 2; shelf += 1) {
    addBox(group, [2.35, 0.07, 0.36], [0, 1.58 + shelf * 0.62, -0.34], materials.plank);
    for (let index = 0; index < 7; index += 1) {
      const jarColor = index % 3 === 0 ? 0x866647 : index % 3 === 1 ? 0x8e9b72 : 0xb08c61;
      const jarMaterial = new THREE.MeshPhysicalMaterial({
        color: jarColor,
        roughness: 0.22,
        transparent: true,
        opacity: 0.82,
        transmission: 0.08,
      });
      addCylinder(
        group,
        randomRange(random, 0.045, 0.085),
        randomRange(random, 0.055, 0.095),
        randomRange(random, 0.16, 0.3),
        [-0.9 + index * 0.29, 1.76 + shelf * 0.62, -0.24],
        jarMaterial,
        { segments: 9 },
      );
    }
  }

  const copper = new THREE.MeshStandardMaterial({ color: 0x9f5d37, roughness: 0.36, metalness: 0.6 });
  for (let index = 0; index < 3; index += 1) {
    addCylinder(group, 0.12 + index * 0.03, 0.1 + index * 0.025, 0.08, [-0.62 + index * 0.58, 2.46, -0.45], copper, {
      rotation: [Math.PI / 2, 0, 0],
      segments: 12,
    });
  }

  group.name = '厨房操作台';
  return group;
}

function createWindowSeat(materials) {
  const group = new THREE.Group();
  group.position.set(0.25, 0, -2.94);
  addBox(group, [3.4, 0.42, 0.68], [0, 0.38, 0], materials.plankDark);
  addBox(group, [3.62, 0.09, 0.82], [0, 0.62, 0.02], materials.plank);
  addBox(group, [3.28, 0.14, 0.56], [0, 0.72, 0.03], materials.rust, { castShadow: false });
  for (let index = 0; index < 3; index += 1) {
    addBox(group, [0.92, 0.48, 0.12], [-1.06 + index * 1.03, 1.02, -0.26], index % 2 ? materials.linen : materials.gold, {
      rotation: [-0.09, 0, index === 1 ? 0.04 : -0.04],
    });
  }
  const throwBlanket = addBox(group, [0.86, 0.035, 0.55], [0.93, 0.82, 0.04], materials.forest, {
    rotation: [0, 0.1, 0.03],
    castShadow: false,
  });
  throwBlanket.receiveShadow = true;
  for (const x of [-0.62, 0.38]) {
    addBox(group, [0.56, 0.24, 0.06], [x, 0.22, 0.38], materials.plank, { castShadow: false });
    const pull = new THREE.Mesh(new THREE.SphereGeometry(0.025, 7, 5), materials.brass);
    pull.position.set(x, 0.22, 0.43);
    group.add(pull);
  }
  const book1 = addBox(group, [0.42, 0.045, 0.28], [-1.18, 0.82, 0.05], materials.rust, { rotation: [0, 0.2, 0] });
  const book2 = addBox(group, [0.35, 0.04, 0.24], [-1.05, 0.86, 0.08], materials.forest, { rotation: [0, -0.1, 0] });
  book1.castShadow = false;
  book2.castShadow = false;
  group.name = '窗下坐榻';
  return group;
}

function createToyChest(materials) {
  const group = new THREE.Group();
  group.position.set(-4.45, 0, 3.02);
  group.rotation.y = 0.12;
  addBox(group, [1.15, 0.65, 0.62], [0, 0.33, 0], materials.plankDark);
  const lid = addBox(group, [1.18, 0.16, 0.65], [0, 0.7, 0], materials.plank, { rotation: [-0.08, 0, 0] });
  lid.castShadow = true;
  addBox(group, [0.12, 0.16, 0.05], [0, 0.47, 0.33], materials.brass, { castShadow: false });
  const yarnMaterial = new THREE.MeshStandardMaterial({ color: 0xa05c43, roughness: 1 });
  for (let index = 0; index < 3; index += 1) {
    const yarn = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 7), yarnMaterial);
    yarn.position.set(0.85 + index * 0.13, 0.12, 0.12 + (index % 2) * 0.08);
    group.add(yarn);
  }
  group.name = '玩具箱';
  return group;
}

function createLargePlant(materials) {
  const group = new THREE.Group();
  group.position.set(4.92, 0, -2.58);
  addCylinder(group, 0.24, 0.19, 0.44, [0, 0.22, 0], materials.rust, { segments: 14 });
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x425a35, roughness: 1 });
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const height = randomRange(Math.random, 0.55, 1.35);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(randomRange(Math.random, 0.15, 0.26), 1), materials.forest);
    leaf.position.set(Math.cos(angle) * 0.22, height, Math.sin(angle) * 0.22);
    leaf.scale.set(1.8, 0.45, 0.8);
    leaf.rotation.set(angle * 0.4, angle, angle * 0.25);
    group.add(leaf);
  }
  const support = addCylinder(group, 0.018, 0.022, 1.2, [0, 0.9, 0], stemMaterial, { segments: 5 });
  support.castShadow = false;
  group.name = '大型绿植';
  return group;
}
