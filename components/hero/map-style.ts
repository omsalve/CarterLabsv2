import type { StyleSpecification, ExpressionSpecification } from "maplibre-gl";
import { graticule, carterRoad, STUDIO_ALONG } from "./geo";

/**
 * A night-survey rendering of OpenStreetMap: near-black ground, arterial roads as
 * dim blood-red veins, relief from real elevation (hillshade + contours), a faint
 * survey grid. Nothing in here is decoration without a source in the data.
 */

export const OSM_TILES = "https://tiles.openfreemap.org/planet";
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const TERRARIUM = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";

const C = {
  ground: "#0d0a0a",
  groundLift: "#110d0d",
  water: "#030304",
  coast: "rgba(236, 228, 220, 0.16)",
  coastGlow: "rgba(150, 18, 26, 0.22)",
  vein: "#6e0e14",
  veinHot: "#8f141b",
  road: "#2a2221",
  roadMinor: "#1b1615",
  rail: "rgba(236, 228, 220, 0.11)",
  building: "#1c1616",
  label: "#756a64",
  labelDim: "#504744",
};

const z = (stops: [number, number | string][]): ExpressionSpecification =>
  ["interpolate", ["exponential", 1.5], ["zoom"], ...stops.flat()] as ExpressionSpecification;

const ramp = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Carter Road in Lit Blood; the head of the line runs hot while it is still drawing. */
const ROAD_RED = [196, 32, 42];
const ROAD_HOT = [255, 178, 164];

/** The layers that carry Carter Road, with the share of the road's light each one gets. */
export const ROAD_LAYERS: [id: string, alpha: number][] = [
  ["carter-glow", 0.8],
  ["carter", 1],
];

/**
 * Carter Road's colour along its length. `reveal` 0..1 lights it outward from the
 * studio toward both ends; the last fifth at either end always dissolves into the
 * street, so the road never stops on a hard edge.
 */
export function roadGradient(reveal: number, alpha = 1): ExpressionSpecification {
  const r = Math.min(1, Math.max(0, reveal));
  const from = STUDIO_ALONG * (1 - r);
  const to = STUDIO_ALONG + (1 - STUDIO_ALONG) * r;
  const soft = 0.045;
  const heat = 1 - ramp(0.78, 1, r);
  const stops: (number | string)[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const ends = ramp(0, 0.22, t) * ramp(1, 0.78, t);
    const lit = ramp(from - soft, from, t) * ramp(to + soft, to, t) * Math.min(1, r * 10);
    const head = heat * Math.min(1, Math.exp(-(((t - from) / 0.035) ** 2)) + Math.exp(-(((t - to) / 0.035) ** 2)));
    const rgb = ROAD_RED.map((c, j) => Math.round(c + (ROAD_HOT[j] - c) * head * 0.85));
    stops.push(t, `rgba(${rgb.join(",")},${(ends * lit * alpha).toFixed(3)})`);
  }
  return ["interpolate", ["linear"], ["line-progress"], ...stops] as ExpressionSpecification;
}

