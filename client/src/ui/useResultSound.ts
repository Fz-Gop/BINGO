import { useEffect, useRef } from "react";
import type { MatchResult } from "../state/types";

type AudioContextCtor = typeof AudioContext;
type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: AudioContextCtor;
};

function getAudioContextCtor() {
  const win = window as WindowWithWebkitAudio;
  return globalThis.AudioContext ?? win.webkitAudioContext ?? null;
}

function scheduleTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  gainLevel: number
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainLevel, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}

function getTonePlan(result: MatchResult, selfPlayerId: string | undefined) {
  if (!result || !selfPlayerId) return null;

  if (result.awardedPointIds.length > 1) {
    return [392, 523.25, 392];
  }

  if (result.awardedPointIds.includes(selfPlayerId)) {
    return [523.25, 659.25, 783.99, 1046.5];
  }

  return [392, 329.63, 261.63];
}

export function useResultSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const interactionReadyRef = useRef(false);

  useEffect(() => {
    function unlockAudio() {
      interactionReadyRef.current = true;
      const AudioCtor = getAudioContextCtor();
      if (!AudioCtor) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtor();
      }
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
    }

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      void audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  return function playResult(result: MatchResult, selfPlayerId: string | undefined) {
    if (!interactionReadyRef.current) return;

    const AudioCtor = getAudioContextCtor();
    if (!AudioCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }

    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    const plan = getTonePlan(result, selfPlayerId);
    if (!plan) return;

    const start = ctx.currentTime + 0.02;
    plan.forEach((frequency, index) => {
      scheduleTone(ctx, frequency, start + index * 0.12, 0.18, 0.055);
    });
  };
}
