import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { createTextures } from './textures.js';
import { createCabin } from './cabin.js';
import { createLandscape } from './forest.js';
import { createSeasonalField } from './field.js';
import { createAtmosphere } from './atmosphere.js';
import { createSeasonalWorld } from './seasonal.js';
import { createInterior } from './interior.js';
import { AmbientSoundscape } from './audio.js';
import { terrainHeight } from './utils.js';

const canvas = document.querySelector('#scene-canvas');
const soundButton = document.querySelector('#sound-toggle');
const soundLabel = soundButton.querySelector('.button-label');
const viewButton = document.querySelector('#view-toggle');
const viewLabel = document.querySelector('#view-label');
const tourButton = document.querySelector('#tour-toggle');
const tourLabel = document.querySelector('#tour-label');
const resetButton = document.querySelector('#reset-view');
const hint = document.querySelector('.hint');
const orbitHint = document.querySelector('#orbit-hint');
const subtitle = document.querySelector('#scene-subtitle');
const seasonCaption = document.querySelector('#season-caption');
const seasonSwitcher = document.querySelector('#season-switcher');
const tourProgress = document.querySelector('#tour-progress');
const tourTrack = document.querySelector('#tour-track');
const tourTime = document.querySelector('#tour-time');
const tourStateLabel = document.querySelector('#tour-state-label');
const seasonButtons = [...seasonSwitcher.querySelectorAll('[data-season]')];
const sceneTransition = document.querySelector('#scene-transition');
const loadingScreen = document.querySelector('#loading-screen');
const loadingBar = document.querySelector('#loading-bar');
const loadingCopy = document.querySelector('#loading-copy');
const errorCard = document.querySelector('#error-card');
const errorCopy = document.querySelector('#error-copy');
const app = document.querySelector('#app');

const OUTDOOR_CAMERA = new THREE.Vector3(15.0, 7.05, 13.8);
const OUTDOOR_TARGET = new THREE.Vector3(2.0, 1.8, 1.0);
const INTERIOR_CAMERA = new THREE.Vector3(0, 4.35, 11.95);
const INTERIOR_TARGET = new THREE.Vector3(0, 2.22, -0.25);
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SHOWCASE_DURATION = 30;
const SHOWCASE_ORDER = ['spring', 'summer', 'autumn', 'winter'];
const CAMERA_RETURN_DURATION = 0.85;
const FREE_CAMERA_BOUNDS = { minX: -16, maxX: 20, minZ: -10, maxZ: 22 };
const CABIN_FOOTPRINT = { minX: -5.35, maxX: 5.35, minZ: -4.55, maxZ: 5.95 };

const SEASONS = {
  spring: {
    subtitle: '花从木屋边醒来，鹿在远处停步。',
    caption: '四季林区 · 春 17:26',
    exposure: 1.34,
    fog: 0x1b2d26,
    fogDensity: 0.0124,
    key: 0xc0d4ce,
    keyIntensity: 2.16,
    hemiSky: 0xc2d5cb,
    hemiGround: 0x4e4939,
    hemiIntensity: 1.48,
    rim: 0xf0b7aa,
    rimIntensity: 1.28,
  },
  summer: {
    subtitle: '蛙声浮在池面，萤火穿过松林。',
    caption: '四季林区 · 夏 20:08',
    exposure: 1.3,
    fog: 0x142a23,
    fogDensity: 0.0134,
    key: 0xb9d0d3,
    keyIntensity: 2.2,
    hemiSky: 0xaec8c2,
    hemiGround: 0x3b392c,
    hemiIntensity: 1.44,
    rim: 0xffad74,
    rimIntensity: 1.36,
  },
  autumn: {
    subtitle: '松风穿过木屋，灯光刚好亮起。',
    caption: '四季林区 · 秋 18:42',
    exposure: 1.34,
    fog: 0x332f22,
    fogDensity: 0.0127,
    key: 0xc3cbbb,
    keyIntensity: 2.16,
    hemiSky: 0xc5bfa3,
    hemiGround: 0x463824,
    hemiIntensity: 1.46,
    rim: 0xffaf70,
    rimIntensity: 1.38,
  },
  winter: {
    subtitle: '雪落在屋檐，温泉升起一缕白雾。',
    caption: '四季林区 · 冬 16:18',
    exposure: 1.3,
    fog: 0x263337,
    fogDensity: 0.0148,
    key: 0xcbe0e7,
    keyIntensity: 2.26,
    hemiSky: 0xcbe0e5,
    hemiGround: 0x53605f,
    hemiIntensity: 1.5,
    rim: 0xa6c7d2,
    rimIntensity: 1.08,
  },
};

