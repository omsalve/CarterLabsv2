import type { Demo } from "../island/types";

/**
 * The starting three, in lineup order: left to right, and the order they walk out.
 *
 * Numbers follow the positions they play: the 10 sets the play, the 7 is the one
 * on show, the 4 holds the shape at the back.
 *
 * Media lives in /public/team/. A clip (2–3s: the broadcast turn to camera, arms
 * crossed) plays once as its player walks out and holds on its last frame; hovering
 * or tapping the card plays it again. Set `loop` for a seamless loop instead.
 * - `matte: true` means the footage has a transparent background, so the player can
 *   stand in front of their number (the Lock Screen depth effect). Supply `webm`
 *   (VP9 with alpha) for Chrome, Edge and Firefox and `hevc` (HEVC with alpha, .mov
 *   or .mp4) for Safari.
 * - Without a matte, give an `mp4` (H.264); the number is printed over the footage.
 * - `poster` is the still shown before the clip loads, and instead of it when the
 *   visitor prefers reduced motion. A poster on its own works too.
 * With no media at all, the card shows a backlit stand-in.
 *
 * Each player also has a profile (components/team): tapping their card lifts it
 * into their poster, reachable at #team/<id>.
 */
export type Player = {
  id: string;
  number: number;
  role: string;
  /** TODO: the person's name; until it's set, the role is the card's headline */
  name?: string;
  captain?: boolean;
  /** where the number plays on the pitch, and what that means in the studio */
  position: { name: string; plays: string };
  /** what they lead in the studio (the owner's description of the team) */
  leads: string;
  /**
   * The part of this site that is theirs, by role; "Show me" plays it live.
   * TODO(owner): confirm who made what; change `title` or drop the row.
   */
  signature?: { title: string; demo: Demo };
  /** TODO(owner): a line or two in their own words; shown on their profile once set */
  bio?: string;
  /** TODO(owner): where to find them, e.g. { label: "LinkedIn", href: "https://…" } */
  links?: { label: string; href: string }[];
  poster?: string;
  video?: { webm?: string; hevc?: string; mp4?: string };
  matte?: boolean;
  loop?: boolean;
};

export const TEAM: Player[] = [
  {
    id: "design",
    number: 10,
    role: "Design Director",
    captain: true,
    position: { name: "Playmaker", plays: "sets the play" },
    leads: "Design",
    signature: { title: "The glass", demo: "glass" },
  },
  {
    id: "frontend",
    number: 7,
    role: "Frontend Lead",
    position: { name: "Winger", plays: "the one on show" },
    leads: "Frontend engineering",
    signature: { title: "The stack", demo: "stack" },
  },
  {
    id: "systems",
    number: 4,
    role: "Systems Architect",
    position: { name: "Centre-back", plays: "holds the shape" },
    leads: "Backend and frameworks",
    signature: { title: "The map", demo: "map" },
  },
];

/** The name a player goes by on the site: their own once given, their role until then. */
export const called = (p: Player) => p.name ?? p.role;
