import * as THREE from 'three';
import { mulberry32, randomRange } from './utils.js';

function addBox(parent, size, position, material, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radiusTop, radiusBottom, height, segments, position, material, rotation = null) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeMaterials(textures) {
  const logMaterials = [
    new THREE.MeshStandardMaterial({
      map: textures.woodMap,
      bumpMap: textures.woodBump,
      bumpScale: 0.045,
      color: 0xc79a72,
      roughness: 0.9,
      metalness: 0,
    }),
    new THREE.MeshStandardMaterial({
      map: textures.woodMap,
      bumpMap: textures.woodBump,
      bumpScale: 0.04,
      color: 0xb4835f,
      roughness: 0.94,
      metalness: 0,
    }),
    new THREE.MeshStandardMaterial({
      map: textures.woodMap,
      bumpMap: textures.woodBump,
      bumpScale: 0.045,
      color: 0xa67858,
      roughness: 0.92,
      metalness: 0,
    }),
  ];

  const plankMaterial = new THREE.MeshStandardMaterial({
    map: textures.plankMap,
    bumpMap: textures.plankBump,
    bumpScale: 0.05,
    color: 0xb08461,
    roughness: 0.88,
  });

  const darkPlankMaterial = new THREE.MeshStandardMaterial({
    map: textures.plankMap,
    bumpMap: textures.plankBump,
    bumpScale: 0.055,
    color: 0x755237,
    roughness: 0.94,
  });

  const roofMaterial = new THREE.MeshStandardMaterial({
    map: textures.roofMap,
    bumpMap: textures.roofBump,
    bumpScale: 0.08,
    color: 0xb6b6a1,
    roughness: 0.96,
    metalness: 0.02,
  });

  const stoneMaterial = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.07,
    color: 0xb0aa94,
    roughness: 1,
  });

  const darkStoneMaterial = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.08,
    color: 0x777568,
    roughness: 1,
  });

  const mossMaterial = new THREE.MeshStandardMaterial({
    color: 0x3f4c2e,
    roughness: 1,
    flatShading: true,
  });

  const ironMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e211d,
    roughness: 0.42,
    metalness: 0.7,
  });

  const brassMaterial = new THREE.MeshStandardMaterial({
    color: 0xb78a4a,
    roughness: 0.35,
    metalness: 0.8,
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xcae0dc,
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.08,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const warmPaneMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc477,
    emissive: 0xff9d47,
    emissiveIntensity: 1.95,
    roughness: 0.48,
    toneMapped: true,
  });

  const curtainMaterial = new THREE.MeshStandardMaterial({
    color: 0x7a5033,
    roughness: 1,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });

  const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x2e2117, roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x526b38, roughness: 0.95, flatShading: true });
  const flowerMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xe17a9b, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xe8c252, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x6f9ed9, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x9c7bc9, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xe58b57, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xc95f68, roughness: 0.8 }),
  ];

  return {
    logMaterials,
    plankMaterial,
    darkPlankMaterial,
    roofMaterial,
    stoneMaterial,
    darkStoneMaterial,
    mossMaterial,
    ironMaterial,
    brassMaterial,
    glassMaterial,
    warmPaneMaterial,
    curtainMaterial,
    soilMaterial,
    leafMaterial,
    flowerMaterials,
  };
}

function createGable(materials) {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-3.48, 0);
  shape.lineTo(3.48, 0);
  shape.lineTo(0, 2.48);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.08);

  const front = new THREE.Mesh(geometry, materials.darkPlankMaterial);
  front.position.set(0, 4.2, 2.72);
  front.castShadow = true;
  front.receiveShadow = true;
  group.add(front);

  const back = front.clone();
  back.position.z = -2.72;
  back.rotation.y = Math.PI;
  group.add(back);

  for (let index = 0; index < 4; index += 1) {
    const width = 5.4 - index * 0.92;
    addBox(group, [width, 0.06, 0.06], [0, 4.52 + index * 0.47, 2.85], materials.ironMaterial, {
      castShadow: false,
    });
  }

  addBox(group, [0.12, 2.42, 0.1], [0, 5.42, 2.88], materials.darkPlankMaterial, { castShadow: false });
  return group;
}

