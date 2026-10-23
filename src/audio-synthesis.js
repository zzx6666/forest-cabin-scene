import { mulberry32 } from './utils.js';

// 八路声景的时长与原实现一致；Worker 与降级路径共用同一套逐样本公式。
export const AUDIO_TRACKS = Object.freeze([
  { name: 'wind', kind: 'noise', seconds: 7 },
  { name: 'gust', kind: 'noise', seconds: 5.5 },
  { name: 'crackle', kind: 'crackle', seconds: 9 },
  { name: 'cricket', kind: 'cricket', seconds: 11 },
  { name: 'cicada', kind: 'cicada', seconds: 10 },
  { name: 'frog', kind: 'frog', seconds: 10 },
  { name: 'bird', kind: 'bird', seconds: 10 },
  { name: 'music', kind: 'music', seconds: 34 },
].map(Object.freeze));

const CHUNK_SAMPLES = 2048;

function* createNoisePcm(sampleRate, randomSource, seconds = 6) {
const frameCount = Math.floor(sampleRate * seconds);
const channels = Array.from({ length: 2 }, () => new Float32Array(frameCount));
let remaining = CHUNK_SAMPLES;
for (let channel = 0; channel < 2; channel += 1) {
  const data = channels[channel];
  let brown = 0;
  for (let index = 0; index < frameCount; index += 1) {
    if (--remaining === 0) {
      remaining = CHUNK_SAMPLES;
      yield;
    }
    const white = randomSource() * 2 - 1;
    brown = (brown + white * 0.02) * 0.998;
    data[index] = brown * 1.8 + white * 0.08;
  }
}
return { seconds, channels };
  }

function* createCracklePcm(sampleRate, randomSource, seconds = 7) {
const frameCount = Math.floor(sampleRate * seconds);
const channels = Array.from({ length: 2 }, () => new Float32Array(frameCount));
let remaining = CHUNK_SAMPLES;
for (let channel = 0; channel < 2; channel += 1) {
  const data = channels[channel];
  for (let event = 0; event < 30; event += 1) {
    const start = Math.floor(randomSource() * (frameCount - 2400));
    const length = Math.floor(80 + randomSource() * 1500);
    const amplitude = randomSource() * 0.36 + 0.04;
    for (let index = 0; index < length; index += 1) {
      if (--remaining === 0) {
        remaining = CHUNK_SAMPLES;
        yield;
      }
      const decay = Math.exp((-index / length) * 7);
      data[start + index] += (randomSource() * 2 - 1) * decay * amplitude;
    }
  }
}
return { seconds, channels };
  }

function* createCricketPcm(sampleRate, randomSource, seconds = 8) {
const frameCount = Math.floor(sampleRate * seconds);
const channels = Array.from({ length: 2 }, () => new Float32Array(frameCount));
let remaining = CHUNK_SAMPLES;
for (let channel = 0; channel < 2; channel += 1) {
  const data = channels[channel];
  const baseFrequency = channel === 0 ? 3850 : 4260;
  const period = channel === 0 ? 1.26 : 1.61;
  for (let startTime = 0.18; startTime < seconds - 0.3; startTime += period) {
    for (let chirp = 0; chirp < 4; chirp += 1) {
      const pulseStart = Math.floor((startTime + chirp * 0.055) * sampleRate);
      const pulseLength = Math.floor(0.028 * sampleRate);
      for (let index = 0; index < pulseLength; index += 1) {
        if (--remaining === 0) {
          remaining = CHUNK_SAMPLES;
          yield;
        }
        const envelope = Math.sin((index / pulseLength) * Math.PI);
        data[pulseStart + index] += Math.sin((index / sampleRate) * Math.PI * 2 * baseFrequency) * envelope * 0.032;
      }
    }
  }
}
return { seconds, channels };
  }

