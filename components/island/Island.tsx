"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import s from "./island.module.css";
import { Spring } from "./spring";
import type { GlassShape } from "./glass-layer";
import type { IslandFrame, IslandHandle, IslandPage, IslandScene } from "./types";

/**
 * The island: one piece of liquid glass that carries the site's content over the
 * map. It enters as a Dynamic-Island-style pill, springs open, and morphs to fit
 * whichever page is showing. The glass itself is drawn by the map's GL layer (see
 * glass-layer.ts); this component owns geometry, content and paging.
 *
 * Paging works like an iPhone widget stack. The pages sit on one vertical strip
 * behind the glass: the page above has receded into the frost, the next waits
 * below the lower edge. Every input (a swipe, a trackpad, the wheel, the keys, the
 * page control, a #link) moves one number, the stack position, and everything is
 * drawn from it: the strip, the height of the glass, the page-control knob. A swipe
 * drags it 1:1 and lets go with its velocity; it never comes to rest between pages.
 *
 * A page can reach out of the glass: an element marked `data-thread` sends a
 * hairline from itself to the studio pin on the map (the About page's "place.").
 * The thread follows how present its page is, through a slower spring of its own,
 * so it scrubs with the stack but trails it like a cable.
 */

const PILL_H = 44;
const HEADER_DROP = 12;
const BODY_TOP = HEADER_DROP + PILL_H;
const RADIUS = 40;
const COMPACT_BELOW = 760;

/** The stack. Distances in CSS px, velocities in pages per second. */
const STACK = {
  gap: 28, // between one page's foot and the next page's head, on the strip
  recede: 0.06, // the page leaving upward shrinks back this much…
  blur: 10, // …and softens this much
  spread: 0.2, // the page arriving from below starts with its lines this much further apart
  fadeTop: 30, // the dissolve under the status row while the stack moves
  fadeBottom: 26, // …and along the lower edge
  stretch: 0.3, // how much of a pull past either end the glass itself gives
  give: 0.3, // the most, in pages, the stack gives past either end
  flick: 0.5, // a release faster than this turns the page
  project: 0.16, // seconds of release velocity projected when choosing the page
  wheelIdle: 140, // ms without wheel events that ends a trackpad gesture
  wheelTurn: 0.1, // …which turns the page if it travelled this far
  notch: 60, // wheel deltas this big, arriving apart, come from a mouse wheel
};

/** The thread from a page to the studio pin. Distances in CSS px. */
const THREAD = {
  draw: 0.9, // response of the thread's spring as it draws out…
  retract: 0.38, // …and as it pulls back, quicker, as exits are
  reel: 0.42, // let go by a page leaving upward, it reels into the pin this quickly
  from: 0.35, // how much of its page must be showing before it starts
  lead: 10, // gap between the anchor and the thread's first point
  gutter: 18, // on a phone, the thread climbs the island's right margin, this far in
  corner: 14, // …turning up into it on this radius
  clear: 28, // the pin must stand at least this far clear of the glass
  land: 7, // the thread stops short of the pin's centre by this much
};

/** The first reveal, per child of the opening page: delays in ms. */
const ENTRY_DELAYS = [40, 150, 240, 330, 420, 500];
const ENTRY_MS = 900;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** The house ease-out, cubic-bezier(0.16, 1, 0.3, 1), which is an exponential. */
const easeOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
/** iOS's rubber band: the further past the end, the harder it pulls back; `dim` is the most it gives. */
const rubber = (over: number, dim: number) => (1 - 1 / ((over * 0.55) / dim + 1)) * dim;

const istTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Keep the widths in step with `.body` in island.module.css. */
function frameFor(vw: number, vh: number, pageH: number): IslandFrame {
  const compact = vw < COMPACT_BELOW;
  const h = Math.round(BODY_TOP + pageH);
  if (compact) {
    return { compact, x: 10, y: Math.max(10, vh - 10 - h), w: vw - 20, h };
  }
  const w = Math.round(Math.min(560, Math.max(380, vw * 0.42)));
  const x = Math.round(Math.min(80, Math.max(24, vw * 0.045)));
  const y = Math.round(Math.max(96, (vh - h) / 2));
  return { compact, x, y, w, h };
}

const typing = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest("a, button, label, summary");

type Props = {
  pages: IslandPage[];
  /** the story has arrived: bring the island in */
  open: boolean;
  reduced: boolean;
  scene: RefObject<IslandScene>;
};