function addFlowerBox(parent, width, materials, random, yOffset) {
  const planter = addBox(
    parent,
    [width + 0.18, 0.22, 0.28],
    [0, yOffset, 0.14],
    materials.darkPlankMaterial,
  );
  planter.castShadow = true;

  addBox(parent, [width, 0.07, 0.2], [0, yOffset + 0.13, 0.14], materials.soilMaterial, {
    castShadow: false,
  });

  for (let index = 0; index < 18; index += 1) {
    const x = randomRange(random, -width * 0.44, width * 0.44);
    const z = randomRange(random, 0.04, 0.2);
    const stemHeight = randomRange(random, 0.08, 0.25);
    addCylinder(parent, 0.01, 0.012, stemHeight, 4, [x, yOffset + 0.15 + stemHeight * 0.5, z], materials.leafMaterial);
    const leaf = new THREE.Mesh(
      new THREE.IcosahedronGeometry(randomRange(random, 0.035, 0.07), 0),
      materials.leafMaterial,
    );
    leaf.position.set(x + randomRange(random, -0.025, 0.025), yOffset + 0.15 + stemHeight, z);
    leaf.scale.set(1.5, 0.45, 1);
    leaf.rotation.z = random() * Math.PI;
    parent.add(leaf);

    if (index % 2 === 0) {
      const bloom = new THREE.Mesh(
        new THREE.SphereGeometry(randomRange(random, 0.035, 0.06), 7, 5),
        materials.flowerMaterials[Math.floor(random() * materials.flowerMaterials.length)],
      );
      bloom.position.copy(leaf.position);
      bloom.position.y += 0.025;
      bloom.scale.y = 0.65;
      parent.add(bloom);
    }
  }
}

