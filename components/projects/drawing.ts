import type { Project } from "./work";

/**
 * A project's landmark drawn the way a survey sheet would draw it: the same box the
 * map raises on its pin (work.ts `site`), in bone hairlines over a north-up ground
 * grid, projected orthographically from one camera. Until the owner's photographs
 * arrive, three of these stand in for them in the case study's gallery (Gallery.tsx):
 * the site as the map's camera frames it, the plan from overhead, and the elevation
 * from the side. They are drawn from nothing but the site's own dimensions, so they
 * carry no figures.
 */

export type View = { name: string; pitch: number; bearing: number };

/** The three sheets: from the camera that lands on the project, from above, and level with it. */
export const views = (p: Project): View[] => [
  { name: "Site", pitch: p.shot.pitch, bearing: p.shot.bearing },
  { name: "Plan", pitch: 0, bearing: 0 },
  { name: "Elevation", pitch: 90, bearing: p.shot.bearing },
];

export type Sheet = {
  /** the ground grid, or on an elevation the ground line */
  grid: string;
  /** the edges the box hides from this camera, drawn dashed */
  hidden: string;
  faces: { d: string; tone: "top" | "lit" | "shade" }[];
  /** the outline of every face the camera sees */
  edges: string;
  /** the pin's coordinate, on the ground at the site's centre */
  dot: { x: number; y: number };
  /** the grid's pitch on screen, so the fade can lie on the ground with it */
  flat: number;
};

/** The sheet's viewBox, 4:3 like the frame it fills. */
export const SHEET = { w: 400, h: 300 };

/** The box takes up at most this much of the sheet, so it sits on the ground rather than filling the frame. */
const FILL = { w: 0.6, h: 0.56 };
/** Grid steps a surveyor would choose (metres), the first that leaves this many px between lines. */
const STEPS = [5, 10, 20, 25, 50, 100, 200];
const MIN_GAP = 26;

const n1 = (v: number) => (Math.abs(v) < 0.05 ? "0" : v.toFixed(1));
const path = (pts: (readonly [number, number])[], close = true) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${n1(x)} ${n1(y)}`).join("") + (close ? "Z" : "");

export function drawSite(site: Project["site"], view: View): Sheet {
  const rad = Math.PI / 180;
  const cb = Math.cos(view.bearing * rad);
  const sb = Math.sin(view.bearing * rad);
  const cp = Math.cos(view.pitch * rad);
  const sp = Math.sin(view.pitch * rad);
  const plan = view.pitch < 0.5;
  const level = view.pitch > 89.5;

  // metres east, north and up, to the sheet's axes before scaling (y grows downward)
  const raw = (x: number, y: number, z: number) => [x * cb - y * sb, -((x * sb + y * cb) * cp + z * sp)] as const;

  // the footprint, counter-clockwise, turned `turn` degrees clockwise (as hero/geo's footprint)
  const t = (site.turn ?? 0) * rad;
  const foot = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => {
    const e = (i * site.w) / 2;
    const n = (j * site.d) / 2;
    return [e * Math.cos(t) + n * Math.sin(t), n * Math.cos(t) - e * Math.sin(t)] as const;
  });

  // fit the box to the sheet
  const box = foot.flatMap(([x, y]) => [raw(x, y, 0), raw(x, y, site.h)]);
  const xs = box.map((p) => p[0]);
  const ys = box.map((p) => p[1]);
  const bw = Math.max(1, Math.max(...xs) - Math.min(...xs));
  const bh = Math.max(1, Math.max(...ys) - Math.min(...ys));
  const k = Math.min((SHEET.w * FILL.w) / bw, (SHEET.h * FILL.h) / bh);
  const ox = SHEET.w / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k;
  const oy = SHEET.h / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k + (level ? 14 : 4);
  const at = (x: number, y: number, z: number) => {
    const [u, v] = raw(x, y, z);
    return [ox + u * k, oy + v * k] as const;
  };

  // the ground grid, north-up, wide enough to run off every edge of the sheet
  let grid: string;
  if (level) {
    const g = at(0, 0, 0)[1];
    grid = `M0 ${n1(g)}H${SHEET.w}`;
  } else {
    const step = STEPS.find((m) => m * k >= MIN_GAP) ?? STEPS[STEPS.length - 1];
    const reach = Math.hypot(SHEET.w, SHEET.h) / (k * Math.max(cp, 0.3));
    const K = Math.min(40, Math.ceil(reach / step));
    const E = K * step;
    const lines: string[] = [];
    for (let i = -K; i <= K; i++) {
      lines.push(path([at(i * step, -E, 0), at(i * step, E, 0)], false));
      lines.push(path([at(-E, i * step, 0), at(E, i * step, 0)], false));
    }
    grid = lines.join("");
  }

  // the camera looks along its bearing, so a wall faces it when its normal points back the other way
  const up = [sb, cb];
  const right = [cb, -sb];
  const top = foot.map(([x, y]) => at(x, y, site.h));
  const base = foot.map(([x, y]) => at(x, y, 0));
  const faces: Sheet["faces"] = [];
  if (!plan) {
    foot.forEach(([ax, ay], i) => {
      const [bx, by] = foot[(i + 1) % 4];
      const nx = by - ay;
      const ny = -(bx - ax);
      if (nx * up[0] + ny * up[1] >= -1e-6) return;
      const tone = nx * right[0] + ny * right[1] < 0 ? "lit" : "shade";
      faces.push({ d: path([base[i], base[(i + 1) % 4], top[(i + 1) % 4], top[i]]), tone });
    });
  }
  if (!level) faces.push({ d: path(top), tone: "top" });

  // every edge, dashed under the faces: the drafted look, and the walls it can't see
  const hidden =
    plan || level
      ? ""
      : [path(base), path(top), ...base.map((b, i) => path([b, top[i]], false))].join("");

  return {
    grid,
    hidden,
    faces,
    edges: faces.map((f) => f.d).join(""),
    dot: { x: at(0, 0, 0)[0], y: at(0, 0, 0)[1] },
    flat: level ? 0 : cp,
  };
}
