import { mercator, unmercator, type LngLat } from "../hero/geo";

/**
 * Camera shots for the Projects page, and the ways between them. Every move is a
 * pure function of a progress value, so the stack, a swipe or a spring can scrub
 * it, hold it or take it back.
 */

export type Padding = { top: number; bottom: number; left: number; right: number };
export type Shot = { center: LngLat; zoom: number; pitch: number; bearing: number; padding: Padding };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** the short way round */
const turn = (a: number, b: number, t: number) => a + ((((b - a + 540) % 360) + 360) % 360 - 180) * t;
const pad = (a: Padding, b: Padding, t: number): Padding => ({
  top: lerp(a.top, b.top, t),
  bottom: lerp(a.bottom, b.bottom, t),
  left: lerp(a.left, b.left, t),
  right: lerp(a.right, b.right, t),
});

/**
 * Between two shots, zooming about a pivot: the pivot's offset from the centre, in
 * screen pixels, runs straight from one shot to the other, so what the camera is
 * heading for comes toward you rather than sliding past. Exactly `a` at 0, `b` at 1.
 */
export function blend(a: Shot, b: Shot, t: number, pivot: LngLat): Shot {
  const P = mercator(pivot);
  const A = mercator(a.center);
  const B = mercator(b.center);
  const sa = 2 ** a.zoom;
  const sb = 2 ** b.zoom;
  const zoom = lerp(a.zoom, b.zoom, t);
  const s = 2 ** zoom;
  const dx = lerp((P.x - A.x) * sa, (P.x - B.x) * sb, t);
  const dy = lerp((P.y - A.y) * sa, (P.y - B.y) * sb, t);
  return {
    center: unmercator(P.x - dx / s, P.y - dy / s),
    zoom,
    pitch: lerp(a.pitch, b.pitch, t),
    bearing: turn(a.bearing, b.bearing, t),
    padding: pad(a.padding, b.padding, t),
  };
}

/**
 * From one shot to another the way a camera flies it (van Wijk and Nuij, as in
 * MapLibre's flyTo): it rises while it crosses and comes down onto the far end.
 * `span` is the larger side of the view, in px.
 */
export function flight(a: Shot, b: Shot, t: number, span: number): Shot {
  const k = Math.min(1, Math.max(0, t));
  const rho = 1.42;
  const rho2 = rho * rho;
  const A = mercator(a.center);
  const B = mercator(b.center);
  const u1 = Math.hypot(B.x - A.x, B.y - A.y) * 512 * 2 ** a.zoom;
  const w0 = span;
  const w1 = span / 2 ** (b.zoom - a.zoom);

  const r = (i: 0 | 1) => {
    const q = (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) / (2 * (i ? w1 : w0) * rho2 * u1);
    return Math.log(Math.sqrt(q * q + 1) - q);
  };
  const r0 = u1 > 1e-6 ? r(0) : 0;
  let S = u1 > 1e-6 ? (r(1) - r0) / rho : NaN;
  // how wide the view is, relative to the start, and how far across it has come, s along the path
  let width = (s: number) => Math.cosh(r0) / Math.cosh(r0 + rho * s);
  let along = (s: number) => (w0 * ((Math.cosh(r0) * Math.tanh(r0 + rho * s) - Math.sinh(r0)) / rho2)) / u1;
  if (!Number.isFinite(S)) {
    // the same place: only the zoom changes
    const dir = w1 < w0 ? -1 : 1;
    S = Math.abs(Math.log(w1 / w0)) / rho;
    along = () => 0;
    width = (s: number) => Math.exp(dir * rho * s);
  }
  const s = k * S;
  const u = S > 1e-9 && u1 > 1e-6 ? along(s) : k;
  return {
    center: unmercator(lerp(A.x, B.x, u), lerp(A.y, B.y, u)),
    zoom: S > 1e-9 ? a.zoom + Math.log2(1 / width(s)) : lerp(a.zoom, b.zoom, k),
    pitch: lerp(a.pitch, b.pitch, k),
    bearing: turn(a.bearing, b.bearing, k),
    padding: pad(a.padding, b.padding, k),
  };
}

/**
 * The shot that frames `points` in the open part of the view (the viewport less
 * `padding`), with `margin` kept clear around them, seen at `pitch` and `bearing`.
 * Tilted, the ground foreshortens toward the horizon and swells toward the viewer,
 * so the fit leaves a little room for the near side.
 */
export function fit(
  points: LngLat[],
  view: { w: number; h: number },
  padding: Padding,
  margin: Padding,
  pitch: number,
  bearing: number,
  maxZoom = 16,
): Shot {
  // on screen, the world turns by −bearing
  const th = (-bearing * Math.PI) / 180;
  const c = Math.cos(th);
  const sn = Math.sin(th);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    const m = mercator(p);
    const x = m.x * c - m.y * sn;
    const y = m.x * sn + m.y * c;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const tilt = Math.cos((pitch * Math.PI) / 180);
  const availW = Math.max(40, view.w - padding.left - padding.right - margin.left - margin.right);
  const availH = Math.max(40, view.h - padding.top - padding.bottom - margin.top - margin.bottom);
  const scale = Math.min(availW / Math.max(x1 - x0, 1e-9), availH / Math.max((y1 - y0) * tilt, 1e-9)) * 0.88;
  const zoom = Math.min(maxZoom, Math.log2(scale / 512));
  const s = 512 * 2 ** zoom;
  // the box's centre, moved for any imbalance in the margin, turned back into the world
  const mx = (x0 + x1) / 2 + (margin.right - margin.left) / 2 / s;
  const my = (y0 + y1) / 2 + (margin.bottom - margin.top) / 2 / (s * tilt);
  return {
    center: unmercator(mx * c + my * sn, -mx * sn + my * c),
    zoom,
    pitch,
    bearing,
    padding,
  };
}

/** A compact fingerprint of a shot, to skip redrawing a camera that has not moved. */
export const shotKey = (s: Shot) =>
  `${s.center[0].toFixed(6)},${s.center[1].toFixed(6)},${s.zoom.toFixed(4)},${s.pitch.toFixed(3)},${s.bearing.toFixed(3)},` +
  `${s.padding.top.toFixed(1)},${s.padding.bottom.toFixed(1)},${s.padding.left.toFixed(1)},${s.padding.right.toFixed(1)}`;
