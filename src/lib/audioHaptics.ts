import type { SoundPreset, SoundSettings } from '../types/trazik';

let AC: AudioContext | null = null;
let wakeLockRef: WakeLockSentinel | null = null;
let hapticSwitchLabel: HTMLLabelElement | null = null;

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.75,
  preset: 'athletic',
};

let currentSoundConfig: SoundSettings = { ...DEFAULT_SOUND_SETTINGS };

export function setSoundConfig(cfg?: Partial<SoundSettings>) {
  currentSoundConfig = {
    enabled: cfg?.enabled ?? DEFAULT_SOUND_SETTINGS.enabled,
    volume:
      typeof cfg?.volume === 'number'
        ? Math.min(1, Math.max(0, cfg.volume))
        : DEFAULT_SOUND_SETTINGS.volume,
    preset: cfg?.preset ?? DEFAULT_SOUND_SETTINGS.preset,
  };
}

export function getSoundConfig(): SoundSettings {
  return currentSoundConfig;
}

export function unlockAudio() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      AC = AC || new AudioCtx();
      if (AC.state === 'suspended') {
        AC.resume().catch(() => {});
      }
    }
  } catch {
    // ignore
  }
}

export function tone(
  freq: number,
  dur: number,
  delay = 0,
  vol = 0.35,
  type: OscillatorType = 'sine',
  force = false
) {
  try {
    if (!force && (!currentSoundConfig.enabled || currentSoundConfig.volume <= 0.01)) {
      return;
    }
    unlockAudio();
    if (!AC) return;
    const effectiveVol = Math.min(0.65, Math.max(0.001, vol * currentSoundConfig.volume));
    const o = AC.createOscillator();
    const g = AC.createGain();
    const T = AC.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(freq, T);
    o.connect(g);
    g.connect(AC.destination);
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(effectiveVol, T + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, T + Math.max(0.03, dur));
    o.start(T);
    o.stop(T + Math.max(0.03, dur) + 0.03);
  } catch {
    // ignore
  }
}

const PRESET_PROFILES: Record<
  SoundPreset,
  {
    osc: OscillatorType;
    start: [number, number][];
    pause: [number, number][];
    tick: number;
    work: [number, number][];
    rest: [number, number][];
    finish: [number, number][];
  }
> = {
  athletic: {
    osc: 'triangle',
    start: [
      [587.33, 0.08],
      [880, 0.14],
    ],
    pause: [
      [659.25, 0.07],
      [440, 0.11],
    ],
    tick: 987.77,
    work: [
      [1046.5, 0.12],
      [1318.5, 0.2],
    ],
    rest: [
      [587.33, 0.12],
      [440, 0.22],
    ],
    finish: [
      [783.99, 0.12],
      [987.77, 0.12],
      [1174.66, 0.14],
      [1567.98, 0.28],
    ],
  },
  chime: {
    osc: 'sine',
    start: [
      [523.25, 0.1],
      [783.99, 0.18],
    ],
    pause: [
      [523.25, 0.09],
      [392.0, 0.14],
    ],
    tick: 880,
    work: [
      [880, 0.14],
      [1174.66, 0.24],
    ],
    rest: [
      [523.25, 0.18],
      [392.0, 0.26],
    ],
    finish: [
      [659.25, 0.14],
      [880, 0.14],
      [1046.5, 0.16],
      [1318.51, 0.32],
    ],
  },
  pulse: {
    osc: 'sine',
    start: [
      [660, 0.07],
      [990, 0.11],
    ],
    pause: [
      [620, 0.06],
      [415, 0.1],
    ],
    tick: 1100,
    work: [
      [1200, 0.11],
      [1200, 0.16],
    ],
    rest: [
      [520, 0.2],
      [520, 0.18],
    ],
    finish: [
      [880, 0.11],
      [1100, 0.11],
      [1320, 0.11],
      [1760, 0.26],
    ],
  },
};

export function playTimerStart(force = false) {
  const p = PRESET_PROFILES[currentSoundConfig.preset] || PRESET_PROFILES.athletic;
  let offset = 0;
  p.start.forEach(([freq, dur]) => {
    tone(freq, dur, offset, 0.24, p.osc, force);
    offset += dur * 0.85;
  });
}