function* createFrogPcm(sampleRate, randomSource, seconds = 9) {
const frameCount = Math.floor(sampleRate * seconds);
const channels = Array.from({ length: 2 }, () => new Float32Array(frameCount));
let remaining = CHUNK_SAMPLES;
for (let channel = 0; channel < 2; channel += 1) {
  const data = channels[channel];
  const periods = channel === 0 ? 1.65 : 2.45;
  const baseFrequency = channel === 0 ? 132 : 108;
  for (let call = 0.3; call < seconds - 1; call += periods) {
    for (let pulse = 0; pulse < 3; pulse += 1) {
      const start = Math.floor((call + pulse * 0.16) * sampleRate);
      const length = Math.floor(0.11 * sampleRate);
      for (let index = 0; index < length; index += 1) {
        if (--remaining === 0) {
          remaining = CHUNK_SAMPLES;
          yield;
        }
        const t = index / sampleRate;
        const envelope = Math.sin((index / length) * Math.PI);
        const vibrato = 1 + Math.sin(t * 42) * 0.06;
        data[start + index] += Math.sin(t * Math.PI * 2 * baseFrequency * vibrato) * envelope * 0.12;
      }
    }
  }
}
return { seconds, channels };
  }

function* createCicadaPcm(sampleRate, randomSource, seconds = 10) {
const frameCount = Math.floor(sampleRate * seconds);
const channels = Array.from({ length: 2 }, () => new Float32Array(frameCount));
let remaining = CHUNK_SAMPLES;
for (let channel = 0; channel < 2; channel += 1) {
  const data = channels[channel];
  const random = mulberry32(9317 + channel * 41);
  const baseFrequency = channel === 0 ? 4860 : 5480;
  const pulseRate = channel === 0 ? 63 : 77;
  const frequency = Math.round(baseFrequency * seconds) / seconds;
  const tremoloRate = Math.round(pulseRate * seconds) / seconds;
  for (let index = 0; index < frameCount; index += 1) {
    if (--remaining === 0) {
      remaining = CHUNK_SAMPLES;
      yield;
    }
    const time = index / sampleRate;
    const slowSwell = 0.58 + Math.sin(Math.PI * 2 * (0.17 + channel * 0.03) * time) * 0.24;
    const tremolo = 0.36 + Math.sin(Math.PI * 2 * tremoloRate * time + channel) * 0.42;
    const wingNoise = (random() * 2 - 1) * 0.009;
    data[index] = (Math.sin(Math.PI * 2 * frequency * time) * 0.046 + wingNoise) * tremolo * slowSwell;
  }
}
return { seconds, channels };
  }

function* createBirdPcm(sampleRate, randomSource, seconds = 9) {
const frameCount = Math.floor(sampleRate * seconds);
const channels = Array.from({ length: 2 }, () => new Float32Array(frameCount));
let remaining = CHUNK_SAMPLES;
for (let channel = 0; channel < 2; channel += 1) {
  const data = channels[channel];
  const randomChirps = channel === 0 ? 14 : 10;
  for (let chirp = 0; chirp < randomChirps; chirp += 1) {
    const startTime = 0.2 + randomSource() * (seconds - 0.8);
    const length = Math.floor((0.055 + randomSource() * 0.09) * sampleRate);
    const startFrequency = 2200 + randomSource() * 900;
    const endFrequency = startFrequency + 500 + randomSource() * 900;
    const start = Math.floor(startTime * sampleRate);
    for (let index = 0; index < length; index += 1) {
      if (--remaining === 0) {
        remaining = CHUNK_SAMPLES;
        yield;
      }
      const progress = index / length;
      const envelope = Math.sin(progress * Math.PI);
      const frequency = startFrequency + (endFrequency - startFrequency) * progress;
      data[start + index] += Math.sin((index / sampleRate) * Math.PI * 2 * frequency) * envelope * 0.035;
    }
  }
}
return { seconds, channels };
  }


