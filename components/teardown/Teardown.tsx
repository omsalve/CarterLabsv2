"use client";

/*
 * THE TEARDOWN: the site, taken apart into the layers it is drawn from, like Xcode's
 * view debugger or Apple's exploded product renders. The frame on screen lifts off as
 * one card, the way an app does in the App Switcher, tilts back, and separates along
 * its depth: the map's layers (each lifted out of the map's own GL frame, see
 * capture.ts), the air over them, the names, the glass, and the page on top. Each is
 * labelled with what it is, figures measured from the frame itself, and the number
 * of the player who built it (lineup/team.ts), so the team is shown by its work.
 *
 * One value, `apart`, drives the lift and the separation, so opening, closing and a
 * pinch are one motion that can be caught anywhere. A drag turns the stack (1:1, and
 * it keeps the release), scroll or pinch spreads it, and pinching it shut puts it
 * back. Hover or focus a layer, or one of the three, and it rises out of the stack
 * while the rest step back. The surf keeps breaking on its layer throughout.
 */

import { useContext, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import i from "../island/island.module.css";
import s from "./teardown.module.css";
import { Spring } from "../island/spring";
import { SceneContext } from "../island/scene";
import { TEAM, called } from "../lineup/team";
import { LENS, FROST } from "../island/glass-layer";
import { CARTER_ROAD, distanceKm } from "../hero/geo";
import { UNTAGGED_HEIGHT } from "../hero/map-style";
import field from "../hero/surf-field.json";
import type { Demo } from "../island/types";
import type { Layers, Slice } from "./capture";

type Part = Slice | "atmosphere" | "glass";
type Plane = {
  id: string;
  /** unnamed planes carry no label (the air, which only matters where the stack is shut) */
  name?: string;
  source?: string;
  /** whose part of the site it is: the player whose "On this site" names it */
  by?: Demo;
  parts: Part[];
  /** the part that keeps drawing while the site is apart */
  live?: Slice;
  /** a copy of the page's own DOM laid on this plane */
  dom?: "names" | "stack";
  /**
   * How much brighter it is drawn once apart. The night survey is lit to be read
   * through glass over black; a layer alone in the void needs more light to be seen.
   */
  light?: number;
};

/** Bottom to top, as the frame is composed. */
const PLANES: Plane[] = [
  { id: "ground", name: "Ground", source: "Land and sea, from OpenStreetMap", by: "map", parts: ["ground", "edges"], light: 1.8 },
  { id: "relief", name: "Relief", source: "Hillshade and contours, from Mapzen terrain", by: "map", parts: ["relief", "contours"], light: 2.4 },
  { id: "coast", name: "Coast", source: "Surf raised from the OSM coastline", by: "map", parts: ["coast", "surf"], live: "surf", light: 1.4 },
  { id: "streets", name: "Streets", source: "Roads, rail and runways", by: "map", parts: ["streets"], light: 3 },
  { id: "carter", name: "Carter Road", source: "The studio's road, lit", by: "map", parts: ["carter"], light: 1.15 },
  { id: "buildings", name: "Buildings", source: "Raised to their OSM heights", by: "map", parts: ["buildings"], light: 2.6 },
  { id: "air", parts: ["atmosphere"] },
  { id: "names", name: "Names", source: "Callouts, pins and instruments", by: "map", parts: ["names"], dom: "names", light: 1.3 },
  { id: "glass", name: "Glass", source: "Bending the map, in its own GL pass", by: "glass", parts: ["glass"] },
  { id: "stack", name: "Stack", source: "The pages, turned like a widget stack", by: "stack", parts: [], dom: "stack" },
];

/** The labelled planes, top of the stack first: the order they're read in. */
const READ = PLANES.map((_, k) => k)
  .filter((k) => PLANES[k].name)
  .reverse();

/** The players who made a part of this site, and which planes are theirs. */
const MAKERS = TEAM.filter((p) => p.signature).map((p) => ({
  player: p,
  planes: PLANES.map((_, k) => k).filter((k) => PLANES[k].by === p.signature!.demo),
})).filter((m) => m.planes.length);
const makerOf = (pl: Plane) => MAKERS.find((m) => m.player.signature!.demo === pl.by)?.player;

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const word = (n: number) => WORDS[n] ?? String(n);

const ROAD_KM = CARTER_ROAD.reduce((sum, p, k) => (k ? sum + distanceKm(CARTER_ROAD[k - 1], p) : 0), 0);

/**
 * Where the stack rests once apart: shrunk back, tilted away and turned, its planes
 * `gap` apart (in the stack's own px), its centre moved by `x`, `y` of the screen.
 */
const POSE = {
  wide: { scale: 0.5, rx: 55, rz: -24, gap: 116, x: -0.08, y: 0.015, depth: 2600 },
  compact: { scale: 0.58, rx: 56, rz: -12, gap: 62, x: 0, y: -0.085, depth: 1500 },
};
/** How far a drag turns it (deg per px), and how far it will go either way from the pose. */
const TURN = { yaw: 0.22, tilt: 0.14, yawRange: [-55, 42], tiltRange: [-30, 16], project: 0.18 };
/** How far apart the planes may be spread; pinched below `shut`, the site goes back together. */
const SPREAD = { min: 0.55, max: 1.6, shut: 0.36, wheel: 0.0022, pinch: 0.01, idle: 160 };
/** A layer that's picked out rises this far out of the stack (px); the rest keep this much light. */
const PICK = { rise: 40, keep: 0.2 };

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** iOS's rubber band: past either end it gives, harder the further it goes. */
const rubber = (over: number, dim: number) => (1 - 1 / ((over * 0.55) / dim + 1)) * dim;
const band = (v: number, lo: number, hi: number, give: number) =>
  v < lo ? lo - rubber(lo - v, give) : v > hi ? hi + rubber(v - hi, give) : v;
const op = (v: number) => (v > 0.998 ? "" : Math.max(0, v).toFixed(3));

const group = (n: number) => Math.round(n).toLocaleString("en-US");
/** to three significant figures, as a scale is quoted */
const sig = (n: number) => {
  const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 2);
  return Math.round(n / p) * p;
};

