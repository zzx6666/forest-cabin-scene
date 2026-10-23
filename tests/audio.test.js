import assert from 'node:assert/strict';
import test from 'node:test';
import { AmbientSoundscape, getMixLevels } from '../src/audio.js';
import { AUDIO_TRACKS, synthesizePcm, synthesizePcmChunked } from '../src/audio-synthesis.js';

const TRACK_NAMES = ['wind', 'gust', 'crackle', 'cricket', 'cicada', 'frog', 'bird', 'music'];

class FakeParam {
  constructor(value = 0) {
    this.value = value;
  }

  cancelScheduledValues() {}

  setValueAtTime(value) {
    this.value = value;
  }

  exponentialRampToValueAtTime(value) {
    this.value = value;
  }
}

class FakeNode {
  connect(node) {
    return node;
  }

  disconnect() {}
}

class FakeSourceNode extends FakeNode {
  constructor() {
    super();
    this.buffer = null;
    this.loop = false;
    this.stopped = false;
  }

  start() {}

  stop() {
    this.stopped = true;
  }
}

class FakeAudioContext {
  constructor({ resumeSucceeds = true, state = 'running' } = {}) {
    this.state = state;
    this.resumeSucceeds = resumeSucceeds;
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.destination = new FakeNode();
    this.sources = [];
    this.closed = false;
  }

  createGain() {
    const node = new FakeNode();
    node.gain = new FakeParam(1);
    return node;
  }

  createBufferSource() {
    const source = new FakeSourceNode();
    this.sources.push(source);
    return source;
  }

  createBiquadFilter() {
    const node = new FakeNode();
    node.frequency = new FakeParam(0);
    node.Q = new FakeParam(0);
    return node;
  }

  createStereoPanner() {
    const node = new FakeNode();
    node.pan = new FakeParam(0);
    return node;
  }

  createOscillator() {
    const node = new FakeNode();
    node.frequency = new FakeParam(0);
    node.start = () => {};
    return node;
  }

  createBuffer(channels, frames) {
    const data = Array.from({ length: channels }, () => new Float32Array(frames));
    return { getChannelData: channel => data[channel] };
  }

  async resume() {
    if (this.resumeSucceeds) this.state = 'running';
    return this.resumeSucceeds;
  }

  async suspend() {
    this.state = 'suspended';
  }

  async close() {
    this.state = 'closed';
    this.closed = true;
  }
}

function createPcm(sampleRate) {
  const tracks = {};
  for (const name of TRACK_NAMES) {
    tracks[name] = { seconds: 0.1, channels: [new Float32Array(16), new Float32Array(16)] };
  }
  return { sampleRate, tracks };
}

function withFakeContext(t, options) {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = function FakeContext() {
    return new FakeAudioContext(options);
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  });
}

test('室内与夏季混音使用正确的 view 名称和声部权重', () => {
  const indoor = getMixLevels('summer', 'interior');
  assert.equal(indoor.cicada, 0);
  assert.equal(indoor.frog, 0);
  assert.equal(indoor.crackle, 0.5);
  assert.ok(getMixLevels('summer', 'outdoor').cicada > 0.5);
  assert.equal(getMixLevels('unknown', 'outdoor'), getMixLevels('autumn', 'outdoor'));
});

test('自动播放被拦截时不会提前合成 PCM', async t => {
  withFakeContext(t, { state: 'suspended', resumeSucceeds: false });
  let synthesisCalls = 0;
  const ambient = new AmbientSoundscape({
    createWorker: () => null,
    synthesizePcm: sampleRate => {
      synthesisCalls += 1;
      return createPcm(sampleRate);
    },
  });

  assert.equal(await ambient.enable(), false);
  assert.equal(synthesisCalls, 0);
  assert.equal(ambient.started, false);
  assert.equal(ambient.enabled, false);
  ambient.dispose();
});

