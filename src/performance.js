/** 画质参数集中管理；优先保留季节内容，仅调整渲染精度。 */
export const QUALITY_PROFILES = Object.freeze({
  high: { name: 'high', pixelRatio: 2, shadowSize: 3072, interiorShadowSize: 2048, pointShadowSize: 1024, shadowHz: 30, reflectionSize: 1024, reflectionHz: 30, reflectionSamples: 4, anisotropy: 16, textureScale: 1, fps: 60, bloomScale: 1, smaa: true },
  balanced: { name: 'balanced', pixelRatio: 1.5, shadowSize: 2048, interiorShadowSize: 1536, pointShadowSize: 512, shadowHz: 30, reflectionSize: 512, reflectionHz: 30, reflectionSamples: 2, anisotropy: 8, textureScale: 1, fps: 60, bloomScale: 0.75, smaa: true },
  mobile: { name: 'mobile', pixelRatio: 1.25, shadowSize: 1024, interiorShadowSize: 1024, pointShadowSize: 512, shadowHz: 15, reflectionSize: 512, reflectionHz: 15, reflectionSamples: 0, anisotropy: 4, textureScale: 0.75, fps: 30, bloomScale: 0.5, smaa: true },
  low: { name: 'low', pixelRatio: 1, shadowSize: 512, interiorShadowSize: 512, pointShadowSize: 256, shadowHz: 10, reflectionSize: 256, reflectionHz: 10, reflectionSamples: 0, anisotropy: 4, textureScale: 0.5, fps: 30, bloomScale: 0.5, smaa: true },
});

export function selectQuality({ width = 1440, coarsePointer = false, override } = {}) {
  if (Object.hasOwn(QUALITY_PROFILES, override)) return QUALITY_PROFILES[override];
  return QUALITY_PROFILES[width < 760 || coarsePointer ? 'mobile' : 'high'];
}

/** 降档需连续慢帧，升档需更长稳定期，避免频繁重建渲染目标。 */
export class AdaptiveQuality {
  constructor(profile, { locked = false, onChange = () => {} } = {}) {
    this.levels = profile.name === 'mobile' || profile.name === 'low'
      ? ['mobile', 'low'] : ['high', 'balanced', 'mobile', 'low'];
    this.maximum = Math.max(0, this.levels.indexOf(profile.name));
    this.index = this.maximum;
    this.locked = locked;
    this.onChange = onChange;
    this.reset();
  }

  reset() { this.elapsed = 0; this.frames = 0; this.slowWindows = 0; this.fastWindows = 0; }

  sample(frameMs) {
    if (this.locked || frameMs <= 0 || frameMs > 250) return;
    this.elapsed += frameMs;
    this.frames += 1;
    if (this.elapsed < 2000) return;
    const mean = this.elapsed / this.frames;
    const budget = 1000 / QUALITY_PROFILES[this.levels[this.index]].fps;
    this.slowWindows = mean > budget * 1.3 ? this.slowWindows + 1 : 0;
    this.fastWindows = mean < budget * 1.08 ? this.fastWindows + 1 : 0;
    this.elapsed = 0;
    this.frames = 0;
    if (this.slowWindows >= 3 && this.index < this.levels.length - 1) {
      this.index += 1;
      this.reset();
      this.onChange(QUALITY_PROFILES[this.levels[this.index]]);
    } else if (this.fastWindows >= 12 && this.index > this.maximum) {
      this.index -= 1;
      this.reset();
      this.onChange(QUALITY_PROFILES[this.levels[this.index]]);
    }
  }
}

/** 空闲时不保留 RAF；页面隐藏时取消调度，唤醒后的首帧不补算空闲时间。 */
export class FrameLoop {
  constructor(frame, { request = requestAnimationFrame, cancel = cancelAnimationFrame, fps = 60 } = {}) {
    this.frame = frame;
    this.request = callback => request(callback);
    this.cancel = id => cancel(id);
    this.fps = Math.max(1, fps);
    this.pending = null;
    this.previous = null;
    this.nextFrameAt = null;
    this.hidden = false;
    this.disposed = false;
    this.tick = this.tick.bind(this);
  }

  setTargetFps(fps) {
    this.fps = Math.max(1, Number(fps) || 60);
    this.nextFrameAt = null;
  }

  wake() {
    if (this.hidden || this.disposed || this.pending !== null) return;
    this.pending = this.request(this.tick);
  }

  tick(now) {
    this.pending = null;
    if (this.hidden || this.disposed) return;
    const interval = 1000 / this.fps;
    // 用下一渲染时间点而不是截断累计时间，避免高刷屏在阈值附近持续漏帧。
    if (this.nextFrameAt !== null && now + 0.25 < this.nextFrameAt) {
      this.wake();
      return;
    }
    const delta = this.previous === null ? 0 : Math.max(0, (now - this.previous) / 1000);
    this.previous = now;
    this.nextFrameAt = (this.nextFrameAt === null ? now : this.nextFrameAt) + interval;
    // 慢帧后不补跑积压的帧，避免恢复时瞬间超过目标上限。
    if (this.nextFrameAt <= now + 0.25) this.nextFrameAt = now + interval;
    if (this.frame(now, delta)) this.wake();
    else {
      this.previous = null;
      this.nextFrameAt = null;
    }
  }

  setVisible(visible) {
    this.hidden = !visible;
    this.previous = null;
    this.nextFrameAt = null;
    if (this.pending !== null) this.cancel(this.pending);
    this.pending = null;
    if (visible) this.wake();
  }

  dispose() {
    this.disposed = true;
    this.nextFrameAt = null;
    if (this.pending !== null) this.cancel(this.pending);
    this.pending = null;
  }
}

export function resizeShadow(light, size) {
  if (!light?.shadow || light.shadow.mapSize.x === size) return;
  light.shadow.map?.dispose();
  light.shadow.mapPass?.dispose();
  light.shadow.map = null;
  light.shadow.mapPass = null;
  light.shadow.mapSize.set(size, size);
  light.shadow.needsUpdate = true;
}

/** 统一所有权释放；共用材质/几何/纹理各释放一次。 */
export function disposeSceneResources(roots, textures = []) {
  const geometries = new Set();
  const materials = new Set();
  const ownedTextures = new Set(textures.filter(value => value?.isTexture));
  for (const root of roots.filter(Boolean)) root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) ownedTextures.add(value);
      for (const uniform of Object.values(material.uniforms ?? {})) {
        if (uniform?.value?.isTexture && !uniform.value.isRenderTargetTexture) ownedTextures.add(uniform.value);
      }
    }
    if (object.isInstancedMesh) object.dispose();
    if (object.shadow) {
      object.shadow.map?.dispose();
      object.shadow.mapPass?.dispose();
    }
  });
  geometries.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  ownedTextures.forEach(value => { if (!value.isRenderTargetTexture) value.dispose(); });
}