const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.017 },
    uVignette: { value: 0.48 },
    uSaturation: { value: 1.045 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uSaturation;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      vec2 aberration = centered * vec2(0.0005, 0.00034);
      vec3 color;
      color.r = texture2D(tDiffuse, vUv + aberration).r;
      color.g = texture2D(tDiffuse, vUv).g;
      color.b = texture2D(tDiffuse, vUv - aberration).b;

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      color *= vec3(1.005, 1.0, 0.985);
      color += vec3(0.008, 0.010, 0.006) * smoothstep(0.15, 0.9, luma);
      color += vec3(0.006, 0.009, 0.008) * (1.0 - smoothstep(0.02, 0.34, luma));

      float aspect = uResolution.x / max(1.0, uResolution.y);
      vec2 vignetteUv = centered * vec2(aspect, 1.0);
      float vignette = 1.0 - smoothstep(0.36, 0.88, length(vignetteUv)) * uVignette;
      color *= vignette;

      float grain = hash(vUv * uResolution + uTime * 61.7) - 0.5;
      color += grain * uGrain;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

function createEnvironmentTexture(renderer) {
  const environmentCanvas = document.createElement('canvas');
  environmentCanvas.width = 1024;
  environmentCanvas.height = 512;
  const context = environmentCanvas.getContext('2d');
  const skyGradient = context.createLinearGradient(0, 0, 0, environmentCanvas.height);
  skyGradient.addColorStop(0, '#122932');
  skyGradient.addColorStop(0.4, '#476d70');
  skyGradient.addColorStop(0.52, '#d9a078');
  skyGradient.addColorStop(0.62, '#536a56');
  skyGradient.addColorStop(1, '#20281d');
  context.fillStyle = skyGradient;
  context.fillRect(0, 0, environmentCanvas.width, environmentCanvas.height);
  const glow = context.createRadialGradient(240, 280, 4, 240, 280, 260);
  glow.addColorStop(0, 'rgba(255, 193, 126, 0.72)');
  glow.addColorStop(0.32, 'rgba(234, 153, 94, 0.2)');
  glow.addColorStop(1, 'rgba(234, 153, 94, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, environmentCanvas.width, environmentCanvas.height);

  const environmentTexture = new THREE.CanvasTexture(environmentCanvas);
  environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
  environmentTexture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const renderTarget = pmrem.fromEquirectangular(environmentTexture);
  environmentTexture.dispose();
  pmrem.dispose();
  return renderTarget.texture;
}

function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.55 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x0c1918, 1);
  return renderer;
}

function getResponsiveFov(aspect, base = 40) {
  if (aspect < 0.72) return base + 20;
  if (aspect < 0.9) return base + 14;
  if (aspect < 1.1) return base + 7;
  return base;
}

function createOutdoorWorld(renderer, environment) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1918);
  scene.fog = new THREE.FogExp2(0x1a211b, 0.0178);
  scene.environment = environment;
  scene.environmentIntensity = 0.4;

  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(getResponsiveFov(aspect, 40), aspect, 0.1, 170);
  camera.position.copy(OUTDOOR_CAMERA);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(OUTDOOR_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.052;
  controls.enablePan = false;
  controls.minDistance = 10.8;
  controls.maxDistance = 20.2;
  controls.minPolarAngle = 0.76;
  controls.maxPolarAngle = 1.46;
  controls.rotateSpeed = 0.42;
  controls.zoomSpeed = 0.65;
  controls.autoRotate = !prefersReducedMotion;
  controls.autoRotateSpeed = 0.14;
  controls.update();

  const hemisphere = new THREE.HemisphereLight(0xc2c5af, 0x493f2c, 1.46);
  scene.add(hemisphere);
  const ambientLight = new THREE.AmbientLight(0x9aaba2, 0.5);
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xb9c4bc, 1.78);
  keyLight.position.set(10, 16, 12);
  keyLight.target.position.set(0.2, 2.2, 0.2);
  keyLight.castShadow = true;
  const shadowSize = window.innerWidth < 760 ? 1536 : 3072;
  keyLight.shadow.mapSize.set(shadowSize, shadowSize);
  keyLight.shadow.camera.left = -25;
  keyLight.shadow.camera.right = 25;
  keyLight.shadow.camera.top = 25;
  keyLight.shadow.camera.bottom = -25;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 65;
  keyLight.shadow.bias = -0.00018;
  keyLight.shadow.normalBias = 0.045;
  keyLight.shadow.radius = 3;
  scene.add(keyLight, keyLight.target);
  const sunsetRim = new THREE.DirectionalLight(0xffa768, 1.2);
  sunsetRim.position.set(-12, 9, -11);
  sunsetRim.target.position.set(0, 3.2, 0);
  scene.add(sunsetRim, sunsetRim.target);
  const frontFill = new THREE.DirectionalLight(0x9dbcc5, 0.82);
  frontFill.position.set(8, 5, 14);
  frontFill.target.position.set(-1, 2.4, 2);
  scene.add(frontFill, frontFill.target);

  return {
    scene,
    camera,
    controls,
    hemisphere,
    keyLight,
    sunsetRim,
    frontFill,
  };
}

function setupPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.27,
    0.52,
    0.82,
  );
  const smaaPass = new SMAAPass();
  const outputPass = new OutputPass();
  const cinematicPass = new ShaderPass(CinematicShader);
  cinematicPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(smaaPass);
  composer.addPass(outputPass);
  composer.addPass(cinematicPass);

  return { composer, renderPass, bloomPass, cinematicPass };
}

