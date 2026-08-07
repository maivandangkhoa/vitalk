import { useCallback, useEffect, useRef, useState } from 'react';

/** Ring tone pulses before the sound gives up and leaves it to the quiet signals. */
const RING_PULSES = 6;
/** Gap between pulses. */
const RING_INTERVAL_MS = 3_500;
/** How fast the tab title alternates while the prompt is up. */
const BLINK_INTERVAL_MS = 900;
/** One tag, so a second prompt replaces the first instead of stacking. */
const NOTIFICATION_TAG = 'havitalk-incoming-call';

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor })
    .webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

/**
 * Two short blips — a phone-like double ring rather than one long tone, which
 * is easier to tell apart from notification sounds the teacher already has.
 *
 * The gain is ramped rather than switched: stepping a gain node straight to its
 * value is heard as a click on top of the note.
 */
function pulse(ctx: AudioContext): void {
  const start = ctx.currentTime;
  for (const [index, offset] of [0, 0.18].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = index === 0 ? 880 : 660;
    const at = start + offset;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.11, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.18);
  }
}

export interface IncomingAlert {
  /** True on alternate beats while the prompt is up — drive the tab title off it. */
  blink: boolean;
  /** Call from inside a click handler, before anything can await. */
  unlock: () => void;
}

/**
 * Makes the teacher's incoming prompt perceivable from a tab that is not in front.
 *
 * The prompt used to be silent, which is the whole reason it needed a
 * thirty-second auto-decline to feel like it was doing something: a teacher who
 * had switched tabs got no signal at all, and was then thrown out of the room
 * for not answering one. Three layers replace that, so the prompt can simply
 * wait instead.
 *
 * The sound is time-boxed and the quiet signals are not, which is deliberate:
 * a tone that repeats forever is the kind of thing people mute permanently,
 * while a blinking title costs nothing to leave running for as long as somebody
 * is genuinely waiting.
 */
export function useIncomingAlert(active: boolean, label: string): IncomingAlert {
  const ctxRef = useRef<AudioContext | null>(null);
  const [blink, setBlink] = useState(false);

  /**
   * Browsers only let an `AudioContext` start from a user gesture, and the one
   * gesture guaranteed to precede any prompt is pressing "enter classroom" —
   * every ring happens after somebody joined. Built here rather than on the
   * first ring, which has no gesture behind it and would stay silent.
   */
  const unlock = useCallback(() => {
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    try {
      ctxRef.current ??= new Ctor();
      void ctxRef.current.resume().catch(() => undefined);
    } catch {
      // An audio context we cannot build is not worth failing a join over.
      ctxRef.current = null;
    }
  }, []);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!active || !ctx) return;

    let fired = 0;
    const ring = () => {
      // A backgrounded tab can have the context suspended under it; resuming is
      // free when it is already running.
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      try {
        pulse(ctx);
      } catch {
        // A closed or blocked context: the title and notification carry it.
      }
      fired += 1;
    };

    ring();
    const timer = setInterval(() => {
      if (fired >= RING_PULSES) {
        clearInterval(timer);
        return;
      }
      ring();
    }, RING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active) {
      setBlink(false);
      return;
    }
    const timer = setInterval(() => setBlink((on) => !on), BLINK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    // Never asked for here. A permission prompt landing on someone who is about
    // to teach is worse than the missing notification, so this only uses a
    // grant the browser already has.
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    let note: Notification;
    try {
      note = new Notification(label, { tag: NOTIFICATION_TAG });
    } catch {
      // Android Chrome only allows these through a service worker.
      return;
    }
    note.onclick = () => {
      window.focus();
      note.close();
    };
    return () => note.close();
  }, [active, label]);

  return { blink, unlock };
}
