"use client";

/*
 * THESIS: The site opens like a night survey of a real city and descends onto one
 * stretch of coastline, instead of the category default of headline + showreel.
 * The map then stays as the ground of the whole site; scrolling only changes the island.
 * OWN-WORLD: near-black OSM ground, arterial roads as dim blood-red veins, red
 * contour lines from real elevation, bone-white surf on Bandra's shore, Carter Road
 * itself lit in Lit Blood; one island of liquid glass (refracting the map, continuous
 * corners, concentric insets, capsule controls); Onyx and Edwardian Script against a
 * wide heavy grotesk; mono for measurements only.
 * STORY: a calm warning ("Ordinary ends here."), then Mumbai observed as territory
 * with a lock-on reticle over Carter Road, and the visitor flies the descent
 * themselves: hold to dive (the longer you hold, the faster you fall), tap to hop,
 * scroll or swipe to scrub either way. Carter Road ignites outward from the studio
 * as they close in; past 90% the camera lands itself, the reticle locks red and a
 * Dynamic-Island pill ("Bandra, Mumbai · 20:41 IST") springs open into the island.
 * Left alone, an autopilot flies it for them.
 * FIRST VIEWPORT (arrived): pitched view over Carter Road, the road glowing red and
 * surf breaking along the shore in the right half; left, the glass island: status
 * row, CARTERLABS wordmark, tagline with a script "Bandra", one lede line, the
 * blood-red capsule "Explore the work", and a platter with the studio's address.
 * THE WORK: the Projects page is the one place the world moves. The camera pulls
 * back over Bandra and the work is pinned; opening a project brings it down onto
 * the pin (components/projects, flown here from scene.survey).
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { Map as MapLibreMap, CameraOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import s from "./hero.module.css";
import {
  TERRITORIES,
  STUDIO,
  CITY_BOUNDS,
  formatLat,
  formatLng,
  cameraAltitude,
  mercator,
  type LngLat,
} from "./geo";
import { buildStyle, TERRARIUM, ROAD_LAYERS, roadGradient } from "./map-style";
import { createSurfLayer, type SurfLayer } from "./surf-layer";
import Island from "../island/Island";
import { ISLAND_PAGES } from "../island/pages";
import { Spring } from "../island/spring";
import { SceneContext } from "../island/scene";
import { createGlassLayer, type GlassLayer } from "../island/glass-layer";
import type { IslandHandle, IslandScene } from "../island/types";
import { PROJECTS } from "../projects/work";
import { blend, fit, flight, shotKey, type Shot } from "../projects/camera";

type Phase = "void" | "line" | "line-out" | "descend" | "arrived";
const ORDER: Phase[] = ["void", "line", "line-out", "descend", "arrived"];

/** The opening line, in ms. Everything after it is flown by the visitor. */
const T = {
  dark: 500, // black before the first word
  line: 2800, // the line arrives and holds
  lineOut: 900,
  hurried: 450, // the fade when a press cuts the line short
  hint: 1400, // after the city surfaces, before the hint appears
};

/**
 * The descent, in progress: 0 is the whole city, 1 is Carter Road.
 * Rates are progress per second.
 */
const DIVE = {
  tap: 0.02, // a press drops you a little straight away
  holdFrom: 0.08, // the moment you press…
  holdGain: 0.3, // …gaining this much per second you keep holding…
  holdMax: 0.42, // …up to this
  wheel: 0.00085, // per wheel pixel
  swipe: 0.85, // per viewport height of swipe
  fling: 0.2, // seconds of release velocity a swipe carries on
  capture: 0.9, // past here the camera lands itself
  idle: 5500, // ms without input before the autopilot takes over
  autoMax: 0.16,
};

const DOWN_KEYS = [" ", "ArrowDown", "PageDown", "Enter"];
const UP_KEYS = ["ArrowUp", "PageUp"];

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The Projects page's survey: pulled back until the studio and all the work fit
 * beside the glass, tilted up for an overview. The margin keeps room for the pins'
 * numbers and names, which hang above them.
 */
const SURVEY = {
  pitch: 42,
  margin: { top: 84, bottom: 36, left: 40, right: 72 },
  compactMargin: { top: 64, bottom: 24, left: 28, right: 28 },
  maxZoom: 15.4,
  lift: 90, // up close, the project sits this much lower in the open map, under its name
};

const NICE_DISTANCES = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

type Point = { x: number; y: number };
type Padding = { top: number; bottom: number; left: number; right: number };
/** The descent's two ends: the city fit and the landing, pinned on one anchor. */
type Path = { anchor: LngLat; z0: number; z1: number; from: Point; to: Point; pitch: number; bearing: number };