let runtime = null;
const freeMoveVector = new THREE.Vector3();
const freeRightVector = new THREE.Vector3();
const freeLookDirection = new THREE.Vector3();
const freeReturnPosition = new THREE.Vector3();

function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function showError(error) {
  console.error('森林小屋场景加载失败：', error);
  loadingScreen.style.display = 'none';
  errorCard.hidden = false;
  if (!(window.WebGLRenderingContext || window.WebGL2RenderingContext)) {
    errorCopy.textContent = '当前浏览器不支持 WebGL。请使用最新版 Chrome、Edge 或 Safari 后重试。';
  } else {
    errorCopy.textContent = '场景初始化时遇到问题，请刷新页面，或确认浏览器已开启硬件加速。';
  }
}

function formatTourTime(value) {
  const seconds = Math.max(0, Math.floor(value));
  return `00:${String(Math.min(59, seconds)).padStart(2, '0')}`;
}

function getFreeCameraDirection(target = freeLookDirection) {
  const cameraState = runtime.freeCamera;
  const cosPitch = Math.cos(cameraState.pitch);
  return target.set(
    -Math.sin(cameraState.yaw) * cosPitch,
    Math.sin(cameraState.pitch),
    -Math.cos(cameraState.yaw) * cosPitch,
  ).normalize();
}

function canFreeCameraOccupy(x, z) {
  if (x < FREE_CAMERA_BOUNDS.minX || x > FREE_CAMERA_BOUNDS.maxX) return false;
  if (z < FREE_CAMERA_BOUNDS.minZ || z > FREE_CAMERA_BOUNDS.maxZ) return false;
  if (x > CABIN_FOOTPRINT.minX && x < CABIN_FOOTPRINT.maxX && z > CABIN_FOOTPRINT.minZ && z < CABIN_FOOTPRINT.maxZ) {
    return false;
  }
  const seasonalObstacles = runtime?.seasonalWorld?.getCollisionCircles?.() ?? [];
  for (const obstacle of seasonalObstacles) {
    if (Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius) return false;
  }
  return true;
}

function moveFreeCamera(deltaX, deltaZ) {
  const camera = runtime.outdoor.camera;
  const nextX = THREE.MathUtils.clamp(camera.position.x + deltaX, FREE_CAMERA_BOUNDS.minX, FREE_CAMERA_BOUNDS.maxX);
  if (canFreeCameraOccupy(nextX, camera.position.z)) camera.position.x = nextX;
  const nextZ = THREE.MathUtils.clamp(camera.position.z + deltaZ, FREE_CAMERA_BOUNDS.minZ, FREE_CAMERA_BOUNDS.maxZ);
  if (canFreeCameraOccupy(camera.position.x, nextZ)) camera.position.z = nextZ;
}

function syncTourButton() {
  if (!runtime) return;
  const returning = runtime.freeCamera?.returning;
  const paused = runtime.tourPaused || returning || !runtime.tourActive;
  let label = '暂停巡展';
  if (returning) label = '归位中';
  else if (runtime.tourPaused) label = '继续巡展';
  else if (!runtime.tourActive) label = runtime.tourCompleted ? '重新巡展' : '开始巡展';
  tourButton.classList.toggle('is-paused', paused);
  tourButton.disabled = Boolean(returning);
  tourLabel.textContent = label;
  tourButton.setAttribute('aria-label', label);
  tourButton.setAttribute('aria-pressed', String(Boolean(runtime.tourPaused)));
  soundButton.disabled = Boolean(runtime.tourPaused || returning);
  app.classList.toggle('is-tour-paused', Boolean(runtime.tourPaused || returning));
}

function updateInterfaceText() {
  if (!runtime) return;
  const theme = SEASONS[runtime.currentSeason];
  const indoor = runtime.currentView === 'interior';
  subtitle.textContent = indoor ? '炉火、热茶，和一张留给你的床。' : theme.subtitle;
  const showcaseLabel = runtime.tourPaused
    ? ' · 自由观赏'
    : runtime.tourActive
      ? ' · 自动巡展'
      : runtime.tourCompleted
        ? ' · 展示结束'
        : '';
  seasonCaption.textContent = (indoor
    ? `木屋室内 · ${runtime.currentSeason === 'spring' ? '春' : runtime.currentSeason === 'summer' ? '夏' : runtime.currentSeason === 'autumn' ? '秋' : '冬'}日窗景`
    : theme.caption) + showcaseLabel;
  viewLabel.textContent = indoor ? '回到室外' : '进入室内';
  orbitHint.textContent = indoor ? '室内环视' : '360° 环视';
  viewButton.setAttribute('aria-label', indoor ? '回到室外场景' : '进入室内场景');
  app.classList.toggle('is-interior', indoor);
  syncTourButton();
  seasonButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.season === runtime.currentSeason));
  });
}


