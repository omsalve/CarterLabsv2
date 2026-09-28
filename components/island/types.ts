import type { ReactNode } from "react";
import type { GlassLayer } from "./glass-layer";

/** One screen of the island. Scrolling the page moves between them. */
export type IslandPage = {
  /** also the anchor id, so `#work` scrolls to the Work page */
  id: string;
  /** accessible name for the page control */
  label: string;
  content: ReactNode;
};

/**
 * What the Projects page asks of the camera, rewritten every frame it moves; the
 * hero flies it (components/projects). All of it scrubs.
 */
export type Survey = {
  /** how much of the Projects page is showing, 0..1: the camera pulls back over Bandra */
  presence: number;
  /** 0 the list … 1 a case study: the camera comes down onto the project */
  focus: number;
  /** the project in focus, or where a flight between two began (−1: none) */
  from: number;
  /** where that flight is going; the same as `from` when there is none */
  to: number;
  /** 0..1 along the flight */
  t: number;
};

/** Mutable scene state the hero owns and the island reads every frame. */
export type IslandScene = {
  glass: GlassLayer | null;
  /** smoothed pointer, -1..1 on each axis; stays 0 on touch devices */
  pointer: { x: number; y: number };
  /** the studio pin on the map, which the About page's thread reaches for; the
      island sets `--thread` (0..1) on it as the thread touches down */
  pin: HTMLElement | null;
  /** where the glass is this frame, written by the island */
  frame: IslandFrame | null;
  /** the project pins on the map, in PROJECTS order; the Projects page drives them */
  marks: (HTMLElement | null)[];
  /** the Projects page hears presses and hovers on its pins here */
  onMark: ((kind: "pick" | "hot" | "cold", i: number) => void) | null;
  survey: Survey | null;
};

export type IslandFrame = { x: number; y: number; w: number; h: number; compact: boolean };

export type IslandHandle = {
  /** where the island will rest for the current page, in viewport CSS pixels */
  target(): IslandFrame;
};
