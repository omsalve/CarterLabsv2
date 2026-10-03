"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import s from "./study.module.css";
import { Spring } from "../island/spring";
import { SHEET, drawSite, views, type Sheet } from "./drawing";
import type { Project } from "./work";

/**
 * The case study's photographs, paged like the Photos app: the frame follows a finger
 * (or a mouse, or two fingers on a trackpad) 1:1, pulls like a rubber band past
 * either end, and lets go onto the photograph the release points at, on a spring
 * that carries its velocity. The page dots follow the same value, so they scrub with
 * it. On a fine pointer, chevrons come up on hover; with the case open, ← and →
 * page it too.
 *
 * Until the owner's photographs arrive (work.ts `images`), the project's landmark
 * stands in for them, drawn three ways (drawing.ts).
 *
 * It hangs on the pin with the rest of the card, where the map is hidden from
 * assistive tech: the case in the island lists what each photograph shows. It only
 * takes the pointer once the card is fully open (the Projects page sets `data-full`
 * on the pin), and goes back to the first photograph as the card folds away.
 */

const PAGE = {
  response: 0.42, // the settle: quick, and only just short of critically damped…
  damping: 0.9,
  give: 0.22, // …past either end it gives this much (of a frame)
  flick: 0.6, // a release faster than this (frames/s) moves on
  project: 0.18, // seconds of release velocity projected when choosing the frame
  gap: 12, // px between one frame and the next as they pass
  slop: 6, // px a press travels before it is a swipe
  wheelIdle: 120, // ms without events that ends a trackpad swipe
  turn: 0.18, // …which pages on if it travelled this far
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rubber = (over: number, dim: number) => (1 - 1 / ((over * 0.55) / dim + 1)) * dim;
const typing = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");

const Chevron = ({ back = false }: { back?: boolean }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d={back ? "M10 3.5 5.5 8 10 12.5" : "M6 3.5 10.5 8 6 12.5"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** A survey sheet of the landmark, standing in for a photograph. */
function Drawing({ sheet, id }: { sheet: Sheet; id: string }) {
  const r = SHEET.w * 0.62;
  return (
    <svg className={s.sheet} viewBox={`0 0 ${SHEET.w} ${SHEET.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        {/* the grid lies on the ground, so its fade does too */}
        <radialGradient
          id={`${id}-fade`}
          gradientUnits="userSpaceOnUse"
          cx={sheet.dot.x}
          cy={sheet.dot.y}
          r={r}
          gradientTransform={`translate(0 ${sheet.dot.y}) scale(1 ${Math.max(0.35, sheet.flat)}) translate(0 ${-sheet.dot.y})`}
        >
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={SHEET.w} height={SHEET.h}>
          <rect width={SHEET.w} height={SHEET.h} fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      <path className={s.grid} d={sheet.grid} mask={`url(#${id}-mask)`} />
      {sheet.hidden && <path className={s.hidden} d={sheet.hidden} />}
      {sheet.faces.map((f, i) => (
        <path key={i} className={s.face} data-tone={f.tone} d={f.d} />
      ))}
      <path className={s.edge} d={sheet.edges} />
      <circle className={s.ring} cx={sheet.dot.x} cy={sheet.dot.y} r="7" />
      <circle className={s.pin} cx={sheet.dot.x} cy={sheet.dot.y} r="2.6" />
    </svg>
  );
}

export default function Gallery({ project: p }: { project: Project }) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^\w-]/g, "");
  const photos = p.images ?? [];
  const sheets = photos.length ? [] : views(p).map((v) => ({ name: v.name, sheet: drawSite(p.site, v) }));
  const n = photos.length || sheets.length;

  useEffect(() => {
    const root = ref.current!;
    const mark = root.closest<HTMLElement>("[data-study]")?.parentElement;
    const track = root.querySelector<HTMLElement>(`.${s.track}`)!;
    const slides = Array.from(root.querySelectorAll<HTMLElement>(`.${s.slide}`));
    const dots = Array.from(root.querySelectorAll<HTMLElement>("[data-dot]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!mark || n < 2) return;

    const page = new Spring(0, PAGE.response, PAGE.damping);
    let dest = 0;
    const drag = { id: -1, live: false, x0: 0, y0: 0, x: 0, t: 0, v: 0, raw: 0, from: 0 };
    const wheel = { live: false, raw: 0, from: 0, last: -Infinity, locked: false, timer: 0 };
    const full = () => mark.hasAttribute("data-full");
    const stride = () => root.clientWidth + PAGE.gap;

    // ---------------------------------------------------------------- paint
    const paint = () => {
      const v = page.value;
      track.style.transform = Math.abs(v) < 1e-4 ? "" : `translate3d(${(-v * stride()).toFixed(2)}px, 0, 0)`;
      // the frame sliding away dims a little into the dark between them
      slides.forEach((el, i) => el.style.setProperty("--away", Math.min(1, Math.abs(v - i)).toFixed(3)));
      dots.forEach((el, i) => el.style.setProperty("--lit", Math.max(0, 1 - Math.abs(v - i)).toFixed(3)));
      root.dataset.at = dest === 0 ? "start" : dest === n - 1 ? "end" : "";
    };

    // ---------------------------------------------------------------- one clock, only while it moves
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (!drag.live) page.step(dt);
      paint();
      raf = drag.live || wheel.live || !page.resting ? requestAnimationFrame(tick) : (last = 0);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    /** On to frame `to`, carrying `velocity` (frames/s) from a release. */
    const settle = (to: number, velocity?: number) => {
      dest = clamp(to, 0, n - 1);
      page.response = reduced ? 0.3 : PAGE.response;
      page.damping = reduced ? 1 : PAGE.damping;
      if (velocity !== undefined && !reduced) page.velocity = velocity;
      page.target = dest;
      wake();
    };
    const go = (to: number) => {
      if (to < 0 || to > n - 1 || to === dest) return;
      settle(to);
    };
    /** Caught mid-settle by a press that never became a swipe: on to the nearest frame. */
    const unstick = () => {
      if (Math.abs(page.value - Math.round(page.value)) > 1e-3) settle(Math.round(page.value));
    };

    /** A swipe stays within a frame of where it began; past that, or past either end, it pulls like a rubber band. */
    const band = (raw: number, from: number) => {
      const lo = Math.max(0, from - 1);
      const hi = Math.min(n - 1, from + 1);
      if (raw < lo) return lo - rubber(lo - raw, PAGE.give);
      if (raw > hi) return hi + rubber(raw - hi, PAGE.give);
      return raw;
    };

    const input = new AbortController();
    const opts = { signal: input.signal };

    // ---------------------------------------------------------------- a finger, a pen or a mouse
    let swallowUntil = -Infinity;

    const onPointerDown = (e: PointerEvent) => {
      if (!full() || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      Object.assign(drag, { id: e.pointerId, live: false, x0: e.clientX, y0: e.clientY, v: 0, from: dest });
      // a touch catches the frame wherever it is, mid-settle
      if (!page.resting) {
        page.jump(page.value);
        dest = clamp(Math.round(page.value), 0, n - 1);
        drag.from = dest;
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      if (!drag.live) {
        const dx = e.clientX - drag.x0;
        const dy = e.clientY - drag.y0;
        // an upward or downward swipe belongs to the stack
        if (e.pointerType !== "mouse" && Math.abs(dy) > PAGE.slop + 2 && Math.abs(dy) > Math.abs(dx)) {
          drag.id = -1;
          return unstick();
        }
        if (Math.abs(dx) < PAGE.slop || Math.abs(dx) < Math.abs(dy)) return;
        Object.assign(drag, { live: true, x: e.clientX, t: e.timeStamp, raw: page.value });
        root.dataset.dragging = "";
        root.setPointerCapture?.(e.pointerId);
        wake();
      }
      drag.raw -= (e.clientX - drag.x) / stride();
      const f = band(drag.raw, drag.from);
      const dt = (e.timeStamp - drag.t) / 1000;
      if (dt > 0) drag.v = drag.v * 0.4 + ((f - page.value) / dt) * 0.6;
      drag.x = e.clientX;
      drag.t = e.timeStamp;
      page.jump(f);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      drag.id = -1;
      if (!drag.live) return unstick();
      drag.live = false;
      delete root.dataset.dragging;
      swallowUntil = e.timeStamp + 350;
      const at = page.value;
      // a pause before letting go spends the fling
      const v = e.type === "pointercancel" || e.timeStamp - drag.t > 90 ? 0 : drag.v;
      let to = Math.round(at + v * PAGE.project);
      if (Math.abs(v) > PAGE.flick) to = v > 0 ? Math.floor(at) + 1 : Math.ceil(at) - 1;
      settle(clamp(to, drag.from - 1, drag.from + 1), v);
    };
    // a press that became a swipe is never a tap on a dot or a chevron
    const onClick = (e: MouseEvent) => {
      if (e.timeStamp >= swallowUntil) return;
      swallowUntil = -Infinity;
      e.preventDefault();
      e.stopPropagation();
    };

    // ---------------------------------------------------------------- two fingers on a trackpad
    const endWheel = () => {
      if (!wheel.live) return;
      wheel.live = false;
      wheel.locked = true; // whatever momentum the swipe has left is spent
      const moved = wheel.raw - wheel.from;
      settle(Math.abs(moved) >= PAGE.turn ? wheel.from + Math.sign(moved) : wheel.from);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || !full()) return;
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? root.clientWidth : 1;
      const dx = e.deltaX * unit;
      const gap = e.timeStamp - wheel.last;
      wheel.last = e.timeStamp;
      if (Math.abs(dx) < 0.5 || Math.abs(dx) <= Math.abs(e.deltaY * unit) * 1.2) return;
      if (wheel.locked) {
        if (gap < 250) return;
        wheel.locked = false;
      }
      if (!wheel.live) Object.assign(wheel, { live: true, raw: page.value, from: dest });
      wheel.raw = clamp(wheel.raw + dx / stride(), wheel.from - 1.4, wheel.from + 1.4);
      page.response = 0.12;
      page.damping = 1;
      page.target = band(wheel.raw, wheel.from);
      clearTimeout(wheel.timer);
      wheel.timer = window.setTimeout(endWheel, PAGE.wheelIdle);
      wake();
    };

    // ---------------------------------------------------------------- keys, dots and chevrons
    const onKeyDown = (e: KeyboardEvent) => {
      if (!full() || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      go(dest + (e.key === "ArrowRight" ? 1 : -1));
    };
    const onPick = (e: MouseEvent) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-dot], [data-step]");
      if (!el) return;
      if (el.dataset.dot !== undefined) go(Number(el.dataset.dot));
      else go(dest + Number(el.dataset.step));
    };

    root.addEventListener("pointerdown", onPointerDown, opts);
    window.addEventListener("pointermove", onPointerMove, { ...opts, passive: true });
    window.addEventListener("pointerup", onPointerUp, opts);
    window.addEventListener("pointercancel", onPointerUp, opts);
    root.addEventListener("click", onClick, { ...opts, capture: true });
    root.addEventListener("click", onPick, opts);
    root.addEventListener("wheel", onWheel, { ...opts, passive: true });
    window.addEventListener("keydown", onKeyDown, opts);

    // folded away, it goes back to the first frame, so the case opens on it next time
    const mo = new MutationObserver(() => {
      if (mark.hasAttribute("data-open") || (dest === 0 && page.resting)) return;
      Object.assign(drag, { id: -1, live: false });
      wheel.live = false;
      dest = 0;
      page.jump(0);
      paint();
    });
    mo.observe(mark, { attributes: true, attributeFilter: ["data-open"] });

    paint();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(wheel.timer);
      input.abort();
      mo.disconnect();
    };
  }, [n]);

  return (
    <div ref={ref} className={s.gallery} data-count={n}>
      <div className={s.track}>
        {photos.length
          ? photos.map((ph, i) => (
              <figure key={ph.src} className={s.slide}>
                <span className={s.shot}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={s.photo} src={ph.src} alt={ph.alt} loading={i ? "lazy" : "eager"} decoding="async" draggable={false} />
                </span>
                {ph.caption && (
                  <figcaption className={s.caption}>
                    <span>{ph.caption}</span>
                  </figcaption>
                )}
              </figure>
            ))
          : sheets.map((sh, i) => (
              <figure key={sh.name} className={s.slide}>
                <span className={`${s.shot} ${s.standIn}`}>
                  <Drawing sheet={sh.sheet} id={`${uid}-${i}`} />
                </span>
                <figcaption className={s.caption}>
                  <span>{sh.name}</span>
                  <span className={s.soon}>Photographs to come</span>
                </figcaption>
              </figure>
            ))}
      </div>

      {n > 1 && (
        <>
          <span className={s.step} data-step="-1">
            <Chevron back />
          </span>
          <span className={s.step} data-step="1">
            <Chevron />
          </span>
          <span className={s.dots}>
            {Array.from({ length: n }, (_, i) => (
              <span key={i} className={s.dot} data-dot={i} style={{ "--lit": i ? 0 : 1 } as CSSProperties} />
            ))}
          </span>
        </>
      )}
    </div>
  );
}
