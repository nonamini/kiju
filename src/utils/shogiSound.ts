import { loadAppSettings } from './appSettingsStorage';
import { getCachedCustomAssets, initCustomAssetsCache } from './customAssetsStorage';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudioCtx) return sharedAudioCtx;

  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioCtx = win.AudioContext ?? win.webkitAudioContext;
  if (!AudioCtx) return null;

  sharedAudioCtx = new AudioCtx();
  return sharedAudioCtx;
}

function playSynthesizedWoodClick(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;

  // Short bandpass-filtered noise burst for the dry wood snap attack
  const noiseDuration = 0.045;
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * noiseDuration));
  const noiseBuffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    channel[i] = (Math.random() * 2 - 1) * Math.exp((-i / sampleCount) * 6);
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1400, now);
  filter.Q.setValueAtTime(1.8, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.25, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseDuration);

  noiseSource.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSource.start(now);

  // Woody pitched body transient (720Hz -> 180Hz decay)
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(720, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.28, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

/**
 * Plays the user-uploaded custom piece sound if configured, otherwise falls back
 * to a crisp synthesized wooden shogi piece click when `soundEnabled` is active.
 */
export function playPieceMoveSound(): void {
  try {
    if (loadAppSettings().soundEnabled === false) return;

    void initCustomAssetsCache();
    const { soundDataUrl } = getCachedCustomAssets();
    if (soundDataUrl && typeof Audio !== 'undefined') {
      const audio = new Audio(soundDataUrl);
      void audio.play().catch(() => {
        playSynthesizedWoodClick();
      });
      return;
    }

    playSynthesizedWoodClick();
  } catch {
    // Ignore audio errors in restricted or headless environments
  }
}