export function playTimerPause() {
  const p = PRESET_PROFILES[currentSoundConfig.preset] || PRESET_PROFILES.athletic;
  let offset = 0;
  p.pause.forEach(([freq, dur]) => {
    tone(freq, dur, offset, 0.2, p.osc);
    offset += dur * 0.85;
  });
}

export function playCountdownTick(secRemaining: number) {
  const p = PRESET_PROFILES[currentSoundConfig.preset] || PRESET_PROFILES.athletic;
  const freq = secRemaining === 1 ? p.tick * 1.12 : p.tick;
  tone(freq, 0.075, 0, 0.2, p.osc);
}

export function playActionCue(kind: 'complete' | 'save' | 'delete') {
  if (!currentSoundConfig.enabled) return;
  if (kind === 'complete') {
    tone(740, 0.055, 0, 0.14, 'triangle');
    tone(987.77, 0.09, 0.045, 0.14, 'triangle');
  } else if (kind === 'save') {
    tone(659.25, 0.06, 0, 0.14, 'sine');
    tone(880, 0.1, 0.05, 0.14, 'sine');
  } else {
    tone(360, 0.07, 0, 0.12, 'sine');
  }
}

export function beepRestFinished() {
  const p = PRESET_PROFILES[currentSoundConfig.preset] || PRESET_PROFILES.athletic;
  let offset = 0;
  p.finish.slice(0, 3).forEach(([freq, dur]) => {
    tone(freq, dur, offset, 0.32, p.osc);
    offset += dur * 1.05;
  });
  try {
    navigator.vibrate?.([180, 80, 180, 80, 260]);
  } catch {
    // ignore
  }
}

export function ivAlarm(k: 'prep' | 'work' | 'rest' | 'end') {
  const p = PRESET_PROFILES[currentSoundConfig.preset] || PRESET_PROFILES.athletic;
  if (k === 'prep') {
    tone(523.25, 0.12, 0, 0.22, p.osc);
  } else if (k === 'work') {
    let offset = 0;
    p.work.forEach(([freq, dur]) => {
      tone(freq, dur, offset, 0.32, p.osc);
      offset += dur * 1.1;
    });
    try {
      navigator.vibrate?.([220]);
    } catch {}
  } else if (k === 'rest') {
    let offset = 0;
    p.rest.forEach(([freq, dur]) => {
      tone(freq, dur, offset, 0.26, p.osc);
      offset += dur * 1.05;
    });
    try {
      navigator.vibrate?.([110, 50, 110]);
    } catch {}
  } else if (k === 'end') {
    let offset = 0;
    p.finish.forEach(([freq, dur]) => {
      tone(freq, dur, offset, 0.34, p.osc);
      offset += dur * 1.05;
    });
    try {
      navigator.vibrate?.([260, 80, 260, 80, 420]);
    } catch {}
  }
}

export async function requestWakeLock() {
  try {
    if (navigator.wakeLock && !wakeLockRef) {
      wakeLockRef = await navigator.wakeLock.request('screen');
      wakeLockRef.addEventListener('release', () => {
        wakeLockRef = null;
      });
    }
  } catch {
    // ignore
  }
}

export function releaseWakeLock() {
  try {
    wakeLockRef?.release().catch(() => {});
  } catch {
    // ignore
  }
  wakeLockRef = null;
}

export function haptic(kind: 'light' | 'medium' | 'success' = 'light') {
  try {
    const cap = (
      window as unknown as {
        Capacitor?: {
          Plugins?: {
            Haptics?: {
              notification: (o: unknown) => void;
              impact: (o: unknown) => void;
            };
          };
        };
      }
    ).Capacitor;
    const H = cap?.Plugins?.Haptics;
    if (H) {
      if (kind === 'success') H.notification({ type: 'SUCCESS' });
      else H.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
      return;
    }
    if (navigator.vibrate) {
      navigator.vibrate(kind === 'success' ? [10, 40, 10] : kind === 'medium' ? 18 : 8);
      return;
    }
    if (!hapticSwitchLabel) {
      hapticSwitchLabel = document.createElement('label');
      hapticSwitchLabel.setAttribute('aria-hidden', 'true');
      hapticSwitchLabel.style.cssText =
        'position:fixed;left:-99px;top:-99px;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      hapticSwitchLabel.appendChild(input);
      document.body.appendChild(hapticSwitchLabel);
    }
    hapticSwitchLabel.click();
  } catch {
    // ignore
  }
}
