/**
 * Builds the surf field texture for Bandra's coast.
 *
 * Input:  OSM natural=coastline ways around Bandra (scripts/data/bandra-coastline.json),
 *         fetched from Overpass. Re-fetch with `node scripts/build-surf-field.mjs --fetch`.
 * Output: public/surf/bandra-surf.png  (RGB, square cells in Web Mercator)
 *           R = distance offshore, 0..WATER_RANGE metres (0 on land)
 *           G = swell exposure 0..1 (how open the water is to the Arabian Sea swell)
 *           B = distance inland, 0..LAND_RANGE metres (0 in water)
 *         components/hero/surf-field.json (bounds + encoding, read by the WebGL layer)
 *
 * Coastline data © OpenStreetMap contributors, ODbL.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(root, "scripts/data/bandra-coastline.json");
const PNG_OUT = join(root, "public/surf/bandra-surf.png");
const META_OUT = join(root, "components/hero/surf-field.json");

// Juhu Tara Rd (north) down to the Mahim causeway (south); Uarashi Reef included.
const BOUNDS = { west: 72.786, east: 72.852, south: 19.022, north: 19.102 };
const CELL_M = 6; // metres per texel
const WATER_RANGE = 600;
const LAND_RANGE = 60;
const SEA_SEED = { lon: 72.792, lat: 19.05 }; // open Arabian Sea

if (process.argv.includes("--fetch")) {
  const query =
    '[out:json][timeout:60];(way["natural"="coastline"](19.000,72.770,19.105,72.870););out geom;';
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": "CarterLabs-surf-field/1.0", Accept: "*/*" },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const text = await res.text();
  JSON.parse(text);
  mkdirSync(dirname(DATA), { recursive: true });
  writeFileSync(DATA, text);
  console.log("fetched coastline →", DATA);
}

// ---------------------------------------------------------------- projection
const mercX = (lon) => (lon + 180) / 360;
const mercY = (lat) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
const midLat = (BOUNDS.south + BOUNDS.north) / 2;
const metresPerMerc = 40075016.686 * Math.cos((midLat * Math.PI) / 180);
const cell = CELL_M / metresPerMerc; // cell size in mercator units

const mx0 = mercX(BOUNDS.west);
const my0 = mercY(BOUNDS.north);
const W = Math.ceil((mercX(BOUNDS.east) - mx0) / cell);
const H = Math.ceil((mercY(BOUNDS.south) - my0) / cell);
const toGrid = (lon, lat) => [(mercX(lon) - mx0) / cell, (mercY(lat) - my0) / cell];
const N = W * H;
console.log(`grid ${W}×${H} @ ${CELL_M} m`);

// ---------------------------------------------------------------- rasterise coast
const WALL = 1, WATER = 2, LAND = 3;
const kind = new Uint8Array(N);

function mark(x, y) {
  if (x >= 0 && y >= 0 && x < W && y < H) kind[y * W + x] = WALL;
}
// Supercover traversal (Amanatides & Woo) so a 4-connected fill cannot leak diagonally.
function traverse(x0, y0, x1, y1) {
  let x = Math.floor(x0), y = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  const dx = x1 - x0, dy = y1 - y0;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tmx = dx !== 0 ? (sx > 0 ? x + 1 - x0 : x0 - x) * tdx : Infinity;
  let tmy = dy !== 0 ? (sy > 0 ? y + 1 - y0 : y0 - y) * tdy : Infinity;
  mark(x, y);
  let guard = 0;
  while ((x !== ex || y !== ey) && guard++ < 1e6) {
    if (tmx < tmy) { tmx += tdx; x += sx; } else { tmy += tdy; y += sy; }
    mark(x, y);
  }
}

const osm = JSON.parse(readFileSync(DATA, "utf8"));
for (const way of osm.elements) {
  const pts = way.geometry.map((p) => toGrid(p.lon, p.lat));
  for (let i = 1; i < pts.length; i++) traverse(...pts[i - 1], ...pts[i]);
}

// ---------------------------------------------------------------- flood fill the sea
{
  const [sx, sy] = toGrid(SEA_SEED.lon, SEA_SEED.lat).map(Math.floor);
  const stack = new Int32Array(N);
  let top = 0;
  stack[top++] = sy * W + sx;
  kind[sy * W + sx] = WATER;
  while (top) {
    const i = stack[--top];
    const x = i % W, y = (i / W) | 0;
    const push = (j) => { if (kind[j] === 0) { kind[j] = WATER; stack[top++] = j; } };
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (y > 0) push(i - W);
    if (y < H - 1) push(i + W);
  }
  for (let i = 0; i < N; i++) if (kind[i] === 0) kind[i] = LAND;
}