function updateTourProgress() {
  if (!runtime || !tourProgress) return;
  const elapsed = runtime.tourCompleted ? SHOWCASE_DURATION : Math.min(SHOWCASE_DURATION, runtime.tourElapsed);
  const progress = Math.max(0, Math.min(1, elapsed / SHOWCASE_DURATION));
  tourProgress.style.transform = `scaleX(${progress})`;
  const stateLabel = runtime.freeCamera?.returning
    ? '正在回到中心'
    : runtime.tourPaused
      ? '自由观赏 · 已暂停'
      : runtime.tourActive
        ? '自动巡展'
        : runtime.tourCompleted
          ? '四季展示结束'
          : '自由观赏';
  const displaySecond = Math.floor(elapsed);
  if (runtime.lastTourDisplaySecond !== displaySecond) {
    runtime.lastTourDisplaySecond = displaySecond;
    tourTime.textContent = `${formatTourTime(elapsed)} / ${formatTourTime(SHOWCASE_DURATION)}`;
    tourTrack.setAttribute('aria-valuenow', String(displaySecond));
  }
  if (runtime.lastTourStateLabel !== stateLabel) {
    runtime.lastTourStateLabel = stateLabel;
    tourStateLabel.textContent = stateLabel;
  }
}

function enterFreeCameraMode() {
  if (!runtime || runtime.currentView !== 'outdoor') return;
  const camera = runtime.outdoor.camera;
  const state = runtime.freeCamera;
  const direction = runtime.outdoor.controls.target.clone().sub(camera.position).normalize();
  state.active = true;
  state.returning = false;
  state.dragging = false;
  state.pointerId = null;
  state.yaw = Math.atan2(-direction.x, -direction.z);
  state.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -0.82, 0.58));
  state.heightOffset = THREE.MathUtils.clamp(
    camera.position.y - terrainHeight(camera.position.x, camera.position.z),
    2.9,
    8.4,
  );
  state.fov = camera.fov;
  state.keys.clear();
  runtime.outdoor.controls.autoRotate = false;
  runtime.outdoor.controls.enabled = false;
  app.classList.add('is-free-camera');
  updateInterfaceText();
  updateTourProgress();
}

function pauseTour() {
  if (!runtime || runtime.busy || runtime.tourPaused || runtime.freeCamera?.returning) return;
  runtime.tourPaused = true;
  runtime.ambient?.pause();
  runtime.outdoor.controls.autoRotate = false;
  runtime.interior.controls.autoRotate = false;
  if (runtime.currentView === 'outdoor') enterFreeCameraMode();
  updateInterfaceText();
  updateTourProgress();
}

function beginTourResume() {
  if (!runtime || runtime.busy || runtime.freeCamera?.returning) return;
  if (!runtime.tourActive) {
    runtime.tourActive = true;
    runtime.tourCompleted = false;
    runtime.tourElapsed = 0;
  }
  runtime.ambient?.resume();

  if (runtime.currentView === 'outdoor' && runtime.freeCamera.active) {
    const camera = runtime.outdoor.camera;
    const state = runtime.freeCamera;
    state.active = false;
    state.returning = true;
    state.returnElapsed = 0;
    state.fromPosition.copy(camera.position);
    state.fromFov = camera.fov;
    state.keys.clear();
    state.dragging = false;
    state.pointerId = null;
    runtime.outdoor.controls.enabled = false;
    runtime.outdoor.controls.autoRotate = false;
    app.classList.remove('is-free-camera');
    updateTourProgress();
    updateInterfaceText();
    return;
  }

  runtime.tourPaused = false;
  const controls = runtime.currentView === 'interior' ? runtime.interior.controls : runtime.outdoor.controls;
  controls.autoRotate = runtime.tourActive && !prefersReducedMotion;
  controls.enabled = true;
  controls.update();
  updateInterfaceText();
  updateTourProgress();
}

function toggleTourPlayback() {
  if (!runtime || runtime.freeCamera?.returning) return;
  if (runtime.tourPaused || !runtime.tourActive) beginTourResume();
  else pauseTour();
}

function updateFreeCamera(delta) {
  if (!runtime?.freeCamera.active || runtime.currentView !== 'outdoor') return;
  const camera = runtime.outdoor.camera;
  const state = runtime.freeCamera;
  const forwardInput = (state.keys.has('KeyW') ? 1 : 0) - (state.keys.has('KeyS') ? 1 : 0);
  const sideInput = (state.keys.has('KeyD') ? 1 : 0) - (state.keys.has('KeyA') ? 1 : 0);
  if (forwardInput !== 0 || sideInput !== 0) {
    freeMoveVector.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw)).multiplyScalar(forwardInput);
    freeRightVector.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw)).multiplyScalar(sideInput);
    freeMoveVector.add(freeRightVector).normalize();
    const speed = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') ? 10.5 : 5.8;
    moveFreeCamera(freeMoveVector.x * speed * delta, freeMoveVector.z * speed * delta);
  }
  camera.position.y = terrainHeight(camera.position.x, camera.position.z) + state.heightOffset;
  getFreeCameraDirection(freeLookDirection);
  camera.lookAt(freeReturnPosition.copy(camera.position).add(freeLookDirection));
  camera.fov = state.fov;
}

