import * as THREE from 'three';
import { mulberry32, randomRange } from './utils.js';

function makeTexture(width, height, draw, options = {}) {
  const canvas = document.createElement('canvas');
  const textureScale = options.textureScale ?? 1;
  canvas.width = Math.max(1, Math.round(width * textureScale));
  canvas.height = Math.max(1, Math.round(height * textureScale));
  const context = canvas.getContext('2d');
  // 使用原始绘制坐标，缩小分辨率时保留图案比例、线宽和密度。
  if (canvas.width !== width || canvas.height !== height) {
    context.scale(canvas.width / width, canvas.height / height);
  }
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (options.color !== false) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const repeat = options.repeat || [1, 1];
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = options.anisotropy || 1;
  texture.needsUpdate = true;
  return texture;
}

function paintWood(context, width, height, seed, palette) {
  const random = mulberry32(seed);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(0.45, palette.base);
  gradient.addColorStop(1, palette.dark);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 86; index += 1) {
    const y = random() * height;
    const amplitude = randomRange(random, 1.2, 7.5);
    const frequency = randomRange(random, 0.008, 0.026);
    const phase = random() * Math.PI * 2;
    context.beginPath();
    for (let x = -20; x <= width + 20; x += 10) {
      const wave = Math.sin(x * frequency + phase) * amplitude + Math.sin(x * 0.065) * 1.2;
      if (x === -20) context.moveTo(x, y + wave);
      else context.lineTo(x, y + wave);
    }
    context.strokeStyle = random() > 0.58
      ? `rgba(242, 196, 139, ${randomRange(random, 0.025, 0.09)})`
      : `rgba(34, 17, 9, ${randomRange(random, 0.035, 0.14)})`;
    context.lineWidth = randomRange(random, 0.5, 2.8);
    context.stroke();
  }

  for (let index = 0; index < 8; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radiusX = randomRange(random, 5, 15);
    const radiusY = radiusX * randomRange(random, 0.35, 0.65);
    const knot = context.createRadialGradient(x, y, 1, x, y, radiusX);
    knot.addColorStop(0, 'rgba(28, 13, 7, 0.54)');
    knot.addColorStop(0.4, 'rgba(69, 35, 19, 0.26)');
    knot.addColorStop(1, 'rgba(240, 183, 118, 0)');
    context.save();
    context.translate(x, y);
    context.scale(1, radiusY / radiusX);
    context.fillStyle = knot;
    context.beginPath();
    context.arc(0, 0, radiusX, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(32, 15, 8, 0.28)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(0, 0, radiusX * 0.58, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

function paintWoodBump(context, width, height, seed) {
  const random = mulberry32(seed);
  context.fillStyle = '#868686';
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 92; index += 1) {
    const y = random() * height;
    const amplitude = randomRange(random, 0.6, 5);
    const frequency = randomRange(random, 0.008, 0.03);
    context.beginPath();
    for (let x = 0; x <= width; x += 12) {
      const wave = Math.sin(x * frequency + random() * 0) * amplitude;
      if (x === 0) context.moveTo(x, y + wave);
      else context.lineTo(x, y + wave);
    }
    context.strokeStyle = random() > 0.5 ? 'rgba(235,235,235,0.18)' : 'rgba(24,24,24,0.2)';
    context.lineWidth = randomRange(random, 0.5, 2.4);
    context.stroke();
  }
}

function paintRoof(context, width, height, seed, bump = false) {
  const random = mulberry32(seed);
  context.fillStyle = bump ? '#8a8a8a' : '#26302b';
  context.fillRect(0, 0, width, height);

  const rows = 13;
  const columns = 11;
  const rowHeight = height / rows;
  const tileWidth = width / columns;

  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? -tileWidth * 0.5 : 0;
    for (let column = -1; column <= columns; column += 1) {
      const x = column * tileWidth + offset;
      const y = row * rowHeight;
      const tone = Math.floor(randomRange(random, -18, 22));
      if (bump) {
        context.fillStyle = `rgb(${138 + tone}, ${138 + tone}, ${138 + tone})`;
      } else {
        const colors = [
          [39 + tone, 53 + tone, 45 + tone],
          [49 + tone, 60 + tone, 50 + tone],
          [38 + tone, 47 + tone, 43 + tone],
        ];
        const color = colors[Math.floor(random() * colors.length)];
        context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      }
      context.beginPath();
      context.moveTo(x + 2, y + 1);
      context.lineTo(x + tileWidth - 2, y + 1);
      context.lineTo(x + tileWidth - 4, y + rowHeight - 2);
      context.lineTo(x + 4, y + rowHeight - 2);
      context.closePath();
      context.fill();
      context.strokeStyle = bump ? 'rgba(18,18,18,0.8)' : 'rgba(9, 15, 12, 0.55)';
      context.lineWidth = bump ? 4 : 2;
      context.stroke();

      if (!bump && random() > 0.76) {
        context.fillStyle = `rgba(71, 95, 58, ${randomRange(random, 0.06, 0.18)})`;
        context.beginPath();
        context.ellipse(
          x + randomRange(random, 8, tileWidth - 8),
          y + randomRange(random, 8, rowHeight - 7),
          randomRange(random, 4, 17),
          randomRange(random, 3, 10),
          random() * Math.PI,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }
  }

  if (!bump) {
    for (let index = 0; index < 26; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = randomRange(random, 8, 38);
      const moss = context.createRadialGradient(x, y, 0, x, y, radius);
      moss.addColorStop(0, `rgba(94, 113, 62, ${randomRange(random, 0.08, 0.22)})`);
      moss.addColorStop(1, 'rgba(94, 113, 62, 0)');
      context.fillStyle = moss;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
}

function paintStone(context, width, height, seed, bump = false) {
  const random = mulberry32(seed);
  context.fillStyle = bump ? '#4c4c4c' : '#3d3e38';
  context.fillRect(0, 0, width, height);

  const cell = 66;
  for (let y = -cell; y < height + cell; y += cell) {
    for (let x = -cell; x < width + cell; x += cell) {
      const centerX = x + cell * 0.5 + randomRange(random, -14, 14);
      const centerY = y + cell * 0.5 + randomRange(random, -9, 9);
      const widthScale = randomRange(random, 0.72, 1.15);
      const heightScale = randomRange(random, 0.58, 0.93);
      const points = 8;
      context.beginPath();
      for (let point = 0; point < points; point += 1) {
        const angle = (point / points) * Math.PI * 2;
        const wobble = randomRange(random, 0.8, 1.12);
        const px = centerX + Math.cos(angle) * cell * 0.43 * widthScale * wobble;
        const py = centerY + Math.sin(angle) * cell * 0.36 * heightScale * wobble;
        if (point === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();

      if (bump) {
        const tone = Math.floor(randomRange(random, 115, 205));
        context.fillStyle = `rgb(${tone}, ${tone}, ${tone})`;
      } else {
        const warm = randomRange(random, 0, 14);
        const tone = Math.floor(randomRange(random, 72, 120));
        context.fillStyle = `rgb(${tone + warm}, ${tone + warm * 0.72}, ${tone + warm * 0.32})`;
      }
      context.fill();
      context.strokeStyle = bump ? 'rgba(20,20,20,0.75)' : 'rgba(20, 23, 19, 0.68)';
      context.lineWidth = bump ? 5 : 3;
      context.stroke();

      if (!bump) {
        context.strokeStyle = 'rgba(221, 210, 181, 0.12)';
        context.lineWidth = 1;
        context.stroke();
        for (let speck = 0; speck < 5; speck += 1) {
          context.fillStyle = `rgba(22, 28, 22, ${randomRange(random, 0.05, 0.15)})`;
          context.beginPath();
          context.arc(
            centerX + randomRange(random, -25, 25),
            centerY + randomRange(random, -20, 20),
            randomRange(random, 0.5, 2.5),
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }
    }
  }

  if (!bump) {
    for (let index = 0; index < 38; index += 1) {
      context.fillStyle = `rgba(73, 93, 53, ${randomRange(random, 0.03, 0.12)})`;
      context.beginPath();
      context.ellipse(
        random() * width,
        random() * height,
        randomRange(random, 4, 22),
        randomRange(random, 3, 12),
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
}

function paintGround(context, width, height, seed) {
  const random = mulberry32(seed);
  // putImageData 不受坐标缩放影响，像素噪声直接按实际画布尺寸生成。
  const image = context.createImageData(context.canvas.width, context.canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const grain = random();
    const green = 34 + grain * 21;
    image.data[index] = 23 + grain * 13;
    image.data[index + 1] = green;
    image.data[index + 2] = 19 + grain * 12;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  for (let index = 0; index < 180; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = randomRange(random, 3, 35);
    const moss = context.createRadialGradient(x, y, 0, x, y, radius);
    moss.addColorStop(0, `rgba(${random() > 0.5 ? '57, 75, 41' : '69, 71, 39'}, ${randomRange(random, 0.04, 0.18)})`);
    moss.addColorStop(1, 'rgba(52, 63, 38, 0)');
    context.fillStyle = moss;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  for (let index = 0; index < 3600; index += 1) {
    const shade = random() > 0.58 ? 'rgba(133, 126, 76, 0.18)' : 'rgba(9, 16, 10, 0.24)';
    context.fillStyle = shade;
    context.fillRect(random() * width, random() * height, randomRange(random, 0.5, 2.5), randomRange(random, 0.5, 2.5));
  }
}

function paintBark(context, width, height, seed) {
  const random = mulberry32(seed);
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#3b2c20');
  gradient.addColorStop(0.5, '#5b4330');
  gradient.addColorStop(1, '#35251b');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 90; index += 1) {
    const x = random() * width;
    const start = random() * height;
    const length = randomRange(random, 18, 130);
    context.beginPath();
    context.moveTo(x, start);
    context.bezierCurveTo(
      x + randomRange(random, -5, 5),
      start + length * 0.3,
      x + randomRange(random, -4, 4),
      start + length * 0.7,
      x + randomRange(random, -2, 2),
      start + length,
    );
    context.strokeStyle = random() > 0.45
      ? `rgba(21, 15, 10, ${randomRange(random, 0.14, 0.46)})`
      : `rgba(182, 145, 101, ${randomRange(random, 0.04, 0.16)})`;
    context.lineWidth = randomRange(random, 1, 5);
    context.stroke();
  }
}

function paintGrass(context, width, height, seed) {
  const random = mulberry32(seed);
  context.clearRect(0, 0, width, height);
  const baseX = width * 0.5;

  for (let index = 0; index < 28; index += 1) {
    const startX = baseX + randomRange(random, -width * 0.28, width * 0.28);
    const endX = startX + randomRange(random, -width * 0.33, width * 0.33);
    const endY = randomRange(random, height * 0.03, height * 0.62);
    const bend = randomRange(random, -40, 40);
    const bladeWidth = randomRange(random, 1.2, 4.2);
    const gradient = context.createLinearGradient(0, height, 0, endY);
    const hue = randomRange(random, 76, 111);
    const lightness = randomRange(random, 28, 52);
    gradient.addColorStop(0, `hsla(${hue}, 28%, ${lightness * 0.65}%, 0.95)`);
    gradient.addColorStop(0.7, `hsla(${hue}, 31%, ${lightness}%, 0.88)`);
    gradient.addColorStop(1, `hsla(${hue}, 33%, ${lightness + 13}%, 0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(startX - bladeWidth, height);
    context.quadraticCurveTo(startX + bend * 0.32, height * 0.53, endX, endY);
    context.quadraticCurveTo(startX + bend * 0.46 + bladeWidth * 0.25, height * 0.52, startX + bladeWidth, height);
    context.closePath();
    context.fill();
  }
}

function paintSoftGlow(context, width, height) {
  const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.16, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function paintSmoke(context, width, height, seed) {
  const random = mulberry32(seed);
  context.clearRect(0, 0, width, height);
  for (let index = 0; index < 7; index += 1) {
    const x = width * 0.5 + randomRange(random, -22, 22);
    const y = height * 0.5 + randomRange(random, -20, 20);
    const radius = randomRange(random, 24, 54);
    const blob = context.createRadialGradient(x, y, 0, x, y, radius);
    blob.addColorStop(0, `rgba(212, 222, 210, ${randomRange(random, 0.11, 0.2)})`);
    blob.addColorStop(1, 'rgba(180, 190, 184, 0)');
    context.fillStyle = blob;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

function paintLeaf(context, width, height) {
  context.clearRect(0, 0, width, height);
  context.translate(width / 2, height / 2);
  const gradient = context.createLinearGradient(-width * 0.32, -height * 0.3, width * 0.3, height * 0.32);
  gradient.addColorStop(0, '#fff9ea');
  gradient.addColorStop(0.6, '#d8cbb6');
  gradient.addColorStop(1, '#9e907c');
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(0, -height * 0.44);
  context.bezierCurveTo(width * 0.32, -height * 0.25, width * 0.28, height * 0.23, 0, height * 0.43);
  context.bezierCurveTo(-width * 0.28, height * 0.23, -width * 0.32, -height * 0.25, 0, -height * 0.44);
  context.fill();
  context.strokeStyle = 'rgba(92, 78, 56, 0.55)';
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(0, -height * 0.35);
  context.lineTo(0, height * 0.35);
  context.stroke();
}

// 由调用方传入质量配置：高档、均衡为 1，移动端为 0.75，低档为 0.5。
// 分辨率只在创建时选择；后续可遍历纹理修改 anisotropy 并标记 needsUpdate。
export function createTextures(renderer, options = {}) {
  const requestedAnisotropy = options.anisotropy ?? 16;
  const anisotropy = Math.max(1, Math.min(
    renderer.capabilities.getMaxAnisotropy(),
    Number.isFinite(requestedAnisotropy) ? requestedAnisotropy : 16,
  ));
  const requestedScale = options.textureScale ?? 1;
  const textureScale = Number.isFinite(requestedScale) && requestedScale > 0
    ? Math.min(1, requestedScale)
    : 1;
  const makeProfileTexture = (width, height, draw, textureOptions) => makeTexture(
    width, height, draw, { ...textureOptions, textureScale },
  );

  const woodMap = makeProfileTexture(512, 512, (context, width, height) => {
    paintWood(context, width, height, 17, { light: '#7b4c2e', base: '#5d371f', dark: '#3d2216' });
  }, { repeat: [1.7, 1], anisotropy });

  const woodBump = makeProfileTexture(512, 512, (context, width, height) => {
    paintWoodBump(context, width, height, 19);
  }, { color: false, repeat: [1.7, 1], anisotropy });

  const plankMap = makeProfileTexture(512, 512, (context, width, height) => {
    paintWood(context, width, height, 31, { light: '#68452d', base: '#492f20', dark: '#281a13' });
  }, { repeat: [2.2, 1], anisotropy });

  const plankBump = makeProfileTexture(512, 512, (context, width, height) => {
    paintWoodBump(context, width, height, 37);
  }, { color: false, repeat: [2.2, 1], anisotropy });

  const roofMap = makeProfileTexture(1024, 1024, (context, width, height) => {
    paintRoof(context, width, height, 71, false);
  }, { repeat: [1, 1.3], anisotropy });

  const roofBump = makeProfileTexture(1024, 1024, (context, width, height) => {
    paintRoof(context, width, height, 73, true);
  }, { color: false, repeat: [1, 1.3], anisotropy });

  const stoneMap = makeProfileTexture(512, 512, (context, width, height) => {
    paintStone(context, width, height, 91, false);
  }, { repeat: [2, 2], anisotropy });

  const stoneBump = makeProfileTexture(512, 512, (context, width, height) => {
    paintStone(context, width, height, 97, true);
  }, { color: false, repeat: [2, 2], anisotropy });

  const groundMap = makeProfileTexture(1024, 1024, (context, width, height) => {
    paintGround(context, width, height, 113);
  }, { repeat: [8, 8], anisotropy });

  const barkMap = makeProfileTexture(256, 512, (context, width, height) => {
    paintBark(context, width, height, 127);
  }, { repeat: [2, 3], anisotropy });

  const grassMap = makeProfileTexture(256, 256, (context, width, height) => {
    paintGrass(context, width, height, 149);
  }, { anisotropy });

  const softGlow = makeProfileTexture(128, 128, paintSoftGlow, { anisotropy: 1 });
  softGlow.wrapS = THREE.ClampToEdgeWrapping;
  softGlow.wrapT = THREE.ClampToEdgeWrapping;

  const smoke = makeProfileTexture(128, 128, (context, width, height) => {
    paintSmoke(context, width, height, 163);
  }, { anisotropy: 1 });
  smoke.wrapS = THREE.ClampToEdgeWrapping;
  smoke.wrapT = THREE.ClampToEdgeWrapping;

  const leaf = makeProfileTexture(128, 128, paintLeaf, { anisotropy: 1 });
  leaf.wrapS = THREE.ClampToEdgeWrapping;
  leaf.wrapT = THREE.ClampToEdgeWrapping;

  const textures = {
    woodMap,
    woodBump,
    plankMap,
    plankBump,
    roofMap,
    roofBump,
    stoneMap,
    stoneBump,
    groundMap,
    barkMap,
    grassMap,
    softGlow,
    smoke,
    leaf,
  };
  const ownedTextures = Object.values(textures);
  let disposed = false;
  // 所有材质共享这些纹理及 repeat；调用方仅在整套不再使用时统一释放。
  Object.defineProperty(textures, 'dispose', {
    enumerable: false,
    value() {
      if (disposed) return;
      disposed = true;
      for (const texture of ownedTextures) texture.dispose();
    },
  });
  return textures;
}
