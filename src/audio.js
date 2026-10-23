/**
 * 程序化环境声：不依赖外部音频文件。
 * 风声、柴火、虫鸣、蛙声与鸟鸣都由 Worker 或分片降级路径在浏览器内合成。
 */

const TRACK_NAMES = Object.freeze(['wind', 'gust', 'crackle', 'cricket', 'cicada', 'frog', 'bird', 'music']);

const MIX_LEVELS = Object.freeze({
  indoor: Object.freeze({ wind: 0.11, gust: 0.018, crackle: 0.5, cricket: 0.008, cicada: 0, frog: 0, bird: 0 }),
  spring: Object.freeze({ wind: 0.32, gust: 0.08, crackle: 0.045, cricket: 0.05, cicada: 0.02, frog: 0.02, bird: 0.32 }),
  summer: Object.freeze({ wind: 0.24, gust: 0.06, crackle: 0.035, cricket: 0.34, cicada: 0.56, frog: 0.62, bird: 0.08 }),
  winter: Object.freeze({ wind: 0.3, gust: 0.04, crackle: 0.035, cricket: 0, cicada: 0, frog: 0, bird: 0 }),
  autumn: Object.freeze({ wind: 0.38, gust: 0.11, crackle: 0.045, cricket: 0.18, cicada: 0.08, frog: 0, bird: 0.025 }),
});

const TRACK_SETTINGS = Object.freeze({
  wind: Object.freeze({ filter: 'lowpass', frequency: 450, gain: 0.34, pan: -0.12, q: 0.5 }),
  gust: Object.freeze({ filter: 'bandpass', frequency: 780, gain: 0.08, pan: 0.34, q: 0.55 }),
  crackle: Object.freeze({ filter: 'highpass', frequency: 720, gain: 0.34, pan: 0.28, q: 1 }),
  cricket: Object.freeze({ filter: 'bandpass', frequency: 4050, gain: 0.18, pan: -0.35, q: 2.2 }),
  cicada: Object.freeze({ filter: 'bandpass', frequency: 5000, gain: 0.2, pan: 0.42, q: 1.25 }),
  frog: Object.freeze({ filter: 'lowpass', frequency: 330, gain: 0.26, pan: -0.18, q: 0.6 }),
  bird: Object.freeze({ filter: 'bandpass', frequency: 2850, gain: 0.16, pan: 0.28, q: 1.2 }),
  music: Object.freeze({ filter: 'lowpass', frequency: 4200, gain: 0.92, pan: 0, q: 0.45 }),
});

const AUDIBLE_GAIN = 0.92;
const SILENT_GAIN = 0.0001;

export function getMixLevels(season, view) {
  if (view === 'interior' || view === 'indoor') return MIX_LEVELS.indoor;
  return MIX_LEVELS[season] ?? MIX_LEVELS.autumn;
}

function createAudioWorker() {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./audio-worker.js', import.meta.url), { type: 'module' });
}

function waitForTask() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

export class AmbientSoundscape {
  constructor({
    createWorker = createAudioWorker,
    synthesizePcm = null,
    yieldTask = waitForTask,
    setTimeoutFn = globalThis.setTimeout.bind(globalThis),
    clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
  } = {}) {
    this.context = null;
    this.master = null;
    this.enabled = false;
    this.started = false;
    this.disposed = false;
    this.visible = true;
    this.season = 'autumn';
    this.view = 'outdoor';
    this.gains = null;
    this.musicGain = null;
    this.pausedByTour = false;
    this.initializePromise = null;
    this.suspendTimer = null;
    this.suspendPromise = null;
    this.worker = null;
    this.sources = [];
    this.nodes = [];
    this.createWorker = createWorker;
    this.synthesizePcm = synthesizePcm;
    this.yieldTask = yieldTask;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.lifecycle = new AbortController();
  }

  createLoopSource(buffer, name) {
    const { context } = this;
    const settings = TRACK_SETTINGS[name];
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = settings.filter;
    filter.frequency.value = settings.frequency;
    filter.Q.value = settings.q;

    const gain = context.createGain();
    gain.gain.value = settings.gain;

    const pan = context.createStereoPanner();
    pan.pan.value = settings.pan;

    source.connect(filter).connect(gain).connect(pan).connect(this.master);
    source.start();

    this.sources.push(source);
    this.nodes.push(filter, gain, pan);
    return { source, filter, gain, pan };
  }

  createAudioBuffer(track, sampleRate) {
    const channelCount = track.channels.length;
    const frameCount = track.channels[0]?.length ?? 0;
    if (!channelCount || !frameCount) throw new Error('合成音频数据为空');
    const buffer = this.context.createBuffer(channelCount, frameCount, sampleRate);
    for (let channel = 0; channel < channelCount; channel += 1) {
      buffer.getChannelData(channel).set(track.channels[channel]);
    }
    return buffer;
  }