function updateFreeCameraReturn(delta) {
  if (!runtime?.freeCamera.returning) return;
  const state = runtime.freeCamera;
  const camera = runtime.outdoor.camera;
  state.returnElapsed += delta;
  const linear = Math.min(1, state.returnElapsed / CAMERA_RETURN_DURATION);
  const eased = 1 - (1 - linear) ** 3;
  camera.position.lerpVectors(state.fromPosition, OUTDOOR_CAMERA, eased);
  camera.fov = THREE.MathUtils.lerp(state.fromFov, getResponsiveFov(camera.aspect, 40), eased);
  camera.updateProjectionMatrix();
  camera.lookAt(OUTDOOR_TARGET);
  if (linear >= 1) {
    state.returning = false;
    camera.position.copy(OUTDOOR_CAMERA);
    camera.fov = getResponsiveFov(camera.aspect, 40);
    camera.updateProjectionMatrix();
    runtime.outdoor.controls.target.copy(OUTDOOR_TARGET);
    runtime.outdoor.controls.enabled = runtime.currentView === 'outdoor';
    runtime.outdoor.controls.autoRotate = runtime.tourActive && !prefersReducedMotion;
    runtime.outdoor.controls.update();
    runtime.tourPaused = false;
    runtime.userInteractedThisSeason = false;
    updateTourProgress();
    updateInterfaceText();
  }
}

function stopShowcase(completed = false, preservePause = false) {
  if (!runtime) return;
  runtime.tourActive = false;
  runtime.tourPaused = preservePause;
  runtime.tourElapsed = 0;
  runtime.tourCompleted = completed;
  runtime.outdoor.controls.autoRotate = false;
  runtime.interior.controls.autoRotate = false;
  updateTourProgress();
  updateInterfaceText();
  if (completed && runtime.currentView === 'outdoor') {
    runtime.tourPaused = true;
    runtime.ambient?.pause();
    enterFreeCameraMode();
  }
}

function updateShowcase(delta) {
  if (!runtime || !runtime.tourActive || runtime.tourPaused || runtime.freeCamera?.returning) return;
  if (runtime.busy) {
    updateTourProgress();
    return;
  }
  runtime.tourElapsed += delta;
  if (runtime.tourElapsed >= SHOWCASE_DURATION) {
    const currentIndex = SHOWCASE_ORDER.indexOf(runtime.currentSeason);
    if (currentIndex >= SHOWCASE_ORDER.length - 1) {
      stopShowcase(true);
      return;
    }
    const nextSeason = SHOWCASE_ORDER[currentIndex + 1];
    runtime.tourElapsed = 0;
    switchSeason(nextSeason, { automatic: true });
  }
  updateTourProgress();
}

function applySeason(season) {
  if (!runtime) return;
  runtime.currentSeason = season;
  const theme = SEASONS[season];
  runtime.landscape.setSeason(season);
  runtime.seasonalField.setSeason(season);
  runtime.seasonalWorld.setSeason(season);
  runtime.atmosphere.setSeason(season);
  runtime.interior.setSeason(season);
  runtime.ambient.setMode(season, runtime.currentView);

  runtime.outdoor.keyLight.color.setHex(theme.key);
  runtime.outdoor.keyLight.intensity = theme.keyIntensity;
  runtime.outdoor.hemisphere.color.setHex(theme.hemiSky);
  runtime.outdoor.hemisphere.groundColor.setHex(theme.hemiGround);
  runtime.outdoor.hemisphere.intensity = theme.hemiIntensity;
  runtime.outdoor.sunsetRim.color.setHex(theme.rim);
  runtime.outdoor.sunsetRim.intensity = theme.rimIntensity;
  runtime.outdoor.scene.fog.color.setHex(theme.fog);
  runtime.outdoor.scene.fog.density = theme.fogDensity;
  runtime.renderer.toneMappingExposure = runtime.currentView === 'interior' ? 1.2 : theme.exposure;
  app.dataset.season = season;
  updateInterfaceText();
}

async function switchSeason(season, options = {}) {
  if (!runtime || runtime.busy) return;
  const { automatic = false } = options;
  const preservePause = !automatic && runtime.tourPaused;
  if (!automatic) stopShowcase(false, preservePause);
  if (season === runtime.currentSeason) return;

  runtime.busy = true;
  if (automatic) runtime.tourElapsed = 0;
  sceneTransition.classList.add('is-active');
  await delay(360);
  applySeason(season);
  await delay(180);
  sceneTransition.classList.remove('is-active');
  runtime.busy = false;

  if (automatic) {
    runtime.userInteractedThisSeason = false;
    const activeControls = runtime.currentView === 'interior' ? runtime.interior.controls : runtime.outdoor.controls;
    activeControls.autoRotate = runtime.tourActive && !runtime.tourPaused && !prefersReducedMotion;
    updateTourProgress();
  }
}