/** Each plane's figures, measured from the frame it was taken from. Mono is only ever for these. */
function figures(l: Layers, pages: number): Record<string, string> {
  const f = l.facts;
  return {
    ground: `SCALE 1:${group(sig(f.scale))}`,
    relief: f.contours ? `EVERY ${f.contours.step} M · TOP ${f.contours.top} M` : "",
    coast: `${group(field.size[0])} × ${group(field.size[1])} CELLS · ${field.cellMetres} M`,
    streets: `${group(f.roads)} SEGMENTS`,
    carter: `${ROAD_KM.toFixed(2)} KM`,
    buildings: `${UNTAGGED_HEIGHT} M WHERE UNTAGGED`,
    names: `${f.names} NAMES`,
    glass: `LENS ${LENS} PX · FROST ${FROST} PX`,
    stack: `${pages} PAGES`,
  };
}

const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest("button, a");

/**
 * A layer's extra light is baked into its canvases once, where the canvas can filter:
 * a CSS filter on each plane, redrawn every frame the surf moves, costs a phone (or a
 * laptop's integrated GPU) its frame rate. The planes then only filter while lifting.
 */
const canBake = () => typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
const bake = (c: HTMLCanvasElement, gain: number) => {
  const ctx = c.getContext("2d")!;
  ctx.save();
  ctx.globalCompositeOperation = "copy";
  ctx.filter = `brightness(${gain})`;
  ctx.drawImage(c, 0, 0);
  ctx.restore();
};

type Props = {
  /** the hero's section: the stage and the island are copied from inside it */
  root: RefObject<HTMLElement | null>;
  reduced: boolean;
};