const Island = forwardRef<IslandHandle, Props>(function Island({ pages, open, reduced, scene }, ref) {
  const [active, setActive] = useState(0);
  const islandRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<SVGSVGElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeRef = useRef(0);
  const handoffRef = useRef(false);
  const goToRef = useRef<(i: number) => void>(() => {});

  const measure = (i = activeRef.current) => pageRefs.current[i]?.offsetHeight ?? 360;
  const target = () => frameFor(window.innerWidth, window.innerHeight, measure());

  useImperativeHandle(ref, () => ({ target }));

  // ------------------------------------------------------------------ clock
  useEffect(() => {
    const tick = () => {
      if (timeRef.current) timeRef.current.textContent = `${istTime.format(new Date())} IST`;
    };
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  // ------------------------------------------------------------------ focus follows the page it was in
  useEffect(() => {
    if (!handoffRef.current) return;
    handoffRef.current = false;
    pageRefs.current[active]?.focus({ preventScroll: true });
  }, [active]);

  // ------------------------------------------------------------------ geometry, the stack, input
  useEffect(() => {
    if (!open) return;
    const el = islandRef.current!;
    const body = bodyRef.current!;
    const world = scene.current;
    const control = controlRef.current;
    const html = document.documentElement;
    const n = pages.length;
    const paging = n > 1;

    const x = new Spring(0, 0.6, 0.78);
    const y = new Spring(0, 0.6, 0.78);
    const w = new Spring(0, 0.6, 0.76);
    const h = new Spring(0, 0.6, 0.78);
    const scale = new Spring(0.62, 0.46, 0.6);
    const alpha = new Spring(0, 0.32, 1);
    // where the stack is, in hundredths of a page, so it comes to rest precisely
    const pos = new Spring(activeRef.current * 100, 0.5, 0.86);
    let dest = activeRef.current; // the page it is heading for

    // ---------------------------------------------------------------- measure
    let heights: number[] = [];
    let kids: HTMLElement[][] = [];
    let tops: number[][] = [];
    const kidsDirty: boolean[] = pages.map(() => false);
    let painted = NaN;
    let threadPage = -1;
    let threadFrom: HTMLElement | null = null;
    const measureAll = () => {
      heights = pages.map((_, i) => pageRefs.current[i]?.offsetHeight ?? 360);
      kids = pages.map((_, i) => Array.from(pageRefs.current[i]?.children ?? []) as HTMLElement[]);
      tops = kids.map((list) => list.map((c) => c.offsetTop));
      threadPage = pages.findIndex((_, i) => !!pageRefs.current[i]?.querySelector("[data-thread]"));
      threadFrom = pageRefs.current[threadPage]?.querySelector<HTMLElement>("[data-thread]") ?? null;
      painted = NaN;
    };
    measureAll();

    /** The glass for a stack position: its height runs between the two pages it lies between. */
    const frameAt = (p: number) => {
      const q = clamp(p, 0, n - 1);
      let body = heights[0];
      if (paging) {
        const i = Math.min(n - 2, Math.floor(q));
        body = heights[i] + (heights[i + 1] - heights[i]) * (q - i);
      }
      // past either end the glass gives a little with the pull, like a gel
      body += Math.abs(p - q) * (heights[Math.round(q)] + STACK.gap) * STACK.stretch;
      return frameFor(window.innerWidth, window.innerHeight, body);
    };

    let frame = frameAt(pos.value / 100);
    let pillW = 240;
    let liveW = 150;
    let timeW = 70;
    let revealed = false;
    let tuned = false;
    let tuneAt = 0;
    let jump = false;
    let raf = 0;
    let last = performance.now();
    let glassMode = "";

    const measurePill = () => {
      liveW = liveRef.current?.offsetWidth ?? 150;
      timeW = timeRef.current?.offsetWidth ?? 70;
      pillW = Math.round(liveW + timeW + 36 + 22);
    };

    const pillFrame = () =>
      frame.compact
        ? { x: (window.innerWidth - pillW) / 2, y: frame.y + frame.h - PILL_H, w: pillW, h: PILL_H }
        : { x: frame.x, y: frame.y, w: pillW, h: PILL_H };

    const setAll = (f: { x: number; y: number; w: number; h: number }, snap: boolean) => {
      for (const [sp, v] of [[x, f.x], [y, f.y], [w, f.w], [h, f.h]] as const) {
        if (snap) sp.jump(v);
        else sp.target = v;
      }
    };

    // ---------------------------------------------------------------- paint the stack
    const setPage = (pg: HTMLElement, dy: number, sc: number, o: number, b: number) => {
      const visible = o > 0.004;
      pg.style.visibility = visible ? "visible" : "";
      if (!visible) return;
      pg.style.opacity = o > 0.998 ? "" : o.toFixed(3);
      pg.style.transform =
        Math.abs(dy) > 0.01 || sc !== 1 ? `translate3d(0, ${dy.toFixed(2)}px, 0) scale(${sc.toFixed(4)})` : "";
      pg.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "";
    };

    const restKids = (k: number) => {
      if (!kidsDirty[k]) return;
      kidsDirty[k] = false;
      for (const c of kids[k]) {
        c.style.transform = "";
        c.style.opacity = "";
        c.style.filter = "";
      }
    };

    // The opening page's first reveal: each line rises out of a blur, in turn.
    let entryAt = 0;
    let entryPage = -1;
    const entry = (k: number, now: number) => {
      let running = false;
      kids[k].forEach((c, j) => {
        const t = clamp((now - entryAt - ENTRY_DELAYS[Math.min(j, ENTRY_DELAYS.length - 1)]) / ENTRY_MS, 0, 1);
        if (t < 1) running = true;
        const o = easeOut(Math.min(1, t / 0.78));
        c.style.opacity = o > 0.998 ? "" : o.toFixed(3);
        if (reduced) return;
        const dy = 12 * (1 - easeOut(t));
        const b = 8 * (1 - easeOut(Math.min(1, t / 0.89)));
        c.style.transform = dy > 0.01 ? `translate3d(0, ${dy.toFixed(2)}px, 0)` : "";
        c.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "";
      });
      kidsDirty[k] = true;
      return running;
    };

    /** The page above the turn: it rides the strip up and recedes into the frost. */
    const upper = (k: number, f: number, shift: number, now: number) => {
      const pg = pageRefs.current[k]!;
      if (reduced) setPage(pg, 0, 1, 1 - smooth(0, 0.5, f), 0);
      else
        setPage(
          pg,
          -f * (heights[k] + STACK.gap) + shift,
          1 - STACK.recede * f,
          1 - smooth(0.05, 0.85, f),
          STACK.blur * smooth(0, 1, f),
        );
      if (k === entryPage && entryAt) {
        if (!entry(k, now)) {
          entryAt = 0;
          restKids(k);
        }
      } else restKids(k);
    };

    /** The page below the turn: it rises on the strip, its lines closing up as they land. */
    const lower = (k: number, f: number, span: number, shift: number) => {
      const pg = pageRefs.current[k]!;
      if (k === entryPage && entryAt) {
        entryAt = 0;
        restKids(k);
      }
      if (reduced) {
        setPage(pg, 0, 1, smooth(0.5, 1, f), 0);
        return restKids(k);
      }
      // soft only as it crosses the lower edge: by halfway it is sharp under the finger
      setPage(pg, (1 - f) * span + shift, 1, smooth(0, 0.55, f), STACK.blur * 0.6 * (1 - smooth(0, 0.6, f)));
      const spread = STACK.spread * (1 - smooth(0.2, 1, f));
      if (spread < 0.0005) return restKids(k);
      kids[k].forEach((c, j) => {
        c.style.transform = `translate3d(0, ${(tops[k][j] * spread).toFixed(2)}px, 0)`;
      });
      kidsDirty[k] = true;
    };

    const offsets: string[] = [];
    const paint = (p: number, now: number) => {
      if (p === painted && !entryAt) return;
      painted = p;
      const q = clamp(p, 0, n - 1);
      const i = paging ? Math.min(n - 2, Math.floor(q)) : 0;
      const f = paging ? q - i : 0;
      const over = p - q; // past either end, in pages
      // the scroll-edge dissolve, only while the stack is moving
      const moving = over ? smooth(0, 0.01, Math.abs(over)) : smooth(0, 0.05, Math.min(f, 1 - f));
      body.style.setProperty("--fade-top", `${(STACK.fadeTop * moving).toFixed(1)}px`);
      body.style.setProperty("--fade-bottom", `${(STACK.fadeBottom * moving).toFixed(1)}px`);
      for (let k = 0; k < n; k++) {
        const pg = pageRefs.current[k];
        if (!pg) continue;
        // where the page sits on the stack (+1 waiting below, 0 on stage, −1 gone above),
        // so what it carries can move with the turn (see components/lineup)
        const off = clamp(k - p, -1, 1).toFixed(3);
        if (off !== offsets[k]) pg.style.setProperty("--page-offset", (offsets[k] = off));
        if (k === i) upper(k, f, over < 0 ? -over * (heights[k] + STACK.gap) : 0, now);
        else if (k === i + 1) lower(k, f, heights[i] + STACK.gap, over > 0 ? -over * (heights[k] + STACK.gap) : 0);
        else setPage(pageRefs.current[k]!, 0, 1, 0, 0);
      }
    };

    // ---------------------------------------------------------------- turning pages
    const settle = (to: number, velocity?: number) => {
      const from = pos.value / 100;
      dest = clamp(to, 0, n - 1);
      pos.response = reduced ? 0.34 : 0.5 + 0.05 * Math.max(0, Math.abs(dest - from) - 1);
      pos.damping = reduced ? 1 : 0.86;
      if (velocity !== undefined) pos.velocity = velocity * 100;
      pos.target = dest * 100;
    };
    /** A push against either end: the stack gives a little and comes back. */
    const bump = (dir: number) => {
      if (!reduced) pos.velocity += dir * 90;
    };
    const turn = (dir: number) => {
      const to = dest + dir;
      if (to < 0 || to > n - 1) return bump(dir);
      settle(to);
    };
    const goTo = (i: number) => settle(clamp(i, 0, n - 1));
    goToRef.current = goTo;

    /** Strip distance, in px per page, of the turn a movement from `p` toward `dir` is making. */
    const span = (p: number, dir: number) => {
      const i = clamp(dir >= 0 ? Math.floor(p) : Math.ceil(p) - 1, 0, n - 2);
      return heights[i] + STACK.gap;
    };

    /** A gesture stays within a page of where it began; past that, or past either end, it pulls like a rubber band. */
    const band = (raw: number, from: number) => {
      const lo = Math.max(0, from - 1);
      const hi = Math.min(n - 1, from + 1);
      if (reduced) return clamp(raw, lo, hi);
      if (raw < lo) return lo - rubber(lo - raw, STACK.give);
      if (raw > hi) return hi + rubber(raw - hi, STACK.give);
      return raw;
    };

    // ---------------------------------------------------------------- input: touch and pen
    const drag = { id: -1, live: false, x0: 0, y0: 0, y: 0, t: 0, raw: 0, from: 0, v: 0 };
    let swallowUntil = -Infinity; // a press that became a swipe is never a tap

    const letGo = () => {
      drag.id = -1;
      settle(Math.round(clamp(pos.value / 100, 0, n - 1)));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!revealed || e.pointerType === "mouse" || !e.isPrimary || typing(e.target)) return;
      Object.assign(drag, { id: e.pointerId, live: false, x0: e.clientX, y0: e.clientY, raw: pos.value / 100, from: dest, v: 0 });
      // a touch catches the stack wherever it is, like a finger on a moving list
      if (!pos.resting) pos.jump(pos.value);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      if (!drag.live) {
        const dx = e.clientX - drag.x0;
        const dy = e.clientY - drag.y0;
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) return letGo();
        if (Math.abs(dy) < 8) return;
        // past the slop: from here on the stack is under the finger
        Object.assign(drag, { live: true, y: e.clientY, t: e.timeStamp });
        return;
      }
      const moved = drag.y - e.clientY; // up is toward the next page
      drag.raw += moved / span(drag.raw, moved);
      const p = band(drag.raw, drag.from);
      const dt = (e.timeStamp - drag.t) / 1000;
      if (dt > 0) drag.v = drag.v * 0.4 + ((p - pos.value / 100) / dt) * 0.6;
      drag.y = e.clientY;
      drag.t = e.timeStamp;
      pos.jump(p * 100);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      if (!drag.live || e.type === "pointercancel") return letGo();
      drag.id = -1;
      swallowUntil = e.timeStamp + 400;
      const p = pos.value / 100;
      // a pause before letting go spends the fling
      const v = e.timeStamp - drag.t > 90 ? 0 : drag.v;
      let to = Math.round(p + v * STACK.project);
      if (Math.abs(v) > STACK.flick) to = v > 0 ? Math.floor(p) + 1 : Math.ceil(p) - 1;
      settle(clamp(to, Math.max(0, drag.from - 1), Math.min(n - 1, drag.from + 1)), reduced ? 0 : v);
    };

    // ---------------------------------------------------------------- input: wheel and trackpad
    const wheel = { live: false, from: 0, raw: 0, last: -Infinity, locked: true, mags: [0, 0, 0], peak: 0, floor: Infinity, timer: 0 };
    const lock = (mag: number) => Object.assign(wheel, { live: false, locked: true, peak: mag, floor: mag });

    const endWheel = () => {
      if (!wheel.live) return;
      const moved = pos.target / 100 - wheel.from;
      settle(Math.abs(moved) >= STACK.wheelTurn ? wheel.from + Math.sign(moved) : wheel.from);
      // if the events were only held up (a busy frame), what's left of the swipe is spent too
      lock(wheel.mags[2]);
    };

    /** A text box that can still scroll this way keeps the wheel for itself. */
    const scrollsItself = (e: WheelEvent) => {
      const box = e.target instanceof Element ? e.target.closest("textarea") : null;
      if (!box || box.scrollHeight <= box.clientHeight) return false;
      return e.deltaY < 0 ? box.scrollTop > 0 : box.scrollTop + box.clientHeight < box.scrollHeight - 1;
    };

    const onWheel = (e: WheelEvent) => {
      if (!revealed || e.ctrlKey || scrollsItself(e)) return;
      const d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (Math.abs(e.deltaX) > Math.abs(d)) return;
      const gap = e.timeStamp - wheel.last;
      wheel.last = e.timeStamp;
      const mag = Math.abs(d);
      wheel.mags = [wheel.mags[1], wheel.mags[2], mag];
      if (mag < 0.5) return;
      const notch = e.deltaMode !== 0 || (mag >= STACK.notch && Number.isInteger(e.deltaY) && e.deltaX === 0 && gap > 30);

      if (wheel.locked) {
        // After a turn, the rest of that swipe (it may still be speeding up, then its
        // momentum) is spent. A new swipe starts after a pause, or when the deltas
        // climb again once the old momentum has died down.
        wheel.peak = Math.max(wheel.peak, mag);
        wheel.floor = Math.min(wheel.floor, mag);
        const [a, b, c] = wheel.mags;
        const rising = wheel.floor < wheel.peak * 0.5 && c > b && b > a && c > wheel.floor * 2 + 4;
        if (gap < STACK.wheelIdle && !rising && !notch) return;
        wheel.locked = false;
      }

      if (notch) {
        // a mouse wheel: one notch, one page, once the last turn is mostly done
        wheel.live = false;
        if (Math.abs(pos.value / 100 - dest) > 0.35) return;
        return turn(Math.sign(d));
      }

      // a trackpad: the stack follows the fingers, then settles
      if (!wheel.live) Object.assign(wheel, { live: true, from: dest, raw: pos.value / 100 });
      wheel.raw += d / span(wheel.raw, d);
      const next = wheel.from + Math.sign(d);
      const reached = next >= 0 && next <= n - 1 && Math.abs(wheel.raw - wheel.from) >= 1;
      const pastEnd = (next < 0 || next > n - 1) && Math.abs(wheel.raw - wheel.from) > 0.25;
      if (reached || pastEnd) {
        // the turn is made (or it has hit an end and bounces): whatever the swipe has left is spent
        lock(mag);
        clearTimeout(wheel.timer);
        return settle(reached ? next : wheel.from);
      }
      pos.response = 0.14;
      pos.damping = 1;
      pos.target = band(wheel.raw, wheel.from) * 100;
      clearTimeout(wheel.timer);
      wheel.timer = window.setTimeout(endWheel, STACK.wheelIdle);
    };

    // ---------------------------------------------------------------- input: keys, links
    const onKeyDown = (e: KeyboardEvent) => {
      if (!revealed || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      let dir = 0;
      if (e.key === "ArrowDown" || e.key === "PageDown") dir = 1;
      else if (e.key === "ArrowUp" || e.key === "PageUp") dir = -1;
      else if (e.key === " " && !isControl(e.target)) dir = e.shiftKey ? -1 : 1;
      else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        return goTo(e.key === "Home" ? 0 : n - 1);
      }
      if (!dir) return;
      e.preventDefault();
      turn(dir);
      // within the page control, focus moves with the selection
      if (e.target instanceof Element && e.target.closest('[role="tab"]')) tabRefs.current[dest]?.focus();
    };

    const pageFor = (hash: string) => pages.findIndex((pg) => hash === `#${pg.id}`);

    const onClick = (e: MouseEvent) => {
      if (e.timeStamp < swallowUntil) {
        swallowUntil = -Infinity;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const link = e.target instanceof Element ? e.target.closest("a[href^='#']") : null;
      const to = link ? pageFor(link.getAttribute("href") ?? "") : -1;
      if (to < 0) return;
      e.preventDefault();
      goTo(to);
    };

    const onHash = () => {
      const to = pageFor(location.hash);
      if (to >= 0) goTo(to);
    };

    // The page itself never scrolls: the stack takes the gestures (see globals.css).
    const input = new AbortController();
    if (paging) {
      html.dataset.paging = "on";
      const opts = { signal: input.signal };
      window.addEventListener("pointerdown", onPointerDown, opts);
      window.addEventListener("pointermove", onPointerMove, { ...opts, passive: true });
      window.addEventListener("pointerup", onPointerUp, opts);
      window.addEventListener("pointercancel", onPointerUp, opts);
      window.addEventListener("wheel", onWheel, { ...opts, passive: true });
      window.addEventListener("keydown", onKeyDown, opts);
      window.addEventListener("hashchange", onHash, opts);
      window.addEventListener("blur", () => drag.id >= 0 && letGo(), opts);
      document.addEventListener("click", onClick, { ...opts, capture: true });
      // where touch-action can't keep one finger from panning the page, stop it here
      if (!CSS.supports("touch-action", "pinch-zoom")) {
        window.addEventListener(
          "touchmove",
          (e) => e.touches.length === 1 && !typing(e.target) && e.preventDefault(),
          { ...opts, passive: false },
        );
      }
    }

    // ---------------------------------------------------------------- the thread
    const svg = threadRef.current;
    const [shade, line, head] = svg ? (Array.from(svg.querySelectorAll("path, circle")) as SVGGeometryElement[]) : [];
    const grad = svg?.querySelector("linearGradient");
    const thread = new Spring(0, THREAD.draw, 1);
    let threadShown = false;
    let touch = -1;

    /** How far the thread has touched down, 0..1: the pin swells and the word glows with it. */
    const setTouch = (v: number) => {
      if (Math.abs(v - touch) < 0.002) return;
      touch = v;
      world.pin?.style.setProperty("--thread", v.toFixed(3));
      el.style.setProperty("--thread", v.toFixed(3));
    };

    type Glass = { X: number; Y: number; W: number };

    /** Where the thread runs, from its anchor to the pin, or null when the pin can't be reached. */
    const route = (g: Glass, compact: boolean) => {
      const pin = world.pin;
      if (!threadFrom || !pin || pin.style.visibility === "hidden") return null;
      const a = threadFrom.getBoundingClientRect();
      const b = pin.getBoundingClientRect();
      const ax = a.left + THREAD.lead;
      const ay = a.top + a.height * 0.58; // through the middle of the lowercase
      const px = b.left;
      const py = b.top;
      if (compact) {
        // a phone: along the line, up the island's right margin, out of its top edge
        // and into the pin from below, so it runs on into the pin's own stem
        const gx = g.X + g.W - THREAD.gutter;
        const r = Math.min(THREAD.corner, (gx - ax) / 2, (ay - g.Y) / 2);
        if (py > g.Y - THREAD.clear || r < 4) return null;
        const k = (g.Y - py) * 0.55;
        const d = `M${ax} ${ay}H${gx - r}Q${gx} ${ay} ${gx} ${ay - r}V${g.Y}C${gx} ${g.Y - k} ${px} ${py + k} ${px} ${py + THREAD.land}`;
        return { ax, ay, px, py, d };
      }
      // beside the island: straight out of the glass, then eased into the pin
      const ex = g.X + g.W;
      if (px < ex + THREAD.clear * 2) return null;
      const k = (px - ex) * 0.5;
      const d = `M${ax} ${ay}H${ex}C${ex + k} ${ay} ${px - k} ${py} ${px - THREAD.land} ${py}`;
      return { ax, ay, px, py, d };
    };

    type Route = NonNullable<ReturnType<typeof route>>;
    let lastRoute: Route | null = null;
    let held: Route | null = null; // the thread's last shape, once its page has let go of it

    const drawThread = (p: number, dt: number, g: Glass, compact: boolean) => {
      if (!svg || !line) return;
      const present = threadPage < 0 ? 0 : 1 - clamp(Math.abs(p - threadPage), 0, 1);
      // As its page recedes upward the anchor is under the status row almost at once,
      // so the page lets go: the thread keeps its last shape and reels into the pin.
      // Brought back, the page takes up a fresh thread.
      const receding = !reduced && threadPage >= 0 && p > threadPage + 0.02;
      if (receding && !held && lastRoute) held = lastRoute;
      if (!receding && held) {
        held = null;
        thread.jump(0);
      }
      // reduced motion: the thread cross-fades with its page instead of drawing out
      let aim = revealed && !receding ? smooth(reduced ? 0.5 : THREAD.from, 1, present) : 0;
      const path = held ?? (aim > 0 || thread.value > 0.001 ? route(g, compact) : null);
      if (!held) lastRoute = path;
      if (!path) aim = 0;
      thread.response = reduced ? 0.34 : held ? THREAD.reel : aim < thread.value ? THREAD.retract : THREAD.draw;
      thread.target = aim;
      thread.step(dt);
      if (!path) thread.jump(0);

      const show = !!path && thread.value > 0.001;
      if (show !== threadShown) {
        threadShown = show;
        svg.style.visibility = show ? "visible" : "";
      }
      if (!show || !path) return setTouch(0);

      const drawn = reduced ? 1 : thread.value;
      // attached, the thread runs from the word to `drawn`; let go, what is left is the pin's end
      const offset = held ? drawn - 1 : 1 - drawn;
      for (const stroke of [shade, line]) {
        stroke.setAttribute("d", path.d);
        stroke.style.strokeDashoffset = offset.toFixed(4);
      }
      svg.style.opacity = reduced ? thread.value.toFixed(3) : "";
      grad?.setAttribute("x1", `${path.ax}`);
      grad?.setAttribute("y1", `${path.ay}`);
      grad?.setAttribute("x2", `${path.px}`);
      grad?.setAttribute("y2", `${path.py}`);
      // a lit head leads the thread out until it touches down, and trails it home
      const contact = held ? smooth(0, 0.3, drawn) : smooth(0.86, 1, drawn);
      if (head && !reduced) {
        const at = line.getPointAtLength((held ? 1 - drawn : drawn) * line.getTotalLength());
        head.setAttribute("cx", at.x.toFixed(2));
        head.setAttribute("cy", at.y.toFixed(2));
        head.style.opacity = (held ? smooth(0, 0.1, drawn) : (1 - contact) * smooth(0, 0.04, drawn)).toFixed(3);
      }
      setTouch(reduced ? thread.value * 0.5 : contact);
    };

    // ---------------------------------------------------------------- open
    measurePill();
    el.dataset.state = "pill";

    const timers: number[] = [];
    const reveal = (now: number) => {
      revealed = true;
      el.dataset.reveal = "on";
      entryAt = now;
      entryPage = activeRef.current;
      tuneAt = now + 900;
      lastMove = now + 900; // on a phone, the page dots show for a moment: there is more
      const at = pageFor(location.hash);
      if (at > 0) timers.push(window.setTimeout(() => goTo(at), reduced ? 0 : 650));
    };

    if (reduced) {
      setAll(frame, true);
      scale.jump(1);
      alpha.target = 1;
      el.dataset.state = "open";
    } else {
      setAll(pillFrame(), true);
      scale.target = 1;
      alpha.target = 1;
      // hold as a pill for a beat, then open like the Dynamic Island does
      timers.push(
        window.setTimeout(() => {
          el.dataset.state = "open";
          frame = frameAt(pos.value / 100);
          setAll(frame, false);
        }, 1050),
      );
    }

    const onResize = () => {
      measureAll();
      jump = true;
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(measureAll);
    for (const p of pageRefs.current) if (p) ro.observe(p);

    // ---------------------------------------------------------------- one clock
    let pPrev = pos.value / 100;
    let speed = 0; // |pages per second|, smoothed
    let lastMove = -Infinity;
    let shown = false;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      pos.step(dt);
      const p = pos.value / 100;
      if (dt > 0) speed += (Math.abs(p - pPrev) / dt - speed) * (1 - Math.exp(-dt * 14));
      pPrev = p;

      frame = frameAt(p);
      if (el.dataset.state === "open") {
        setAll(frame, jump);
        jump = false;
      }
      // once open, the glass keeps close company with the stack: quick, still liquid
      if (revealed && !tuned && now > tuneAt) {
        tuned = true;
        for (const sp of [x, y, w, h]) {
          sp.response = 0.32;
          sp.damping = 0.84;
        }
      }
      for (const sp of [x, y, w, h, scale, alpha]) sp.step(dt);

      world.frame = { x: x.value, y: y.value, w: w.value, h: h.value, compact: frame.compact };

      const pointer = world.pointer;
      const px = frame.compact ? 0 : pointer.x * -7;
      const py = frame.compact ? 0 : pointer.y * -5;
      // liquid: as the island stretches taller it draws in a little at the sides
      const squash = Math.max(-10, Math.min(10, h.velocity * -0.01));
      const W = Math.max(1, w.value + squash);
      const H = Math.max(1, h.value);
      const X = x.value - squash / 2 + px;
      const Y = y.value + py;
      const k = scale.value;
      const radius = Math.min(RADIUS, H / 2, W / 2);
      const openness = Math.min(1, Math.max(0, (w.value - pillW) / Math.max(1, frame.w - pillW)));

      el.style.width = `${W}px`;
      el.style.height = `${H}px`;
      el.style.borderRadius = `${radius}px`;
      el.style.transform = `translate3d(${X}px, ${Y}px, 0) scale(${k})`;
      el.style.opacity = `${Math.min(1, alpha.value)}`;
      el.style.setProperty("--open", openness.toFixed(3));
      body.style.height = `${Math.max(0, H - BODY_TOP).toFixed(1)}px`;

      if (!revealed && el.dataset.state === "open" && (reduced || openness > 0.82)) reveal(now);
      if (revealed) paint(p, now);
      drawThread(p, dt, { X, Y, W }, frame.compact);

      // the current page is the nearer one, so it changes at the halfway point of a turn
      const idx = Math.round(clamp(p, 0, n - 1));
      if (idx !== activeRef.current) {
        const was = pageRefs.current[activeRef.current];
        handoffRef.current = !!was && was.contains(document.activeElement);
        activeRef.current = idx;
        setActive(idx);
      }

      const shapes: GlassShape[] = [
        {
          x: X + (W * (1 - k)) / 2,
          y: Y + (H * (1 - k)) / 2,
          w: W * k,
          h: H * k,
          r: radius * k,
          opacity: Math.min(1, alpha.value),
        },
      ];

      if (control && paging) {
        const cw = 30;
        const pitch = frame.compact ? 12 : 18;
        const ch = 26 + (n - 1) * pitch;
        control.style.height = `${ch}px`;
        control.style.setProperty("--pitch", `${pitch}px`);
        // on a phone there is no room beside the island: the dots lie across the empty
        // middle of the status row instead, first page on the left
        const inset = 18 + 14 * openness; // the status row's padding (see .header)
        const gapMid = X + (inset + liveW + W - inset - timeW) / 2;
        const cx = frame.compact ? gapMid - cw / 2 : X + W + 14;
        const cy = frame.compact ? Y + HEADER_DROP * openness + PILL_H / 2 - ch / 2 : Y + H / 2 - ch / 2;
        control.style.transform = `translate3d(${cx}px, ${cy}px, 0)${frame.compact ? " rotate(-90deg)" : ""}`;
        control.style.setProperty("--knob", clamp(p, 0, n - 1).toFixed(3));
        // at speed the knob pulls out into a capsule, like a drop between the dots
        control.style.setProperty("--stretch", Math.min(10, speed * 3).toFixed(2));
        if (!pos.resting || drag.id >= 0 || wheel.live) lastMove = Math.max(lastMove, now);
        const show = revealed && (!frame.compact || now - lastMove < 1400);
        if (show !== shown) {
          shown = show;
          if (show) control.dataset.show = "on";
          else delete control.dataset.show;
        }
        if (!frame.compact && show) shapes.push({ x: cx, y: cy, w: cw, h: ch, r: 15, opacity: 1 });
      }

      const glass = world.glass;
      const mode = glass && glass.status !== "failed" ? "gl" : "css";
      if (mode !== glassMode) {
        glassMode = mode;
        el.dataset.glass = mode;
        if (control) control.dataset.glass = mode;
      }
      if (glass) {
        glass.setShapes(mode === "gl" ? shapes : []);
        glass.setLight(pointer.x, pointer.y);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      clearTimeout(wheel.timer);
      input.abort();
      delete html.dataset.paging;
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      world.glass?.setShapes([]);
      world.frame = null;
      setTouch(0);
      if (svg) svg.style.visibility = "";
      goToRef.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reduced, pages.length]);

  return (
    <>
      <div
        ref={islandRef}
        className={s.island}
        data-state="hidden"
        inert={!open}
        role="region"
        aria-label="CarterLabs"
      >
        <div className={s.header}>
          <span ref={liveRef} className={s.live}>
            <span className={s.liveDot} aria-hidden="true" />
            Bandra, Mumbai
          </span>
          <span ref={timeRef} className={s.time} />
        </div>
        <div ref={bodyRef} className={s.body}>
          {pages.map((page, i) => (
            <div
              key={page.id}
              ref={(node) => {
                pageRefs.current[i] = node;
              }}
              id={page.id}
              data-page=""
              className={s.page}
              role={pages.length > 1 ? "tabpanel" : undefined}
              aria-label={page.label}
              tabIndex={-1}
              inert={i !== active}
              aria-hidden={i !== active}
            >
              {page.content}
            </div>
          ))}
        </div>
      </div>

      <svg ref={threadRef} className={s.thread} aria-hidden="true">
        <defs>
          <linearGradient id="cl-thread" gradientUnits="userSpaceOnUse">
            <stop offset="0" style={{ stopColor: "var(--bone)", stopOpacity: 0.62 }} />
            <stop offset="0.7" style={{ stopColor: "var(--bone)", stopOpacity: 0.42 }} />
            <stop offset="1" style={{ stopColor: "var(--blood-lit)", stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <path className={s.threadShade} pathLength={1} />
        <path className={s.threadLine} pathLength={1} stroke="url(#cl-thread)" />
        <circle className={s.threadHead} r={2} />
      </svg>

      {pages.length > 1 && (
        <div ref={controlRef} className={s.control} role="tablist" aria-label="Sections" aria-orientation="vertical">
          <span className={s.controlKnob} aria-hidden="true" />
          {pages.map((page, i) => (
            <button
              key={page.id}
              ref={(node) => {
                tabRefs.current[i] = node;
              }}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls={page.id}
              aria-label={page.label}
              tabIndex={i === active ? 0 : -1}
              className={s.controlDot}
              style={{ "--i": i } as CSSProperties}
              onClick={() => goToRef.current(i)}
            />
          ))}
        </div>
      )}
    </>
  );
});

export default Island;