async function switchView(view) {
  if (!runtime || runtime.busy || runtime.freeCamera?.returning || view === runtime.currentView) return;
  if (runtime.freeCamera.active) {
    runtime.freeCamera.active = false;
    runtime.freeCamera.keys.clear();
    app.classList.remove('is-free-camera');
  }
  runtime.busy = true;
  sceneTransition.classList.add('is-active');
  await delay(380);
  runtime.currentView = view;
  const indoor = view === 'interior';
  runtime.postProcessing.renderPass.scene = indoor ? runtime.interior.scene : runtime.outdoor.scene;
  runtime.postProcessing.renderPass.camera = indoor ? runtime.interior.camera : runtime.outdoor.camera;
  runtime.outdoor.controls.enabled = !indoor;
  runtime.interior.controls.enabled = indoor;
  const activeControls = indoor ? runtime.interior.controls : runtime.outdoor.controls;
  activeControls.autoRotate =
    runtime.tourActive && !runtime.tourPaused && !runtime.userInteractedThisSeason && !prefersReducedMotion;
  activeControls.update();
  runtime.renderer.toneMappingExposure = indoor ? 1.2 : SEASONS[runtime.currentSeason].exposure;
  runtime.ambient.setMode(runtime.currentSeason, view);
  if (!indoor && runtime.tourPaused) enterFreeCameraMode();
  updateInterfaceText();
  await delay(220);
  sceneTransition.classList.remove('is-active');
  runtime.busy = false;
}

async function resetActiveView() {
  if (!runtime || runtime.busy || runtime.freeCamera?.returning) return;
  if (runtime.freeCamera.active) {
    const camera = runtime.outdoor.camera;
    const state = runtime.freeCamera;
    camera.position.copy(OUTDOOR_CAMERA);
    const direction = OUTDOOR_TARGET.clone().sub(camera.position).normalize();
    state.yaw = Math.atan2(-direction.x, -direction.z);
    state.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -0.82, 0.58));
    state.heightOffset = THREE.MathUtils.clamp(
      camera.position.y - terrainHeight(camera.position.x, camera.position.z),
      2.9,
      8.4,
    );
    state.fov = getResponsiveFov(camera.aspect, 40);
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
    getFreeCameraDirection(freeLookDirection);
    camera.lookAt(freeReturnPosition.copy(camera.position).add(freeLookDirection));
    runtime.userInteractedThisSeason = false;
    return;
  }
  runtime.busy = true;
  sceneTransition.classList.add('is-active');
  await delay(240);
  const indoor = runtime.currentView === 'interior';
  const camera = indoor ? runtime.interior.camera : runtime.outdoor.camera;
  const controls = indoor ? runtime.interior.controls : runtime.outdoor.controls;
  camera.position.copy(indoor ? INTERIOR_CAMERA : OUTDOOR_CAMERA);
  controls.target.copy(indoor ? INTERIOR_TARGET : OUTDOOR_TARGET);
  runtime.userInteractedThisSeason = false;
  controls.autoRotate = runtime.tourActive && !runtime.tourPaused && !prefersReducedMotion;
  controls.update();
  await delay(80);
  sceneTransition.classList.remove('is-active');
  runtime.busy = false;
}

