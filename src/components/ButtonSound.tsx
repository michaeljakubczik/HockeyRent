import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const preferenceKey = 'hockey_button_sound_v1';

export function useButtonSound() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(preferenceKey) !== 'off'; }
    catch { return true; }
  });
  const context = useRef<AudioContext | null>(null);
  const lastClick = useRef(0);

  const playClick = useCallback(() => {
      try {
        // Safari otherwise routes Web Audio through the iPhone silent switch.
        try {
          const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
          if (session) session.type = 'playback';
        } catch { /* Older browsers use the default audio route. */ }
        // Create/resume only during a user gesture (including iOS Safari).
        const Audio = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) return;
        const audio = context.current ?? (context.current = new Audio());
        const play = () => {
          if (audio.state !== 'running' || document.hidden) return;
          // A soft, filtered 18 ms noise impulse sounds like a button click.
          const duration = 0.018;
          const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
          const samples = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
          const source = audio.createBufferSource();
          source.buffer = buffer;
          const filter = audio.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 2400;
          filter.Q.value = 0.5;
          const gain = audio.createGain();
          const now = audio.currentTime;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.09, now + 0.001);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
          source.connect(filter);
          filter.connect(gain);
          gain.connect(audio.destination);
          source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
          source.start(now);
        };
        if (audio.state === 'running') play();
        else void audio.resume().then(play).catch(() => {});
      } catch { /* Audio feedback must never interrupt an action. */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(preferenceKey, enabled ? 'on' : 'off'); } catch { /* Optional preference storage. */ }
    if (!enabled) return;
    const onClick = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (!event.isTrusted || !button || button.disabled || button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('data-sound-toggle')) return;
      if (performance.now() - lastClick.current < 100) return;
      lastClick.current = performance.now();
      playClick();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [enabled, playClick]);

  useEffect(() => () => {
    if (context.current) void context.current.close().catch(() => {});
    context.current = null;
  }, []);

  return { enabled, toggle: () => {
    if (!enabled) playClick(); // An immediate sample also unlocks Safari audio.
    else {
      try {
        const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'auto';
      } catch { /* Optional browser API. */ }
    }
    setEnabled(value => !value);
  } };
}

export function SoundToggle({ enabled, toggle }: { enabled: boolean; toggle: () => void }) {
  const label = enabled ? 'Klickton ausschalten' : 'Klickton einschalten';
  const Icon = enabled ? Volume2 : VolumeX;
  return <button type="button" data-sound-toggle aria-label={label} title={label} aria-pressed={enabled}
    onClick={toggle} className="p-2.5 shrink-0 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer">
    <Icon className="w-5 h-5" />
  </button>;
}
