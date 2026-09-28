"use client";

import { useContext, useEffect, useRef, useState } from "react";
import i from "../island/island.module.css";
import s from "./projects.module.css";
import { Spring } from "../island/spring";
import { SceneContext } from "../island/scene";
import { formatLat, formatLng } from "../hero/geo";
import { PROJECTS, REACH_KM, fromStudio } from "./work";

/**
 * The Projects page: the work as a list, each row a pin on the map, and a case
 * study that each row lifts into.
 *
 * Three motions, one value each, so every one of them can be scrubbed.
 * - The survey follows the stack. As the page rises (its `--page-offset`, written
 *   by the island), the camera pulls back off Carter Road until Bandra fits beside
 *   the glass, the rows come up, and each row's pin drops onto the map as it lands.
 * - The card follows `focus`. A tapped row lifts out of the list and grows into its
 *   case study, like a card on the App Store's Today tab: its number, name and kind
 *   fly to the case's header, the other rows sink into the frost, the glass grows
 *   around it, and the camera comes down onto the pin on the same spring. A swipe
 *   to the right (a finger, or two on a trackpad) takes it back under the finger.
 * - A flight follows `hop`. From one case to the next the camera flies pin to pin
 *   while the case turns over like a page of the stack.
 *
 * The hero flies the camera and hangs the pins (components/hero); this page says
 * what it wants through the scene (`scene.survey`) and drives the pins' look.
 */

const CARD = {
  response: 0.56, // the card's spring…
  damping: 0.84, // …which carries a little life past the end
  sink: 0.05, // the rows left behind shrink back this much…
  part: 18, // …and part this far (px) from the one that lifted
  blur: 8,
  flick: 1.4, // a release closing faster than this (focus/s) closes it
  project: 0.16, // seconds of release velocity projected when deciding
  give: 0.08, // pulled past open, it gives this much
  wheelIdle: 140, // ms without events that ends a trackpad swipe
  commit: 0.3, // …which closes the case if it travelled this far
};
const HOP = { response: 0.8, damping: 0.92 };
const DROP = { response: 0.5, damping: 0.64 }; // a pin lands with a little give

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rubber = (over: number, dim: number) => (1 - 1 / ((over * 0.55) / dim + 1)) * dim;
const op = (v: number) => (v > 0.998 ? "" : Math.max(0, v).toFixed(3));

type Box = { x: number; y: number; w: number; h: number };
/** A part's flight from the row to the case: where it starts, where it lands, and how much smaller it starts. */
type Flip = { from: Box; to: Box; k: number };

