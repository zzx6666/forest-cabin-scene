import * as THREE from 'three';
import { mulberry32, randomRange, terrainHeight } from './utils.js';

function createSky(textures) {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(120, 48, 32);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x0a1a23) },
      uMid: { value: new THREE.Color(0x35545a) },
      uHorizon: { value: new THREE.Color(0xc18c6e) },
      uSunDirection: { value: new THREE.Vector3(-0.56, 0.1, -0.82).normalize() },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uSunDirection;
      varying vec3 vDirection;

      void main() {
        vec3 direction = normalize(vDirection);
        float height = direction.y;
        vec3 color = mix(uHorizon, uMid, smoothstep(-0.04, 0.2, height));
        color = mix(color, uZenith, smoothstep(0.17, 0.78, height));

        float horizonBand = exp(-abs(height) * 14.0) * 0.06;
        color += vec3(0.95, 0.55, 0.32) * horizonBand;

        float sunHalo = pow(max(dot(direction, uSunDirection), 0.0), 24.0);
        float wideHalo = pow(max(dot(direction, uSunDirection), 0.0), 5.0);
        color += vec3(1.0, 0.43, 0.18) * sunHalo * 0.24;
        color += vec3(0.55, 0.24, 0.12) * wideHalo * 0.07;

        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        color += (dither - 0.5) / 255.0;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.renderOrder = -100;
  group.add(sky);

  const random = mulberry32(20401);
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  for (let index = 0; index < 520; index += 1) {
    const azimuth = random() * Math.PI * 2;
    const height = Math.pow(random(), 0.68) * 0.92 + 0.06;
    const horizontal = Math.sqrt(1 - height * height);
    const radius = 92;
    positions.push(
      Math.cos(azimuth) * horizontal * radius,
      height * radius,
      Math.sin(azimuth) * horizontal * radius,
    );
    const brightness = randomRange(random, 0.45, 1);
    color.setRGB(brightness * 0.78, brightness * 0.85, brightness);
    colors.push(color.r, color.g, color.b);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const starMaterial = new THREE.PointsMaterial({
    map: textures.softGlow,
    size: 0.46,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    fog: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  group.add(stars);

  const sunsetGlowMaterial = new THREE.SpriteMaterial({
    map: textures.softGlow,
    color: 0xd78e5d,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const sunsetGlow = new THREE.Sprite(sunsetGlowMaterial);
  sunsetGlow.position.set(-54, 9, -77);
  sunsetGlow.scale.set(38, 38, 1);
  group.add(sunsetGlow);

  group.name = '暮色天空';
  return { group, material, stars, sunsetGlow };
}

function createMist(textures) {
  const random = mulberry32(21841);
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const layers = [];
  for (let index = 0; index < 16; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = randomRange(random, 8, 28);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const material = new THREE.MeshBasicMaterial({
      map: textures.softGlow,
      color: index % 3 === 0 ? 0xb8c8bb : 0x90a89d,
      transparent: true,
      opacity: randomRange(random, 0.018, 0.042),
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.set(-Math.PI / 2, 0, random() * Math.PI);
    mesh.scale.set(randomRange(random, 7, 17), randomRange(random, 4, 9), 1);
    mesh.position.set(x, terrainHeight(x, z) + randomRange(random, 0.2, 1.1), z);
    mesh.renderOrder = 2;
    group.add(mesh);
    layers.push({
      mesh,
      baseX: x,
      baseZ: z,
      phase: random() * Math.PI * 2,
      speed: randomRange(random, 0.008, 0.02),
      baseOpacity: material.opacity,
    });
  }
  group.name = '林间薄雾';
  return { group, layers };
}

function createFireflies() {
  const random = mulberry32(23609);
  const count = 92;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const base = [];
  const amplitude = [];
  const speeds = [];
  const palette = [
    new THREE.Color(0xffc56e),
    new THREE.Color(0xffdda0),
    new THREE.Color(0xbddd83),
  ];

  for (let index = 0; index < count; index += 1) {
    let x;
    let z;
    if (index < 34) {
      x = randomRange(random, -5.4, 5.4);
      z = randomRange(random, 4.2, 12.5);
    } else {
      const angle = random() * Math.PI * 2;
      const radius = randomRange(random, 5, 19);
      x = Math.sin(angle) * radius;
      z = Math.cos(angle) * radius;
    }
    const y = terrainHeight(x, z) + randomRange(random, 0.45, 3.6);
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    base.push(new THREE.Vector3(x, y, z));
    amplitude.push(new THREE.Vector3(
      randomRange(random, 0.14, 0.7),
      randomRange(random, 0.12, 0.42),
      randomRange(random, 0.14, 0.7),
    ));
    speeds.push(randomRange(random, 0.22, 0.68));
    phases[index] = random() * Math.PI * 2;
    sizes[index] = randomRange(random, 0.3, 0.72);
    const color = palette[Math.floor(random() * palette.length)];
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uVisibility: { value: 1 },
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = aColor;
        vAlpha = 0.48 + 0.52 * pow(0.5 + 0.5 * sin(uTime * 1.8 + aPhase * 3.1), 2.0);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (106.0 / max(2.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uVisibility;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float distanceToCenter = length(gl_PointCoord - vec2(0.5));
        if (distanceToCenter > 0.5) discard;
        float halo = smoothstep(0.5, 0.02, distanceToCenter);
        float core = smoothstep(0.18, 0.0, distanceToCenter);
        vec3 color = vColor * (0.65 + core * 1.8);
        gl_FragColor = vec4(color, halo * halo * vAlpha * 0.85 * uVisibility);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = '萤火虫';

  return {
    points,
    material,
    base,
    amplitude,
    speeds,
    phases,
    update(elapsed) {
      material.uniforms.uTime.value = elapsed;
      const attribute = points.geometry.attributes.position;
      for (let index = 0; index < count; index += 1) {
        const phase = phases[index];
        const speed = speeds[index];
        attribute.array[index * 3] = base[index].x + Math.sin(elapsed * speed + phase) * amplitude[index].x;
        attribute.array[index * 3 + 1] = base[index].y + Math.sin(elapsed * speed * 0.72 + phase * 1.3) * amplitude[index].y;
        attribute.array[index * 3 + 2] = base[index].z + Math.cos(elapsed * speed * 0.84 + phase) * amplitude[index].z;
      }
      attribute.needsUpdate = true;
    },
  };
}

function createSmoke(textures, origin) {
  const random = mulberry32(25913);
  const count = 46;
  const positions = new Float32Array(count * 3);
  const opacities = new Float32Array(count);
  const sizes = new Float32Array(count);
  const particles = [];

  for (let index = 0; index < count; index += 1) {
    const life = randomRange(random, 5.2, 9.4);
    const age = random() * life;
    const phase = random() * Math.PI * 2;
    const driftX = randomRange(random, -0.55, 0.75);
    const driftZ = randomRange(random, -0.42, 0.38);
    particles.push({ life, age, phase, driftX, driftZ, speed: randomRange(random, 0.8, 1.22) });
    positions[index * 3] = origin.x;
    positions[index * 3 + 1] = origin.y;
    positions[index * 3 + 2] = origin.z;
    opacities[index] = 0;
    sizes[index] = 0.3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uMap: { value: textures.smoke },
      uPixelRatio: { value: 1 },
    },
    vertexShader: `
      attribute float aOpacity;
      attribute float aSize;
      varying float vOpacity;
      uniform float uPixelRatio;
      void main() {
        vOpacity = aOpacity;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio * (360.0 / max(2.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying float vOpacity;
      void main() {
        float alpha = texture2D(uMap, gl_PointCoord).a;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vec3(0.63, 0.67, 0.63), alpha * vOpacity);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = '炊烟';

  return {
    points,
    material,
    update(delta) {
      const positionAttribute = geometry.attributes.position;
      const opacityAttribute = geometry.attributes.aOpacity;
      const sizeAttribute = geometry.attributes.aSize;
      for (let index = 0; index < count; index += 1) {
        const particle = particles[index];
        particle.age += delta * particle.speed;
        if (particle.age > particle.life) {
          particle.age = random() * 0.35;
          particle.phase = random() * Math.PI * 2;
          particle.driftX = randomRange(random, -0.55, 0.75);
          particle.driftZ = randomRange(random, -0.42, 0.38);
        }
        const progress = particle.age / particle.life;
        const rise = progress * 6.2;
        const sway = Math.sin(particle.phase + progress * 4.6) * (0.12 + progress * 0.6);
        positionAttribute.array[index * 3] = origin.x + sway + particle.driftX * progress;
        positionAttribute.array[index * 3 + 1] = origin.y + rise;
        positionAttribute.array[index * 3 + 2] = origin.z + Math.cos(particle.phase + progress * 3.2) * (0.08 + progress * 0.38) + particle.driftZ * progress;
        opacityAttribute.array[index] = Math.pow(Math.sin(progress * Math.PI), 1.15) * 0.24;
        sizeAttribute.array[index] = 0.5 + progress * 2.2;
      }
      positionAttribute.needsUpdate = true;
      opacityAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
    },
  };
}

function createDust(textures) {
  const random = mulberry32(27449);
  const count = 190;
  const positions = new Float32Array(count * 3);
  const base = [];
  const phases = [];
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 15;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const y = terrainHeight(x, z) + randomRange(random, 0.25, 4.4);
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
    color: 0xffd4a2,
    size: 0.03,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = '浮尘';

  return {
    points,
    update(elapsed) {
      const attribute = geometry.attributes.position;
      for (let index = 0; index < count; index += 1) {
        const phase = phases[index];
        const basePoint = base[index];
        attribute.array[index * 3] = basePoint.x + Math.sin(elapsed * 0.11 + phase) * 0.55;
        attribute.array[index * 3 + 1] = basePoint.y + Math.sin(elapsed * 0.16 + phase * 1.7) * 0.35;
        attribute.array[index * 3 + 2] = basePoint.z + Math.cos(elapsed * 0.09 + phase) * 0.48;
      }
      attribute.needsUpdate = true;
    },
  };
}

function createFallingLeaves(textures) {
  const random = mulberry32(28181);
  const count = 190;
  const states = [];
  const palette = [
    new THREE.Color(0xd9a64f),
    new THREE.Color(0xc97c35),
    new THREE.Color(0xb34f36),
    new THREE.Color(0x8e6537),
    new THREE.Color(0xd0b15c),
  ];
  const geometry = new THREE.PlaneGeometry(0.18, 0.3);
  const material = new THREE.MeshStandardMaterial({
    map: textures.leaf,
    color: 0xffffff,
    roughness: 0.9,
    side: THREE.DoubleSide,
    alphaTest: 0.2,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    emissive: 0x3a1c08,
    emissiveIntensity: 0.28,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const x = randomRange(random, -22, 22);
    const z = randomRange(random, -14, 20);
    const y = randomRange(random, 1.4, 12.8);
    const scale = randomRange(random, 0.62, 1.35);
    const leafColor = palette[index % palette.length];
    const state = {
      x,
      y,
      z,
      scale,
      speed: randomRange(random, 0.32, 0.78),
      phase: random() * Math.PI * 2,
      sway: randomRange(random, 0.38, 0.95),
      drift: randomRange(random, -0.16, 0.16),
      spin: randomRange(random, 0.65, 1.65),
    };
    states.push(state);
    dummy.position.set(state.x, state.y, state.z);
    dummy.rotation.set(state.phase, state.phase * 1.7, state.phase * 0.63);
    dummy.scale.setScalar(state.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, leafColor);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.name = '飘落的树叶';

  return {
    points: mesh,
    update(delta, elapsed) {
      for (let index = 0; index < count; index += 1) {
        const state = states[index];
        state.y -= delta * state.speed;
        state.x += (Math.sin(elapsed * 0.8 + state.phase) * state.sway + state.drift) * delta;
        state.z += Math.cos(elapsed * 0.57 + state.phase * 0.84) * delta * 0.24;
        const floor = terrainHeight(state.x, state.z) + 0.08;
        if (state.y < floor) {
          state.y = randomRange(random, 9.5, 15.5);
          state.x = randomRange(random, -22, 22);
          state.z = randomRange(random, -14, 20);
        }
        dummy.position.set(state.x, state.y, state.z);
        dummy.rotation.set(
          elapsed * state.spin + state.phase,
          elapsed * state.spin * 0.72 + state.phase * 1.7,
          elapsed * state.spin * 0.43 + state.phase * 0.63,
        );
        dummy.scale.setScalar(state.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function createAtmosphere(scene, textures, smokeOrigin) {
  const sky = createSky(textures);
  scene.add(sky.group);

  const mist = createMist(textures);
  scene.add(mist.group);

  const fireflies = createFireflies();
  scene.add(fireflies.points);

  const smoke = createSmoke(textures, smokeOrigin);
  scene.add(smoke.points);

  const dust = createDust(textures);
  scene.add(dust.points);

  const leaves = createFallingLeaves(textures);
  scene.add(leaves.points);

  const seasonPalettes = {
    spring: {
      zenith: 0x13242c,
      mid: 0x5d7476,
      horizon: 0xd6a7a0,
      sun: 0xe6b5ad,
      sunOpacity: 0.18,
      stars: 0.44,
      mist: 0xa9bdb0,
    },
    summer: {
      zenith: 0x0a1a23,
      mid: 0x35545a,
      horizon: 0xc18c6e,
      sun: 0xd78e5d,
      sunOpacity: 0.24,
      stars: 0.68,
      mist: 0x90a89d,
    },
    autumn: {
      zenith: 0x0c1b21,
      mid: 0x4d5750,
      horizon: 0xd09a67,
      sun: 0xd38b58,
      sunOpacity: 0.3,
      stars: 0.72,
      mist: 0xa2aa97,
    },
    winter: {
      zenith: 0x0d1d2a,
      mid: 0x526d79,
      horizon: 0xb5c5c7,
      sun: 0xb7d0da,
      sunOpacity: 0.13,
      stars: 0.82,
      mist: 0xc0d1d3,
    },
  };

  const setSeason = (season) => {
    const palette = seasonPalettes[season];
    sky.material.uniforms.uZenith.value.setHex(palette.zenith);
    sky.material.uniforms.uMid.value.setHex(palette.mid);
    sky.material.uniforms.uHorizon.value.setHex(palette.horizon);
    sky.sunsetGlow.material.color.setHex(palette.sun);
    sky.sunsetGlow.material.opacity = palette.sunOpacity;
    sky.stars.material.opacity = palette.stars;
    fireflies.points.visible = season !== 'winter';
    fireflies.material.uniforms.uVisibility.value = season === 'summer' ? 1 : season === 'spring' ? 0.64 : 0.48;
    leaves.points.visible = season === 'autumn';
    mist.layers.forEach((layer, index) => {
      layer.mesh.material.color.setHex(index % 3 === 0 ? 0xb8c8bb : palette.mist);
    });
  };
  setSeason('autumn');

  return {
    group: sky.group,
    fireflies,
    setSeason,
    setPixelRatio(pixelRatio) {
      fireflies.material.uniforms.uPixelRatio.value = pixelRatio;
      smoke.material.uniforms.uPixelRatio.value = pixelRatio;
    },
    update(elapsed, delta) {
      fireflies.update(elapsed);
      smoke.update(delta);
      dust.update(elapsed);
      leaves.update(delta, elapsed);
      for (const layer of mist.layers) {
        layer.mesh.position.x = layer.baseX + Math.sin(elapsed * layer.speed + layer.phase) * 1.4;
        layer.mesh.position.z = layer.baseZ + Math.cos(elapsed * layer.speed * 0.76 + layer.phase) * 0.8;
        layer.mesh.material.opacity = layer.baseOpacity * (0.82 + Math.sin(elapsed * 0.13 + layer.phase) * 0.18);
      }
    },
  };
}