function setupInterface() {
  const ambient = new AmbientSoundscape();
  ambient.setMode('spring', 'outdoor');
  runtime.ambient = ambient;
  let soundBusy = false;

  const syncSoundState = (enabled, pending = false) => {
    soundButton.classList.toggle('sound-active', enabled);
    soundButton.classList.toggle('sound-pending', pending && !enabled);
    soundButton.setAttribute('aria-pressed', String(enabled));
    soundButton.setAttribute(
      'aria-label',
      enabled ? '关闭环境音乐' : pending ? '浏览器需要一次点击来播放环境音乐' : '开启环境音乐',
    );
    soundLabel.textContent = enabled ? '静音' : pending ? '点击聆听' : '环境音乐';
  };

  const removeAudioUnlock = () => {
    window.removeEventListener('pointerdown', unlockAudio, true);
    window.removeEventListener('keydown', unlockAudio, true);
  };

  const enableAudio = async () => {
    if (soundBusy) return false;
    if (ambient.enabled) {
      syncSoundState(true);
      removeAudioUnlock();
      return true;
    }
    soundBusy = true;
    syncSoundState(false, true);
    try {
      const enabled = await ambient.enable();
      syncSoundState(enabled, !enabled);
      if (enabled) removeAudioUnlock();
      return enabled;
    } catch {
      syncSoundState(false, true);
      window.setTimeout(() => {
        if (!ambient.enabled) syncSoundState(false, true);
      }, 1800);
      return false;
    } finally {
      soundBusy = false;
    }
  };

  const unlockAudio = () => {
    if (!ambient.enabled) {
      enableAudio();
    } else {
      removeAudioUnlock();
    }
  };

  soundButton.addEventListener('click', async () => {
    if (soundBusy) return;
    if (ambient.enabled) {
      ambient.disable();
      syncSoundState(false);
      return;
    }
    await enableAudio();
  });

  tourButton.addEventListener('click', toggleTourPlayback);

  seasonButtons.forEach((button) => {
    button.addEventListener('click', () => {
      switchSeason(button.dataset.season);
    });
  });

  viewButton.addEventListener('click', () => {
    switchView(runtime.currentView === 'outdoor' ? 'interior' : 'outdoor');
  });
  resetButton.addEventListener('click', resetActiveView);
  canvas.addEventListener('dblclick', resetActiveView);
  canvas.addEventListener('pointerdown', () => hint.classList.add('hint-explored'), { once: true });

  const freeCamera = runtime.freeCamera;
  const endFreeDrag = (event) => {
    if (!freeCamera.dragging || (event && freeCamera.pointerId !== event.pointerId)) return;
    freeCamera.dragging = false;
    if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    freeCamera.pointerId = null;
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (!runtime.freeCamera.active || event.button !== 0) return;
    runtime.freeCamera.dragging = true;
    runtime.freeCamera.pointerId = event.pointerId;
    runtime.freeCamera.lastX = event.clientX;
    runtime.freeCamera.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!runtime.freeCamera.active || !runtime.freeCamera.dragging || event.pointerId !== runtime.freeCamera.pointerId) return;
    const deltaX = event.clientX - runtime.freeCamera.lastX;
    const deltaY = event.clientY - runtime.freeCamera.lastY;
    runtime.freeCamera.lastX = event.clientX;
    runtime.freeCamera.lastY = event.clientY;
    runtime.freeCamera.yaw -= deltaX * 0.0022;
    runtime.freeCamera.pitch = THREE.MathUtils.clamp(
      runtime.freeCamera.pitch - deltaY * 0.00165,
      -0.62,
      0.55,
    );
  });
  canvas.addEventListener('pointerup', endFreeDrag);
  canvas.addEventListener('pointercancel', endFreeDrag);
  canvas.addEventListener('wheel', (event) => {
    if (!runtime.freeCamera.active) return;
    event.preventDefault();
    runtime.freeCamera.fov = THREE.MathUtils.clamp(runtime.freeCamera.fov + event.deltaY * 0.026, 26, 62);
    runtime.outdoor.camera.fov = runtime.freeCamera.fov;
    runtime.outdoor.camera.updateProjectionMatrix();
  }, { passive: false });

  const isInteractiveTarget = (target) => target instanceof Element && Boolean(target.closest('button, a, input, textarea, select'));
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !isInteractiveTarget(event.target)) {
      event.preventDefault();
      toggleTourPlayback();
      return;
    }
    if (!runtime.freeCamera.active) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      runtime.freeCamera.keys.add(event.code);
    }
  });
  window.addEventListener('keyup', (event) => {
    runtime.freeCamera.keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    runtime.freeCamera.keys.clear();
    endFreeDrag();
  });

  [runtime.outdoor.controls, runtime.interior.controls].forEach((controls) => {
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      runtime.userInteractedThisSeason = true;
      hint.classList.add('hint-explored');
    });
  });

  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('keydown', unlockAudio, true);
  window.setTimeout(() => {
    if (!ambient.enabled) enableAudio();
  }, 900);
}