export default function Hero() {
  const [phase, setPhase] = useState<Phase>("void");
  const [cut, setCut] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );

  const rootRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<IslandHandle>(null);
  const sceneRef = useRef<IslandScene>({
    glass: null,
    pointer: { x: 0, y: 0 },
    pin: null,
    frame: null,
    marks: [],
    onMark: null,
    survey: null,
  });
  /** page content inside the island reaches the scene through this (see island/scene.ts) */
  const getScene = useCallback(() => sceneRef.current, []);
  const pinRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<(HTMLDivElement | null)[]>([]);
  const reticleRef = useRef<HTMLDivElement>(null);
  const reticleAltRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const coordRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const scaleRef = useRef<HTMLSpanElement>(null);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);
  const skipRef = useRef<() => void>(() => {});

  useEffect(() => {
    const root = rootRef.current!;
    const host = hostRef.current!;
    const reticle = reticleRef.current!;
    const ring = ringRef.current!;
    const html = document.documentElement;
    const scene = sceneRef.current;
    scene.pin = pinRef.current;
    scene.marks = marksRef.current;
    const reducedMotion = window.matchMedia(REDUCED_QUERY).matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    // The story plays from the top, and the page does not scroll until it has landed.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    html.dataset.intro = "on";

    const life = new AbortController(); // unmount
    const sequence = new AbortController(); // the timeline; skip aborts it
    life.signal.addEventListener("abort", () => sequence.abort());

    let map: MapLibreMap | null = null;
    let surf: SurfLayer | null = null;
    let glass: GlassLayer | null = null;
    let arrived = false;
    let base = { bearing: 0, pitch: 0 };
    let frameRaf = 0;
    let surfRaf = 0;
    let hazeRaf = 0;
    let surfLevel = 0;
    let roadLevel = 0;
    let fov0 = 36.87;
    let fov = fov0;

    const sleep = (ms: number, signal = sequence.signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        const id = window.setTimeout(resolve, ms);
        signal.addEventListener("abort", () => (clearTimeout(id), reject(signal.reason)), { once: true });
      });

    // Any press, key or scroll during the opening line cuts it short.
    let hurried = false;
    let wake: (() => void) | null = null;
    const beat = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const signal = sequence.signal;
        if (signal.aborted) return reject(signal.reason);
        if (hurried) return resolve();
        const id = window.setTimeout(() => done(), ms);
        const done = () => {
          clearTimeout(id);
          wake = null;
          resolve();
        };
        wake = done;
        signal.addEventListener("abort", () => (clearTimeout(id), reject(signal.reason)), { once: true });
      });
    const hurry = () => {
      if (hurried) return;
      hurried = true;
      wake?.();
    };

    const isCompact = () => window.innerWidth < 760;

    /** Where the descent ends, framed around the island so Carter Road sits in open map. */
    const finalCamera = (): CameraOptions & { padding: Padding } => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const island = islandRef.current?.target();
      if (isCompact()) {
        const top = island ? island.y : h * 0.5;
        return {
          center: [72.8236, 19.0645] as LngLat,
          zoom: 14.3,
          pitch: 52,
          bearing: -18,
          padding: { top: 56, bottom: Math.max(0, h - top), left: 0, right: 0 },
        };
      }
      const control = ISLAND_PAGES.length > 1 ? 44 : 0;
      const left = island ? island.x + island.w + control + Math.min(48, w * 0.03) : w * 0.45;
      return {
        center: [72.8262, 19.0622] as LngLat,
        zoom: 14.7,
        pitch: 60,
        bearing: -14,
        padding: { top: 40, bottom: 0, left, right: 0 },
      };
    };

    const cityPadding = (): Padding => {
      const compact = isCompact();
      return { top: compact ? 90 : 70, bottom: compact ? 90 : 70, left: 24, right: 24 };
    };

    // ------------------------------------------------------------------ HUD + callouts
    const labelW: number[] = []; // the project pins' names, measured once
    const sync = () => {
      if (!map) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const place = (el: HTMLElement | null, at: LngLat) => {
        if (!el) return;
        const p = map!.project(at);
        const away = p.x < -240 || p.x > w + 240 || p.y < -240 || p.y > h + 240;
        el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        el.style.visibility = away ? "hidden" : "";
        return p;
      };
      for (const t of TERRITORIES) place(labelRefs.current[t.id], t.at);
      place(pinRef.current, STUDIO);
      place(reticle, STUDIO);
      PROJECTS.forEach((pr, i) => {
        const mark = marksRef.current[i];
        const p = place(mark, pr.at);
        if (!mark || !p) return;
        // a pin reads its name to the right unless only the left has room for it
        labelW[i] ||= mark.querySelector<HTMLElement>(`.${s.markText}`)?.offsetWidth ?? 200;
        const right = w - p.x - 32;
        const left = p.x - 32;
        mark.dataset.side = right >= labelW[i] || right >= left ? "right" : "left";
      });

      const c = map.getCenter();
      const zoom = map.getZoom();
      if (coordRef.current) coordRef.current.textContent = `${formatLat(c.lat)}   ${formatLng(c.lng)}`;
      const alt = cameraAltitude(zoom, c.lat, map.getPitch(), h);
      const altText = alt >= 1000 ? `ALT ${(alt / 1000).toFixed(1)} KM` : `ALT ${Math.round(alt)} M`;
      if (altRef.current) altRef.current.textContent = altText;
      if (reticleAltRef.current) reticleAltRef.current.textContent = altText;
      if (scaleRef.current && scaleLabelRef.current) {
        const mpp = (40075016.686 * Math.cos((c.lat * Math.PI) / 180)) / (512 * 2 ** zoom);
        const d = NICE_DISTANCES.find((m) => m / mpp >= 64) ?? NICE_DISTANCES.at(-1)!;
        scaleRef.current.style.width = `${(d / mpp).toFixed(1)}px`;
        scaleLabelRef.current.textContent = d >= 1000 ? `${d / 1000} KM` : `${d} M`;
      }
      if (!arrived) setSurf(smooth(13.2, 14.6, zoom));
    };

    const setSurf = (value: number) => {
      surfLevel = value;
      surf?.setOpacity(value);
    };

    /** Light Carter Road outward from the studio, 0..1. */
    const setRoad = (reveal: number) => {
      if (!map || Math.abs(reveal - roadLevel) < 0.002) return;
      roadLevel = reveal;
      for (const [id, alpha] of ROAD_LAYERS) {
        map.setPaintProperty(id, "line-gradient", roadGradient(reveal, alpha), { validate: false });
      }
    };

    // ------------------------------------------------------------------ the map
    const mapReady: Promise<MapLibreMap | null> = (async () => {
      const maplibregl = await import("maplibre-gl");
      // served from /public by scripts/copy-maplibre-worker.mjs
      maplibregl.setWorkerUrl(new URL("/maplibre/maplibre-gl-worker.mjs", window.location.origin).href);
      let demTiles = TERRARIUM;
      let contourTiles: string | null = null;
      try {
        const { default: mlcontour } = await import("maplibre-contour");
        const dem = new mlcontour.DemSource({ url: TERRARIUM, encoding: "terrarium", maxzoom: 12, worker: true });
        dem.setupMaplibre(maplibregl);
        demTiles = dem.sharedDemProtocolUrl;
        contourTiles = dem.contourProtocolUrl({
          thresholds: { 9: [50, 200], 11: [25, 100], 13: [10, 50] },
          contourLayer: "contours",
          elevationKey: "ele",
          levelKey: "level",
          overzoom: 1,
        });
      } catch {
        // relief falls back to hillshade alone
      }
      if (life.signal.aborted) return null;

      const m = new maplibregl.Map({
        container: host,
        style: buildStyle(demTiles, contourTiles),
        bounds: CITY_BOUNDS,
        fitBoundsOptions: { padding: cityPadding() },
        interactive: false,
        attributionControl: false,
        maxPitch: 70,
        renderWorldCopies: false,
        fadeDuration: 300,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        canvasContextAttributes: { antialias: true },
      });
      map = m;
      fov0 = fov = m.getVerticalFieldOfView();
      surf = createSurfLayer();
      surf.setFrozen(reducedMotion);
      glass = createGlassLayer();

      await new Promise<void>((resolve) => m.once("load", () => resolve()));
      if (life.signal.aborted) return null;
      m.addLayer(surf, "runways");
      m.addLayer(glass); // last: atmosphere, then glass over the finished map
      scene.glass = glass;
      if (arrived) glass.setHaze(1);
      m.on("move", sync);
      m.on("resize", sync);
      sync();
      // Wait for the city's tiles, but never hold the sequence hostage to a slow network.
      await Promise.race([
        new Promise<void>((resolve) => m.once("idle", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
      return m;
    })().catch((err) => {
      console.warn("[hero] map unavailable, continuing without it", err);
      if (!life.signal.aborted) setMapFailed(true);
      return null;
    });

    // ------------------------------------------------------------------ atmosphere
    /** The haze that swallows the horizon as the camera tilts. */
    const hazeTo = (value: number, ms: number) => {
      cancelAnimationFrame(hazeRaf);
      if (!glass || ms <= 0) return glass?.setHaze(value);
      const from = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - from) / ms);
        glass?.setHaze(value * smooth(0, 1, t));
        if (t < 1) hazeRaf = requestAnimationFrame(step);
      };
      hazeRaf = requestAnimationFrame(step);
    };

    // ------------------------------------------------------------------ the descent
    let path: Path | null = null;
    let descending = false;
    let captured = false;
    let descendAt = 0;
    let hinted = false;
    let goal = 0; // where the visitor has asked to be
    const dive = new Spring(0, 0.42, 0.92); // follows the goal, in percent
    let warp = 0; // 0..1, how fast the fall feels
    let autoAt = 0;
    let lastInput = 0;
    const press = { mode: "none" as "none" | "hold" | "swipe", since: 0, y0: 0, goal0: 0, y: 0, t: 0, vy: 0 };
    let keyDir = 0;
    let keySince = 0;

    /**
     * The flight is pinned on one point, the landing's centre: at every step it sits
     * at the right place on screen, so the city closes in around it rather than
     * sliding past. At p = 0 this is exactly the opening city fit.
     */
    const plan = (): Path => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const end = finalCamera();
      const anchor = end.center as LngLat;
      const pad = cityPadding();
      const sw = mercator(CITY_BOUNDS[0]);
      const ne = mercator(CITY_BOUNDS[1]);
      const scale = Math.min(
        (w - pad.left - pad.right) / (ne.x - sw.x),
        (h - pad.top - pad.bottom) / (sw.y - ne.y),
      );
      const a = mercator(anchor);
      return {
        anchor,
        z0: Math.log2(scale / 512),
        z1: end.zoom!,
        from: { x: w / 2 + (a.x - (sw.x + ne.x) / 2) * scale, y: h / 2 + (a.y - (sw.y + ne.y) / 2) * scale },
        to: { x: (end.padding.left + w - end.padding.right) / 2, y: (end.padding.top + h - end.padding.bottom) / 2 },
        pitch: end.pitch!,
        bearing: end.bearing!,
      };
    };

    const cameraAt = (q: Path, p: number, now: number): CameraOptions & { padding: Padding } => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const ptr = scene.pointer;
      // the city draws a breath as it surfaces
      const breathe = -0.45 * (1 - easeOutCubic(Math.min(1, (now - descendAt) / 2600)));
      const travel = easeInOutCubic(smooth(0.04, 0.85, p));
      const look = 1 - smooth(0.45, 1, p); // look around from altitude, not on final approach
      const x = q.from.x + (q.to.x - q.from.x) * travel - ptr.x * 40 * look;
      const y = q.from.y + (q.to.y - q.from.y) * travel - ptr.y * 30 * look;
      const tilt = smooth(0.25, 1, p);
      return {
        center: q.anchor,
        zoom: q.z0 + (q.z1 - q.z0) * p + breathe,
        // at p = 1 these are exactly the resting parallax
        pitch: Math.max(0, q.pitch * easeInOutCubic(tilt) - ptr.y * 2.2 * tilt),
        bearing: q.bearing * easeInOutCubic(smooth(0.1, 1, p)) + ptr.x * (5 - 2.4 * p),
        padding: {
          left: Math.max(0, 2 * x - w),
          right: Math.max(0, w - 2 * x),
          top: Math.max(0, 2 * y - h),
          bottom: Math.max(0, h - 2 * y),
        },
      };
    };

    const pushGoal = (d: number) => {
      goal = clamp(goal + d, -0.08, 1);
    };

    const fly = (m: MapLibreMap, q: Path, now: number, dt: number) => {
      if (!captured) {
        let thrust = 0;
        if (press.mode === "hold" || keyDir) {
          const since = Math.max(press.mode === "hold" ? press.since : keySince, descendAt);
          const dir = press.mode === "hold" ? 1 : keyDir;
          thrust = dir * Math.min(DIVE.holdMax, DIVE.holdFrom + DIVE.holdGain * ((now - since) / 1000));
          autoAt = 0;
        } else if (now - lastInput > DIVE.idle) {
          autoAt ||= now;
          thrust = Math.min(DIVE.autoMax, 0.03 + 0.09 * ((now - autoAt) / 1000));
        }
        if (thrust) pushGoal(thrust * dt);
        // above the city the goal springs back, like pulling past the top of a list
        if (goal < 0 && press.mode !== "swipe") goal *= Math.exp(-dt * 5);
        dive.target = goal * 100;
      }
      dive.step(dt);
      const p = dive.value / 100;

      if (!captured && p >= DIVE.capture) {
        captured = true;
        dive.response = 0.95;
        dive.damping = 1;
        dive.target = 100;
        root.dataset.lock = "on";
        delete root.dataset.hold;
        // a tick in the hand as it locks on (browsers only allow it after a real press)
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(12);
      }

      // Speed widens the lens a little once the camera is tilted enough to show it.
      const speed = Math.min(1, Math.abs(dive.velocity) / 100 / 0.5);
      warp += (speed - warp) * (1 - Math.exp(-dt * 5));
      const nextFov = fov0 + 12 * warp * smooth(0.3, 0.75, p) * (1 - smooth(0.93, 1, p));
      if (Math.abs(nextFov - fov) > 0.02) {
        fov = nextFov;
        m.setVerticalFieldOfView(fov);
      }
      m.jumpTo(cameraAt(q, p, now));
      glass?.setHaze(smooth(0.35, 1, p));
      setRoad(smooth(0.3, 0.95, p));

      root.style.setProperty("--p", clamp(p, 0, 1).toFixed(4));
      root.style.setProperty("--speed", warp.toFixed(3));
      reticle.style.setProperty("--r", `${(42 - 18 * smooth(0, 0.9, p)).toFixed(1)}px`);
      if (!hinted && now - descendAt > T.hint) {
        hinted = true;
        if (p < 0.05) root.dataset.hint = "on";
      }
      if (hinted && p > 0.05) root.dataset.hint = "off";

      if (captured && dive.value > 99.8) arrive(false);
    };

    // ------------------------------------------------------------------ input
    const aim = { x: 0, y: 0 }; // where the pointer is, -1..1; scene.pointer eases toward it
    const touched = () => {
      lastInput = performance.now();
      autoAt = 0;
    };
    const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest("a, button");

    const placeRing = (e: PointerEvent) => {
      ring.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      if (isControl(e.target)) delete root.dataset.ring;
      else root.dataset.ring = "on";
    };

    const release = () => {
      press.mode = "none";
      keyDir = 0;
      delete root.dataset.hold;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (arrived || e.button > 0 || isControl(e.target)) return;
      if (!descending) hurry();
      const now = performance.now();
      Object.assign(press, { mode: "hold", since: now, y0: e.clientY, goal0: goal, y: e.clientY, t: e.timeStamp, vy: 0 });
      if (descending && !captured) pushGoal(DIVE.tap);
      touched();
      if (!captured) root.dataset.hold = "on";
      placeRing(e);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && finePointer) {
        aim.x = (e.clientX / window.innerWidth) * 2 - 1;
        aim.y = (e.clientY / window.innerHeight) * 2 - 1;
      }
      if (arrived) return;
      if (e.pointerType === "mouse" || press.mode !== "none") placeRing(e);
      // Touch and pen can swipe: a press that travels turns from a hold into a scrub.
      if (press.mode === "none" || e.pointerType === "mouse") return;
      if (press.mode === "hold" && Math.abs(e.clientY - press.y0) > 12) {
        Object.assign(press, { mode: "swipe", y0: e.clientY, goal0: goal });
        delete root.dataset.hold;
      }
      if (press.mode !== "swipe") return;
      const dt = Math.max(1, e.timeStamp - press.t);
      press.vy = press.vy * 0.6 + ((e.clientY - press.y) / dt) * 0.4;
      press.y = e.clientY;
      press.t = e.timeStamp;
      if (descending && !captured) goal = clamp(press.goal0 - ((e.clientY - press.y0) / window.innerHeight) * DIVE.swipe, -0.08, 1);
      touched();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (press.mode === "none") return;
      if (press.mode === "swipe" && descending && !captured && e.timeStamp - press.t < 90) {
        pushGoal(-((press.vy * 1000) / window.innerHeight) * DIVE.swipe * DIVE.fling);
      }
      release();
      if (e.pointerType !== "mouse") delete root.dataset.ring;
      touched();
    };

    const onWheel = (e: WheelEvent) => {
      if (arrived || e.ctrlKey) return;
      if (!descending) return hurry();
      if (captured) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      pushGoal(clamp(e.deltaY * unit, -240, 240) * DIVE.wheel);
      touched();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (arrived || isControl(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") return skipRef.current();
      const dir = DOWN_KEYS.includes(e.key) ? 1 : UP_KEYS.includes(e.key) ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      if (!descending) hurry();
      if (keyDir !== dir) {
        keyDir = dir;
        keySince = performance.now();
      }
      touched();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if ((keyDir > 0 && DOWN_KEYS.includes(e.key)) || (keyDir < 0 && UP_KEYS.includes(e.key))) keyDir = 0;
    };

    if (!reducedMotion) {
      const opts = { signal: life.signal };
      window.addEventListener("pointerdown", onPointerDown, opts);
      window.addEventListener("pointermove", onPointerMove, { ...opts, passive: true });
      window.addEventListener("pointerup", onPointerUp, opts);
      window.addEventListener("pointercancel", onPointerUp, opts);
      window.addEventListener("wheel", onWheel, { ...opts, passive: true });
      window.addEventListener("keydown", onKeyDown, opts);
      window.addEventListener("keyup", onKeyUp, opts);
      window.addEventListener("blur", release, opts);
      // a long press is a dive, not a context menu
      window.addEventListener("contextmenu", (e) => !arrived && e.preventDefault(), opts);
      html.addEventListener(
        "pointerleave",
        () => {
          aim.x = 0;
          aim.y = 0;
          delete root.dataset.ring;
        },
        opts,
      );
    }

    // ------------------------------------------------------------------ the survey (Projects)
    /** Where the camera rests once landed; the Projects page's moves start and end here. */
    let rest: Shot | null = null;
    let shots: { key: string; overview: Shot; close: Shot[] } | null = null;
    let lastShot = "";
    let quiet = 0;
    let surveyed = "";

    /** The part of the view the island leaves open, as camera padding. */
    const openMap = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const f = scene.frame;
      if (isCompact()) return { top: 56, bottom: Math.max(0, h - (f ? f.y : h * 0.55)) + 8, left: 0, right: 0 };
      const control = ISLAND_PAGES.length > 1 ? 44 : 0;
      return { top: 48, bottom: 16, left: f ? f.x + f.w + control + Math.min(48, w * 0.03) : w * 0.45, right: 16 };
    };

    /** The overview and each project up close, framed for the island as it is now. */
    const surveyShots = (from: Shot) => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const pad = openMap();
      const key = `${w}x${h}:${Math.round(pad.top)},${Math.round(pad.bottom)},${Math.round(pad.left)}`;
      if (shots?.key === key) return shots;
      const compact = isCompact();
      const all = [STUDIO, ...PROJECTS.map((p) => p.at)];
      const margin = compact ? SURVEY.compactMargin : SURVEY.margin;
      const overview = fit(all, { w, h }, pad, margin, SURVEY.pitch, from.bearing, SURVEY.maxZoom);
      // Up close the project sits a little low, under its name; on a phone, a little
      // left too, so the name has the width to its right.
      const lift = compact ? SURVEY.lift / 2 : SURVEY.lift;
      const aside = compact ? w * 0.3 : pad.right;
      const close = PROJECTS.map((p): Shot => ({
        center: p.at,
        ...p.shot,
        padding: { ...pad, top: pad.top + lift, right: aside },
      }));
      return (shots = { key, overview, close });
    };

    const cut = (v: number) => (v >= 0.5 ? 1 : 0);

    /**
     * Once landed, the camera answers to the Projects page: it pulls back off Carter
     * Road over Bandra as the page rises, comes down onto a project as its card
     * lifts, and flies pin to pin between cases. With reduced motion each move is a
     * cut, at halfway. The pointer's parallax rides on top, as it always has.
     */
    const direct = (m: MapLibreMap) => {
      if (!rest) return;
      const sv = scene.survey;
      const presence = sv ? clamp(sv.presence, 0, 1) : 0;
      let cam = rest;
      let focus = 0;
      if (sv && presence > 0) {
        const set = surveyShots(rest);
        let near = set.overview;
        if (sv.from >= 0 && sv.focus > 0.0005) {
          focus = sv.focus;
          const a = set.close[sv.from];
          const close =
            sv.to >= 0 && sv.to !== sv.from
              ? flight(a, set.close[sv.to], reducedMotion ? cut(sv.t) : sv.t, Math.max(host.clientWidth, host.clientHeight))
              : a;
          near = blend(set.overview, close, reducedMotion ? cut(focus) : focus, close.center);
        }
        const k = reducedMotion ? cut(presence) : smooth(0, 1, presence);
        cam = k >= 1 ? near : blend(rest, near, k, STUDIO);
      }
      const ptr = scene.pointer;
      const shot: Shot = { ...cam, bearing: cam.bearing + ptr.x * 2.6, pitch: Math.max(0, cam.pitch - ptr.y * 2.2) };
      const key = shotKey(shot);
      if (key !== lastShot) {
        lastShot = key;
        m.jumpTo(shot);
      }

      // The red moves to the work: while a case is open, the studio and its road step back.
      const q = presence * clamp(focus, 0, 1);
      if (Math.abs(q - quiet) > 0.004 || (q === 0 && quiet !== 0)) {
        quiet = q;
        pinRef.current?.style.setProperty("--quiet", q.toFixed(3));
        for (const [id] of ROAD_LAYERS) m.setPaintProperty(id, "line-opacity", 1 - 0.75 * q);
      }
      const surveying = presence.toFixed(3);
      if (surveying !== surveyed) root.style.setProperty("--survey", (surveyed = surveying));
    };

    // The project pins belong to the Projects page, hung on the map: presses and
    // hovers go back to it.
    marksRef.current.forEach((mark, i) => {
      const disc = mark?.querySelector<HTMLElement>(`.${s.markDisc}`);
      if (!disc) return;
      const opts = { signal: life.signal };
      disc.addEventListener("click", () => scene.onMark?.("pick", i), opts);
      disc.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && scene.onMark?.("hot", i), opts);
      disc.addEventListener("pointerleave", () => scene.onMark?.("cold", i), opts);
    });

    // ------------------------------------------------------------------ one clock
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const cur = scene.pointer;
      const k = 1 - Math.exp(-dt * 2.2);
      const dx = aim.x - cur.x;
      const dy = aim.y - cur.y;
      const moved = Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4;
      if (moved) {
        cur.x += dx * k;
        cur.y += dy * k;
        root.style.setProperty("--px", cur.x.toFixed(4));
        root.style.setProperty("--py", cur.y.toFixed(4));
      }
      if (descending && map && path) fly(map, path, now, dt);
      // once landed, the camera follows the Projects page (and the mouse, if there is one)
      else if (arrived && map) direct(map);
      frameRaf = requestAnimationFrame(frame);
    };
    if (!reducedMotion) frameRaf = requestAnimationFrame(frame);

    // ------------------------------------------------------------------ arrival
    const fadeSurfIn = (instant: boolean) => {
      cancelAnimationFrame(surfRaf);
      if (!surf) return;
      if (instant) return setSurf(1);
      const from = performance.now();
      const start = surfLevel;
      const step = (now: number) => {
        const t = Math.min(1, (now - from) / 1400);
        setSurf(Math.max(start + (1 - start) * smooth(0, 1, t), 0.001));
        if (t < 1) surfRaf = requestAnimationFrame(step);
      };
      surfRaf = requestAnimationFrame(step);
    };

    const settle = (instant: boolean) => {
      if (!map) return;
      const end = finalCamera();
      const ptr = scene.pointer;
      base = { bearing: end.bearing!, pitch: end.pitch! };
      rest = { center: end.center as LngLat, zoom: end.zoom!, pitch: base.pitch, bearing: base.bearing, padding: end.padding };
      shots = null;
      lastShot = "";
      fov = fov0;
      map.setVerticalFieldOfView(fov0);
      map.jumpTo({ ...end, bearing: base.bearing + ptr.x * 2.6, pitch: base.pitch - ptr.y * 2.2 });
      hazeTo(1, 0);
      setRoad(1);
      fadeSurfIn(instant);
    };

    const arrive = (instant: boolean) => {
      if (arrived) return;
      arrived = true;
      descending = false;
      sequence.abort();
      map?.stop();
      settle(instant);
      setPhase("arrived");
      delete html.dataset.intro;
      delete root.dataset.hold;
      delete root.dataset.ring;
      root.dataset.hint = "off";
      root.style.setProperty("--p", "1");
      root.style.setProperty("--speed", "0");
      // with reduced motion the clock only starts here, for the Projects page's cuts
      if (!frameRaf) frameRaf = requestAnimationFrame(frame);
    };

    // Skip: a short cut to black, then the finished frame.
    skipRef.current = () => {
      if (arrived) return;
      setCut(true);
      window.setTimeout(() => {
        if (life.signal.aborted) return;
        arrive(true);
        root.dataset.skipped = "true";
        window.setTimeout(() => setCut(false), 60);
      }, 260);
    };

    // If the map shows up after an early skip, put it where the story ended.
    mapReady.then((m) => {
      if (m && arrived) settle(true);
    });

    // ------------------------------------------------------------------ the sequence
    const run = async () => {
      if (reducedMotion) {
        await mapReady;
        arrive(true);
        return;
      }
      await beat(T.dark);
      if (!hurried) {
        setPhase("line");
        await beat(T.line);
      }
      setPhase("line-out");
      await sleep(hurried ? T.hurried : T.lineOut);

      const m = await Promise.race([mapReady, sleep(6000).then(() => null)]);
      if (!m) {
        await sleep(600);
        arrive(false);
        return;
      }
      path = plan();
      descendAt = performance.now();
      lastInput = descendAt;
      descending = true;
      html.dataset.intro = "descend";
      setPhase("descend");
    };
    run().catch(() => {
      /* aborted by skip or unmount */
    });

    // ------------------------------------------------------------------ ambient
    let resizeTimer = 0;
    const onResize = () => {
      labelW.length = 0; // the names are set in viewport units
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (descending && map) path = plan();
        else if (arrived && map) settle(true);
      }, 160);
    };
    window.addEventListener("resize", onResize, { signal: life.signal });

    return () => {
      life.abort();
      clearTimeout(resizeTimer);
      cancelAnimationFrame(frameRaf);
      cancelAnimationFrame(surfRaf);
      cancelAnimationFrame(hazeRaf);
      delete html.dataset.intro;
      scene.glass = null;
      scene.pin = null;
      scene.marks = [];
      map?.remove();
      map = null;
    };
  }, []);

  const at = (p: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(p);

  return (
    <section
      ref={rootRef}
      className={s.hero}
      data-phase={phase}
      data-map={at("descend") ? "on" : undefined}
      data-survey={at("descend") ? "on" : undefined}
      data-arrived={at("arrived") ? "on" : undefined}
      data-cut={cut ? "on" : undefined}
      data-nomap={mapFailed ? "on" : undefined}
      aria-labelledby="hero-title"
    >
      <div className={s.stage}>
        <div className={s.map} aria-hidden="true">
          <div ref={hostRef} className={s.mapHost} />
        </div>
        <div className={s.scrim} aria-hidden="true" />
        <div className={s.veil} aria-hidden="true" />

        <div className={s.callouts} aria-hidden="true">
          {TERRITORIES.map((t, i) => (
            <div
              key={t.id}
              ref={(el) => {
                labelRefs.current[t.id] = el;
              }}
              className={s.callout}
              data-id={t.id}
              data-side={t.side}
              style={{ "--i": i } as CSSProperties}
            >
              <span className={s.calloutDot} />
              <span className={s.calloutLeader} />
              <span className={s.calloutText}>
                <span className={s.calloutName}>{t.name}</span>
                <span className={s.calloutCoord}>
                  {formatLat(t.at[1], 3)} · {formatLng(t.at[0], 3)}
                </span>
              </span>
            </div>
          ))}
          <div ref={reticleRef} className={s.reticle}>
            <span className={s.reticleFrame}>
              <span className={s.corner} data-c="tl" />
              <span className={s.corner} data-c="tr" />
              <span className={s.corner} data-c="bl" />
              <span className={s.corner} data-c="br" />
            </span>
            <span className={s.reticleText}>
              <span className={s.reticleName}>Carter Road</span>
              <span ref={reticleAltRef} className={s.reticleAlt} />
            </span>
          </div>
          <div ref={pinRef} className={s.pin}>
            <span className={s.pinPulse} />
            <span className={s.pinDot} />
            <span className={s.pinLeader} />
            <span className={s.pinText}>
              <span className={s.pinName}>Carter Road</span>
              <span className={s.pinNote}>The studio</span>
            </span>
          </div>
          {/* The work, numbered as the Projects page lists it; that page drops and lights them. */}
          {PROJECTS.map((p, i) => (
            <div
              key={p.id}
              ref={(el) => {
                marksRef.current[i] = el;
              }}
              className={s.mark}
            >
              <span className={s.markRipple} />
              <span className={s.markDot} />
              <span className={s.markLeader} />
              <span className={s.markDisc}>{i + 1}</span>
              <span className={s.markText}>
                <span className={s.markName}>{p.name}</span>
                <span className={s.markKind}>{p.kind}</span>
              </span>
            </div>
          ))}
        </div>

        <div className={s.hud} aria-hidden="true">
          <div className={s.hudTopLeft}>
            <span ref={coordRef} className={s.measure} />
            <span ref={altRef} className={s.measure} />
          </div>
          <div className={s.hudTopRight}>
            <span className={s.hudCity}>Mumbai</span>
          </div>
          <div className={s.hudBottomLeft}>
            <span className={s.scale}>
              <span ref={scaleRef} className={s.scaleBar} />
              <span ref={scaleLabelRef} className={s.measure} />
            </span>
          </div>
        </div>

        <p className={s.intro} aria-hidden="true">
          <span className={s.introWord} style={{ "--w": 0 } as CSSProperties}>
            Ordinary
          </span>{" "}
          <span className={s.introWord} style={{ "--w": 1 } as CSSProperties}>
            ends
          </span>{" "}
          <span className={`${s.introWord} ${s.introScript}`} style={{ "--w": 2 } as CSSProperties}>
            here.
          </span>
        </p>

        <p className={s.hint} aria-hidden="true">
          <span className={s.hintPress} />
          <span className={s.hintFine}>
            Hold to descend <span className={s.hintSoft}>or scroll</span>
          </span>
          <span className={s.hintTouch}>
            Hold or swipe up <span className={s.hintSoft}>to descend</span>
          </span>
        </p>

        <div ref={ringRef} className={s.ring} aria-hidden="true" />

        <div className={s.cutCurtain} aria-hidden="true" />

        <button
          type="button"
          className={s.skip}
          onClick={() => skipRef.current()}
          inert={phase === "arrived"}
        >
          Skip intro
          <span className={s.skipFill} aria-hidden="true" />
        </button>

        <p className={s.credit}>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap
          </a>
          <span aria-hidden="true"> · </span>
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
            OpenFreeMap
          </a>
          <span aria-hidden="true"> · </span>
          <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">
            Terrain: Mapzen
          </a>
        </p>
      </div>

      <SceneContext value={getScene}>
        <Island ref={islandRef} pages={ISLAND_PAGES} open={phase === "arrived"} reduced={reduced} scene={sceneRef} />
      </SceneContext>
    </section>
  );
}