test('用户开启后暂停、后台挂起和恢复保持同一状态', async t => {
  withFakeContext(t, {});
  const ambient = new AmbientSoundscape({
    createWorker: () => null,
    synthesizePcm: sampleRate => createPcm(sampleRate),
  });
  assert.equal(await ambient.enable(), true);
  assert.equal(ambient.started, true);
  assert.equal(ambient.sources.length, 8);
  assert.equal(ambient.context.state, 'running');

  await ambient.pause();
  assert.equal(ambient.pausedByTour, true);
  assert.equal(ambient.context.state, 'suspended');

  await ambient.resume();
  assert.equal(ambient.pausedByTour, false);
  assert.equal(ambient.context.state, 'running');

  await ambient.setVisibility(false);
  assert.equal(ambient.context.state, 'suspended');
  await ambient.setVisibility(true);
  assert.equal(ambient.context.state, 'running');
  ambient.dispose();
});

test('关闭声音后延迟挂起，销毁停止音源并关闭上下文', async t => {
  withFakeContext(t, {});
  let scheduled = null;
  const ambient = new AmbientSoundscape({
    createWorker: () => null,
    synthesizePcm: sampleRate => createPcm(sampleRate),
    setTimeoutFn: callback => { scheduled = callback; return 7; },
    clearTimeoutFn: () => {},
  });
  await ambient.enable();
  const context = ambient.context;
  ambient.disable();
  assert.equal(ambient.enabled, false);
  assert.equal(typeof scheduled, 'function');
  scheduled();
  await Promise.resolve();
  assert.equal(context.state, 'suspended');

  const sources = [...ambient.sources];
  ambient.dispose();
  assert.equal(context.closed, true);
  assert.ok(sources.every(source => source.stopped));
  assert.equal(ambient.sources.length, 0);
});
test('Worker 合成契约包含八路等长双声道 PCM', () => {
  const sampleRate = 8000;
  const pcm = synthesizePcm(sampleRate);
  assert.equal(pcm.sampleRate, sampleRate);
  assert.deepEqual(Object.keys(pcm.tracks), AUDIO_TRACKS.map(track => track.name));
  for (const track of AUDIO_TRACKS) {
    const result = pcm.tracks[track.name];
    assert.equal(result.seconds, track.seconds);
    assert.equal(result.channels.length, 2);
    assert.equal(result.channels[0].length, Math.floor(sampleRate * track.seconds));
    assert.equal(result.channels[1].length, result.channels[0].length);
  }
});

test('分片合成可在批次之间响应取消', async () => {
  const controller = new AbortController();
  let yields = 0;
  await assert.rejects(
    synthesizePcmChunked(3000, {
      signal: controller.signal,
      yieldTask: async () => {
        yields += 1;
        if (yields === 2) controller.abort();
      },
    }),
    error => error.name === 'AbortError',
  );
  assert.ok(yields >= 2);
});
test('Worker 成功返回时转移 PCM 并停止 Worker', async t => {
  withFakeContext(t, {});
  const listeners = new Map();
  const worker = {
    terminated: false,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    postMessage({ sampleRate }) {
      queueMicrotask(() => {
        const event = { data: { type: 'complete', ...createPcm(sampleRate) } };
        for (const listener of listeners.get('message') ?? []) listener(event);
      });
    },
    terminate() {
      this.terminated = true;
    },
  };
  const ambient = new AmbientSoundscape({
    createWorker: () => worker,
    synthesizePcm: () => {
      throw new Error('Worker 成功时不应进入降级路径');
    },
  });

  assert.equal(await ambient.enable(), true);
  assert.equal(ambient.sources.length, 8);
  assert.equal(worker.terminated, true);
  ambient.dispose();
});

test('Worker 失败后分片降级仍可完成初始化', async t => {
  withFakeContext(t, {});
  t.mock.method(console, 'warn', () => {});
  const listeners = new Map();
  const worker = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    postMessage() {
      queueMicrotask(() => {
        const event = { data: { type: 'error', message: '模拟失败' } };
        for (const listener of listeners.get('message') ?? []) listener(event);
      });
    },
    terminate() {},
  };
  let fallbackCalls = 0;
  const ambient = new AmbientSoundscape({
    createWorker: () => worker,
    synthesizePcm: sampleRate => {
      fallbackCalls += 1;
      return createPcm(sampleRate);
    },
  });

  assert.equal(await ambient.enable(), true);
  assert.equal(fallbackCalls, 1);
  assert.equal(ambient.sources.length, 8);
  ambient.dispose();
});