function* createMusicPcm(sampleRate, randomSource, seconds = 34) {
const frameCount = Math.floor(sampleRate * seconds);
const channels = Array.from({ length: 2 }, () => new Float32Array(frameCount));
let remaining = CHUNK_SAMPLES;
const chords = [
  [146.83, 220.0, 293.66, 369.99],
  [123.47, 185.0, 246.94, 369.99],
  [98.0, 146.83, 196.0, 246.94],
  [110.0, 164.81, 220.0, 277.18],
];
const chordLength = seconds / chords.length;
const melody = [587.33, 739.99, 880.0, 659.25, 554.37, 739.99, 493.88, 659.25];
const random = mulberry32(84721);
for (let channel = 0; channel < 2; channel += 1) {
  const data = channels[channel];
  for (let index = 0; index < frameCount; index += 1) {
    if (--remaining === 0) {
      remaining = CHUNK_SAMPLES;
      yield;
    }
    const time = index / sampleRate;
    const chordIndex = Math.min(chords.length - 1, Math.floor(time / chordLength));
    const chord = chords[chordIndex];
    const localTime = time - chordIndex * chordLength;
    const attack = Math.min(1, localTime / 1.8);
    const release = Math.min(1, (chordLength - localTime) / 2.4);
    const envelope = Math.max(0, Math.min(attack, release));
    let sample = 0;
    chord.forEach((frequency, noteIndex) => {
      const detune = channel === 0 ? 0.997 : 1.003;
      sample += Math.sin(Math.PI * 2 * frequency * detune * time + noteIndex * 0.35) * 0.022;
      sample += Math.sin(Math.PI * 2 * frequency * 2 * detune * time + noteIndex * 0.18) * 0.0045;
    });
    sample *= envelope;
    const shimmer = Math.sin(Math.PI * 2 * 0.085 * time + channel * 0.8) * 0.0045;
    data[index] = sample + shimmer * envelope;
  }

  for (let event = 0; event < 10; event += 1) {
    const startTime = 1.2 + event * 3.2 + (channel === 0 ? 0 : 1.4) + random() * 0.5;
    const frequency = melody[Math.floor(random() * melody.length)] * (channel === 0 ? 1 : 1.002);
    const duration = 1.8;
    const start = Math.floor(startTime * sampleRate);
    const length = Math.floor(duration * sampleRate);
    for (let index = 0; index < length && start + index < frameCount; index += 1) {
      if (--remaining === 0) {
        remaining = CHUNK_SAMPLES;
        yield;
      }
      const t = index / sampleRate;
      const envelope = Math.exp(-t * 2.4) * Math.min(1, index / 300);
      data[start + index] += Math.sin(Math.PI * 2 * frequency * t) * envelope * 0.03;
      data[start + index] += Math.sin(Math.PI * 2 * frequency * 1.5 * t) * envelope * 0.007;
    }
  }
}
return { seconds, channels };
  }

const synthesizers = {
  noise: createNoisePcm,
  crackle: createCracklePcm,
  cricket: createCricketPcm,
  frog: createFrogPcm,
  cicada: createCicadaPcm,
  bird: createBirdPcm,
  music: createMusicPcm,
};

function* generatePcm(sampleRate, random) {
  if (!Number.isInteger(sampleRate) || sampleRate < 3000 || sampleRate > 384000) {
    throw new RangeError('PCM 采样率须为 3000 至 384000 之间的整数');
  }
  const tracks = {};
  for (const { name, kind, seconds } of AUDIO_TRACKS) {
    tracks[name] = yield* synthesizers[kind](sampleRate, random, seconds);
    yield;
  }
  return { sampleRate, tracks };
}

export function createAbortError() {
  const error = new Error('音频合成已取消');
  error.name = 'AbortError';
  return error;
}

/** Worker 内直接合成；不访问 AudioContext，也不依赖静态音频素材。 */
export function synthesizePcm(sampleRate, { random = Math.random } = {}) {
  const generator = generatePcm(sampleRate, random);
  let step;
  do {
    step = generator.next();
  } while (!step.done);
  return step.value;
}

/** 降级时每批最多约 4ms，批次之间必须让出事件循环，而非只等待微任务。 */
export async function synthesizePcmChunked(sampleRate, {
  random = Math.random,
  signal,
  yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)),
  now = () => performance.now(),
  budgetMs = 4,
} = {}) {
  const generator = generatePcm(sampleRate, random);
  try {
    while (true) {
      if (signal?.aborted) throw createAbortError();
      await yieldTask();
      if (signal?.aborted) throw createAbortError();
      const start = now();
      let step;
      do {
        if (signal?.aborted) throw createAbortError();
        step = generator.next();
        if (step.done) return step.value;
      } while (now() - start < budgetMs);
    }
  } finally {
    generator.return();
  }
}
