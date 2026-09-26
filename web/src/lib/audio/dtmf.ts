export const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) {
      sharedAudioCtx = new AudioCtxClass();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playDtmfTone(key: string, durationMs: number = 140): void {
  const freqs = DTMF_FREQUENCIES[key];
  if (!freqs) return;

  const ctx = getSharedAudioContext();
  if (!ctx) return;

  const [lowFreq, highFreq] = freqs;
  const now = ctx.currentTime;
  const durSec = durationMs / 1000;

  const oscLow = ctx.createOscillator();
  const oscHigh = ctx.createOscillator();
  oscLow.type = 'sine';
  oscHigh.type = 'sine';
  oscLow.frequency.setValueAtTime(lowFreq, now);
  oscHigh.frequency.setValueAtTime(highFreq, now);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.04, now + 0.015);
  gainNode.gain.setValueAtTime(0.04, now + durSec - 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + durSec);

  oscLow.connect(gainNode);
  oscHigh.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscLow.start(now);
  oscHigh.start(now);
  oscLow.stop(now + durSec);
  oscHigh.stop(now + durSec);
}

export function playHookSwitchSound(isOffHook: boolean): void {
  const ctx = getSharedAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(isOffHook ? 280 : 160, now);
  osc.frequency.exponentialRampToValueAtTime(isOffHook ? 140 : 80, now + 0.05);

  const initialGain = isOffHook ? 0.035 : 0.025;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(initialGain, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.075);
}