export function buildStyle(demTiles: string, contourTiles: string | null): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      osm: { type: "vector", url: OSM_TILES },
      dem: {
        type: "raster-dem",
        tiles: [demTiles],
        tileSize: 256,
        maxzoom: 12,
        encoding: "terrarium",
      },
      ...(contourTiles
        ? { contours: { type: "vector" as const, tiles: [contourTiles], maxzoom: 15 } }
        : {}),
      grid: { type: "geojson", data: graticule() },
      carter: { type: "geojson", data: carterRoad(), lineMetrics: true },
    },
    sky: {
      "sky-color": "#000000",
      "horizon-color": "#0b0606",
      "fog-color": "#050404",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.9,
      "fog-ground-blend": 0.4,
      "atmosphere-blend": 0,
    },
    light: { anchor: "viewport", color: "#ffd9d4", intensity: 0.22, position: [1.3, 250, 35] },
    layers: [
      { id: "ground", type: "background", paint: { "background-color": C.ground } },
      {
        id: "wild",
        type: "fill",
        source: "osm",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "grass", "wetland"]]],
        paint: { "fill-color": C.groundLift, "fill-antialias": false },
      },
      {
        id: "relief",
        type: "hillshade",
        source: "dem",
        paint: {
          "hillshade-exaggeration": 0.55,
          "hillshade-shadow-color": "#000000",
          "hillshade-highlight-color": "#3b2322",
          "hillshade-accent-color": "#150808",
          "hillshade-illumination-direction": 300,
        },
      },
      {
        id: "airfield",
        type: "fill",
        source: "osm",
        "source-layer": "aeroway",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#0f0c0c" },
      },
      {
        id: "water",
        type: "fill",
        source: "osm",
        "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "fill-color": C.water },
      },
      {
        id: "coast-glow",
        type: "line",
        source: "osm",
        "source-layer": "water",
        filter: ["==", ["get", "class"], "ocean"],
        paint: {
          "line-color": C.coastGlow,
          "line-width": z([[9, 3], [13, 7], [16, 14]]),
          "line-blur": z([[9, 3], [13, 7], [16, 14]]),
        },
      },
      {
        id: "coast",
        type: "line",
        source: "osm",
        "source-layer": "water",
        paint: {
          "line-color": C.coast,
          "line-width": z([[9, 0.5], [14, 0.9], [17, 1.4]]),
          "line-opacity": ["case", ["==", ["get", "class"], "ocean"], 1, 0.55],
        },
      },
      {
        id: "grid",
        type: "line",
        source: "grid",
        paint: {
          "line-color": "#ece4dc",
          "line-width": ["case", ["get", "major"], 0.7, 0.45],
          "line-opacity": [
            "interpolate", ["linear"], ["zoom"],
            9, ["case", ["get", "major"], 0.075, 0.04],
            12.5, ["case", ["get", "major"], 0.05, 0.02],
            13.5, 0,
          ],
        },
      },
      ...(contourTiles
        ? ([
            {
              id: "contours",
              type: "line",
              source: "contours",
              "source-layer": "contours",
              // SRTM is a surface model, so the flat city reads as noise below ~25 m.
              filter: [">=", ["get", "ele"], 30],
              paint: {
                "line-color": ["case", [">", ["get", "level"], 0], "#9c1a22", "#6a1016"],
                "line-width": ["case", [">", ["get", "level"], 0], 0.85, 0.5],
                "line-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.55, 13, 0.4, 16, 0.3],
              },
            },
          ] as StyleSpecification["layers"])
        : []),
      {
        id: "runways",
        type: "line",
        source: "osm",
        "source-layer": "aeroway",
        filter: ["==", ["get", "class"], "runway"],
        paint: { "line-color": "#2a2322", "line-width": z([[10, 0.8], [14, 6], [16, 22]]) },
      },
      {
        id: "roads-minor",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 12.5,
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "tertiary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.roadMinor,
          "line-width": z([[12.5, 0.3], [15, 1.4], [17, 4]]),
        },
      },
      {
        id: "roads",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["primary", "secondary"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.road,
          "line-width": z([[9, 0.35], [12, 0.8], [15, 2.4], [17, 6]]),
        },
      },
      {
        id: "rail",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: {
          "line-color": C.rail,
          "line-width": z([[9, 0.5], [14, 1.1]]),
          "line-dasharray": [3, 2],
        },
      },
      {
        id: "veins-glow",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        maxzoom: 13.5,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": C.veinHot,
          "line-width": z([[9, 4], [13, 9]]),
          "line-blur": z([[9, 4], [13, 9]]),
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 0, 12, 0.07],
        },
      },
      {
        id: "veins",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          // at city scale the veins sit back so the callouts lead
          "line-color": ["interpolate", ["linear"], ["zoom"], 9, "#3e070b", 11.5, "#560a0f", 12.5, C.vein],
          "line-width": z([[9, 0.5], [12, 1.1], [15, 3.4], [17, 8]]),
        },
      },
      // Carter Road, lit as the camera comes down onto it (see Hero). Starts dark.
      {
        id: "carter-glow",
        type: "line",
        source: "carter",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-gradient": roadGradient(0),
          "line-width": z([[10, 8], [13, 16], [15, 30], [17, 54]]),
          "line-blur": z([[10, 6], [13, 12], [15, 22], [17, 40]]),
        },
      },
      {
        id: "carter",
        type: "line",
        source: "carter",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-gradient": roadGradient(0),
          "line-width": z([[10, 1.6], [13, 2.6], [15, 4.2], [17, 8]]),
          "line-blur": 0.6,
        },
      },
      {
        id: "buildings",
        type: "fill-extrusion",
        source: "osm",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": C.building,
          "fill-extrusion-height": [
            "interpolate", ["linear"], ["zoom"],
            13.4, 0,
            14.6, ["coalesce", ["get", "render_height"], 6],
          ],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 13.8, 0.92],
          "fill-extrusion-vertical-gradient": true,
        },
      },
      {
        id: "sea-name",
        type: "symbol",
        source: "osm",
        "source-layer": "water_name",
        maxzoom: 12,
        filter: ["in", ["get", "class"], ["literal", ["ocean", "sea"]]],
        layout: {
          "text-field": ["upcase", ["coalesce", ["get", "name:en"], ["get", "name"], ""]],
          "text-font": ["Noto Sans Italic"],
          "text-size": 11,
          "text-letter-spacing": 0.6,
          "text-max-width": 30,
        },
        paint: { "text-color": C.labelDim },
      },
      {
        id: "street-names",
        type: "symbol",
        source: "osm",
        "source-layer": "transportation_name",
        minzoom: 14.2,
        // Carter Road is named by the studio pin, and its halo would cut the lit road
        filter: [
          "all",
          ["in", ["get", "class"], ["literal", ["primary", "secondary", "trunk"]]],
          ["==", ["index-of", "Carter", ["coalesce", ["get", "name:en"], ["get", "name"], ""]], -1],
        ],
        layout: {
          "symbol-placement": "line",
          "text-field": ["upcase", ["coalesce", ["get", "name:en"], ["get", "name"], ""]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 9,
          "text-letter-spacing": 0.22,
          "text-pitch-alignment": "viewport",
          "symbol-spacing": 420,
        },
        paint: {
          "text-color": C.label,
          "text-halo-color": C.ground,
          "text-halo-width": 1.2,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 14.2, 0, 14.8, 0.9],
        },
      },
      {
        id: "neighbourhoods",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        minzoom: 13.6,
        // districts only, and not Bandra itself: the callout already names it
        filter: [
          "all",
          ["==", ["get", "class"], "suburb"],
          ["==", ["index-of", "Bandra", ["coalesce", ["get", "name:en"], ["get", "name"]]], -1],
        ],
        layout: {
          "text-field": ["upcase", ["coalesce", ["get", "name:en"], ["get", "name"], ""]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 9.5,
          "text-letter-spacing": 0.32,
          "text-pitch-alignment": "viewport",
        },
        paint: {
          "text-color": C.labelDim,
          "text-halo-color": C.ground,
          "text-halo-width": 1,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 13.6, 0, 14.2, 1],
        },
      },
    ],
  };
}