async function boot() {
  loadingCopy.textContent = '整理四季与林间灯火…';
  loadingBar.style.width = '10%';
  await nextFrame();

  const renderer = setupRenderer();
  loadingBar.style.width = '24%';
  const environment = createEnvironmentTexture(renderer);
  const textures = createTextures(renderer);
  loadingBar.style.width = '38%';
  loadingCopy.textContent = '种下会随四季变化的树林…';

  const outdoor = createOutdoorWorld(renderer, environment);
  const landscape = createLandscape(textures);
  outdoor.scene.add(landscape.group);
  const seasonalField = createSeasonalField();
  outdoor.scene.add(seasonalField.group);
  loadingBar.style.width = '52%';
  loadingCopy.textContent = '竖起原木小屋与阁楼…';

  const cabin = createCabin(textures);
  outdoor.scene.add(cabin.group);
  const seasonalWorld = createSeasonalWorld(textures);
  outdoor.scene.add(seasonalWorld.group);
  const atmosphere = createAtmosphere(outdoor.scene, textures, cabin.smokeTip);
  atmosphere.setPixelRatio(renderer.getPixelRatio());
  loadingBar.style.width = '68%';
  loadingCopy.textContent = '摆好花丛、温泉与林间动物…';

  const interior = createInterior(textures, canvas);
  interior.scene.environment = environment;
  interior.scene.environmentIntensity = 0.16;
  loadingBar.style.width = '82%';
  loadingCopy.textContent = '点亮壁炉与室内灯火…';

  const postProcessing = setupPostProcessing(renderer, outdoor.scene, outdoor.camera);
  runtime = {
    renderer,
    textures,
    environment,
    outdoor,
    landscape,
    seasonalField,
    cabin,
    seasonalWorld,
    atmosphere,
    interior,
    postProcessing,
    currentSeason: 'spring',
    currentView: 'outdoor',
    busy: false,
    tourActive: true,
    tourElapsed: 0,
    tourCompleted: false,
    tourPaused: false,
    lastTourDisplaySecond: -1,
    lastTourStateLabel: '',
    userInteractedThisSeason: false,
    freeCamera: {
      active: false,
      returning: false,
      dragging: false,
      pointerId: null,
      lastX: 0,
      lastY: 0,
      yaw: 0,
      pitch: 0,
      fov: 40,
      heightOffset: 5,
      returnElapsed: 0,
      fromFov: 40,
      fromPosition: new THREE.Vector3(),
      keys: new Set(),
    },
    ambient: null,
  };
  setupInterface();
  applySeason('spring');
  outdoor.controls.enabled = true;
  outdoor.controls.autoRotate = !prefersReducedMotion;
  interior.controls.enabled = false;
  interior.controls.autoRotate = !prefersReducedMotion;
  updateTourProgress();

  const windowStates = cabin.windows.map((window) => ({
    window,
    baseLight: window.light.intensity,
    baseEmissive: window.pane.material.emissiveIntensity,
  }));
  const bulbStates = cabin.stringLights.bulbs.map(({ bulb, glow, phase, baseGlow }) => ({
    bulb,
    glow,
    phase,
    baseGlow,
  }));

  const handleResize = () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.55 : 2);
    outdoor.camera.aspect = window.innerWidth / window.innerHeight;
    outdoor.camera.fov = runtime.freeCamera.active
      ? runtime.freeCamera.fov
      : getResponsiveFov(outdoor.camera.aspect, 40);
    outdoor.camera.updateProjectionMatrix();
    interior.camera.aspect = window.innerWidth / window.innerHeight;
    interior.camera.fov = interior.camera.aspect < 0.7 ? 64 : interior.camera.aspect < 0.95 ? 56 : 46;
    interior.camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    postProcessing.composer.setPixelRatio(pixelRatio);
    postProcessing.composer.setSize(window.innerWidth, window.innerHeight);
    postProcessing.cinematicPass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    atmosphere.setPixelRatio(pixelRatio);
  };
  window.addEventListener('resize', handleResize, { passive: true });

  try {
    await document.fonts.ready;
  } catch {
    // 字体加载失败不会阻断三维场景。
  }

  try {
    await renderer.compileAsync(outdoor.scene, outdoor.camera);
    await renderer.compileAsync(interior.scene, interior.camera);
  } catch (error) {
    console.warn('预编译着色器未完成，将在首帧继续编译：', error);
  }

  postProcessing.composer.render();
  loadingBar.style.width = '100%';
  loadingCopy.textContent = '四季已经就位';

  let sceneElapsed = 0;
  let previousTime = performance.now();
  const animate = (now) => {
    requestAnimationFrame(animate);
    const rawDelta = (now - previousTime) / 1000;
    previousTime = now;
    const delta = Math.min(rawDelta, 0.05);
    const worldFrozen = runtime.tourPaused || runtime.freeCamera.returning;
    if (!worldFrozen) sceneElapsed += delta;

    updateShowcase(Math.min(rawDelta, 1.0));

    if (runtime.currentView === 'outdoor') {
      if (!worldFrozen) {
        landscape.update(sceneElapsed);
        seasonalField.update(sceneElapsed);
        atmosphere.update(sceneElapsed, delta);
        seasonalWorld.update(sceneElapsed, delta);
      }
      if (runtime.freeCamera.returning) updateFreeCameraReturn(delta);
      else if (runtime.freeCamera.active) updateFreeCamera(delta);
      else outdoor.controls.update();

      if (!worldFrozen) {
        windowStates.forEach(({ window, baseLight, baseEmissive }, index) => {
          const flicker =
            0.965 +
            Math.sin(sceneElapsed * 1.3 + index * 2.17) * 0.022 +
            Math.sin(sceneElapsed * 6.8 + index * 4.41) * 0.01;
          window.light.intensity = baseLight * flicker;
          window.pane.material.emissiveIntensity = baseEmissive * flicker;
        });
        cabin.lantern.pivot.rotation.z = Math.sin(sceneElapsed * 0.78) * 0.028;
        cabin.lantern.pivot.rotation.x = Math.cos(sceneElapsed * 0.57) * 0.014;
        cabin.lantern.light.intensity = 17 + Math.sin(sceneElapsed * 2.1) * 0.55;
        bulbStates.forEach(({ bulb, glow, phase, baseGlow }) => {
          const pulse = 0.5 + 0.5 * Math.sin(sceneElapsed * 1.55 + phase);
          glow.material.opacity = baseGlow * (0.68 + pulse * 0.32);
          const glowScale = 0.43 + pulse * 0.08;
          glow.scale.set(glowScale, glowScale, 1);
          bulb.scale.setScalar(0.9 + pulse * 0.13);
        });
      }
    } else {
      if (!worldFrozen) interior.update(sceneElapsed, delta);
      interior.controls.update();
    }

    postProcessing.cinematicPass.uniforms.uTime.value = sceneElapsed;
    postProcessing.composer.render();
  };

  requestAnimationFrame(animate);
  await delay(420);
  loadingScreen.classList.add('is-leaving');
  app.classList.add('is-ready');
  window.setTimeout(() => {
    loadingScreen.hidden = true;
  }, 1700);
}

boot().catch(showError);
