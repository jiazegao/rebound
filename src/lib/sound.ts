/** Short beeps for the "5 SECONDS" warning and "TIME", using the Web Audio API (no sound files). */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

export function beep(kind: 'warning' | 'time' | 'buzz' = 'warning'): void {
  const ctx = audio();
  if (!ctx) return;
  const settings = {
    warning: { freq: 880, duration: 0.15, repeats: 1 },
    time: { freq: 520, duration: 0.45, repeats: 1 },
    buzz: { freq: 660, duration: 0.08, repeats: 1 },
  }[kind];
  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = settings.freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + settings.duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + settings.duration + 0.05);
}

/** Browsers only allow audio after a user gesture; call this from a click handler. */
export function unlockAudio(): void {
  audio();
}
