import type { Feature, FeatureCollection, LineString } from "geojson";

export type LngLat = [lng: number, lat: number];

export type Territory = {
  id: string;
  name: string;
  at: LngLat;
  /** which side of the marker the callout reads from */
  side: "left" | "right";
};

/** The five districts called out over the city view. Bandra is the one we keep. */
export const TERRITORIES: Territory[] = [
  { id: "borivali", name: "Borivali", at: [72.8567, 19.2307], side: "left" },
  { id: "thane", name: "Thane", at: [72.9781, 19.2183], side: "right" },
  { id: "andheri", name: "Andheri", at: [72.8697, 19.1136], side: "right" },
  { id: "bandra", name: "Bandra", at: [72.8318, 19.0596], side: "left" },
  { id: "fort", name: "Fort", at: [72.8347, 18.9322], side: "left" },
];

/** On the Carter Road promenade (OSM way 46418220), just inland of the coastline. */
export const STUDIO: LngLat = [72.8229, 19.0664];

/**
 * Carter Road, south to north: the centreline between its two carriageways
 * (scripts/data/carter-road.json, OSM ways 22860733 → 1148389835 and
 * 781757629 → 1148387713), resampled by length and smoothed once. About 1.17 km.
 */
export const CARTER_ROAD: LngLat[] = [
  [72.8225197, 19.0605577], [72.8223556, 19.0606844], [72.8222135, 19.0609101], [72.8221463, 19.0611708],
  [72.8221616, 19.0614377], [72.8222195, 19.0617026], [72.8222844, 19.0619667], [72.8223493, 19.0622308],
  [72.8224142, 19.0624948], [72.8224791, 19.0627589], [72.8225429, 19.0630232], [72.8226043, 19.063288],
  [72.8226763, 19.0635501], [72.8227793, 19.0638024], [72.8228995, 19.0640484], [72.8230141, 19.0642962],
  [72.823099, 19.0645544], [72.8231584, 19.0648193], [72.823203, 19.0650867], [72.8232138, 19.0653569],
  [72.8231961, 19.0656271], [72.823144, 19.065893], [72.8230755, 19.0661561], [72.8229982, 19.0664171],
  [72.8229188, 19.0666777], [72.8228394, 19.0669382], [72.8227601, 19.0671987], [72.8226811, 19.0674593],
  [72.8226132, 19.0677223], [72.8226112, 19.0679896], [72.822671, 19.0682529], [72.8227628, 19.0685093],
  [72.822861, 19.068764], [72.8229436, 19.0690229], [72.8229669, 19.0692892], [72.8229136, 19.0695523],
  [72.8228126, 19.0698052], [72.8226885, 19.0700494], [72.8225578, 19.0702906], [72.8224263, 19.0705316],
  [72.8223934, 19.0705918],
];

/** Web Mercator, 0..1 across the world (y grows southward), as MapLibre measures it. */
export function mercator([lng, lat]: LngLat) {
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: (lng + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}

/** The inverse of `mercator`. */
export function unmercator(x: number, y: number): LngLat {
  return [x * 360 - 180, (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90];
}

/** Great-circle distance, in kilometres. */
export function distanceKm([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * A rectangle on the ground centred on `at`: `w` metres east to west, `d` north to
 * south, turned `turn` degrees clockwise. Closed, counter-clockwise.
 */
export function footprint([lng, lat]: LngLat, w: number, d: number, turn = 0): LngLat[] {
  const perDeg = 111320; // metres in a degree of latitude
  const k = Math.cos((lat * Math.PI) / 180);
  const r = (turn * Math.PI) / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([x, y]): LngLat => {
    const east = (x * w) / 2;
    const north = (y * d) / 2;
    return [
      lng + (east * Math.cos(r) + north * Math.sin(r)) / (perDeg * k),
      lat + (north * Math.cos(r) - east * Math.sin(r)) / perDeg,
    ];
  });
}

/** How far along a line (0..1 of its length) the vertex nearest to `at` sits. */
function along(line: LngLat[], at: LngLat) {
  const k = Math.cos((at[1] * Math.PI) / 180);
  let total = 0;
  let best = { d: Infinity, at: 0 };
  line.forEach((p, i) => {
    if (i > 0) total += Math.hypot((p[0] - line[i - 1][0]) * k, p[1] - line[i - 1][1]);
    const d = Math.hypot((p[0] - at[0]) * k, p[1] - at[1]);
    if (d < best.d) best = { d, at: total };
  });
  return best.at / total;
}

/** Where the studio sits along Carter Road; the road lights outward from here. */
export const STUDIO_ALONG = along(CARTER_ROAD, STUDIO);

/** Greater Mumbai plus Thane, the frame for the opening survey. */
export const CITY_BOUNDS: [LngLat, LngLat] = [
  [72.79, 18.9],
  [73.0, 19.275],
];

export const formatLat = (lat: number, digits = 4) =>
  `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? "N" : "S"}`;
export const formatLng = (lng: number, digits = 4) =>
  `${Math.abs(lng).toFixed(digits)}° ${lng >= 0 ? "E" : "W"}`;

/** A faint survey grid, every 0.05°, over the metropolitan region. */
export function graticule(): FeatureCollection<LineString> {
  const features: FeatureCollection<LineString>["features"] = [];
  const [w, e, s, n] = [72.6, 73.25, 18.75, 19.45];
  const step = 0.05;
  for (let lng = w; lng <= e + 1e-9; lng += step) {
    features.push({
      type: "Feature",
      properties: { major: Math.round(lng * 100) % 10 === 0 },
      geometry: { type: "LineString", coordinates: [[lng, s], [lng, n]] },
    });
  }
  for (let lat = s; lat <= n + 1e-9; lat += step) {
    features.push({
      type: "Feature",
      properties: { major: Math.round(lat * 100) % 10 === 0 },
      geometry: { type: "LineString", coordinates: [[w, lat], [e, lat]] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function carterRoad(): Feature<LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: CARTER_ROAD } };
}

/** Approximate camera altitude above the map centre, in metres. */
export function cameraAltitude(zoom: number, lat: number, pitchDeg: number, viewportHeight: number) {
  const metresPerPixel = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  const fov = 36.8699 * (Math.PI / 180);
  const distancePx = viewportHeight / 2 / Math.tan(fov / 2);
  return distancePx * metresPerPixel * Math.cos((pitchDeg * Math.PI) / 180);
}