export default function Teardown({ root, reduced }: Props) {
  const getScene = useContext(SceneContext);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const planeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelRefs = useRef<(HTMLLIElement | null)[]>([]);
  const leaderRefs = useRef<(SVGGElement | null)[]>([]);
  const frameRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});
  /** the layers picked out by a press (a hover only previews); top of the stack first */
  const [picked, setPicked] = useState<number[]>([]);
  const api = useRef<{ close(): void; preview(k: number[] | null): void; pick(k: number[]): void }>({
    close() {},
    preview() {},
    pick() {},
  });

  useEffect(() => {
    const dialog = dialogRef.current!;
    const space = spaceRef.current!;
    const rig = rigRef.current!;
    const planes = planeRefs.current;
    const world = getScene();
    if (!world) return;
    const n = PLANES.length;

    // ---------------------------------------------------------------- springs
    const apart = new Spring(0, 0.72, 0.8);
    const yaw = new Spring(0, 0.5, 0.88);
    const tilt = new Spring(0, 0.5, 0.88);
    const spread = new Spring(1, 0.42, 0.88);
    const dim = new Spring(0, 0.36, 1);
    const lit = PLANES.map(() => new Spring(0, 0.36, 1));

    let shown = false;
    let closing = false;
    let from: HTMLElement | null = null;
    let raf = 0;
    let last = 0;
    let W = 1;
    let H = 1;
    let compact = false;
    let pose = POSE.wide;
    let pinned: number[] = [];
    let hovered: number[] | null = null;
    let dirty = true; // something other than a spring changed what the frame should show
    const heights: number[] = PLANES.map(() => 60);
    let colW = 240;
    const chromes = Array.from(dialog.querySelectorAll<HTMLElement>("[data-chrome]"));

    const glow = () => {
      const on = hovered ?? pinned;
      lit.forEach((sp, k) => (sp.target = on.includes(k) ? 1 : 0));
      dim.target = on.length ? 1 : 0;
      labelRefs.current.forEach((li, k) => li && (li.dataset.lit = on.includes(k) ? "on" : on.length ? "off" : ""));
    };
    api.current.preview = (k) => {
      hovered = k;
      glow();
    };
    api.current.pick = (k) => {
      pinned = k;
      glow();
    };

    // ---------------------------------------------------------------- the frame, copied
    /** A copy of part of the hero, inert, laid on a plane exactly where the original sits on screen. */
    const echo = (what: "names" | "stack") => {
      const hero = root.current!;
      const wrap = document.createElement("div");
      // the hero's own class and state, so rules like `.hero[data-arrived] .pin` still hold
      wrap.className = hero.className;
      for (const [k, v] of Object.entries(hero.dataset)) if (v !== undefined) wrap.dataset[k] = v;
      wrap.style.cssText = hero.style.cssText;
      Object.assign(wrap.style, { position: "absolute", inset: "0", pointerEvents: "none" });
      wrap.inert = true; // a picture of the page: nothing in it can be focused or pressed
      const scrub = (el: Element) => {
        el.removeAttribute("id");
        el.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
        el.querySelectorAll("video").forEach((v) => {
          v.removeAttribute("autoplay");
          v.removeAttribute("src");
          v.querySelectorAll("source").forEach((src) => src.remove());
        });
        return el;
      };
      if (what === "names") {
        const stage = hero.querySelector('[data-teardown="stage"]');
        if (!stage) return wrap;
        const bare = stage.cloneNode(false) as HTMLElement;
        bare.style.background = "none"; // the names float; the ground is its own plane
        stage.querySelectorAll(':scope > [data-teardown="names"]').forEach((el) => bare.append(scrub(el.cloneNode(true) as Element)));
        wrap.append(bare);
      } else {
        hero.querySelectorAll(':scope > [data-teardown="stack"]').forEach((el) => wrap.append(scrub(el.cloneNode(true) as Element)));
      }
      return wrap;
    };

    // ---------------------------------------------------------------- open, close
    let surf: HTMLCanvasElement | null = null;
    const open = (button: HTMLElement) => {
      if (shown) return;
      const layers = world.layers?.capture();
      if (!layers) return;
      from = button;
      // counted on the page itself, before its copy joins it inside the hero
      const pages = root.current?.querySelectorAll(':scope > [data-teardown="stack"] [data-page]').length ?? 0;
      W = layers.w;
      H = layers.h;
      compact = W < 760;
      pose = compact ? POSE.compact : POSE.wide;
      space.style.perspective = `${pose.depth}px`;
      rig.style.width = `${W}px`;
      rig.style.height = `${H}px`;
      surf = null;
      PLANES.forEach((pl, k) => {
        const box = planes[k]?.firstElementChild as HTMLElement | null;
        if (!box) return;
        box.replaceChildren();
        for (const part of pl.parts) {
          const c = part === "atmosphere" ? layers.atmosphere : part === "glass" ? layers.glass : layers.slices[part];
          if (!c) continue;
          c.className = s.canvas;
          box.append(c);
          if (pl.live === part) surf = c;
        }
        if (pl.dom) box.append(echo(pl.dom));
      });
      setFacts(figures(layers, pages));

      world.hold = true;
      shown = true;
      closing = false;
      memo.clear();
      dirty = true;
      dialog.dataset.compact = compact ? "on" : "";
      dialog.style.opacity = "0"; // until the first frame composes it
      dialog.showModal();
      titleRef.current?.focus({ preventScroll: true });
      apart.response = reduced ? 0.34 : 0.72;
      apart.damping = reduced ? 1 : 0.8;
      apart.target = 1;
      if (surf && !reduced) world.layers?.live("surf", surf);
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    world.takeApart = open;

    const close = (velocity = 0) => {
      if (!shown || closing) return;
      closing = true;
      world.layers?.live(null);
      world.hold = false;
      hovered = null;
      pinned = [];
      setPicked([]);
      glow();
      apart.response = reduced ? 0.34 : 0.52;
      apart.damping = reduced ? 1 : 0.9;
      apart.target = 0;
      if (!reduced) apart.velocity += velocity;
    };
    api.current.close = () => close();

    /** Back together: the copies go, and focus goes back where it came from. */
    const finish = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (shown && dialog.open) dialog.close();
      if (shown) world.layers?.live(null);
      world.hold = false;
      shown = false;
      closing = false;
      planes.forEach((p) => (p?.firstElementChild as HTMLElement | null)?.replaceChildren());
      surf = null;
      for (const sp of [apart, yaw, tilt, dim, ...lit]) sp.jump(0);
      spread.jump(1);
      raw.spread = 1;
      dialog.style.opacity = "0";
      from?.focus({ preventScroll: true });
      from = null;
    };

    // ---------------------------------------------------------------- compose
    type Geo = { s: number; rx: number; rz: number; cx: number; cy: number };
    /** Where a point on plane `z` lands on screen, as the browser will draw it. */
    const project = (x: number, y: number, z: number, g: Geo) => {
      const a = g.rz * RAD;
      const b = g.rx * RAD;
      const px = x - W / 2;
      const py = y - H / 2;
      const x1 = px * Math.cos(a) - py * Math.sin(a);
      const y1 = px * Math.sin(a) + py * Math.cos(a);
      const y2 = y1 * Math.cos(b) - z * Math.sin(b);
      const z2 = y1 * Math.sin(b) + z * Math.cos(b);
      const X = x1 * g.s + g.cx;
      const Y = y2 * g.s + g.cy;
      const k = pose.depth / (pose.depth - z2 * g.s);
      return { x: W / 2 + (X - W / 2) * k, y: H / 2 + (Y - H / 2) * k };
    };

    // Only what changed is written, and nothing is read back from layout: the copy of
    // the page under the stack is large, and a restyle of it every frame is the cost.
    const memo = new Map<Element, Record<string, string>>();
    const put = (el: HTMLElement | SVGElement, key: "transform" | "opacity" | "filter", value: string) => {
      let m = memo.get(el);
      if (!m) memo.set(el, (m = {}));
      if (m[key] === value) return;
      m[key] = value;
      el.style[key] = value;
    };
    const attr = (el: Element, key: string, value: string) => {
      let m = memo.get(el);
      if (!m) memo.set(el, (m = {}));
      if (m[key] === value) return;
      m[key] = value;
      el.setAttribute(key, value);
    };

    const zs: number[] = PLANES.map(() => 0);
    const compose = () => {
      const a = Math.max(0, apart.value);
      // the lift: the frame shrinks back and tilts away over the first stretch…
      const t = reduced ? 1 : smooth(0, 0.7, a);
      const g: Geo = {
        s: lerp(1, pose.scale, t),
        rx: (pose.rx + tilt.value) * t,
        rz: (pose.rz + yaw.value) * t,
        cx: W / 2 + pose.x * W * t,
        cy: H / 2 + pose.y * H * t,
      };
      put(
        rig,
        "transform",
        `translate3d(${g.cx.toFixed(2)}px, ${g.cy.toFixed(2)}px, 0) scale3d(${g.s.toFixed(4)}, ${g.s.toFixed(4)}, ${g.s.toFixed(4)}) ` +
          `rotateX(${g.rx.toFixed(3)}deg) rotateZ(${g.rz.toFixed(3)}deg) translate3d(${-W / 2}px, ${-H / 2}px, 0)`,
      );

      // …and the planes part, the top ones first, like a deck fanning up off the table
      const edges = smooth(0.1, 0.55, a);
      for (let k = 0; k < n; k++) {
        const pl = planes[k];
        if (!pl) continue;
        const lead = (n - 1 - k) / (n - 1);
        const d = 0.06 + 0.3 * lead;
        const e = reduced ? 1 : Math.max(0, (a - d) / (1 - d));
        const z = (k - (n - 1) / 2) * pose.gap * spread.value * e + (reduced ? 0 : PICK.rise * lit[k].value * t);
        zs[k] = z;
        put(pl, "transform", Math.abs(z) > 0.01 ? `translate3d(0, 0, ${z.toFixed(1)}px)` : "");
        let o = 1 - (1 - PICK.keep) * dim.value * (1 - lit[k].value);
        // the air only belongs to the finished frame: it clears as the layers lift
        if (PLANES[k].id === "air") o *= 1 - smooth(0, 0.3, a);
        put(pl, "opacity", op(o));
        const lift = lerp(1, PLANES[k].light ?? 1, t);
        put(pl, "filter", lift > 1.005 ? `brightness(${lift.toFixed(2)})` : "");
        const frame = frameRefs.current[k];
        if (frame) put(frame, "opacity", (edges * (0.45 + 0.55 * lit[k].value)).toFixed(3));
      }

      // the void closes over the live site almost at once; the frame it shows is the same one
      put(dialog, "opacity", op(reduced ? a : smooth(0, 0.035, a)));
      const chrome = smooth(0.5, 0.95, a);
      for (const el of chromes) put(el, "opacity", op(chrome));

      if (compact) return;
      // labels: each hangs off its plane's near corner, in a column at the right that
      // stays put while the stack turns, so the leaders do the moving
      const rows = READ.map((k) => ({ k, at: project(W - 1, H - 1, zs[k], g) }));
      const edge = clamp(W * 0.024, 18, 36);
      const col = W - edge - colW;
      // Each name sits level with its corner where there's room; where there isn't they
      // part evenly about their corners, and all of them stay between the capsules.
      const hs = rows.map((r) => heights[r.k] + 6);
      const last = rows.length - 1;
      const want = rows.map((r) => r.at.y - 10);
      const ys = want.slice();
      for (let j = 1; j <= last; j++) ys[j] = Math.max(ys[j], ys[j - 1] + hs[j - 1]);
      const mid = (list: number[]) => list.reduce((sum, v) => sum + v, 0) / list.length;
      const shift = mid(want) - mid(ys);
      for (let j = 0; j <= last; j++) ys[j] += shift;
      const top = edge + 56;
      const bottom = H - edge - 64;
      ys[last] = Math.min(ys[last], bottom - hs[last]);
      for (let j = last - 1; j >= 0; j--) ys[j] = Math.min(ys[j], ys[j + 1] - hs[j]);
      ys[0] = Math.max(ys[0], top);
      for (let j = 1; j <= last; j++) ys[j] = Math.max(ys[j], ys[j - 1] + hs[j - 1]);
      rows.forEach(({ k, at }, j) => {
        const li = labelRefs.current[k];
        const lead = leaderRefs.current[k];
        if (!li || !lead) return;
        const y = ys[j];
        const show = op(chrome * smooth(0.55 + j * 0.03, 0.85 + j * 0.03, a));
        put(li, "transform", `translate3d(${col.toFixed(1)}px, ${y.toFixed(1)}px, 0)`);
        put(li, "opacity", show);
        const ly = y + 10; // through the name
        const [path, dot] = lead.children as unknown as [SVGPathElement, SVGCircleElement];
        attr(path, "d", `M${at.x.toFixed(1)} ${at.y.toFixed(1)}L${(col - 18).toFixed(1)} ${ly.toFixed(1)}H${(col - 6).toFixed(1)}`);
        attr(dot, "cx", at.x.toFixed(1));
        attr(dot, "cy", at.y.toFixed(1));
        put(lead, "opacity", show);
      });
    };

    const springs = [apart, yaw, tilt, spread, dim, ...lit];
    let still = false; // nothing moved last frame, so the frame on screen is already right
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const moving = springs.some((sp) => !sp.resting);
      for (const sp of springs) sp.step(dt);
      // one more compose after the springs come to rest, for their exact final values
      if (moving || !still || dirty) compose();
      still = !moving;
      dirty = false;
      if (closing && apart.resting && apart.value === 0) return finish();
      raf = requestAnimationFrame(tick);
    };

    // ---------------------------------------------------------------- input
    // Everything the site listens for on the window (the stack, the lineup, the gallery)
    // stays with the teardown while it's up.
    const raw = { yaw: 0, tilt: 0, spread: 1 };
    const fingers = new Map<number, { x: number; y: number }>();
    const drag = { id: -1, x: 0, y: 0, t: 0, vx: 0, vy: 0 };
    let pinch = { d: 0, spread: 1 };
    let wheelTimer = 0;

    /** Pinched past its closest, the stack starts to go back together under the fingers. */
    const setSpread = (v: number, follow: boolean) => {
      raw.spread = v;
      spread.target = band(v, SPREAD.min, SPREAD.max, 0.3);
      if (follow) spread.jump(spread.target);
      if (!reduced && !closing) apart.target = v < SPREAD.min ? 1 - 0.55 * smooth(SPREAD.min, SPREAD.shut, v) : 1;
    };
    /** A spread let go: shut far enough, the site goes back together; otherwise it settles in range. */
    const letSpread = () => {
      if (raw.spread < SPREAD.shut * 1.35 && !reduced) return close(-0.6);
      setSpread(clamp(raw.spread, SPREAD.min, SPREAD.max), false);
      apart.target = 1;
    };

    const stop = (e: Event) => e.stopPropagation();

    const onPointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      if (!shown || closing || isControl(e.target)) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        const [p, q] = [...fingers.values()];
        pinch = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, spread: raw.spread };
        drag.id = -1;
        return;
      }
      if (fingers.size > 1) return;
      Object.assign(drag, { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, vx: 0, vy: 0 });
      raw.yaw = yaw.value;
      raw.tilt = tilt.value;
      dialog.setPointerCapture(e.pointerId);
      dialog.dataset.drag = "on";
    };

    const onPointerMove = (e: PointerEvent) => {
      e.stopPropagation();
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        const [p, q] = [...fingers.values()];
        setSpread(pinch.spread * (Math.hypot(p.x - q.x, p.y - q.y) / pinch.d), true);
        return;
      }
      if (e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const dt = Math.max(1, e.timeStamp - drag.t) / 1000;
      raw.yaw += dx * TURN.yaw;
      raw.tilt += dy * TURN.tilt;
      drag.vx = drag.vx * 0.4 + ((dx * TURN.yaw) / dt) * 0.6;
      drag.vy = drag.vy * 0.4 + ((dy * TURN.tilt) / dt) * 0.6;
      Object.assign(drag, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      yaw.jump(band(raw.yaw, TURN.yawRange[0], TURN.yawRange[1], 14));
      tilt.jump(band(raw.tilt, TURN.tiltRange[0], TURN.tiltRange[1], 8));
    };

    const onPointerUp = (e: PointerEvent) => {
      e.stopPropagation();
      if (!fingers.delete(e.pointerId)) return;
      if (fingers.size === 1 && drag.id < 0) return letSpread();
      if (e.pointerId !== drag.id) return;
      drag.id = -1;
      delete dialog.dataset.drag;
      // a pause before letting go spends the fling
      const still = e.timeStamp - drag.t > 90;
      const vx = still ? 0 : drag.vx;
      const vy = still ? 0 : drag.vy;
      yaw.target = clamp(yaw.value + vx * TURN.project, TURN.yawRange[0], TURN.yawRange[1]);
      tilt.target = clamp(tilt.value + vy * TURN.project, TURN.tiltRange[0], TURN.tiltRange[1]);
      yaw.velocity = reduced ? 0 : vx;
      tilt.velocity = reduced ? 0 : vy;
    };

    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault(); // a pinch on a trackpad arrives as ctrl + wheel: here it spreads, it doesn't zoom the page
      if (!shown || closing) return;
      const d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? H : 1);
      const next = e.ctrlKey ? raw.spread * Math.exp(-d * SPREAD.pinch) : raw.spread * Math.exp(d * SPREAD.wheel);
      spread.response = 0.22;
      spread.damping = 1;
      setSpread(clamp(next, 0.2, 3), false);
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        spread.response = 0.42;
        spread.damping = 0.88;
        letSpread();
      }, SPREAD.idle);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (!shown || closing || e.metaKey || e.ctrlKey || e.altKey) return;
      const turn = (sp: Spring, by: number, range: number[]) => {
        e.preventDefault();
        sp.target = clamp(sp.target + by, range[0], range[1]);
      };
      if (e.key === "ArrowLeft") turn(yaw, -12, TURN.yawRange);
      else if (e.key === "ArrowRight") turn(yaw, 12, TURN.yawRange);
      else if (e.key === "ArrowUp") turn(tilt, -8, TURN.tiltRange);
      else if (e.key === "ArrowDown") turn(tilt, 8, TURN.tiltRange);
      else if (e.key === "+" || e.key === "=") setSpread(clamp(raw.spread * 1.25, SPREAD.min, SPREAD.max), false);
      else if (e.key === "-" || e.key === "_") setSpread(clamp(raw.spread * 0.8, SPREAD.min, SPREAD.max), false);
    };

    // Esc goes through the dialog's cancel: put it back rather than vanish
    const onCancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    // …and if the browser closes it anyway (a second Esc), tidy up at once
    const onClose = () => shown && finish();
    const onResize = () => shown && close();

    const input = new AbortController();
    const opts = { signal: input.signal };
    dialog.addEventListener("pointerdown", onPointerDown, opts);
    dialog.addEventListener("pointermove", onPointerMove, opts);
    dialog.addEventListener("pointerup", onPointerUp, opts);
    dialog.addEventListener("pointercancel", onPointerUp, opts);
    dialog.addEventListener("wheel", onWheel, { ...opts, passive: false });
    dialog.addEventListener("keydown", onKeyDown, opts);
    dialog.addEventListener("keyup", stop, opts);
    dialog.addEventListener("cancel", onCancel, opts);
    dialog.addEventListener("close", onClose, opts);
    window.addEventListener("resize", onResize, opts);

    const ro = new ResizeObserver(() => {
      labelRefs.current.forEach((li, k) => {
        if (!li) return;
        heights[k] = li.offsetHeight;
        colW = li.offsetWidth || colW;
      });
      dirty = true;
    });
    labelRefs.current.forEach((li) => li && ro.observe(li));

    return () => {
      input.abort();
      ro.disconnect();
      clearTimeout(wheelTimer);
      if (shown) finish();
      cancelAnimationFrame(raf);
      if (world.takeApart === open) world.takeApart = null;
    };
    // the hero is a ref that lives as long as the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getScene, reduced]);

  const light = (k: number[]) => api.current.preview(k);
  const unlight = () => api.current.preview(null);
  const pick = (k: number[]) => {
    const next = picked.join() === k.join() ? [] : k;
    setPicked(next);
    api.current.pick(next);
  };

  const count = READ.length;
  const hands = MAKERS.length;
  /** On a phone there's no room beside the stack: one layer is read at a time, below it. */
  const reading = picked.length === 1 ? picked[0] : -1;
  const step = (by: number) => {
    const at = READ.indexOf(reading);
    const next = at < 0 ? (by > 0 ? 0 : READ.length - 1) : (at + by + READ.length) % READ.length;
    pick([READ[next]]);
  };

  const label = (k: number) => {
    const pl = PLANES[k];
    const who = makerOf(pl);
    return (
      <>
        <span className={s.disc} aria-hidden={!who}>
          {who?.number}
        </span>
        <span className={s.text}>
          <span className={s.name}>{pl.name}</span>
          <span className={s.source}>{pl.source}</span>
          {facts[pl.id] && <span className={s.measure}>{facts[pl.id]}</span>}
        </span>
      </>
    );
  };

  return (
    <dialog ref={dialogRef} className={s.dialog} aria-labelledby="teardown-title" aria-describedby="teardown-hint">
      <div ref={spaceRef} className={s.space} aria-hidden="true">
        <div ref={rigRef} className={s.rig}>
          {PLANES.map((pl, k) => (
            <div
              key={pl.id}
              ref={(el) => {
                planeRefs.current[k] = el;
              }}
              className={s.plane}
              data-plane={pl.id}
            >
              <div className={s.content} />
              {pl.name && (
                <span
                  ref={(el) => {
                    frameRefs.current[k] = el;
                  }}
                  className={s.frame}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <svg className={s.leaders} aria-hidden="true">
        {PLANES.map((pl, k) =>
          pl.name ? (
            <g
              key={pl.id}
              ref={(el) => {
                leaderRefs.current[k] = el;
              }}
            >
              <path />
              <circle r={2.5} />
            </g>
          ) : null,
        )}
      </svg>

      <header className={s.head} data-chrome="">
        <h2 ref={titleRef} id="teardown-title" className={`${i.statement} ${s.title}`} tabIndex={-1}>
          {word(count)} layers, {word(hands).toLowerCase()} <span className={i.script}>hands</span>.
        </h2>
        <p id="teardown-hint" className={s.hint}>
          <span className={s.hintFine}>Drag to turn it. Scroll to spread it.</span>
          <span className={s.hintTouch}>Drag to turn it. Pinch to spread it.</span>
        </p>
      </header>

      <button type="button" className={s.back} data-chrome="" onClick={() => api.current.close()}>
        Put it back
      </button>

      <ol className={s.labels} aria-label="Layers, top to bottom">
        {READ.map((k) => (
          <li
            key={PLANES[k].id}
            ref={(el) => {
              labelRefs.current[k] = el;
            }}
            className={s.row}
          >
            <button
              type="button"
              className={s.label}
              aria-pressed={picked.includes(k)}
              onPointerEnter={(e) => e.pointerType === "mouse" && light([k])}
              onPointerLeave={unlight}
              onFocus={() => light([k])}
              onBlur={unlight}
              onClick={() => pick([k])}
            >
              {label(k)}
            </button>
          </li>
        ))}
      </ol>

      {/* a phone reads one layer at a time */}
      <div className={s.reader} aria-live="polite" data-chrome="">
        <button type="button" className={s.stepper} aria-label="Layer above" onClick={() => step(-1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={s.read}>
          {reading >= 0 ? (
            label(reading)
          ) : (
            <span className={s.prompt}>Step through the layers, top to bottom.</span>
          )}
        </div>
        <button type="button" className={s.stepper} aria-label="Layer below" onClick={() => step(1)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className={s.legend} role="group" aria-label="Who built which" data-chrome="">
        {MAKERS.map(({ player, planes }, j) => (
          <button
            key={player.id}
            type="button"
            className={s.maker}
            style={{ "--j": j } as CSSProperties}
            aria-pressed={picked.length > 0 && picked.join() === planes.join()}
            aria-label={`${called(player)}, number ${player.number}: ${player.signature!.title.toLowerCase()}, ${planes.length} ${planes.length === 1 ? "layer" : "layers"}`}
            onPointerEnter={(e) => e.pointerType === "mouse" && light(planes)}
            onPointerLeave={unlight}
            onFocus={() => light(planes)}
            onBlur={unlight}
            onClick={() => pick(planes)}
          >
            <span className={s.disc}>{player.number}</span>
            {player.signature!.title}
            <span className={s.count}>
              {planes.length} {planes.length === 1 ? "layer" : "layers"}
            </span>
          </button>
        ))}
      </div>
    </dialog>
  );
}