function createWindow(materials, textures, specification) {
  const {
    x,
    y,
    z,
    width,
    height,
    rotationY = 0,
    shutters = true,
    flowerBox = true,
    lightIntensity = 12,
  } = specification;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  const random = mulberry32(Math.round((x + 9) * 137 + (z + 7) * 73));

  addBox(group, [width + 0.2, height + 0.2, 0.16], [0, 0, -0.02], materials.darkPlankMaterial);

  const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), materials.warmPaneMaterial.clone());
  pane.position.z = 0.075;
  group.add(pane);

  const curtainWidth = width * 0.22;
  for (const side of [-1, 1]) {
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(curtainWidth, height * 0.92, 1, 3),
      materials.curtainMaterial,
    );
    curtain.position.set(side * (width * 0.35), -0.01, 0.088);
    curtain.rotation.z = side * 0.06;
    group.add(curtain);
  }

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.04, height - 0.04), materials.glassMaterial);
  glass.position.z = 0.13;
  group.add(glass);

  const frameDepth = 0.13;
  addBox(group, [width + 0.24, 0.1, frameDepth], [0, height / 2 + 0.04, 0.15], materials.plankMaterial);
  addBox(group, [width + 0.24, 0.1, frameDepth], [0, -height / 2 - 0.04, 0.15], materials.plankMaterial);
  addBox(group, [0.1, height + 0.2, frameDepth], [-width / 2 - 0.04, 0, 0.15], materials.plankMaterial);
  addBox(group, [0.1, height + 0.2, frameDepth], [width / 2 + 0.04, 0, 0.15], materials.plankMaterial);
  addBox(group, [0.065, height, frameDepth * 0.7], [0, 0, 0.17], materials.darkPlankMaterial, {
    castShadow: false,
  });
  addBox(group, [width, 0.065, frameDepth * 0.7], [0, 0, 0.17], materials.darkPlankMaterial, {
    castShadow: false,
  });

  if (shutters) {
    for (const side of [-1, 1]) {
      const shutterX = side * (width / 2 + 0.34);
      addBox(group, [0.52, height + 0.17, 0.09], [shutterX, 0, 0.1], materials.darkPlankMaterial);
      for (let slat = -3; slat <= 3; slat += 1) {
        addBox(group, [0.45, 0.035, 0.055], [shutterX, slat * (height / 8), 0.16], materials.plankMaterial, {
          castShadow: false,
        });
      }
      addBox(group, [0.04, height + 0.1, 0.06], [shutterX + side * 0.22, 0, 0.17], materials.ironMaterial, {
        castShadow: false,
      });
    }
  }

  if (flowerBox) addFlowerBox(group, width, materials, random, -height / 2 - 0.3);

  const light = new THREE.PointLight(0xffad66, lightIntensity, 8.5, 2);
  light.position.set(0, 0.08, 0.45);
  group.add(light);

  const glowMaterial = new THREE.SpriteMaterial({
    map: textures.softGlow,
    color: 0xffad66,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.scale.set(width * 3.2, height * 3.1, 1);
  glow.position.z = 0.22;
  group.add(glow);

  return { group, pane, light, glow };
}

function createDoor(materials) {
  const group = new THREE.Group();
  group.position.set(-1.55, 1.54, 2.87);

  addBox(group, [1.46, 2.38, 0.12], [0, 0, -0.015], materials.darkPlankMaterial);
  const boardColors = [0x9c6c49, 0xa87852, 0x8d5e3e, 0xa06f49, 0x966746];
  for (let index = 0; index < 6; index += 1) {
    const material = materials.darkPlankMaterial.clone();
    material.color.setHex(boardColors[index % boardColors.length]);
    addBox(group, [0.185, 2.22, 0.11], [-0.48 + index * 0.192, 0, 0.08], material);
  }

  addBox(group, [1.17, 0.13, 0.08], [0, 0.72, 0.16], materials.darkPlankMaterial);
  addBox(group, [1.17, 0.13, 0.08], [0, -0.72, 0.16], materials.darkPlankMaterial);

  addBox(group, [0.66, 0.48, 0.08], [0, 0.55, 0.17], materials.ironMaterial, { castShadow: false });
  const doorPane = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.36), materials.warmPaneMaterial.clone());
  doorPane.material.emissiveIntensity = 1.1;
  doorPane.position.set(0, 0.55, 0.23);
  group.add(doorPane);
  for (const x of [-0.18, 0, 0.18]) {
    addBox(group, [0.035, 0.44, 0.04], [x, 0.55, 0.25], materials.darkPlankMaterial, { castShadow: false });
  }
  addBox(group, [0.6, 0.035, 0.04], [0, 0.55, 0.25], materials.darkPlankMaterial, { castShadow: false });

  addBox(group, [0.04, 0.28, 0.035], [0.4, 0.04, 0.27], materials.ironMaterial, { castShadow: false });
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), materials.brassMaterial);
  handle.position.set(0.38, -0.03, 0.32);
  handle.castShadow = true;
  group.add(handle);

  for (const yPosition of [-0.67, 0.67]) {
    addBox(group, [0.24, 0.05, 0.035], [-0.44, yPosition, 0.26], materials.ironMaterial, { castShadow: false });
  }

  addBox(group, [1.66, 0.16, 0.26], [0, 1.25, 0.08], materials.plankMaterial);
  addBox(group, [0.15, 2.46, 0.22], [-0.79, 0.01, 0.04], materials.plankMaterial);
  addBox(group, [0.15, 2.46, 0.22], [0.79, 0.01, 0.04], materials.plankMaterial);

  const wreath = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.055, 6, 20),
    new THREE.MeshStandardMaterial({ color: 0x455d34, roughness: 0.95, flatShading: true }),
  );
  wreath.position.set(0, 0.88, 0.27);
  wreath.castShadow = true;
  group.add(wreath);
  const berryMaterial = new THREE.MeshStandardMaterial({ color: 0x8f3c31, roughness: 0.7 });
  for (let index = 0; index < 7; index += 1) {
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), berryMaterial);
    const angle = (index / 7) * Math.PI * 2;
    berry.position.set(Math.cos(angle) * 0.22, 0.88 + Math.sin(angle) * 0.22, 0.33);
    group.add(berry);
  }

  return group;
}

