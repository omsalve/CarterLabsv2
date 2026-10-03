"use client";

import { useContext, useEffect, useRef, useState } from "react";
import i from "../island/island.module.css";
import p from "../projects/projects.module.css";
import l from "../lineup/lineup.module.css";
import s from "./team.module.css";
import { Spring } from "../island/spring";
import { SceneContext } from "../island/scene";
import Lineup, { CardArt, sourceFor } from "../lineup/Lineup";
import { TEAM, called } from "../lineup/team";
import type { Demo } from "../island/types";

/**
 * The Team page: the starting three as a lineup, and a profile each card lifts into.
 *
 * Three motions, one value each, so every one of them can be scrubbed.
 * - The lineup deals and walks out with the stack (components/lineup).
 * - The lift follows `focus`. A tapped card grows into its player's poster, the way
 *   a Contact Poster opens: the card's own art (backlight, number, player) scales
 *   up and steps right while the window it shows through opens out to the glass's
 *   edges; the name flies to the poster's corner, growing as it goes; the other two
 *   cards sink into the frost, and the glass grows around it all.
 * - The gallery follows `slide`. The three posters sit side by side on a strip,
 *   like the Lock Screen's gallery: a swipe (a finger, or two on a trackpad) drags
 *   it 1:1 and lets go with its velocity, and the switcher's thumb rides with it.
 *   Pulled right past the first poster, it goes back into its card.
 *
 * Each profile also names the part of this site that is theirs, and plays it live
 * ("Show me", through the scene), and has its own link to share: #team/<id>.
 */

