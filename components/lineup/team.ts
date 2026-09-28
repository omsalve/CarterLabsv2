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
 */
export type Player = {
  id: string;
  number: number;
  role: string;
  /** TODO: the person's name; until it's set, the role is the card's headline */
  name?: string;
  captain?: boolean;
  poster?: string;
  video?: { webm?: string; hevc?: string; mp4?: string };
  matte?: boolean;
  loop?: boolean;
};

export const TEAM: Player[] = [
  { id: "design", number: 10, role: "Design Director", captain: true },
  { id: "frontend", number: 7, role: "Frontend Lead" },
  { id: "systems", number: 4, role: "Systems Architect" },
];