function createStringLights(materials, textures) {
  const group = new THREE.Group();
  const lampCount = 13;
  const points = [];
  for (let index = 0; index <= 14; index += 1) {
    const t = index / 14;
    const x = THREE.MathUtils.lerp(-3.52, 3.52, t);
    const sag = Math.sin(t * Math.PI) * 0.21;
    points.push(new THREE.Vector3(x, 3.34 - sag, 4.98));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, 0.008, 4, false),
    new THREE.MeshStandardMaterial({ color: 0x161812, roughness: 0.75 }),
  );
  group.add(wire);

  const bulbs = [];
  for (let index = 0; index < lampCount; index += 1) {
    const t = (index + 0.65) / (lampCount + 0.3);
    const position = curve.getPoint(t);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 1.45, 0.55),
      toneMapped: false,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.037, 8, 6), material);
    bulb.position.copy(position);
    bulb.position.y -= 0.055;
    group.add(bulb);

    const glowMaterial = new THREE.SpriteMaterial({
      map: textures.softGlow,
      color: 0xffbd72,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.position.copy(bulb.position);
    glow.position.z += 0.01;
    glow.scale.setScalar(0.48);
    group.add(glow);

    addCylinder(group, 0.035, 0.045, 0.06, 7, [position.x, position.y + 0.008, position.z], materials.ironMaterial);
    bulbs.push({
      bulb,
      glow,
      phase: index * 1.37 + t * 4.2,
      baseGlow: 0.45 + (index % 3) * 0.04,
    });
  }

  return { group, bulbs };
}

