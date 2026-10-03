import type { FeatureCollection, Polygon } from "geojson";
import { STUDIO, distanceKm, footprint, type LngLat } from "../hero/geo";

export type Project = {
  id: string;
  name: string;
  /** what it is, as the owner describes it */
  kind: string;
  /** the street or neighbourhood it sits on */
  street: string;
  /** the suburb, for the case study */
  area: string;
  at: LngLat;
  /** true while `at` is only the street or neighbourhood, not the site itself */
  approx?: boolean;
  /** how the camera frames it up close */
  shot: { zoom: number; pitch: number; bearing: number };
  /**
   * The red landmark that rises on its pin, in metres: `w` east to west, `d` north
   * to south, `h` tall, turned `turn` degrees clockwise.
   */
  site: { w: number; d: number; h: number; turn?: number };
  /**
   * The brand, in a line or two, under the photographs on its case study.
   * TODO(owner): DRAFT, written only from the facts on hand (PRODUCT.md: the brand,
   * what it is, where it is). Replace it with your own words.
   */
  description?: string;
  /**
   * TODO(owner): photographs of the work, in the order they should page. Put them in
   * /public/work/<id>/ and list them here, e.g. { src: "/work/goancho/menu.jpg",
   * alt: "The new menu on a café table", caption: "Menu" }. They're framed at 4:3 and
   * cropped to fill (landscape reads best); 1600px wide is plenty. Until there are
   * any, drawings of the project's landmark stand in for them (drawing.ts).
   */
  images?: Photo[];
  /*
   * Owner to supply. Each appears in the case study once it is set. The story
   * (summary, services, growth, period) is told on the map, on the card that hangs
   * on the pin (Study.tsx), under the photographs and the description.
   */
  /** what we did for the brand, in a line or two */
  summary?: string;
  /** what we made, as the brand would list it: "Identity", "Website", … */
  services?: string[];
  /** what it did for the brand: two or three results, as measured */
  growth?: Growth[];
  /** over what time the growth was measured, as it should read: "First six months" */
  period?: string;
  year?: string;
  link?: string;
};

/**
 * One result, as it should read: the figure ("+140%", "3.2×", "₹4.1 Cr") and what it
 * counts ("Online orders"). Its digits roll up as the card opens.
 */
export type Growth = { figure: string; label: string };

/**
 * One photograph in the case study's gallery. `alt` says what it shows, for anyone
 * who can't see it (the case in the island reads it out); `caption`, if set, sits
 * under it on the card.
 */
export type Photo = { src: string; alt: string; caption?: string };

/**
 * The work, in the owner's order. Names, kinds and places are the owner's; the
 * sites are placed from OpenStreetMap. Goancho is Cafe Goancho at Pali Bazaar
 * (Pali Mala Road). Third Entity and Vakratunda Vedantaa sit on their street and
 * neighbourhood until the owner confirms the exact buildings.
 */
export const PROJECTS: Project[] = [
  {
    id: "third-entity",
    name: "Third Entity",
    kind: "Clothing brand",
    street: "Hill Road",
    area: "Bandra West",
    at: [72.8338, 19.0551],
    approx: true,
    shot: { zoom: 16.5, pitch: 58, bearing: -26 },
    site: { w: 24, d: 24, h: 24 }, // a small box
    description: "A clothing brand on Hill Road, the street Bandra comes to shop.",
  },
  {
    id: "vakratunda-vedantaa",
    name: "Vakratunda Vedantaa",
    kind: "Real estate tower",
    street: "Kher Nagar",
    area: "Bandra East",
    at: [72.8444, 19.0585],
    approx: true,
    shot: { zoom: 16.2, pitch: 62, bearing: 6 },
    site: { w: 32, d: 32, h: 200 }, // a big tower
    description: "A real estate tower rising over Kher Nagar, across the tracks in Bandra East.",
  },
  {
    id: "goancho",
    name: "Goancho",
    kind: "Goan café",
    street: "Pali Hill",
    area: "Bandra West",
    at: [72.82895, 19.06267],
    shot: { zoom: 16.7, pitch: 56, bearing: -8 },
    site: { w: 68, d: 26, h: 14 }, // a long, low block
    description: "Cafe Goancho, a Goan café at Pali Bazaar, on Pali Mala Road.",
  },
];

/** Each project's landmark, as map features; a feature's id is its place in PROJECTS. */
export const sites = (): FeatureCollection<Polygon, { h: number }> => ({
  type: "FeatureCollection",
  features: PROJECTS.map((p, k) => ({
    type: "Feature",
    id: k,
    properties: { h: p.site.h },
    geometry: { type: "Polygon", coordinates: [footprint(p.at, p.site.w, p.site.d, p.site.turn)] },
  })),
});

/** Whether the owner has told its story yet. */
export const hasStudy = (p: Project) => Boolean(p.summary || p.services?.length || p.growth?.length);

/** How far a project is from the studio, as the HUD would set it. */
export const fromStudio = (p: Project) => {
  const km = distanceKm(STUDIO, p.at);
  return `${p.approx ? "≈ " : ""}${km.toFixed(1)} KM`;
};

/** The whole list lies within this of the studio (rounded up to the half kilometre). */
export const REACH_KM = Math.ceil(Math.max(...PROJECTS.map((p) => distanceKm(STUDIO, p.at) + (p.approx ? 0.3 : 0))) * 2) / 2;
