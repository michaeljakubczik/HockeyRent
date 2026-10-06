import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const preferenceKey = 'hockey_button_sound_v1';
type SoundKind = 'click' | 'delete' | 'return' | 'money' | 'bag' | 'create';

// Quiet, local effects: no downloaded recordings or additional network requests.
function synthesize(audio: AudioContext, kind: SoundKind) {
  const now = audio.currentTime;
  const noise = (duration: number, level: number, frequency: number, endFrequency = frequency, paper = false) => {
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const t = i / audio.sampleRate;
      const texture = paper ? 0.2 + Math.pow(Math.sin(t * 155), 6) * 0.8 : 1;
      samples[i] = (Math.random() * 2 - 1) * texture;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = kind === 'return' ? 'bandpass' : 'lowpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + Math.min(0.015, duration / 5));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(audio.destination);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(now);
  };
  const tone = (frequency: number, delay: number, duration: number, level: number, endFrequency = frequency) => {
    const source = audio.createOscillator();
    source.type = 'sine';
    source.frequency.setValueAtTime(frequency, now + delay);
    source.frequency.exponentialRampToValueAtTime(endFrequency, now + delay + duration);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(level, now + delay + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
    source.connect(gain); gain.connect(audio.destination);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(now + delay); source.stop(now + delay + duration);
  };
  if (kind === 'delete') noise(0.19, 0.11, 3600, 1400, true);
  else if (kind === 'return') noise(0.16, 0.12, 2400, 450);
  else if (kind === 'money') {
    tone(1550, 0, 0.09, 0.025);
    tone(2250, 0.045, 0.1, 0.018);
  } else if (kind === 'create') {
    tone(420, 0, 0.045, 0.025);
    tone(1100, 0.04, 0.13, 0.025);
    tone(2200, 0.04, 0.08, 0.008);
  } else if (kind === 'bag') {
    noise(0.075, 0.065, 1600, 700);
    tone(180, 0.015, 0.07, 0.025, 100);
  } else noise(0.018, 0.09, 2400);
}

export function useButtonSound() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(preferenceKey) !== 'off'; } catch { return true; }
  });
  const enabledRef = useRef(enabled);
  const context = useRef<AudioContext | null>(null);
  const pendingClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSound = useRef(-Infinity);
  const prepare = useCallback(() => {
    if (pendingClick.current !== null) clearTimeout(pendingClick.current);
    pendingClick.current = null;
  }, []);
  const getAudio = useCallback(() => {
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
    } catch { /* Optional Safari API. */ }
    const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return null;
    return context.current ?? (context.current = new Audio());
  }, []);
  const play = useCallback((kind: SoundKind = 'click', preview = false) => {
    prepare();
    if ((!enabledRef.current && !preview) || document.hidden) return;
    try {
      const audio = getAudio();
      if (!audio) return;
      const emit = () => {
        if ((!enabledRef.current && !preview) || document.hidden || audio.state !== 'running') return;
        if (performance.now() - lastSound.current < 220) return;
        lastSound.current = performance.now();
        synthesize(audio, kind);
      };
      if (audio.state === 'running') emit();
      else void audio.resume().then(emit).catch(() => {});
    } catch { /* Sound must never interrupt an action. */ }
  }, [getAudio, prepare]);

  useEffect(() => {
    enabledRef.current = enabled;
    try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch { /* Optional preference storage. */ }
    if (!enabled) return;
    const onClick = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (!event.isTrusted || !button || button.disabled || button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('data-sound-toggle')) return;
      // Unlock Safari during the gesture; the action handler can replace the click.
      try { const audio = getAudio(); if (audio && audio.state !== 'running') void audio.resume().catch(() => {}); } catch { /* Optional audio. */ }
      prepare();
      pendingClick.current = setTimeout(() => play('click'), 0);
    };
    document.addEventListener('click', onClick, true);
    return () => { document.removeEventListener('click', onClick, true); prepare(); };
  }, [enabled, getAudio, play, prepare]);

  useEffect(() => () => {
    prepare();
    if (context.current) void context.current.close().catch(() => {});
    context.current = null;
  }, [prepare]);

  return { enabled, prepare, play, toggle: () => {
    enabledRef.current = !enabled;
    if (!enabled) play('click', true);
    else {
      prepare();
      try {
        const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'auto';
      } catch { /* Optional browser API. */ }
    }
    setEnabled(value => !value);
  } };
}

export function SoundToggle({ enabled, toggle }: { enabled: boolean; toggle: () => void }) {
  const label = enabled ? 'Töne ausschalten' : 'Töne einschalten';
  const Icon = enabled ? Volume2 : VolumeX;
  return <button type="button" data-sound-toggle aria-label={label} title={label} aria-pressed={enabled}
    onClick={toggle} className="p-2.5 shrink-0 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer">
    <Icon className="w-5 h-5" />
  </button>;
}
