import { mulberry32 } from './utils.js';

/**
 * 程序化环境声：不依赖外部音频文件。
 * 风声、柴火、虫鸣、蛙声与鸟鸣都在浏览器内实时合成。
 */
export class AmbientSoundscape {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = false;
    this.started = false;
    this.season = 'autumn';
    this.view = 'outdoor';
    this.gains = null;
    this.pausedByTour = false;
  }

  createNoiseBuffer(seconds = 6) {
    const { context } = this;
    const frameCount = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, frameCount, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let brown = 0;
      for (let index = 0; index < frameCount; index += 1) {
        const white = Math.random() * 2 - 1;
        brown = (brown + white * 0.02) * 0.998;
        data[index] = brown * 1.8 + white * 0.08;
      }
    }
    return buffer;
  }

  createCrackleBuffer(seconds = 7) {
    const { context } = this;
    const frameCount = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, frameCount, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let event = 0; event < 30; event += 1) {
        const start = Math.floor(Math.random() * (frameCount - 2400));
        const length = Math.floor(80 + Math.random() * 1500);
        const amplitude = Math.random() * 0.36 + 0.04;
        for (let index = 0; index < length; index += 1) {
          const decay = Math.exp((-index / length) * 7);
          data[start + index] += (Math.random() * 2 - 1) * decay * amplitude;
        }
      }
    }
    return buffer;
  }

  createCricketBuffer(seconds = 8) {
    const { context } = this;
    const frameCount = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, frameCount, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      const baseFrequency = channel === 0 ? 3850 : 4260;
      const period = channel === 0 ? 1.26 : 1.61;
      for (let startTime = 0.18; startTime < seconds - 0.3; startTime += period) {
        for (let chirp = 0; chirp < 4; chirp += 1) {
          const pulseStart = Math.floor((startTime + chirp * 0.055) * context.sampleRate);
          const pulseLength = Math.floor(0.028 * context.sampleRate);
          for (let index = 0; index < pulseLength; index += 1) {
            const envelope = Math.sin((index / pulseLength) * Math.PI);
            data[pulseStart + index] += Math.sin((index / context.sampleRate) * Math.PI * 2 * baseFrequency) * envelope * 0.032;
          }
        }
      }
    }
    return buffer;
  }

  createFrogBuffer(seconds = 9) {
    const { context } = this;
    const frameCount = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, frameCount, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      const periods = channel === 0 ? 1.65 : 2.45;
      const baseFrequency = channel === 0 ? 132 : 108;
      for (let call = 0.3; call < seconds - 1; call += periods) {
        for (let pulse = 0; pulse < 3; pulse += 1) {
          const start = Math.floor((call + pulse * 0.16) * context.sampleRate);
          const length = Math.floor(0.11 * context.sampleRate);
          for (let index = 0; index < length; index += 1) {
            const t = index / context.sampleRate;
            const envelope = Math.sin((index / length) * Math.PI);
            const vibrato = 1 + Math.sin(t * 42) * 0.06;
            data[start + index] += Math.sin(t * Math.PI * 2 * baseFrequency * vibrato) * envelope * 0.12;
          }
        }
      }
    }
    return buffer;
  }

  createCicadaBuffer(seconds = 10) {
    const { context } = this;
    const frameCount = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, frameCount, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      const random = mulberry32(9317 + channel * 41);
      const baseFrequency = channel === 0 ? 4860 : 5480;
      const pulseRate = channel === 0 ? 63 : 77;
      const frequency = Math.round(baseFrequency * seconds) / seconds;
      const tremoloRate = Math.round(pulseRate * seconds) / seconds;
      for (let index = 0; index < frameCount; index += 1) {
        const time = index / context.sampleRate;
        const slowSwell = 0.58 + Math.sin(Math.PI * 2 * (0.17 + channel * 0.03) * time) * 0.24;
        const tremolo = 0.36 + Math.sin(Math.PI * 2 * tremoloRate * time + channel) * 0.42;
        const wingNoise = (random() * 2 - 1) * 0.009;
        data[index] = (Math.sin(Math.PI * 2 * frequency * time) * 0.046 + wingNoise) * tremolo * slowSwell;
      }
    }
    return buffer;
  }

  createBirdBuffer(seconds = 9) {
    const { context } = this;
    const frameCount = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, frameCount, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      const randomChirps = channel === 0 ? 14 : 10;
      for (let chirp = 0; chirp < randomChirps; chirp += 1) {
        const startTime = 0.2 + Math.random() * (seconds - 0.8);
        const length = Math.floor((0.055 + Math.random() * 0.09) * context.sampleRate);
        const startFrequency = 2200 + Math.random() * 900;
        const endFrequency = startFrequency + 500 + Math.random() * 900;
        const start = Math.floor(startTime * context.sampleRate);
        for (let index = 0; index < length; index += 1) {
          const progress = index / length;
          const envelope = Math.sin(progress * Math.PI);
          const frequency = startFrequency + (endFrequency - startFrequency) * progress;
          data[start + index] += Math.sin((index / context.sampleRate) * Math.PI * 2 * frequency) * envelope * 0.035;
        }
      }
    }
    return buffer;
  }


  createMusicBuffer(seconds = 34) {
    const { context } = this;
    const frameCount = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, frameCount, context.sampleRate);
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
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < frameCount; index += 1) {
        const time = index / context.sampleRate;
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
        const start = Math.floor(startTime * context.sampleRate);
        const length = Math.floor(duration * context.sampleRate);
        for (let index = 0; index < length && start + index < frameCount; index += 1) {
          const t = index / context.sampleRate;
          const envelope = Math.exp(-t * 2.4) * Math.min(1, index / 300);
          data[start + index] += Math.sin(Math.PI * 2 * frequency * t) * envelope * 0.03;
          data[start + index] += Math.sin(Math.PI * 2 * frequency * 1.5 * t) * envelope * 0.007;
        }
      }
    }
    return buffer;
  }

  createLoopSource(buffer, filterType, frequency, gainValue, panValue, q = 1) {
    const { context } = this;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    const pan = context.createStereoPanner();
    pan.pan.value = panValue;
    source.connect(filter).connect(gain).connect(pan).connect(this.master);
    source.start();
    return { source, gain, filter };
  }

  async initialize() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('当前浏览器不支持 Web Audio');
    this.context = new AudioContextClass();
    const { context } = this;

    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(context.destination);

    const windSource = context.createBufferSource();
    windSource.buffer = this.createNoiseBuffer(7);
    windSource.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 450;
    windFilter.Q.value = 0.5;
    const windGain = context.createGain();
    windGain.gain.value = 0.34;
    const windPan = context.createStereoPanner();
    windPan.pan.value = -0.12;
    windSource.connect(windFilter).connect(windGain).connect(windPan).connect(this.master);
    windSource.start();
    const windLfo = context.createOscillator();
    windLfo.type = 'sine';
    windLfo.frequency.value = 0.06;
    const windLfoAmount = context.createGain();
    windLfoAmount.gain.value = 130;
    windLfo.connect(windLfoAmount).connect(windFilter.frequency);
    windLfo.start();

    const gust = this.createLoopSource(this.createNoiseBuffer(5.5), 'bandpass', 780, 0.08, 0.34, 0.55);
    const crackle = this.createLoopSource(this.createCrackleBuffer(9), 'highpass', 720, 0.34, 0.28);
    const cricket = this.createLoopSource(this.createCricketBuffer(11), 'bandpass', 4050, 0.18, -0.35, 2.2);
    const cicada = this.createLoopSource(this.createCicadaBuffer(10), 'bandpass', 5000, 0.2, 0.42, 1.25);
    const frog = this.createLoopSource(this.createFrogBuffer(10), 'lowpass', 330, 0.26, -0.18, 0.6);
    const bird = this.createLoopSource(this.createBirdBuffer(10), 'bandpass', 2850, 0.16, 0.28, 1.2);
    const music = this.createLoopSource(this.createMusicBuffer(34), 'lowpass', 4200, 0.92, 0, 0.45);

    this.sources = [windSource, gust.source, crackle.source, cricket.source, cicada.source, frog.source, bird.source, music.source];
    this.musicGain = music.gain;
    this.gains = {
      wind: windGain,
      gust: gust.gain,
      crackle: crackle.gain,
      cricket: cricket.gain,
      cicada: cicada.gain,
      frog: frog.gain,
      bird: bird.gain,
    };
    this.started = true;
    this.applyMix(true);
  }

  applyMix(immediate = false) {
    if (!this.gains || !this.context) return;
    let mix;
    if (this.view === 'indoor') {
      mix = { wind: 0.11, gust: 0.018, crackle: 0.5, cricket: 0.008, cicada: 0, frog: 0, bird: 0 };
    } else if (this.season === 'spring') {
      mix = { wind: 0.32, gust: 0.08, crackle: 0.045, cricket: 0.05, cicada: 0.02, frog: 0.02, bird: 0.32 };
    } else if (this.season === 'summer') {
      mix = { wind: 0.24, gust: 0.06, crackle: 0.035, cricket: 0.34, cicada: 0.56, frog: 0.62, bird: 0.08 };
    } else if (this.season === 'winter') {
      mix = { wind: 0.3, gust: 0.04, crackle: 0.035, cricket: 0, cicada: 0, frog: 0, bird: 0 };
    } else {
      mix = { wind: 0.38, gust: 0.11, crackle: 0.045, cricket: 0.18, cicada: 0.08, frog: 0, bird: 0.025 };
    }
    const now = this.context.currentTime;
    for (const [key, value] of Object.entries(mix)) {
      const gain = this.gains[key];
      gain.gain.cancelScheduledValues(now);
      if (immediate) {
        gain.gain.setValueAtTime(value, now);
      } else {
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, value), now + 1.1);
      }
    }
  }

  setMode(season, view) {
    this.season = season;
    this.view = view;
    this.applyMix(false);
  }

  async enable() {
    if (!this.started) await this.initialize();
    if (this.context.state === 'suspended') {
      const resumeAttempt = this.context.resume().then(() => true).catch(() => false);
      const timeout = new Promise((resolve) => {
        window.setTimeout(() => resolve(false), 650);
      });
      await Promise.race([resumeAttempt, timeout]);
    }
    if (this.context.state !== 'running') {
      this.enabled = false;
      return false;
    }
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(0.92, now + 1.35);
    this.enabled = true;
    return true;
  }

  disable() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    this.enabled = false;
  }

  async toggle() {
    if (this.enabled) {
      this.disable();
      return false;
    }
    return this.enable();
  }

  pause() {
    if (!this.context || !this.enabled) return;
    this.pausedByTour = true;
    if (this.context.state === 'running') {
      this.context.suspend().catch(() => {});
    }
  }

  resume() {
    if (!this.context || !this.enabled || !this.pausedByTour) return;
    this.pausedByTour = false;
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
  }
}
