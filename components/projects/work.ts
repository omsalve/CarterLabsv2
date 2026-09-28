import { STUDIO, distanceKm, type LngLat } from "../hero/geo";

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
  /** Owner to supply. Each appears in the case study once it is set. */
  summary?: string;
  services?: string[];
  year?: string;
  link?: string;
};

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
  },
  {
    id: "goancho",
    name: "Goancho",
    kind: "Goan café",
    street: "Pali Hill",
    area: "Bandra West",
    at: [72.82895, 19.06267],
    shot: { zoom: 16.7, pitch: 56, bearing: -8 },
  },
];

/** How far a project is from the studio, as the HUD would set it. */
export const fromStudio = (p: Project) => {
  const km = distanceKm(STUDIO, p.at);
  return `${p.approx ? "≈ " : ""}${km.toFixed(1)} KM`;
};

/** The whole list lies within this of the studio (rounded up to the half kilometre). */
export const REACH_KM = Math.ceil(Math.max(...PROJECTS.map((p) => distanceKm(STUDIO, p.at) + (p.approx ? 0.3 : 0))) * 2) / 2;