  async synthesizeInWorker(sampleRate, signal, worker = this.createWorker?.()) {
    if (!worker) throw new Error('当前环境不支持音频 Worker');

    return new Promise((resolve, reject) => {
      this.worker = worker;
      let settled = false;
      const cleanup = () => {
        worker.removeEventListener?.('message', handleMessage);
        worker.removeEventListener?.('error', handleError);
        signal?.removeEventListener('abort', handleAbort);
        worker.terminate?.();
        if (this.worker === worker) this.worker = null;
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const handleMessage = ({ data }) => {
        if (data?.type === 'complete') {
          finish(resolve, data);
        } else if (data?.type === 'error') {
          finish(reject, new Error(data.message || '音频 Worker 合成失败'));
        }
      };
      const handleError = event => {
        finish(reject, event?.error ?? new Error(event?.message || '音频 Worker 运行失败'));
      };
      const handleAbort = () => {
        const error = new Error('音频合成已取消');
        error.name = 'AbortError';
        finish(reject, error);
      };

      worker.addEventListener?.('message', handleMessage);
      worker.addEventListener?.('error', handleError);
      signal?.addEventListener('abort', handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
        return;
      }

      try {
        worker.postMessage({ type: 'synthesize', sampleRate });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async synthesizeWithFallback(sampleRate, signal) {
    if (this.synthesizePcm) return this.synthesizePcm(sampleRate, { signal });
    const { synthesizePcmChunked } = await import('./audio-synthesis.js');
    return synthesizePcmChunked(sampleRate, {
      signal,
      yieldTask: this.yieldTask,
    });
  }

  async synthesizeTracks(sampleRate, signal) {
    if (!this.createWorker) return this.synthesizeWithFallback(sampleRate, signal);

    let worker;
    try {
      worker = this.createWorker();
    } catch (error) {
      console.warn('无法创建音频 Worker，改用分片合成：', error);
      return this.synthesizeWithFallback(sampleRate, signal);
    }
    if (!worker) return this.synthesizeWithFallback(sampleRate, signal);

    try {
      return await this.synthesizeInWorker(sampleRate, signal, worker);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.warn('音频 Worker 不可用，改用分片合成：', error);
      return this.synthesizeWithFallback(sampleRate, signal);
    }
  }

  async initialize() {
    if (this.started) return true;
    if (this.disposed) throw new Error('音频模块已销毁');
    if (!this.initializePromise) {
      this.initializePromise = this.initializeGraph().catch(error => {
        this.initializePromise = null;
        throw error;
      });
    }
    const initialized = await this.initializePromise;
    if (!initialized) this.initializePromise = null;
    return initialized;
  }

  async initializeGraph() {
    if (!this.visible || this.disposed) return false;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前浏览器不支持 Web Audio');

    if (!this.context) {
      const createdContext = new AudioContextClass();
      this.context = createdContext;
      this.master = createdContext.createGain();
      this.master.gain.value = 0;
      this.master.connect(createdContext.destination);
    }

    const context = this.context;
    if (context.state !== 'running') {
      const resumed = await this.resumeContext();
      if (!resumed || this.disposed) return false;
    }

    try {
      const synthesisRate = Math.min(context.sampleRate, 32000);
      const pcm = await this.synthesizeTracks(synthesisRate, this.lifecycle.signal);
      if (this.disposed) throw new Error('音频模块已销毁');

      const buffers = {};
      for (const name of TRACK_NAMES) {
        if (!pcm.tracks?.[name]) throw new Error(`缺少音频轨道：${name}`);
        buffers[name] = this.createAudioBuffer(pcm.tracks[name], pcm.sampleRate ?? context.sampleRate);
      }

      const nextGains = {};
      for (const name of TRACK_NAMES) {
        const loop = this.createLoopSource(buffers[name], name);
        if (name === 'wind') {
          const lfo = context.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = 0.06;
          const lfoAmount = context.createGain();
          lfoAmount.gain.value = 130;
          lfo.connect(lfoAmount).connect(loop.filter.frequency);
          lfo.start();
          this.nodes.push(lfo, lfoAmount);
        }
        if (name === 'music') this.musicGain = loop.gain;
        else nextGains[name] = loop.gain;
      }

      this.gains = nextGains;
      this.started = true;
      this.applyMix(true);
      return true;
    } catch (error) {
      this.stopGraph();
      this.closeContext();
      throw error;
    }
  }

  applyMix(immediate = false) {
    if (!this.gains || !this.context) return;
    const mix = getMixLevels(this.season, this.view);
    const now = this.context.currentTime;
    for (const [key, value] of Object.entries(mix)) {
      const gain = this.gains[key];
      if (!gain) continue;
      gain.gain.cancelScheduledValues(now);
      if (immediate) {
        gain.gain.setValueAtTime(value, now);
      } else {
        gain.gain.setValueAtTime(Math.max(SILENT_GAIN, gain.gain.value), now);
        gain.gain.exponentialRampToValueAtTime(Math.max(SILENT_GAIN, value), now + 1.1);
      }
    }
  }

  setMode(season, view) {
    this.season = season;
    this.view = view;
    this.applyMix(false);
  }

  setVisibility(visible) {
    this.visible = Boolean(visible);
    if (!this.visible) return this.suspend();
    if (this.enabled && !this.pausedByTour) return this.resumePlayback();
    return Promise.resolve(false);
  }

  clearSuspendTimer() {
    if (this.suspendTimer === null) return;
    this.clearTimeoutFn(this.suspendTimer);
    this.suspendTimer = null;
  }

  async resumeContext() {
    if (!this.context || this.context.state === 'closed' || this.disposed) return false;
    if (this.suspendPromise) await this.suspendPromise;
    if (!this.context || this.context.state === 'closed' || this.disposed) return false;
    if (this.context.state === 'running') return true;

    let timeoutId;
    const resumeAttempt = this.context.resume().then(() => true).catch(() => false);
    const timeout = new Promise(resolve => {
      timeoutId = this.setTimeoutFn(() => resolve(false), 650);
    });
    const resumed = await Promise.race([resumeAttempt, timeout]);
    this.clearTimeoutFn(timeoutId);
    return resumed && this.context.state === 'running';
  }

  suspend() {
    if (!this.context || this.context.state !== 'running') return this.suspendPromise ?? Promise.resolve(false);
    if (this.suspendPromise) return this.suspendPromise;
    const operation = this.context.suspend().catch(() => {});
    const pending = operation.finally(() => {
      if (this.suspendPromise === pending) this.suspendPromise = null;
    });
    this.suspendPromise = pending;
    return pending;
  }

  async resumePlayback() {
    const resumed = await this.resumeContext();
    if (!resumed || !this.enabled || !this.visible || this.pausedByTour || this.disposed) return false;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(SILENT_GAIN, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(AUDIBLE_GAIN, now + 1.35);
    return true;
  }

  async enable() {
    if (this.disposed) return false;
    this.enabled = true;
    this.clearSuspendTimer();
    try {
      const initialized = await this.initialize();
      if (!initialized || !this.enabled || this.disposed) {
        this.enabled = false;
        return false;
      }
      if (!this.visible || this.pausedByTour) {
        this.suspend();
        return true;
      }

      const resumed = await this.resumePlayback();
      if (!resumed) this.enabled = false;
      return resumed;
    } catch (error) {
      this.enabled = false;
      throw error;
    }
  }

  disable() {
    this.enabled = false;
    this.clearSuspendTimer();
    if (this.disposed || !this.context || !this.master) return;

    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(SILENT_GAIN, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(SILENT_GAIN, now + 0.7);
    if (this.context.state === 'running') {
      this.suspendTimer = this.setTimeoutFn(() => {
        this.suspendTimer = null;
        if (!this.enabled) this.suspend();
      }, 760);
    }
  }

  async toggle() {
    if (this.enabled) {
      this.disable();
      return false;
    }
    return this.enable();
  }

  pause() {
    this.pausedByTour = true;
    return this.suspend();
  }

  resume() {
    this.pausedByTour = false;
    return this.enabled && this.visible ? this.resumePlayback() : Promise.resolve(false);
  }

  stopGraph() {
    for (const source of this.sources) {
      try { source.stop(); } catch {}
    }
    for (const source of this.sources) {
      try { source.disconnect(); } catch {}
    }
    for (const node of this.nodes) {
      try { node.disconnect(); } catch {}
    }
    this.sources = [];
    this.nodes = [];
    this.gains = null;
    this.musicGain = null;
  }

  closeContext() {
    if (this.context && this.context.state !== 'closed') {
      this.context.close().catch(() => {});
    }
    this.context = null;
    this.master = null;
    this.suspendPromise = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this.lifecycle.abort();
    this.clearSuspendTimer();
    this.worker?.terminate?.();
    this.worker = null;
    this.stopGraph();
    try { this.master?.disconnect(); } catch {}
    this.started = false;
    this.initializePromise = null;
    this.closeContext();
  }
}