function createLantern(materials, textures) {
  const pivot = new THREE.Group();
  pivot.position.set(-0.05, 3.27, 4.77);

  addCylinder(pivot, 0.008, 0.008, 0.33, 5, [0, -0.165, 0], materials.ironMaterial);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 5, 14, Math.PI), materials.ironMaterial);
  hook.position.set(0, 0.04, 0);
  hook.rotation.z = Math.PI;
  pivot.add(hook);

  const body = new THREE.Group();
  body.position.y = -0.54;
  pivot.add(body);

  addCylinder(body, 0.19, 0.2, 0.045, 10, [0, 0.24, 0], materials.ironMaterial);
  addCylinder(body, 0.19, 0.2, 0.045, 10, [0, -0.24, 0], materials.ironMaterial);
  addCylinder(body, 0.23, 0.09, 0.08, 8, [0, 0.3, 0], materials.ironMaterial);

  const lanternGlassMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.8, 1.55, 0.54),
    transparent: true,
    opacity: 0.86,
    toneMapped: false,
  });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 12, 1, true), lanternGlassMaterial);
  glass.position.y = 0;
  body.add(glass);

  for (const x of [-0.17, 0.17]) {
    for (const z of [-0.17, 0.17]) {
      addBox(body, [0.022, 0.5, 0.022], [x, 0, z], materials.ironMaterial);
    }
  }

  const light = new THREE.PointLight(0xffaa56, 17, 6.5, 2);
  light.position.set(0, -0.02, 0.06);
  body.add(light);

  const glowMaterial = new THREE.SpriteMaterial({
    map: textures.softGlow,
    color: 0xffb15e,
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.scale.set(1.35, 1.35, 1);
  glow.position.y = -0.02;
  body.add(glow);

  return { pivot, body, light, glass };
}

export function createCabin(textures) {
  const materials = makeMaterials(textures);
  const group = new THREE.Group();
  group.name = '林间木屋';
  const random = mulberry32(2531);

  // 石基与室内遮光体块
  addBox(group, [7.0, 0.46, 5.66], [0, 0.23, 0], materials.stoneMaterial);
  addBox(group, [6.42, 3.92, 5.08], [0, 2.3, 0], materials.darkPlankMaterial);

  // 原木墙体
  const frontLogGeometry = new THREE.CylinderGeometry(0.195, 0.215, 7.26, 14, 1, false);
  const sideLogGeometry = new THREE.CylinderGeometry(0.195, 0.215, 5.88, 14, 1, false);
  for (let index = 0; index < 10; index += 1) {
    const y = 0.62 + index * 0.373;
    for (const z of [-2.69, 2.69]) {
      const log = new THREE.Mesh(frontLogGeometry, materials.logMaterials[index % 3]);
      log.position.set(0, y, z);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = index * 0.035;
      log.castShadow = true;
      log.receiveShadow = true;
      group.add(log);
    }
    for (const x of [-3.35, 3.35]) {
      const log = new THREE.Mesh(sideLogGeometry, materials.logMaterials[(index + 1) % 3]);
      log.position.set(x, y, 0);
      log.rotation.x = Math.PI / 2;
      log.rotation.z = index * 0.028;
      log.castShadow = true;
      log.receiveShadow = true;
      group.add(log);
    }
  }

  // 原木角落的端面层次
  for (const x of [-3.35, 3.35]) {
    for (const z of [-2.69, 2.69]) {
      addCylinder(group, 0.225, 0.225, 0.1, 14, [x, 0.62, z], materials.logMaterials[1], [Math.PI / 2, 0, 0]);
    }
  }

  group.add(createGable(materials));

  // 双坡屋顶
  const eaveY = 4.24;
  const ridgeY = 6.7;
  const halfSpan = 4.46;
  const rise = ridgeY - eaveY;
  const roofAngle = Math.atan2(rise, halfSpan);
  const slopeLength = Math.hypot(rise, halfSpan);
  const roofGeometry = new THREE.BoxGeometry(slopeLength + 0.24, 0.2, 7.04);

  const rightRoof = new THREE.Mesh(roofGeometry, materials.roofMaterial);
  rightRoof.position.set(halfSpan * 0.5, (eaveY + ridgeY) * 0.5, 0);
  rightRoof.rotation.z = -roofAngle;
  rightRoof.castShadow = true;
  rightRoof.receiveShadow = true;
  group.add(rightRoof);

  const leftRoof = rightRoof.clone();
  leftRoof.position.x *= -1;
  leftRoof.rotation.z = roofAngle;
  group.add(leftRoof);

  addBox(group, [0.38, 0.19, 7.14], [0, 6.71, 0], materials.darkPlankMaterial);
  addBox(group, [0.13, 0.28, 7.12], [-4.43, 4.3, 0], materials.darkPlankMaterial);
  addBox(group, [0.13, 0.28, 7.12], [4.43, 4.3, 0], materials.darkPlankMaterial);

  for (const z of [-3.52, 3.52]) {
    for (const side of [-1, 1]) {
      addBox(
        group,
        [slopeLength + 0.2, 0.16, 0.11],
        [side * halfSpan * 0.5, (eaveY + ridgeY) * 0.5 + 0.13, z],
        materials.darkPlankMaterial,
        { rotation: [0, 0, side === 1 ? -roofAngle : roofAngle] },
      );
    }
  }

  const gutterMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d302b,
    roughness: 0.5,
    metalness: 0.55,
  });
  addCylinder(group, 0.075, 0.075, 7.1, 10, [-4.48, 4.29, 0], gutterMaterial, [Math.PI / 2, 0, 0]);
  addCylinder(group, 0.075, 0.075, 7.1, 10, [4.48, 4.29, 0], gutterMaterial, [Math.PI / 2, 0, 0]);

  // 屋脊与坡面上的苔藓
  const mossGeometry = new THREE.IcosahedronGeometry(0.18, 0);
  for (let index = 0; index < 38; index += 1) {
    const x = (random() > 0.5 ? 1 : -1) * randomRange(random, 0.65, 4.1);
    const z = randomRange(random, -3.25, 3.25);
    const y = ridgeY - Math.abs(x) * (rise / halfSpan) + 0.17;
    const moss = new THREE.Mesh(mossGeometry, materials.mossMaterial);
    moss.position.set(x, y, z);
    moss.scale.set(randomRange(random, 0.7, 1.8), randomRange(random, 0.14, 0.34), randomRange(random, 0.55, 1.35));
    moss.rotation.set(random() * 0.3, random() * Math.PI, (x > 0 ? -1 : 1) * roofAngle);
    moss.castShadow = false;
    group.add(moss);
  }

  // 石砌烟囱
  addBox(group, [0.82, 4.55, 0.84], [2.98, 2.72, -1.24], materials.stoneMaterial);
  addBox(group, [0.7, 1.8, 0.72], [2.98, 5.83, -1.24], materials.stoneMaterial);
  addBox(group, [1.04, 0.16, 1.05], [2.98, 6.72, -1.24], materials.darkStoneMaterial);
  addBox(group, [0.82, 0.16, 0.82], [2.98, 6.87, -1.24], materials.stoneMaterial);
  addCylinder(group, 0.23, 0.27, 0.18, 10, [2.98, 6.99, -1.24], materials.ironMaterial);

  // 门窗与暖光
  const windows = [];
  const frontWindow = createWindow(materials, textures, {
    x: 1.38,
    y: 2.24,
    z: 2.9,
    width: 1.48,
    height: 1.24,
    lightIntensity: 10,
  });
  group.add(frontWindow.group);
  windows.push(frontWindow);

  const sideWindow = createWindow(materials, textures, {
    x: 3.49,
    y: 2.25,
    z: 0.36,
    width: 1.14,
    height: 1.14,
    rotationY: Math.PI / 2,
    lightIntensity: 7,
  });
  group.add(sideWindow.group);
  windows.push(sideWindow);

  const backWindow = createWindow(materials, textures, {
    x: 0.55,
    y: 2.25,
    z: -2.9,
    width: 1.2,
    height: 1.02,
    rotationY: Math.PI,
    lightIntensity: 7,
    flowerBox: false,
  });
  group.add(backWindow.group);
  windows.push(backWindow);

  group.add(createDoor(materials));

  // 门廊基础
  addBox(group, [7.48, 0.26, 2.28], [0, 0.15, 3.93], materials.darkStoneMaterial);
  const porchMaterials = [materials.plankMaterial, materials.plankMaterial.clone(), materials.plankMaterial.clone()];
  porchMaterials[1].color.setHex(0x9a7152);
  porchMaterials[2].color.setHex(0x8d6548);
  for (let index = 0; index < 39; index += 1) {
    addBox(
      group,
      [0.183, 0.07, 2.05],
      [-3.57 + index * 0.188, 0.33, 3.92],
      porchMaterials[index % 3],
    );
  }

  // 门廊立柱、横梁与雨棚
  for (const x of [-3.45, 3.45]) {
    addBox(group, [0.23, 3.22, 0.23], [x, 1.99, 4.9], materials.darkPlankMaterial);
  }
  addBox(group, [7.12, 0.2, 0.24], [0, 3.5, 4.86], materials.darkPlankMaterial);
  const awning = addBox(group, [7.68, 0.16, 2.88], [0, 3.72, 3.87], materials.roofMaterial, {
    rotation: [0.17, 0, 0],
  });
  awning.castShadow = true;

  for (let index = 0; index < 8; index += 1) {
    addBox(
      group,
      [0.075, 0.12, 2.64],
      [-3.2 + index * 0.92, 3.53, 3.9],
      materials.darkPlankMaterial,
      { rotation: [0.17, 0, 0], castShadow: false },
    );
  }

  // 前缘与两侧栏杆
  for (const x of [-3.4, -1.22, 1.22, 3.4]) {
    addBox(group, [0.11, 1.03, 0.11], [x, 0.88, 4.9], materials.darkPlankMaterial);
  }
  addBox(group, [2.16, 0.11, 0.12], [-2.31, 1.36, 4.9], materials.plankMaterial);
  addBox(group, [2.16, 0.11, 0.12], [2.31, 1.36, 4.9], materials.plankMaterial);
  addBox(group, [2.12, 0.08, 0.09], [-2.31, 0.66, 4.9], materials.darkPlankMaterial);
  addBox(group, [2.12, 0.08, 0.09], [2.31, 0.66, 4.9], materials.darkPlankMaterial);

  for (const side of [-1, 1]) {
    for (let index = 0; index < 6; index += 1) {
      const x = side * (1.43 + index * 0.33);
      addBox(group, [0.045, 0.63, 0.055], [x, 1.02, 4.9], materials.darkPlankMaterial, {
        castShadow: false,
      });
    }
    addBox(group, [0.12, 0.1, 2.0], [side * 3.39, 1.36, 3.92], materials.plankMaterial);
    for (let index = 0; index < 5; index += 1) {
      addBox(group, [0.055, 0.63, 0.045], [side * 3.39, 1.02, 3.03 + index * 0.44], materials.darkPlankMaterial, {
        castShadow: false,
      });
    }
  }

  // 木台阶
  addBox(group, [2.32, 0.13, 0.48], [0, 0.27, 5.18], materials.plankMaterial);
  addBox(group, [2.54, 0.13, 0.48], [0, 0.16, 5.55], materials.darkPlankMaterial);
  addBox(group, [2.74, 0.12, 0.48], [0, 0.065, 5.9], materials.plankMaterial);
  addBox(group, [1.1, 0.025, 0.58], [-1.55, 0.39, 3.19], materials.darkPlankMaterial, { castShadow: false });

  // 门廊长凳与随手搭着的毯子
  const bench = new THREE.Group();
  bench.position.set(-2.72, 0.36, 3.68);
  addBox(bench, [1.15, 0.12, 0.42], [0, 0.48, 0], materials.plankMaterial);
  addBox(bench, [1.15, 0.55, 0.1], [0, 0.82, -0.22], materials.darkPlankMaterial, {
    rotation: [-0.08, 0, 0],
  });
  for (const x of [-0.46, 0.46]) {
    addBox(bench, [0.1, 0.52, 0.1], [x, 0.23, -0.11], materials.darkPlankMaterial);
    addBox(bench, [0.1, 0.52, 0.1], [x, 0.23, 0.11], materials.darkPlankMaterial);
  }
  const blanketMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5b3f,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  addBox(bench, [0.48, 0.04, 0.44], [0.25, 0.56, 0], blanketMaterial, { rotation: [0, 0.03, 0] });
  addBox(bench, [0.48, 0.24, 0.035], [0.25, 0.65, 0.22], blanketMaterial, {
    rotation: [0, 0, 0.02],
    castShadow: false,
  });

  // 在门廊上蜷着睡的小猫
  const cat = new THREE.Group();
  const ginger = new THREE.MeshStandardMaterial({ color: 0xaa6f40, roughness: 1 });
  const gingerDark = new THREE.MeshStandardMaterial({ color: 0x6f4329, roughness: 1 });
  const catBody = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 7), ginger);
  catBody.scale.set(1.45, 0.68, 0.92);
  catBody.castShadow = true;
  cat.add(catBody);
  const catHead = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 7), ginger);
  catHead.position.set(-0.2, 0.07, 0.04);
  catHead.scale.set(0.9, 0.82, 0.88);
  catHead.castShadow = true;
  cat.add(catHead);
  for (const z of [-0.055, 0.055]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 4), gingerDark);
    ear.position.set(-0.24, 0.18, z);
    ear.rotation.z = 0.16;
    cat.add(ear);
  }
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0x784a2e, roughness: 1 });
  for (const x of [-0.03, 0.08, 0.15]) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 4, 12, Math.PI), stripeMaterial);
    stripe.position.set(x, 0.06, 0);
    stripe.rotation.set(Math.PI / 2, 0, 0);
    stripe.scale.z = 0.6;
    cat.add(stripe);
  }
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.22, 0, 0.02),
    new THREE.Vector3(0.36, -0.04, 0.12),
    new THREE.Vector3(0.27, -0.06, 0.22),
    new THREE.Vector3(0.11, -0.06, 0.18),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 10, 0.025, 4, false), gingerDark);
  cat.add(tail);
  cat.position.set(-2.65, 1.01, 3.64);
  group.add(bench, cat);

  // 门边的陶盆与绿植
  const terracotta = new THREE.MeshStandardMaterial({ color: 0x84503a, roughness: 0.94 });
  const potPositions = [
    [-3.05, 0.61, 4.44],
    [2.86, 0.61, 3.04],
  ];
  for (const [x, y, z] of potPositions) {
    addCylinder(group, 0.16, 0.22, 0.36, 12, [x, y, z], terracotta);
    for (let index = 0; index < 13; index += 1) {
      const angle = random() * Math.PI * 2;
      const height = randomRange(random, 0.22, 0.62);
      const distance = randomRange(random, 0.02, 0.22);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(randomRange(random, 0.045, 0.09), 0), materials.leafMaterial);
      leaf.position.set(x + Math.cos(angle) * distance, y + 0.18 + height, z + Math.sin(angle) * distance);
      leaf.scale.set(1.8, 0.42, 0.8);
      leaf.rotation.set(random() * 0.7, angle, randomRange(random, -0.5, 0.5));
      group.add(leaf);
    }
  }

  // 右侧柴火架
  addBox(group, [0.82, 0.09, 1.54], [3.88, 0.42, 1.35], materials.darkPlankMaterial);
  addBox(group, [0.08, 1.18, 0.09], [3.48, 0.93, 0.63], materials.darkPlankMaterial);
  addBox(group, [0.08, 1.18, 0.09], [3.48, 0.93, 2.07], materials.darkPlankMaterial);
  const firewoodMaterial = new THREE.MeshStandardMaterial({
    map: textures.barkMap,
    color: 0x9a7a5d,
    roughness: 0.96,
  });
  const cutWoodMaterial = new THREE.MeshStandardMaterial({ color: 0x9b7952, roughness: 1 });
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.095, 1.26, 8),
        [firewoodMaterial, cutWoodMaterial, cutWoodMaterial],
      );
      log.position.set(3.83 + column * 0.17, 0.58 + row * 0.17, 1.34 + randomRange(random, -0.1, 0.1));
      log.rotation.set(Math.PI / 2, randomRange(random, -0.05, 0.05), 0);
      log.castShadow = true;
      group.add(log);
    }
  }

  // 门廊串灯与提灯
  const stringLights = createStringLights(materials, textures);
  group.add(stringLights.group);
  const lantern = createLantern(materials, textures);
  group.add(lantern.pivot);

  const pathGlow = new THREE.PointLight(0xffa25a, 8, 7, 2);
  pathGlow.position.set(0, 1.05, 5.45);
  group.add(pathGlow);

  // 原木上的苔藓与藤蔓
  for (let index = 0; index < 9; index += 1) {
    const patch = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), materials.mossMaterial);
    patch.position.set(randomRange(random, -3.0, 3.0), randomRange(random, 0.66, 1.8), 2.9);
    patch.scale.set(randomRange(random, 1.2, 2.5), 0.32, 0.72);
    patch.rotation.z = random() * Math.PI;
    group.add(patch);
  }

  for (let index = 0; index < 18; index += 1) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(randomRange(random, 0.035, 0.07), 0), materials.leafMaterial);
    leaf.position.set(
      3.47 + randomRange(random, -0.05, 0.08),
      randomRange(random, 0.55, 2.6),
      4.9 + randomRange(random, -0.05, 0.03),
    );
    leaf.scale.set(1.8, 0.5, 0.8);
    leaf.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    group.add(leaf);
  }

  return {
    group,
    windows,
    stringLights,
    lantern,
    smokeTip: new THREE.Vector3(2.98, 7.04, -1.24),
  };
}