const LIFT = {
  response: 0.56, // the lift's spring, as the Projects page's card…
  damping: 0.84, // …with a little life past the end
  sink: 0.05, // the cards left behind shrink back this much…
  part: 10, // …drop this far (px)…
  blur: 8, // …and soften this much
};
const GALLERY = {
  gap: 16, // between one poster and the next on the strip (px)
  flick: 0.5, // a release faster than this (posters/s) moves on
  project: 0.16, // seconds of release velocity projected when choosing the poster
  give: 0.28, // the most, in posters, the strip gives past either end
  close: 0.1, // pulled this far right of the first poster, letting go puts it back in its card
  recede: 0.04, // a poster sliding away shrinks back this much…
  dim: 0.45, // …and dims this much
  wheelIdle: 140, // ms without events that ends a trackpad swipe…
  wheelTurn: 0.12, // …which moves on if it travelled this far
};
/** The poster under the pointer (deg), like the cards but gentler: it is larger. */
const TILT = { x: 3.2, y: 2.4 };
/** A #team/<id> link opens its profile once that player has walked out: ms on stage, and per place in the lineup. */
const ARRIVE = { first: 700, cadence: 320 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rubber = (over: number, dim: number) => (1 - 1 / ((over * 0.55) / dim + 1)) * dim;
const op = (v: number) => (v > 0.998 ? "" : Math.max(0, v).toFixed(3));
const px = (x: number, y: number) => (Math.abs(x) + Math.abs(y) < 0.01 ? "" : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`);
const typing = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

type Box = { x: number; y: number; w: number; h: number };
/** A lift: where the card was (its box, its corners, its name), so the poster can start there. */
type Flight = { card: Box; radii: number[]; name: Box; nameK: number };

/** Copy text: the Clipboard API where the page is secure, the old way where it isn't (a phone on the LAN, say). */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.append(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  }
}

const Chevron = ({ back = false }: { back?: boolean }) => (
  <svg className={p.chevron} viewBox="0 0 16 16" aria-hidden="true">
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

export default function Team() {
  const getScene = useContext(SceneContext);
  const rootRef = useRef<HTMLDivElement>(null);
  /** whose profile is open (-1: the lineup) */
  const [shown, setShown] = useState(-1);
  /** which profile the gallery is on, or heading for */
  const [at, setAt] = useState(0);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(0);
  /** the lift's controls, for the buttons; set once the page is live */
  const api = useRef<{ open(k: number): void; close(): void; go(k: number): void }>({ open() {}, close() {}, go() {} });
  const handoff = useRef<"profile" | "card" | null>(null);
  const lastCard = useRef(0);

  // focus follows the lift: into the profile as it opens (and along the gallery),
  // back to its card as it closes
  useEffect(() => {
    const root = rootRef.current;
    const to = handoff.current;
    handoff.current = null;
    if (!root || !to) return;
    if (to === "profile" && shown >= 0) {
      // the frame that shows it comes next; hidden, it can't take focus yet
      const profile = root.querySelector<HTMLElement>(`[data-profile="${at}"]`);
      if (profile) profile.style.visibility = "visible";
      profile?.querySelector("h3")?.focus({ preventScroll: true });
    } else if (to === "card" && (root.contains(document.activeElement) || document.activeElement === document.body)) {
      root.querySelector<HTMLElement>(`[data-card="${lastCard.current}"]`)?.focus({ preventScroll: true });
    }
  }, [shown, at]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useEffect(() => {
    const root = rootRef.current!;
    const page = root.closest<HTMLElement>("[data-page]");
    const island = root.closest<HTMLElement>('[role="region"]');
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduced;
    const n = TEAM.length;
    const pick = (el: ParentNode, cls: string) => el.querySelector<HTMLElement>(`.${cls}`)!;

    const index = pick(root, s.index);
    const intro = pick(root, s.intro);
    const bar = pick(root, s.bar);
    const switcher = pick(root, s.switcher);
    const cards = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-card]")).map((btn) => ({
      btn,
      name: pick(btn, l.name),
    }));
    const profiles = Array.from(root.querySelectorAll<HTMLElement>("[data-profile]")).map((el, k) => {
      const group = pick(el, s.group);
      const video = el.querySelector("video");
      if (video) {
        video.muted = true;
        const src = sourceFor(TEAM[k]);
        if (src && video.getAttribute("src") !== src) video.src = src;
      }
      return {
        el,
        stage: pick(el, s.stage),
        win: pick(el, s.window),
        canvas: pick(el, s.canvas),
        group,
        number: pick(group, l.number),
        player: pick(group, l.player),
        artShade: pick(group, l.scrim),
        shade: pick(el, s.shade),
        caption: pick(el, s.caption),
        name: pick(el, s.name),
        line: pick(el, s.line),
        glare: pick(el, s.glare),
        body: Array.from(el.querySelectorAll<HTMLElement>('[data-part="body"]')),
        video,
        tx: new Spring(0, 0.5, 0.82),
        ty: new Spring(0, 0.5, 0.82),
        lift: new Spring(0, 0.36, 0.9),
      };
    });
    type Profile = (typeof profiles)[number];

    // ---------------------------------------------------------------- state
    const focus = new Spring(0, LIFT.response, LIFT.damping);
    const slide = new Spring(0, 0.5, 0.86); // where the gallery is, in hundredths of a poster
    let cur = -1; // the card that lifted: the lift belongs to it
    let want = 0; // 1 while a profile should be open
    let dest = 0; // the poster the gallery is heading for
    let flight: Flight | null = null;
    let pending = -1; // a #team/<id> to open once the page has the stage
    let stagedAt = 0;

    // ---------------------------------------------------------------- measure
    /** Layout position within the root; transforms don't move it, so it holds mid-flight. */
    const local = (el: HTMLElement): Box => {
      let x = 0;
      let y = 0;
      let node: HTMLElement | null = el;
      while (node && node !== root) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };
    /** Where it is on screen now, within the root: a pressed or lifted card is a little off its layout box. */
    const seen = (el: HTMLElement): Box => {
      const r = el.getBoundingClientRect();
      const R = root.getBoundingClientRect();
      return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height };
    };
    const fontSize = (el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize) || 16;

    let indexH = 0;
    let slot = 600;
    let tall: number[] = []; // each profile's height, from the top of the page
    let stageBox: Box[] = [];
    let groupBox: Box[] = [];
    let nameBox: Box[] = [];
    let cardBox: Box[] = [];
    let cardName: Box[] = [];
    let nameK: number[] = [];
    const measure = () => {
      indexH = index.offsetHeight;
      slot = (page?.offsetWidth ?? root.offsetWidth + 64) + GALLERY.gap;
      tall = profiles.map((pr) => pr.el.offsetTop + pr.el.offsetHeight);
      stageBox = profiles.map((pr) => local(pr.stage));
      // the canvas keeps the stage's size while the window runs from the card to it
      profiles.forEach((pr, k) => {
        pr.canvas.style.width = `${stageBox[k].w}px`;
        pr.canvas.style.height = `${stageBox[k].h}px`;
      });
      groupBox = profiles.map((pr) => local(pr.group));
      nameBox = profiles.map((pr) => local(pr.name));
      cardBox = cards.map((c) => local(c.btn));
      cardName = cards.map((c) => local(c.name));
      nameK = cards.map((c, k) => fontSize(c.name) / fontSize(profiles[k].name));
    };
    measure();

    /** The card's corners: one platter cut into three, so only its outer ones are wide. */
    const cornersOf = (j: number) => {
      const lo = j === 0 ? 32 : 14;
      const hi = j === n - 1 ? 32 : 14;
      return [lo, hi, hi, lo];
    };
    /** Where a lift starts (or ends): the card as it is on screen when opening, its resting box when closing. */
    const flightFor = (j: number, onScreen: boolean): Flight => {
      const card = onScreen ? seen(cards[j].btn) : cardBox[j];
      const k = card.w / Math.max(1, cardBox[j].w);
      const name = onScreen ? seen(cards[j].name) : cardName[j];
      return { card, radii: cornersOf(j), name, nameK: nameK[j] * k };
    };

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
    /** From the card's place and size to its own, as `m` runs 0 → 1 (it may pass 1 as the spring settles). */
    const flyIn = (el: HTMLElement, from: Box, to: Box, k: number, m: number) =>
      place(el, (from.x - to.x) * (1 - m), (from.y - to.y) * (1 - m), k + (1 - k) * m);
    /** Rising into place like a page of the stack arriving: soft and spread out, then settled. */
    const rise = (el: HTMLElement, a: number, travel: number) => {
      if (reduced) return look(el, a);
      place(el, 0, (1 - a) * travel);
      look(el, a, (1 - a) * 6);
    };

    const rest = (pr: Profile) => {
      pr.win.style.transform = "";
      pr.win.style.width = "";
      pr.win.style.height = "";
      pr.win.style.borderRadius = "";
      pr.canvas.style.transform = "";
      pr.group.style.transform = "";
      pr.group.style.removeProperty("--unmask");
      pr.name.style.transform = "";
      pr.artShade.style.opacity = "0";
      pr.shade.style.opacity = "";
      still(pr.line);
      pr.body.forEach(still);
    };

    // ---------------------------------------------------------------- paint
    const offsetNow = () => {
      if (!page) return 0;
      const v = parseFloat(page.style.getPropertyValue("--page-offset"));
      return Number.isFinite(v) ? v : 1;
    };

    const paint = () => {
      const e = cur >= 0 ? focus.value : 0; // the lift, with its spring's life
      const E = clamp(e, 0, 1);
      const lifting = cur >= 0 && e > 0.0005;
      const g = slide.value / 100;

      // -- the lineup: its intro and the other cards step back into the frost
      if (lifting && !reduced) {
        place(intro, 0, -12 * E, 1 - 0.03 * E);
        look(intro, 1 - smooth(0, 0.4, E), 6 * smooth(0, 0.5, E));
      } else {
        place(intro, 0, 0);
        look(intro, 1 - smooth(0, reduced ? 0.5 : 0.4, E));
      }
      cards.forEach((c, j) => {
        const b = c.btn;
        if (!lifting) {
          b.style.transition = "";
          return still(b);
        }
        b.style.transition = "none"; // its press transition would lag the frames
        if (j === cur) {
          // the card is the poster now, until it is back
          place(b, 0, 0);
          b.style.filter = "";
          b.style.opacity = reduced ? op(1 - smooth(0, 0.5, E)) : "0";
          return;
        }
        const a = 1 - smooth(0, reduced ? 0.5 : 0.45, E);
        if (reduced) {
          place(b, 0, 0);
          look(b, a);
        } else {
          place(b, 0, LIFT.part * e, 1 - LIFT.sink * E);
          look(b, a, LIFT.blur * smooth(0, 0.6, E));
        }
      });

      // -- the profiles, side by side on the gallery's strip
      profiles.forEach((pr, k) => {
        const d = k - g;
        const ad = Math.min(1, Math.abs(d));
        const visible = lifting && Math.abs(d) < 0.999;
        pr.el.style.visibility = visible ? "visible" : "";
        if (!visible) return;
        // a neighbour caught mid-slide as the profile closes fades with the lineup's return
        const aside = k === cur ? 1 : smooth(0.6, 1, E);
        if (reduced) {
          place(pr.el, 0, 0);
          look(pr.el, (1 - smooth(0, 0.5, ad)) * (k === cur ? smooth(0.5, 1, E) : aside));
        } else {
          place(pr.el, d * slot, 0, 1 - GALLERY.recede * ad);
          look(pr.el, (1 - GALLERY.dim * ad) * aside);
        }

        const f = flight;
        if (k !== cur || reduced || !f || Math.abs(e - 1) < 0.0005) {
          rest(pr);
        } else {
          // the window runs from the card's box to the stage's, clipping as it goes;
          // the canvas stays pinned to the stage, so what it holds can fly on its own
          const T = stageBox[k];
          const W = {
            x: lerp(f.card.x, T.x, e),
            y: lerp(f.card.y, T.y, e),
            w: Math.max(1, lerp(f.card.w, T.w, e)),
            h: Math.max(1, lerp(f.card.h, T.h, e)),
          };
          pr.win.style.transform = `translate3d(${(W.x - T.x).toFixed(2)}px, ${(W.y - T.y).toFixed(2)}px, 0)`;
          pr.win.style.width = `${W.w.toFixed(2)}px`;
          pr.win.style.height = `${W.h.toFixed(2)}px`;
          pr.win.style.borderRadius = f.radii.map((r) => `${lerp(r, 32, E).toFixed(2)}px`).join(" ");
          place(pr.canvas, T.x - W.x, T.y - W.y);
          // the card's art grows into the poster's, stepping right; the name flies to the corner
          flyIn(pr.group, f.card, groupBox[k], f.card.w / Math.max(1, groupBox[k].w), e);
          flyIn(pr.name, f.name, nameBox[k], f.nameK, e);
          pr.group.style.setProperty("--unmask", (1 - E).toFixed(3));
          pr.artShade.style.opacity = op(1 - smooth(0.1, 0.7, E));
          pr.shade.style.opacity = op(smooth(0.1, 0.7, E));
          rise(pr.line, smooth(0.35, 0.8, E), 8);
          pr.body.forEach((el, j) => rise(el, smooth(0.38 + 0.08 * j, 0.82 + 0.08 * j, E), 18 + 10 * j));
        }

        // under a fine pointer the poster leans like an Apple TV poster, its layers parting
        if (fine) {
          const tx = pr.tx.value;
          const ty = pr.ty.value;
          const lift = pr.lift.value;
          const leaning = Math.abs(tx) + Math.abs(ty) > 0.001;
          pr.stage.style.transform = leaning
            ? `perspective(1100px) rotateX(${(-ty * TILT.y).toFixed(3)}deg) rotateY(${(tx * TILT.x).toFixed(3)}deg)`
            : "";
          pr.number.style.transform = px(-tx * 8, -ty * 5);
          pr.player.style.transform = px(tx * 4, ty * 3);
          pr.caption.style.transform = px(tx * 6, ty * 4);
          pr.glare.style.opacity = lift > 0.002 ? (lift * 0.9).toFixed(3) : "0";
          pr.glare.style.setProperty("--gx", `${(50 + tx * 46).toFixed(1)}%`);
          pr.glare.style.setProperty("--gy", `${(50 + ty * 46).toFixed(1)}%`);
        }
      });

      // -- the bar over the profiles, and the switcher's thumb riding the gallery
      bar.style.visibility = lifting ? "visible" : "";
      if (lifting) {
        if (reduced) look(bar, smooth(0.5, 1, E));
        else rise(bar, smooth(0.3, 0.7, E), 10);
      }
      switcher.style.setProperty("--g", clamp(g, -0.2, n - 0.8).toFixed(3));

      // -- the glass fits the profile as it grows (the island measures the page)
      if (lifting) {
        const q = clamp(g, 0, n - 1);
        const a = Math.min(n - 2, Math.floor(q));
        const h = n > 1 ? lerp(tall[a], tall[a + 1], q - a) : tall[0];
        root.style.height = `${Math.max(0, lerp(indexH, h, e)).toFixed(1)}px`;
      } else root.style.height = "";
    };

    // ---------------------------------------------------------------- the clip
    /** The profile showing plays its player's clip from the top; the rest are still. */
    const roll = (k: number) => {
      profiles.forEach((pr, j) => {
        const v = pr.video;
        if (!v) return;
        if (j === k && !reduced && v.currentSrc) {
          v.currentTime = 0;
          v.play().catch(() => {});
        } else v.pause();
      });
    };

    // ---------------------------------------------------------------- the link
    const hashFor = (k: number) => (k >= 0 ? `#team/${TEAM[k].id}` : "#team");
    const writeHash = (k: number) => {
      const next = hashFor(k);
      if (location.hash !== next) history.replaceState(history.state, "", next);
    };
    const fromHash = () => {
      const m = /^#team\/([\w-]+)$/.exec(location.hash);
      return m ? TEAM.findIndex((t) => t.id === m[1]) : -1;
    };

    // ---------------------------------------------------------------- the lift
    const settleFocus = (to: 0 | 1, velocity?: number) => {
      want = to;
      focus.response = reduced ? 0.34 : LIFT.response;
      focus.damping = reduced ? 1 : LIFT.damping;
      if (velocity !== undefined && !reduced) focus.velocity = velocity;
      focus.target = to;
      wake();
    };
    const settled = () => Math.abs(focus.value - 1) < 0.03;

    const open = (k: number) => {
      if (cur >= 0 && want === 1) return go(k);
      // another card is still settling back into the lineup: let it land first
      if (cur >= 0 && cur !== k && focus.value > 0.05) return;
      measure();
      cur = k;
      dest = k;
      slide.jump(k * 100);
      flight = flightFor(k, true);
      lastCard.current = k;
      handoff.current = "profile";
      setAt(k);
      setShown(k);
      writeHash(k);
      roll(k);
      settleFocus(1);
    };

    const close = (velocity?: number) => {
      if (cur < 0 || want === 0) return;
      // the lift ends on whichever poster the gallery is on (or heading for), even
      // mid-slide: the poster slides home as it drops into its card
      measure();
      cur = dest;
      slide.target = dest * 100;
      flight = flightFor(dest, false);
      lastCard.current = dest;
      handoff.current = "card";
      setShown(-1);
      writeHash(-1);
      roll(-1);
      settleFocus(0, velocity);
    };

    /** A push past either end of the gallery: it gives a little and comes back. */
    const bump = (dir: number) => {
      if (!reduced) slide.velocity += dir * 90;
      wake();
    };

    const go = (k: number, velocity?: number) => {
      if (cur < 0 || want === 0 || !settled()) return;
      if (k < 0 || k > n - 1) return bump(Math.sign(k));
      const from = slide.value / 100;
      slide.response = reduced ? 0.34 : 0.5 + 0.06 * Math.max(0, Math.abs(k - from) - 1);
      slide.damping = reduced ? 1 : 0.86;
      if (velocity !== undefined && !reduced) slide.velocity = velocity * 100;
      slide.target = k * 100;
      if (k !== dest) {
        // focus in the profile sliding away goes with the gallery; in the bar, it stays put
        if (profiles[dest].el.contains(document.activeElement)) handoff.current = "profile";
        dest = k;
        setAt(k);
        writeHash(k);
        roll(k);
      }
      wake();
    };

    api.current = { open, close: () => close(), go };

    // ---------------------------------------------------------------- input
    const input = new AbortController();
    const opts = { signal: input.signal };

    const onKeyDown = (e: KeyboardEvent) => {
      if (cur < 0 || want === 0 || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        return close();
      }
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      go(dest + (e.key === "ArrowRight" ? 1 : -1));
    };

    /** A swipe stays within a poster of where it began; past that, or past either end, it pulls like a rubber band. */
    const band = (raw: number, from: number) => {
      const lo = Math.max(0, from - 1);
      const hi = Math.min(n - 1, from + 1);
      if (reduced) return clamp(raw, lo, hi);
      if (raw < lo) return lo - rubber(lo - raw, GALLERY.give);
      if (raw > hi) return hi + rubber(raw - hi, GALLERY.give);
      return raw;
    };

    /** Let go: on to the poster the release points at, or, pulled past the first, back into its card. */
    const release = (g: number, v: number, from: number) => {
      if (from === 0 && (g < -GALLERY.close || (g < -0.03 && v < -GALLERY.flick))) {
        slide.velocity = reduced ? 0 : v * 100;
        return close(Math.min(0, v));
      }
      let to = Math.round(g + v * GALLERY.project);
      if (Math.abs(v) > GALLERY.flick) to = v > 0 ? Math.floor(g) + 1 : Math.ceil(g) - 1;
      to = clamp(to, Math.max(0, from - 1), Math.min(n - 1, from + 1));
      // a tick in the hand as the swipe lands on the next player (phones allow it only after a real press)
      if (to !== dest && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
      if (to === dest) {
        // back where it was: settle with the release's velocity
        slide.response = reduced ? 0.34 : 0.5;
        slide.damping = reduced ? 1 : 0.86;
        if (!reduced) slide.velocity = v * 100;
        slide.target = to * 100;
        return wake();
      }
      go(to, v);
    };

    // a finger swiping sideways drags the gallery
    const drag = { id: -1, live: false, x0: 0, y0: 0, x: 0, t: 0, raw: 0, from: 0, v: 0 };
    let swallowUntil = -Infinity;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary || cur < 0 || want === 0 || !settled()) return;
      if (!island?.contains(e.target as Node) || typing(e.target)) return;
      Object.assign(drag, { id: e.pointerId, live: false, x0: e.clientX, y0: e.clientY, v: 0 });
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      if (!drag.live) {
        const dx = e.clientX - drag.x0;
        const dy = e.clientY - drag.y0;
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) drag.id = -1; // the stack's
        else if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          // past the slop: from here on the gallery is under the finger (a touch catches it mid-slide)
          Object.assign(drag, { live: true, x: e.clientX, t: e.timeStamp, raw: slide.value / 100, from: dest });
          slide.jump(slide.value);
          wake();
        }
        return;
      }
      drag.raw -= (e.clientX - drag.x) / slot;
      const g = band(drag.raw, drag.from);
      const dt = (e.timeStamp - drag.t) / 1000;
      if (dt > 0) drag.v = drag.v * 0.4 + ((g - slide.value / 100) / dt) * 0.6;
      drag.x = e.clientX;
      drag.t = e.timeStamp;
      slide.jump(g * 100);
      wake();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      drag.id = -1;
      if (!drag.live) return;
      drag.live = false;
      swallowUntil = e.timeStamp + 400;
      // a pause before letting go spends the fling
      const v = e.type === "pointercancel" || e.timeStamp - drag.t > 90 ? 0 : drag.v;
      release(slide.value / 100, v, drag.from);
    };
    const onClick = (e: MouseEvent) => {
      if (e.timeStamp >= swallowUntil) return;
      swallowUntil = -Infinity;
      e.preventDefault();
      e.stopPropagation();
    };

    // two fingers on a trackpad do the same
    const wheel = { live: false, raw: 0, from: 0, last: -Infinity, locked: false, timer: 0 };
    const endWheel = () => {
      if (!wheel.live) return;
      wheel.live = false;
      wheel.locked = true; // whatever the swipe has left is spent
      const g = band(wheel.raw, wheel.from);
      if (wheel.from === 0 && g < -GALLERY.close) return release(g, 0, 0);
      const moved = g - wheel.from;
      release(Math.abs(moved) >= GALLERY.wheelTurn ? wheel.from + Math.sign(moved) : wheel.from, 0, wheel.from);
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
      if (cur < 0 || want === 0 || !settled() || !island?.contains(e.target as Node)) return;
      if (!wheel.live) Object.assign(wheel, { live: true, from: dest, raw: slide.value / 100 });
      wheel.raw += dx / slot;
      clearTimeout(wheel.timer);
      const next = wheel.from + Math.sign(wheel.raw - wheel.from);
      if (Math.abs(wheel.raw - wheel.from) >= 1 && next >= 0 && next <= n - 1) {
        // the move is made: the rest of the swipe, momentum and all, is spent
        wheel.live = false;
        wheel.locked = true;
        return go(next);
      }
      slide.response = 0.14;
      slide.damping = 1;
      slide.target = band(wheel.raw, wheel.from) * 100;
      wheel.timer = window.setTimeout(endWheel, GALLERY.wheelIdle);
      wake();
    };

    const onHash = () => {
      const k = fromHash();
      if (k < 0) return;
      if (cur >= 0 && want === 1) go(k);
      else pending = k;
      wake();
    };

    window.addEventListener("keydown", onKeyDown, opts);
    window.addEventListener("pointerdown", onPointerDown, opts);
    window.addEventListener("pointermove", onPointerMove, { ...opts, passive: true });
    window.addEventListener("pointerup", onPointerUp, opts);
    window.addEventListener("pointercancel", onPointerUp, opts);
    window.addEventListener("wheel", onWheel, { ...opts, passive: true });
    window.addEventListener("hashchange", onHash, opts);
    root.addEventListener("click", onClick, { ...opts, capture: true });

    // the poster leans under a fine pointer, once it has landed
    if (fine) {
      profiles.forEach((pr, k) => {
        const lean = (x: number, y: number, lift: number) => {
          pr.tx.target = x;
          pr.ty.target = y;
          pr.lift.target = lift;
          wake();
        };
        pr.stage.addEventListener(
          "pointermove",
          (e) => {
            if (e.pointerType !== "mouse" || k !== dest || want !== 1 || !settled() || !slide.resting) return;
            const r = pr.stage.getBoundingClientRect();
            lean(clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1), clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1), 1);
          },
          opts,
        );
        pr.stage.addEventListener("pointerleave", () => lean(0, 0, 0), opts);
      });
    }

    // ---------------------------------------------------------------- one clock, only while something moves
    let raf = 0;
    let last = 0;
    let lastO = NaN;
    pending = fromHash();

    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const o = offsetNow();
      const moved = o !== lastO;
      lastO = o;
      const staged = Math.abs(o) < 0.1;
      if (!staged) stagedAt = 0;
      else stagedAt ||= now;

      // off the stack: the profile goes back into its card, so the lineup is there next time
      if (Math.abs(o) >= 0.999 && cur >= 0) {
        focus.jump(0);
        slide.jump(0);
        Object.assign(drag, { id: -1, live: false });
        wheel.live = false;
        cur = -1;
        want = 0;
        dest = 0;
        flight = null;
        setShown(-1);
        roll(-1);
        if (location.hash.startsWith("#team/")) history.replaceState(history.state, "", location.pathname + location.search);
      }
      // a link to a profile opens it once the lineup has walked out
      if (pending >= 0 && staged && cur < 0 && now - stagedAt >= (reduced ? 0 : ARRIVE.first + ARRIVE.cadence * pending)) {
        const k = pending;
        pending = -1;
        open(k);
      }

      focus.step(dt);
      slide.step(dt);
      for (const pr of profiles) {
        pr.tx.step(dt);
        pr.ty.step(dt);
        pr.lift.step(dt);
      }
      // closed and settled: the card is back in the lineup
      if (cur >= 0 && want === 0 && focus.resting) {
        cur = -1;
        flight = null;
      }

      paint();

      const busy =
        moved ||
        drag.live ||
        wheel.live ||
        !focus.resting ||
        !slide.resting ||
        (pending >= 0 && staged) ||
        profiles.some((pr) => !pr.tx.resting || !pr.ty.resting || !pr.lift.resting);
      raf = busy ? requestAnimationFrame(tick) : (last = 0);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    paint();
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
    for (const pr of profiles) ro.observe(pr.el);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(wheel.timer);
      input.abort();
      mo.disconnect();
      ro.disconnect();
      for (const pr of profiles) pr.video?.pause();
    };
  }, []);

  /** Share this profile: the share sheet on a phone, the link copied everywhere else. */
  const share = async () => {
    const player = TEAM[at];
    const url = `${location.origin}${location.pathname}#team/${player.id}`;
    if (window.matchMedia("(pointer: coarse)").matches && navigator.share) {
      try {
        await navigator.share({ title: `${called(player)} · CarterLabs`, url });
      } catch {
        /* dismissed */
      }
      return;
    }
    if (!(await copy(url))) return;
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  /** "Show me": the part of the site it names plays live (the hero and the island answer, through the scene). */
  const demo = (kind: Demo, button: HTMLElement) => {
    getScene()?.demos[kind]?.();
    button.dataset.live = "";
    window.setTimeout(() => delete button.dataset.live, 900);
  };

  return (
    <div ref={rootRef} className={s.team} data-concentric="">
      <div className={s.index} inert={shown >= 0}>
        <div className={s.intro}>
          <h2 className={i.statement}>
            The starting <span className={i.script}>three</span>.
          </h2>
          <p className={`${i.lede} ${i.ledeWide}`}>
            <span className={i.leadIn}>A small squad, on purpose.</span> The people you meet are the people who build it.
            <br />
            Choose one to meet them.
          </p>
          {/* the site, taken apart into its layers, each credited to the one who made it (components/teardown) */}
          <button type="button" className={s.apart} onClick={(e) => getScene()?.takeApart?.(e.currentTarget)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1.75 14 4.9 8 8.05 2 4.9Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M2 8.1 8 11.25 14 8.1M2 11.2 8 14.35 14 11.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Take it apart
          </button>
        </div>
        <Lineup onPick={(k) => api.current.open(k)} open={shown >= 0 ? at : -1} />
      </div>

      <div className={s.bar} inert={shown < 0}>
        <button type="button" className={p.back} onClick={() => api.current.close()}>
          <Chevron back />
          Team
        </button>
        <div className={s.switcher} role="group" aria-label="Players">
          <span className={s.thumb} aria-hidden="true" />
          {TEAM.map((pl, k) => (
            <button
              key={pl.id}
              type="button"
              className={s.switch}
              aria-current={at === k ? "true" : undefined}
              aria-label={`${called(pl)}, number ${pl.number}`}
              onClick={() => api.current.go(k)}
            >
              {pl.number}
            </button>
          ))}
        </div>
        <button type="button" className={s.share} data-done={copied ? "" : undefined} onClick={share}>
          <span className={s.shareIcon} aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M8 1.75v8.5M5 4.5l3-2.75 3 2.75" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.25 6.75H4.5a1.5 1.5 0 0 0-1.5 1.5v4.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5v-4.5a1.5 1.5 0 0 0-1.5-1.5h-.75" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <svg viewBox="0 0 16 16">
              <path d="M3.5 8.5 6.5 11.5 12.5 4.75" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={s.shareLabel}>
            <span>Share</span>
            <span aria-hidden="true">Copied</span>
          </span>
        </button>
        <span className="sr-only" role="status">
          {copied ? "Link copied" : ""}
        </span>
      </div>

      {TEAM.map((pl, k) => {
        const next = TEAM[(k + 1) % TEAM.length];
        return (
          <article
            key={pl.id}
            id={`player-${pl.id}`}
            className={s.profile}
            data-profile={k}
            data-bio={pl.bio ? "" : undefined}
            aria-labelledby={`player-${pl.id}-name`}
            inert={shown < 0 || at !== k}
          >
            <div className={s.stage}>
              <div className={s.window}>
                <div className={s.canvas}>
                  <CardArt player={pl} className={s.group} />
                  <span className={s.shade} aria-hidden="true" />
                  <div className={s.caption}>
                    <h3 id={`player-${pl.id}-name`} className={s.name} tabIndex={-1}>
                      {called(pl)}
                      {pl.captain && (
                        <span className={l.captain} role="img" aria-label="Captain">
                          C
                        </span>
                      )}
                    </h3>
                    <p className={s.line}>
                      {pl.name && `${pl.role} · `}No. {pl.number} · {pl.position.name}
                    </p>
                  </div>
                  <span className={s.glare} aria-hidden="true" />
                </div>
              </div>
            </div>
            {pl.bio && (
              <p className={`${i.lede} ${s.bio}`} data-part="body">
                {pl.bio}
              </p>
            )}
            <dl className={p.facts} data-part="body">
              <div className={p.fact}>
                <dt>Plays</dt>
                <dd>{capital(pl.position.plays)}</dd>
              </div>
              <div className={p.fact}>
                <dt>Leads</dt>
                <dd>{pl.leads}</dd>
              </div>
              {pl.signature && (
                <div className={p.fact}>
                  <dt>On this site</dt>
                  <dd className={s.sig}>
                    {pl.signature.title}
                    <button
                      type="button"
                      className={s.show}
                      aria-label={`Show me ${pl.signature.title.toLowerCase()}`}
                      onClick={(e) => demo(pl.signature!.demo, e.currentTarget)}
                    >
                      <svg viewBox="0 0 10 10" aria-hidden="true">
                        <path d="M2.5 1.6v6.8L8.4 5Z" fill="currentColor" />
                      </svg>
                      Show me
                    </button>
                  </dd>
                </div>
              )}
            </dl>
            {!!pl.links?.length && (
              <div className={s.links} data-part="body">
                {pl.links.map((link) => (
                  <a key={link.href} className={s.link} href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                ))}
              </div>
            )}
            <button type="button" className={p.next} data-part="body" onClick={() => api.current.go((k + 1) % TEAM.length)}>
              <span className={p.disc} aria-hidden="true">
                {next.number}
              </span>
              <span className={p.nextText}>
                <span className={p.nextLabel}>Next up</span>
                <span className={p.nextName}>{called(next)}</span>
              </span>
              <Chevron />
            </button>
          </article>
        );
      })}
    </div>
  );
}