const Chevron = ({ back = false }: { back?: boolean }) => (
  <svg className={s.chevron} viewBox="0 0 16 16" aria-hidden="true">
    <path
      d={back ? "M10 3.5 5.5 8 10 12.5" : "M6 3.5 10.5 8 6 12.5"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function Projects() {
  const getScene = useContext(SceneContext);
  const rootRef = useRef<HTMLDivElement>(null);
  /** which case is showing, for focus and the accessibility tree (-1: the list) */
  const [shown, setShown] = useState(-1);
  /** the card's controls, for the buttons; set once the page is live */
  const api = useRef<{ open(k: number): void; close(): void; hop(k: number): void }>({ open() {}, close() {}, hop() {} });
  const handoff = useRef<"case" | "row" | null>(null);
  const lastCase = useRef(-1);

  // focus follows the card: into the case as it opens, back to its row as it closes
  useEffect(() => {
    const root = rootRef.current;
    const to = handoff.current;
    handoff.current = null;
    if (!root || !to) return;
    if (shown >= 0) {
      lastCase.current = shown;
      root.querySelector<HTMLElement>(`[data-case="${shown}"] h3`)?.focus({ preventScroll: true });
    } else if (root.contains(document.activeElement) || document.activeElement === document.body) {
      root.querySelector<HTMLElement>(`[data-row="${lastCase.current}"] button`)?.focus({ preventScroll: true });
    }
  }, [shown]);

  useEffect(() => {
    const root = rootRef.current!;
    const page = root.closest<HTMLElement>("[data-page]");
    const island = root.closest<HTMLElement>('[role="region"]');
    const world = getScene();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const part = (el: Element, name: string) => el.querySelector<HTMLElement>(`[data-part="${name}"]`)!;

    const index = root.querySelector<HTMLElement>(`.${s.index}`)!;
    const intro = root.querySelector<HTMLElement>(`.${s.intro}`)!;
    const list = root.querySelector<HTMLElement>(`.${s.list}`)!;
    const card = root.querySelector<HTMLElement>(`.${s.card}`)!;
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-row]")).map((li) => ({
      li,
      hit: li.querySelector("button")!,
      disc: part(li, "disc"),
      name: part(li, "name"),
      meta: part(li, "meta"),
      rest: part(li, "rest"),
    }));
    const cases = Array.from(root.querySelectorAll<HTMLElement>("[data-case]")).map((el) => ({
      el,
      back: part(el, "back"),
      disc: part(el, "disc"),
      name: part(el, "name"),
      meta: part(el, "meta"),
      body: Array.from(el.querySelectorAll<HTMLElement>('[data-part="body"]')),
    }));

    // ---------------------------------------------------------------- state
    const focus = new Spring(0, CARD.response, CARD.damping);
    const hop = new Spring(0, HOP.response, HOP.damping);
    const drops = PROJECTS.map(() => new Spring(0, reduced ? 0.3 : DROP.response, reduced ? 1 : DROP.damping));
    let cur = -1; // the case the card belongs to (the row it lifted from)
    let want = 0; // 1 while it should be open
    let hopping = false;
    let next = -1; // where a flight is going
    let closeAfterHop = false;
    let hot = -1;

    // ---------------------------------------------------------------- measure
    /** Layout position within the root; transforms don't move it, so it holds mid-flight. */
    const local = (el: HTMLElement): Box => {
      let x = 0;
      let y = 0;
      let at: HTMLElement | null = el;
      while (at && at !== root) {
        x += at.offsetLeft;
        y += at.offsetTop;
        at = at.offsetParent as HTMLElement | null;
      }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };
    const fontSize = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize) || 16;

    let indexH = 0;
    let caseH: number[] = [];
    let rowBox: Box[] = [];
    let flips: { disc: Flip; name: Flip; meta: Flip }[] = [];
    // where the card ends up: out to the list's edges (8px in from the glass), and 8px under the status row
    const full = { x: -24, w: 0, top: -6 };
    const measure = () => {
      const edge = local(list);
      full.x = edge.x;
      full.w = edge.w;
      full.top = page ? 8 - parseFloat(getComputedStyle(page).paddingTop) : -6;
      indexH = index.offsetHeight;
      caseH = cases.map((c) => c.el.offsetHeight);
      rowBox = rows.map((r) => local(r.li));
      flips = rows.map((r, k) => {
        const c = cases[k];
        return {
          disc: { from: local(r.disc), to: local(c.disc), k: r.disc.offsetWidth / Math.max(1, c.disc.offsetWidth) },
          name: { from: local(r.name), to: local(c.name), k: fontSize(r.name) / fontSize(c.name) },
          meta: { from: local(r.meta), to: local(c.meta), k: fontSize(r.meta) / fontSize(c.meta) },
        };
      });
    };
    measure();

    // ---------------------------------------------------------------- paint helpers
    const place = (el: HTMLElement, x: number, y: number, sc = 1) => {
      el.style.transform =
        Math.abs(x) + Math.abs(y) < 0.01 && Math.abs(sc - 1) < 1e-4
          ? ""
          : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${sc.toFixed(4)})`;
    };
    const look = (el: HTMLElement, o: number, blur = 0) => {
      el.style.opacity = op(o);
      el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "";
    };
    const still = (el: HTMLElement) => {
      place(el, 0, 0);
      look(el, 1);
    };
    /** The part leaves the row for the case: it travels and grows as it fades. */
    const flyOut = (el: HTMLElement, f: Flip, m: number, o: number) => {
      if (reduced) return look(el, o);
      place(el, (f.to.x - f.from.x) * m, (f.to.y - f.from.y) * m, 1 + (1 / f.k - 1) * m);
      look(el, o);
    };
    /** The case's own part lands where the row's left off, starting from its size and place. */
    const flyIn = (el: HTMLElement, f: Flip, m: number, o: number) => {
      if (reduced) return look(el, o);
      place(el, (f.from.x - f.to.x) * (1 - m), (f.from.y - f.to.y) * (1 - m), f.k + (1 - f.k) * m);
      look(el, o);
    };
    /** Rising into place like a page of the stack arriving: soft and spread out, then settled. */
    const rise = (el: HTMLElement, a: number, travel: number) => {
      if (reduced) return look(el, a);
      place(el, 0, (1 - a) * travel);
      look(el, a, (1 - a) * 6);
    };

    // ---------------------------------------------------------------- paint
    const offsetNow = () => {
      if (!page) return 0;
      const v = parseFloat(page.style.getPropertyValue("--page-offset"));
      return Number.isFinite(v) ? v : 1;
    };

    const paint = (o: number) => {
      const q = 1 - Math.min(1, Math.abs(o)); // how much of the page is showing
      const e = cur >= 0 ? focus.value : 0; // the card, with its spring's life
      const E = clamp(e, 0, 1);
      const t = hopping ? clamp(hop.value, 0, 1) : 0;
      const to = hopping ? next : cur;
      const lifting = cur >= 0 && e > 0.0005;

      // -- the list: rows come up with the page and sink back when a card lifts
      if (lifting && !reduced) {
        place(intro, 0, -12 * E, 1 - 0.03 * E);
        look(intro, 1 - smooth(0, 0.4, E), 6 * smooth(0, 0.5, E));
      } else {
        place(intro, 0, 0);
        look(intro, 1 - smooth(0, 0.4, E));
      }
      // from below the rows come up one after another; from above they are already there
      const arrival = (k: number) => (reduced || o <= 0 ? 1 : smooth(0.25 + 0.14 * k, 0.7 + 0.14 * k, q));
      // the list's fill comes with its first row, and stays behind when a card lifts
      list.style.setProperty("--bg", (arrival(0) * (1 - smooth(0.05, 0.55, E))).toFixed(3));

      rows.forEach((r, k) => {
        const a = arrival(k);
        const lifted = lifting && k === cur;
        let y = (1 - a) * 22;
        let sc = 1;
        let alpha = a;
        let blur = (1 - a) * 5;
        if (lifting && !lifted) {
          alpha *= 1 - smooth(0, 0.45, E);
          if (!reduced) {
            y += (k < cur ? -1 : 1) * CARD.part * e;
            sc = 1 - CARD.sink * E;
            blur = Math.max(blur, CARD.blur * smooth(0, 0.6, E));
          }
        }
        if (reduced) {
          place(r.li, 0, 0);
          look(r.li, alpha);
        } else {
          place(r.li, 0, y, sc);
          look(r.li, alpha, blur);
        }
        // the hairlines either side of the lifted row go with it
        const edge = lifting && (k === cur || k === cur + 1);
        r.li.style.setProperty("--line", edge ? (1 - smooth(0, 0.2, E)).toFixed(3) : "1");

        if (lifted) {
          const f = flips[k];
          const gone = 1 - smooth(0, 0.3, E);
          flyOut(r.disc, f.disc, e, gone);
          flyOut(r.name, f.name, e, gone);
          flyOut(r.meta, f.meta, e, gone);
          look(r.rest, 1 - smooth(0, 0.22, E));
        } else {
          still(r.disc);
          still(r.name);
          still(r.meta);
          look(r.rest, 1);
        }
      });

      // -- the card: the row's own light, lifting and growing to the edges of the glass
      if (lifting && !reduced) {
        const from = rowBox[cur];
        const h = (hopping ? lerp(caseH[cur], caseH[to], t) : caseH[cur]) - full.top;
        const x = lerp(from.x, full.x, e);
        const y = lerp(from.y, full.top, e);
        const lift = smooth(0, 0.1, E) * (1 - smooth(0.5, 1, E));
        card.style.visibility = lift > 0.004 ? "visible" : "";
        card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
        card.style.width = `${lerp(from.w, full.w, e).toFixed(2)}px`;
        card.style.height = `${lerp(from.h, h, e).toFixed(2)}px`;
        card.style.borderRadius = `${lerp(22, 32, E).toFixed(2)}px`;
        card.style.opacity = lift.toFixed(3);
      } else card.style.visibility = "";

      // -- the cases
      cases.forEach((c, k) => {
        const leaving = hopping && k === cur;
        const arriving = hopping && k === next;
        const carded = lifting && k === cur && !hopping;
        const visible = leaving || arriving || carded;
        c.el.style.visibility = visible ? "visible" : "";
        if (!visible) return;

        if (leaving) {
          // turned over like a page leaving the stack: up, back and into the frost
          if (reduced) look(c.el, 1 - smooth(0, 0.5, t));
          else {
            place(c.el, 0, -28 * t, 1 - 0.05 * t);
            look(c.el, 1 - smooth(0.05, 0.6, t), 10 * smooth(0, 1, t));
          }
          [c.back, c.disc, c.name, c.meta, ...c.body].forEach(still);
          return;
        }
        if (arriving) {
          still(c.el);
          if (reduced) {
            look(c.el, smooth(0.5, 1, t));
            [c.back, c.disc, c.name, c.meta, ...c.body].forEach(still);
            return;
          }
          // the next case comes up from below, its lines closing up as they land
          [c.back, c.disc, c.name, c.meta, ...c.body].forEach((el, j) =>
            rise(el, smooth(0.18 + 0.05 * j, 0.7 + 0.05 * j, t), 16 + 6 * j),
          );
          return;
        }
        // the card: the header is the row's, flown here; the rest rises in behind it
        still(c.el);
        const f = flips[k];
        const seen = smooth(0.06, 0.36, E);
        flyIn(c.disc, f.disc, e, seen);
        flyIn(c.name, f.name, e, seen);
        flyIn(c.meta, f.meta, e, seen);
        rise(c.back, smooth(0.3, 0.7, E), 10);
        c.body.forEach((el, j) => rise(el, smooth(0.38 + 0.08 * j, 0.82 + 0.08 * j, E), 18 + 10 * j));
      });

      // -- the glass fits the card as it grows (the island measures the page)
      if (lifting) {
        const caseNow = hopping ? lerp(caseH[cur], caseH[to], t) : caseH[cur];
        root.style.height = `${Math.max(0, lerp(indexH, caseNow, e)).toFixed(1)}px`;
      } else root.style.height = "";

      // -- the pins
      const marks = world?.marks ?? [];
      marks.forEach((m, k) => {
        if (!m) return;
        const d = drops[k].value;
        const w = !lifting ? 0 : hopping ? (k === cur ? 1 - t : k === next ? t : 0) : k === cur ? 1 : 0;
        const sel = w * E;
        m.style.setProperty("--d", smooth(0, 0.35, d).toFixed(3));
        m.style.setProperty("--l", smooth(0.15, 0.6, d).toFixed(3));
        // the disc keeps the spring's overshoot: it lands, gives a little, settles
        m.style.setProperty("--k", Math.max(0, (d - 0.3) / 0.7).toFixed(3));
        m.style.setProperty("--r", reduced || drops[k].target < 1 ? "1" : smooth(0.3, 1, d).toFixed(3));
        m.style.setProperty("--sel", sel.toFixed(3));
        m.style.setProperty("--dim", Math.max(0, E - sel).toFixed(3));
        if (d > 0.6) m.dataset.live = "";
        else delete m.dataset.live;
      });

      if (world) world.survey = { presence: q, focus: lifting ? e : 0, from: cur, to, t };
    };

    // ---------------------------------------------------------------- hover: a row and its pin are one thing
    const setHot = (k: number) => {
      if (k === hot) return;
      hot = k;
      rows.forEach((r, j) => (j === k ? (r.li.dataset.hot = "") : delete r.li.dataset.hot));
      (world?.marks ?? []).forEach((m, j) => {
        if (!m) return;
        if (j === k) m.dataset.hot = "";
        else delete m.dataset.hot;
      });
    };

    // ---------------------------------------------------------------- the card
    const settleFocus = (to: 0 | 1, velocity?: number) => {
      want = to;
      focus.response = reduced ? 0.34 : CARD.response;
      focus.damping = reduced ? 1 : CARD.damping;
      if (velocity !== undefined && !reduced) focus.velocity = velocity;
      focus.target = to;
      wake();
    };

    const openCase = (k: number) => {
      if (hopping) return;
      if (cur >= 0 && want === 1) return hopTo(k);
      // another card is still settling back into its row: let it land first
      if (cur >= 0 && cur !== k && focus.value > 0.05) return;
      measure();
      cur = k;
      handoff.current = "case";
      setShown(k);
      settleFocus(1);
    };

    const close = (velocity?: number) => {
      if (cur < 0 || want === 0) return;
      if (hopping) {
        closeAfterHop = true;
        return;
      }
      handoff.current = "row";
      setShown(-1);
      settleFocus(0, velocity);
    };

    const hopTo = (k: number) => {
      if (cur < 0 || want === 0 || hopping || k === cur) return;
      measure();
      hopping = true;
      next = k;
      hop.response = reduced ? 0.34 : HOP.response;
      hop.damping = reduced ? 1 : HOP.damping;
      hop.jump(0);
      hop.target = 1;
      handoff.current = "case";
      setShown(k);
      wake();
    };

    api.current = { open: openCase, close: () => close(), hop: hopTo };

    if (world) {
      world.onMark = (kind, k) => {
        if (kind === "hot") setHot(k);
        else if (kind === "cold") {
          if (hot === k) setHot(-1);
        } else if (cur < 0 || want === 0) openCase(k);
        else hopTo(k);
      };
    }

    // ---------------------------------------------------------------- input: back
    const input = new AbortController();
    const opts = { signal: input.signal };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || cur < 0 || want === 0) return;
      e.preventDefault();
      close();
    };

    // a finger swiping right takes the card back, as it goes
    const drag = { id: -1, live: false, x0: 0, y0: 0, x: 0, t: 0, v: 0, raw: 1 };
    let swallowUntil = -Infinity;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary || cur < 0 || want === 0 || hopping) return;
      if (!island?.contains(e.target as Node)) return;
      Object.assign(drag, { id: e.pointerId, live: false, x0: e.clientX, y0: e.clientY, v: 0 });
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      if (!drag.live) {
        const dx = e.clientX - drag.x0;
        const dy = e.clientY - drag.y0;
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) drag.id = -1; // the stack's
        else if (dx > 10 && dx > Math.abs(dy)) {
          Object.assign(drag, { live: true, x: e.clientX, t: e.timeStamp, raw: focus.value });
          focus.jump(focus.value);
          wake();
        }
        return;
      }
      const W = Math.max(1, page?.offsetWidth ?? 400);
      drag.raw -= (e.clientX - drag.x) / W;
      const f = drag.raw > 1 ? 1 + rubber(drag.raw - 1, CARD.give) : Math.max(0, drag.raw);
      const dt = (e.timeStamp - drag.t) / 1000;
      if (dt > 0) drag.v = drag.v * 0.4 + ((f - focus.value) / dt) * 0.6;
      drag.x = e.clientX;
      drag.t = e.timeStamp;
      focus.jump(f);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      drag.id = -1;
      if (!drag.live) return;
      drag.live = false;
      swallowUntil = e.timeStamp + 400;
      const v = e.timeStamp - drag.t > 90 ? 0 : drag.v;
      const lands = focus.value + v * CARD.project;
      if (e.type === "pointerup" && (lands < 0.5 || v < -CARD.flick)) close(v);
      else settleFocus(1, v);
    };
    const onClick = (e: MouseEvent) => {
      if (e.timeStamp >= swallowUntil) return;
      swallowUntil = -Infinity;
      e.preventDefault();
      e.stopPropagation();
    };

    // two fingers on a trackpad, swiping right, do the same
    const wheel = { live: false, raw: 1, last: -Infinity, locked: false, timer: 0 };
    const endWheel = () => {
      if (!wheel.live) return;
      wheel.live = false;
      wheel.locked = true; // whatever the swipe has left is spent
      if (1 - wheel.raw > CARD.commit) close();
      else settleFocus(1);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? window.innerWidth : 1;
      const dx = e.deltaX * unit;
      const gap = e.timeStamp - wheel.last;
      wheel.last = e.timeStamp;
      if (Math.abs(dx) < 0.5 || Math.abs(dx) <= Math.abs(e.deltaY * unit) * 1.2) return;
      if (wheel.locked) {
        if (gap < 250) return;
        wheel.locked = false;
      }
      if (cur < 0 || want === 0 || hopping || !island?.contains(e.target as Node)) return;
      if (!wheel.live) Object.assign(wheel, { live: true, raw: focus.value });
      wheel.raw = Math.min(1.4, wheel.raw + dx / Math.max(1, page?.offsetWidth ?? 400));
      clearTimeout(wheel.timer);
      if (wheel.raw <= 0.04) {
        wheel.live = false;
        wheel.locked = true;
        return close();
      }
      focus.response = 0.12;
      focus.damping = 1;
      focus.target = wheel.raw > 1 ? 1 + rubber(wheel.raw - 1, CARD.give) : wheel.raw;
      wheel.timer = window.setTimeout(endWheel, CARD.wheelIdle);
      wake();
    };

    window.addEventListener("keydown", onKeyDown, opts);
    window.addEventListener("pointerdown", onPointerDown, opts);
    window.addEventListener("pointermove", onPointerMove, { ...opts, passive: true });
    window.addEventListener("pointerup", onPointerUp, opts);
    window.addEventListener("pointercancel", onPointerUp, opts);
    window.addEventListener("wheel", onWheel, { ...opts, passive: true });
    root.addEventListener("click", onClick, { ...opts, capture: true });

    rows.forEach((r, k) => {
      r.li.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && setHot(k), opts);
      r.li.addEventListener("pointerleave", () => hot === k && setHot(-1), opts);
      r.hit.addEventListener("focus", () => r.hit.matches(":focus-visible") && setHot(k), opts);
      r.hit.addEventListener("blur", () => hot === k && setHot(-1), opts);
    });

    // ---------------------------------------------------------------- one clock, only while something moves
    let raf = 0;
    let last = 0;
    let lastO = NaN;

    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const o = offsetNow();
      const q = 1 - Math.min(1, Math.abs(o));
      const moved = o !== lastO;
      lastO = o;

      // off the stack: the card goes back into its row, so the list is there next time
      if (Math.abs(o) >= 0.999 && (cur >= 0 || hopping)) {
        focus.jump(0);
        hop.jump(0);
        Object.assign(drag, { id: -1, live: false });
        wheel.live = false;
        hopping = false;
        closeAfterHop = false;
        cur = -1;
        want = 0;
        setShown(-1);
      }

      // each pin drops as its row lands, and lifts off in reverse as the page goes
      drops.forEach((d, k) => {
        if (q > 0.55 + 0.12 * k) d.target = 1;
        else if (q < 0.35 + 0.12 * k) d.target = 0;
        d.step(dt);
      });
      focus.step(dt);
      hop.step(dt);

      if (hopping && hop.resting) {
        hopping = false;
        cur = next;
        hop.jump(0);
        if (closeAfterHop) {
          closeAfterHop = false;
          close();
        }
      }
      // closed and settled: the card is back in its row
      if (cur >= 0 && want === 0 && focus.resting && !drag.live && !wheel.live) cur = -1;

      paint(o);

      const busy =
        moved || drag.live || wheel.live || hopping || !focus.resting || !hop.resting || drops.some((d) => !d.resting);
      raf = busy ? requestAnimationFrame(tick) : (last = 0);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    paint(offsetNow());
    wake();

    // the island writes the page's offset into its style as the stack moves
    const mo = new MutationObserver(wake);
    if (page) mo.observe(page, { attributes: true, attributeFilter: ["style"] });
    const ro = new ResizeObserver(() => {
      measure();
      lastO = NaN;
      wake();
    });
    ro.observe(index);
    for (const c of cases) ro.observe(c.el);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(wheel.timer);
      input.abort();
      mo.disconnect();
      ro.disconnect();
      if (world) {
        world.onMark = null;
        world.survey = null;
      }
    };
  }, [getScene]);

  return (
    <div ref={rootRef} className={s.projects} data-concentric="">
      {/* the row's own light, which lifts out from under it and grows to the glass's edges */}
      <span className={s.card} aria-hidden="true" />

      <div className={s.index} inert={shown >= 0}>
        <div className={s.intro}>
          <h2 className={i.statement}>
            The <span className={i.script}>work</span>, up close.
          </h2>
          <p className={`${i.lede} ${i.ledeWide}`}>
            <span className={i.leadIn}>All of it within {REACH_KM} km of the studio.</span>
            <br />
            Choose one to go there.
          </p>
        </div>
        <ol className={s.list}>
          {PROJECTS.map((p, k) => (
            <li key={p.id} className={s.row} data-row={k}>
              <button
                type="button"
                className={s.rowHit}
                aria-expanded={shown === k}
                aria-controls={`case-${p.id}`}
                onClick={() => api.current.open(k)}
              >
                <span className={s.disc} data-part="disc" aria-hidden="true">
                  {k + 1}
                </span>
                <span className={s.rowText}>
                  <span className={s.rowName} data-part="name">
                    {p.name}
                  </span>
                  <span className={s.rowMeta} data-part="meta">
                    {p.kind} · {p.street}
                  </span>
                </span>
                <span className={s.rowRest} data-part="rest">
                  <span className={s.measure}>{fromStudio(p)}</span>
                  <Chevron />
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {PROJECTS.map((p, k) => {
        const after = PROJECTS[(k + 1) % PROJECTS.length];
        return (
          <article
            key={p.id}
            id={`case-${p.id}`}
            className={s.case}
            data-case={k}
            aria-labelledby={`case-${p.id}-title`}
            inert={shown !== k}
          >
            <button type="button" className={s.back} data-part="back" onClick={() => api.current.close()}>
              <Chevron back />
              Projects
            </button>
            <header className={s.head}>
              <span className={`${s.disc} ${s.discLarge}`} data-part="disc" aria-hidden="true">
                {k + 1}
              </span>
              <h3 id={`case-${p.id}-title`} className={s.title} data-part="name" tabIndex={-1}>
                {p.name}
              </h3>
              <p className={s.meta} data-part="meta">
                {p.kind} · {p.street}
              </p>
            </header>
            {p.summary && (
              <p className={`${i.lede} ${s.summary}`} data-part="body">
                {p.summary}
              </p>
            )}
            <dl className={s.facts} data-part="body">
              <div className={s.fact}>
                <dt>Where</dt>
                <dd>
                  {p.street}, {p.area}
                </dd>
              </div>
              <div className={s.fact}>
                <dt>From the studio</dt>
                <dd className={s.measure}>{fromStudio(p)}</dd>
              </div>
              {!p.approx && (
                <div className={s.fact}>
                  <dt>On the map</dt>
                  <dd className={s.measure}>
                    {formatLat(p.at[1])} · {formatLng(p.at[0])}
                  </dd>
                </div>
              )}
              {p.services && (
                <div className={s.fact}>
                  <dt>What we made</dt>
                  <dd>{p.services.join(", ")}</dd>
                </div>
              )}
              {p.year && (
                <div className={s.fact}>
                  <dt>Year</dt>
                  <dd>{p.year}</dd>
                </div>
              )}
            </dl>
            {p.link && (
              <div className={s.visit} data-part="body">
                <a className={i.cta} href={p.link} target="_blank" rel="noreferrer">
                  Visit {p.name}
                  <span className={i.ctaIcon} aria-hidden="true">
                    <svg viewBox="0 0 16 16">
                      <path d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </a>
              </div>
            )}
            <button type="button" className={s.next} data-part="body" onClick={() => api.current.hop((k + 1) % PROJECTS.length)}>
              <span className={s.disc} aria-hidden="true">
                {((k + 1) % PROJECTS.length) + 1}
              </span>
              <span className={s.nextText}>
                <span className={s.nextLabel}>Next project</span>
                <span className={s.nextName}>{after.name}</span>
              </span>
              <Chevron />
            </button>
          </article>
        );
      })}
    </div>
  );
}
