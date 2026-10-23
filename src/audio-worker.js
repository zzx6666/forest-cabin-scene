import { synthesizePcm } from './audio-synthesis.js';

// 音频仍由公式生成；将所有声道的所有权转给主线程，避免复制整份 PCM。
globalThis.addEventListener('message', ({ data }) => {
  if (data?.type !== 'synthesize') return;
  try {
    const pcm = synthesizePcm(data.sampleRate);
    const transfer = Object.values(pcm.tracks).flatMap(({ channels }) => channels.map((channel) => channel.buffer));
    globalThis.postMessage({ type: 'complete', ...pcm }, transfer);
  } catch (error) {
    globalThis.postMessage({ type: 'error', message: error.message });
  }
});