// ---------------------------------------------------------------- distance transforms
// Felzenszwalb & Huttenlocher exact squared EDT.
function edt(isSource) {
  const INF = 1e20;
  const f = new Float64Array(N);
  for (let i = 0; i < N; i++) f[i] = isSource(i) ? 0 : INF;
  const n = Math.max(W, H);
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n);
  const pass = (len, get, set) => {
    for (let q = 0; q < len; q++) g[q] = get(q);
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      do {
        const p = v[k];
        s = (g[q] + q * q - (g[p] + p * p)) / (2 * q - 2 * p);
      } while (s <= z[k] && --k >= 0);
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      d[q] = (q - p) * (q - p) + g[p];
    }
    for (let q = 0; q < len; q++) set(q, d[q]);
  };
  for (let x = 0; x < W; x++) pass(H, (q) => f[q * W + x], (q, val) => (f[q * W + x] = val));
  for (let y = 0; y < H; y++) pass(W, (q) => f[y * W + q], (q, val) => (f[y * W + q] = val));
  for (let i = 0; i < N; i++) f[i] = Math.sqrt(f[i]) * CELL_M;
  return f;
}
const waterDist = edt((i) => kind[i] !== WATER);
const landDist = edt((i) => kind[i] !== LAND);

// ---------------------------------------------------------------- swell exposure
// March rays back toward where the monsoon swell comes from (W–SW). Water that can
// "see" the open sea gets surf; the Mahim creek and the lee of the reef stay calm.
const DIRS = [
  { deg: 180, w: 0.28 }, // from W   (grid angle, x east / y south)
  { deg: 157.5, w: 0.3 }, // from WSW
  { deg: 135, w: 0.22 }, // from SW
  { deg: 202.5, w: 0.2 }, // from WNW
];
const S = 4; // compute at quarter resolution, it is smooth anyway
const w4 = Math.ceil(W / S), h4 = Math.ceil(H / S);
let expo = new Float32Array(w4 * h4);
const RAY_M = 2600;
for (let y = 0; y < h4; y++) {
  for (let x = 0; x < w4; x++) {
    const cx = Math.min(W - 1, x * S + (S >> 1)), cy = Math.min(H - 1, y * S + (S >> 1));
    if (kind[cy * W + cx] !== WATER) { expo[y * w4 + x] = 0; continue; }
    let e = 0;
    for (const { deg, w } of DIRS) {
      const a = (deg * Math.PI) / 180;
      const ux = Math.cos(a), uy = Math.sin(a);
      let open = 1;
      for (let t = 2; t * CELL_M < RAY_M; t += 1.5) {
        const px = Math.round(cx + ux * t), py = Math.round(cy + uy * t);
        if (px < 0 || py < 0 || px >= W || py >= H) break;
        const k = kind[py * W + px];
        if (k === LAND || k === WALL) {
          // partial shelter from far-away land, full shelter from close land
          open = Math.min(1, (t * CELL_M) / RAY_M) ** 2 * 0.35;
          break;
        }
      }
      e += w * open;
    }
    expo[y * w4 + x] = e;
  }
}
// soften: separable box blur, three passes ≈ gaussian
for (let pass = 0; pass < 3; pass++) {
  const r = 3;
  const tmp = new Float32Array(w4 * h4);
  for (let y = 0; y < h4; y++)
    for (let x = 0; x < w4; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w4) { s += expo[y * w4 + xx]; c++; } }
      tmp[y * w4 + x] = s / c;
    }
  const out = new Float32Array(w4 * h4);
  for (let y = 0; y < h4; y++)
    for (let x = 0; x < w4; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h4) { s += tmp[yy * w4 + x]; c++; } }
      out[y * w4 + x] = s / c;
    }
  expo = out;
}
const sampleExpo = (x, y) => {
  const fx = Math.min(w4 - 1.001, Math.max(0, x / S - 0.5)), fy = Math.min(h4 - 1.001, Math.max(0, y / S - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const a = expo[y0 * w4 + x0], b = expo[y0 * w4 + x0 + 1], c = expo[(y0 + 1) * w4 + x0], d = expo[(y0 + 1) * w4 + x0 + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
};

// ---------------------------------------------------------------- encode PNG
const raw = Buffer.alloc((W * 3 + 1) * H);
const rows = [];
for (let y = 0; y < H; y++) {
  const row = Buffer.alloc(W * 3);
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    row[x * 3] = Math.round(Math.min(1, waterDist[i] / WATER_RANGE) * 255);
    row[x * 3 + 1] = Math.round(Math.min(1, Math.max(0, sampleExpo(x, y))) * 255);
    row[x * 3 + 2] = Math.round(Math.min(1, landDist[i] / LAND_RANGE) * 255);
  }
  rows.push(row);
}
for (let y = 0; y < H; y++) {
  const o = y * (W * 3 + 1);
  raw[o] = 2; // filter: Up
  const cur = rows[y], prev = rows[y - 1];
  for (let k = 0; k < W * 3; k++) raw[o + 1 + k] = (cur[k] - (prev ? prev[k] : 0)) & 255;
}
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
mkdirSync(dirname(PNG_OUT), { recursive: true });
writeFileSync(PNG_OUT, png);

const meta = {
  bounds: BOUNDS,
  mercator: { x0: mx0, y0: my0, x1: mx0 + W * cell, y1: my0 + H * cell },
  size: [W, H],
  cellMetres: CELL_M,
  waterRange: WATER_RANGE,
  landRange: LAND_RANGE,
  metresPerMercator: metresPerMerc,
};
writeFileSync(META_OUT, JSON.stringify(meta, null, 2) + "\n");
const waterCells = kind.reduce((a, k) => a + (k === WATER ? 1 : 0), 0);
console.log(`water ${((waterCells / N) * 100).toFixed(1)}% · png ${(png.length / 1024).toFixed(0)} KB → ${PNG_OUT}`);
