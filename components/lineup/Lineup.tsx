"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import s from "./lineup.module.css";
import { Spring } from "../island/spring";
import { TEAM, called, type Player } from "./team";

/**
 * The Team page's lineup: the starting three, revealed like a matchday line-up.
 *
 * Two motions, two drivers.
 * - The deal follows the stack. The island writes each page's `--page-offset` every
 *   frame (+1 waiting below, 0 on stage, −1 gone above). As the page rises, the
 *   cards deal out of one deck, so a swipe scrubs the deal, holds it or takes it back.
 * - The walkout plays once the page has the stage. One by one, each player's shirt
 *   number rises, the light comes up behind them, they step forward out of the
 *   dark (their clip starts), their name is written in and light runs across the
 *   card. Each card rides its own spring, so a walkout left halfway is caught, and
 *   the lineup walks out again the next time the page arrives.
 *
 * On a fine pointer each card tilts under it like an Apple TV poster, its layers
 * parting in depth, and the other two step out of the light. A touch lifts the
 * card under the finger. Each card is a button:
 * the Team page lifts it into its player's profile (components/team).
 */

const WALK = {
  first: 160, // ms from taking the stage to the first player walking out
  cadence: 320, // ms between players
};
/** The deck: the cards under the top one lie fanned this much (deg), this far down (px), this much smaller. */
const DECK = { fan: 5, drop: 10, shrink: 0.06 };
/** The tilt under the pointer (deg), and how far the card lifts (scale). */
const TILT = { x: 7, y: 5, lift: 0.022 };
/** While one card is under the pointer, the others dim this much: the spotlight is on it. */
const SPOT = 0.3;
const GAP = 6; // keep in step with .lineup's gap

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const op = (v: number) => (v > 0.998 ? "" : v.toFixed(3));
const px = (x: number, y: number) => (Math.abs(x) + Math.abs(y) < 0.01 ? "" : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`);

const SAFARI = /^((?!chrome|android|crios|fxios|edg).)*safari/i;

/** Safari plays alpha only in HEVC; everyone else, only in VP9 WebM. */
export function sourceFor(p: Player) {
  const v = p.video;
  if (!v) return "";
  if (!p.matte) return v.mp4 || v.webm || v.hevc || "";
  return (SAFARI.test(navigator.userAgent) ? v.hevc || v.webm : v.webm || v.hevc) || v.mp4 || "";
}

type Props = {
  players?: Player[];
  /** a card was chosen: lift it into its player's profile (components/team) */
  onPick?: (k: number) => void;
  /** whose profile is open, for the accessibility tree (-1: none) */
  open?: number;
};

export default function Lineup({ players = TEAM, onPick, open = -1 }: Props) {
  const rootRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const page = root.closest<HTMLElement>("[data-page]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !reduced;
    const pick = (el: Element, cls: string) => el.querySelector<HTMLElement>(`.${cls}`);

    const cards = (Array.from(root.children) as HTMLElement[]).map((card, j) => {
      const video = card.querySelector("video");
      if (video) {
        video.muted = true;
        const src = sourceFor(players[j]);
        if (src && video.getAttribute("src") !== src) video.src = src;
      }
      return {
        card,
        number: pick(card, s.number)!,
        backlight: pick(card, s.backlight)!,
        player: pick(card, s.player)!,
        caption: pick(card, s.caption)!,
        name: pick(card, s.name)!,
        role: pick(card, s.role),
        sweep: pick(card, s.sweep)!,
        glare: pick(card, s.glare)!,
        video,
        // real footage walks out of the dark; the stand-in is a silhouette already
        lit: card.dataset.media !== "stand-in",
        walk: new Spring(0, reduced ? 0.34 : 0.62, reduced ? 1 : 0.8),
        tx: new Spring(0, 0.5, 0.82),
        ty: new Spring(0, 0.5, 0.82),
        lift: new Spring(0, 0.36, 0.9),
        dim: new Spring(0, 0.4, 1),
        due: Infinity, // when this player walks out
        rolled: false, // the clip has been started for this walkout
        press: { id: -1, x: 0, y: 0 },
      };
    });
    type Card = (typeof cards)[number];
    const n = cards.length;
    const mid = (n - 1) / 2;

    let W = 0;
    let H = 0;
    const measure = () => {
      W = cards[0]?.card.offsetWidth ?? 0;
      H = cards[0]?.card.offsetHeight ?? 0;
    };
    measure();

    // ---------------------------------------------------------------- clips
    const roll = (c: Card) => {
      c.rolled = true;
      const v = c.video;
      if (!v || reduced || !v.currentSrc) return;
      v.currentTime = 0;
      v.play().catch(() => {});
    };
    const rewind = (c: Card) => {
      c.rolled = false;
      if (!c.video) return;
      c.video.pause();
      if (c.video.readyState > 0) c.video.currentTime = 0;
    };
    /** Hovering or tapping a player who has walked out runs their clip again. */
    const encore = (c: Card) => {
      const v = c.video;
      if (v && c.rolled && !reduced && (v.paused || v.ended)) roll(c);
    };

    // ---------------------------------------------------------------- the stack
    const deal = new Spring(0, 0.34, 0.8);
    let onStage = false;

    const offsetNow = () => {
      if (!page) return 0; // outside the island there is no stack: always on stage
      const v = parseFloat(page.style.getPropertyValue("--page-offset"));
      return Number.isFinite(v) ? v : 1;
    };

    const sync = (now: number) => {
      const o = offsetNow();
      const gone = Math.abs(o) >= 0.999;
      // the deal is scrubbed by the page rising from below; from above, the cards arrive dealt
      const dealt = reduced || o <= 0 ? 1 : 1 - smooth(0.1, 0.9, o);
      if (gone) deal.jump(dealt);
      else deal.target = dealt;

      const on = Math.abs(o) < 0.5;
      if (on && !onStage) {
        // the page has the stage: whoever hasn't walked out yet goes, in lineup order
        let k = 0;
        for (const c of cards) if (c.walk.target < 1) c.due = now + (reduced ? 0 : WALK.first + WALK.cadence * k++);
      } else if (!on && onStage) {
        // leaving: nobody else comes out, and those already out stay lit as the page recedes
        for (const c of cards) c.due = Infinity;
      }
      onStage = on;
      if (gone) {
        // off the stack: the tunnel resets, so the lineup walks out again next time
        for (const c of cards) {
          c.walk.jump(0);
          c.due = Infinity;
          if (c.rolled) rewind(c);
        }
      }
      for (const c of cards) {
        if (now >= c.due) {
          c.due = Infinity;
          c.walk.target = 1;
        }
      }
    };

    // ---------------------------------------------------------------- paint
    const paint = () => {
      const undealt = 1 - deal.value;
      for (let j = 0; j < n; j++) {
        const c = cards[j];
        const side = j - mid;
        const tx = c.tx.value;
        const ty = c.ty.value;
        const lift = c.lift.value;

        // in the deck the side cards lie under the middle one, fanned a little
        const dx = -side * (W + GAP) * undealt;
        const dy = Math.abs(side) * DECK.drop * undealt;
        const rot = side * DECK.fan * undealt;
        const sc = 1 - DECK.shrink * Math.abs(side) * undealt + TILT.lift * lift;
        const still = Math.abs(dx) + Math.abs(dy) + Math.abs(rot) + Math.abs(sc - 1) + Math.abs(tx) + Math.abs(ty) < 0.001;
        c.card.style.transform = still
          ? ""
          : `perspective(900px) translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rot.toFixed(3)}deg) ` +
            `scale(${sc.toFixed(4)}) rotateX(${(-ty * TILT.y).toFixed(3)}deg) rotateY(${(tx * TILT.x).toFixed(3)}deg)`;

        const w = c.walk.value;
        const seg = (a: number, b: number) => clamp((w - a) / (b - a), 0, 1);

        if (reduced) {
          // nothing travels: the number, the player and the name come up in place
          c.number.style.opacity = op(seg(0, 0.5));
          c.backlight.style.opacity = op(seg(0, 0.6));
          c.player.style.opacity = op(seg(0.2, 0.8));
          c.caption.style.opacity = op(seg(0.4, 1));
          continue;
        }

        // 1. the number rises out of the floor of the card
        c.number.style.opacity = op(seg(0, 0.32));
        c.number.style.transform = px(-tx * 4, -ty * 3 + (1 - seg(0, 0.5)) * H * 0.34);
        // 2. the light comes up behind where the player will stand
        c.backlight.style.opacity = op(seg(0.04, 0.6));
        // 3. the player steps forward out of the dark (this one may pass 1 as the spring settles)
        const step = Math.max(0, (w - 0.14) / 0.86);
        const blur = 7 * (1 - seg(0.14, 0.75));
        const lit = c.lit ? 0.08 + 0.92 * seg(0.2, 0.9) : 1;
        c.player.style.opacity = op(seg(0.12, 0.42));
        c.player.style.transform =
          `translate3d(${(tx * 3).toFixed(2)}px, ${(ty * 2 + (1 - step) * H * 0.12).toFixed(2)}px, 0) ` +
          `scale(${(1.06 - 0.06 * step).toFixed(4)})`;
        c.player.style.filter =
          `${blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : ""} ${lit < 0.999 ? `brightness(${lit.toFixed(3)})` : ""}`.trim();
        // 4. the name is written in, left to right, and the role settles under it
        const named = seg(0.42, 0.88);
        c.caption.style.transform = px(tx * 6, ty * 4);
        c.name.style.clipPath = named < 1 ? `inset(-30% ${((1 - named) * 100).toFixed(2)}% -30% 0)` : "";
        c.name.style.transform = px(-(1 - named) * 8, 0);
        if (c.role) c.role.style.opacity = op(seg(0.62, 1));
        // 5. light runs across the card once
        const sw = seg(0.3, 1);
        c.sweep.style.opacity = sw > 0 && sw < 1 ? Math.sin(Math.PI * sw).toFixed(3) : "0";
        c.sweep.style.transform = `translate3d(${((-1.2 + 2.4 * sw) * W).toFixed(1)}px, 0, 0)`;
        // under the pointer, a highlight where the light would catch the tilted card,
        // and the other cards out of the spotlight
        if (fine) {
          const dim = c.dim.value;
          c.card.style.filter = dim > 0.002 ? `brightness(${(1 - SPOT * dim).toFixed(3)}) saturate(${(1 - 0.4 * dim).toFixed(3)})` : "";
          c.glare.style.opacity = lift > 0.002 ? lift.toFixed(3) : "0";
          c.glare.style.setProperty("--gx", `${(50 + tx * 46).toFixed(1)}%`);
          c.glare.style.setProperty("--gy", `${(50 + ty * 46).toFixed(1)}%`);
        }
      }
    };

    // ---------------------------------------------------------------- one clock, only while something moves
    let raf = 0;
    let last = 0;
    const busy = () =>
      !deal.resting ||
      cards.some((c) => c.due < Infinity || !c.walk.resting || !c.tx.resting || !c.ty.resting || !c.lift.resting || !c.dim.resting);

    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      sync(now);
      deal.step(dt);
      // one card under the pointer puts the others in its shadow
      const spot = fine && cards.some((c) => c.lift.target > 0);
      for (const c of cards) {
        c.dim.target = spot && c.lift.target === 0 ? 1 : 0;
        c.walk.step(dt);
        c.tx.step(dt);
        c.ty.step(dt);
        c.lift.step(dt);
        c.dim.step(dt);
        // the clip starts as the player steps out of the dark
        if (!c.rolled && c.walk.target === 1 && c.walk.value > 0.22) roll(c);
      }
      paint();
      if (busy()) raf = requestAnimationFrame(tick);
      else raf = last = 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    // start from the tunnel, before the page is ever shown
    sync(performance.now());
    paint();
    wake();

    // the island writes the page's offset into its style as the stack moves
    const mo = new MutationObserver(wake);
    if (page) mo.observe(page, { attributes: true, attributeFilter: ["style"] });
    const ro = new ResizeObserver(() => {
      measure();
      paint();
    });
    ro.observe(root);

    // ---------------------------------------------------------------- pointer
    const input = new AbortController();
    const opts = { signal: input.signal };
    const rest = (c: Card) => {
      c.tx.target = 0;
      c.ty.target = 0;
      c.lift.target = 0;
      wake();
    };
    for (const c of cards) {
      const el = c.card;
      if (fine) {
        el.addEventListener(
          "pointerenter",
          (e) => {
            if (e.pointerType === "mouse") encore(c);
          },
          opts,
        );
        el.addEventListener(
          "pointermove",
          (e) => {
            if (e.pointerType !== "mouse") return;
            const r = el.getBoundingClientRect();
            c.tx.target = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
            c.ty.target = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
            c.lift.target = 1;
            wake();
          },
          opts,
        );
        el.addEventListener("pointerleave", () => rest(c), opts);
      }
      if (reduced) continue;
      // a press lifts the card under the finger; if the finger moves off to turn the page, it settles back
      el.addEventListener(
        "pointerdown",
        (e) => {
          if (e.pointerType === "mouse") return;
          c.press = { id: e.pointerId, x: e.clientX, y: e.clientY };
          c.lift.target = 1;
          wake();
        },
        opts,
      );
      el.addEventListener(
        "pointermove",
        (e) => {
          if (e.pointerId !== c.press.id) return;
          if (Math.hypot(e.clientX - c.press.x, e.clientY - c.press.y) > 8) {
            c.press.id = -1;
            rest(c);
          }
        },
        opts,
      );
      const release = (e: PointerEvent) => {
        if (e.pointerId !== c.press.id) return;
        c.press.id = -1;
        if (e.type === "pointerup") encore(c);
        rest(c);
      };
      el.addEventListener("pointerup", release, opts);
      el.addEventListener("pointercancel", release, opts);
    }

    // a hidden tab plays nothing
    const onVisibility = () => {
      for (const c of cards) {
        const v = c.video;
        if (!v) continue;
        if (document.hidden) v.pause();
        else if (c.rolled && v.loop && onStage) v.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility, opts);

    return () => {
      cancelAnimationFrame(raf);
      input.abort();
      mo.disconnect();
      ro.disconnect();
      for (const c of cards) c.video?.pause();
    };
  }, [players]);

  const mid = (players.length - 1) / 2;

  return (
    <ol ref={rootRef} className={s.lineup} data-concentric="" style={{ "--count": players.length } as CSSProperties}>
      {players.map((p, j) => (
        <li
          key={p.id}
          className={s.card}
          data-media={p.video ? "clip" : p.poster ? "still" : "stand-in"}
          style={{ zIndex: players.length - Math.round(Math.abs(j - mid)) }}
        >
          {/* the card is a button: it lifts into the player's profile */}
          <button
            type="button"
            className={s.stage}
            data-card={j}
            aria-expanded={onPick ? open === j : undefined}
            aria-controls={onPick ? `player-${p.id}` : undefined}
            aria-describedby={onPick ? `${p.id}-card-hint` : undefined}
            disabled={!onPick}
            onClick={() => onPick?.(j)}
          >
            <CardArt player={p} />
            <span className={s.caption}>
              <span className={s.name}>
                {called(p)}
                {p.captain && (
                  <span className={s.captain} role="img" aria-label="Captain">
                    C
                  </span>
                )}
              </span>
              {p.name && <span className={s.role}>{p.role}</span>}
            </span>
            <span id={`${p.id}-card-hint`} hidden>
              Number {p.number}. Opens their profile.
            </span>
            <span className={s.sweep} aria-hidden="true" />
            <span className={s.glare} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * What a card shows behind its caption: the backlight, the shirt number, the
 * player and the scrim. The profile's poster carries the same art, scaled up, so
 * the card can grow into it (components/team).
 */
export function CardArt({ player: p, className = "" }: { player: Player; className?: string }) {
  return (
    <span className={`${s.art} ${className}`} data-matte={p.matte || (!p.video && !p.poster) ? "" : undefined} aria-hidden="true">
      <span className={s.backlight} />
      <span className={s.number}>{p.number}</span>
      <span className={s.player}>
        <Media player={p} />
      </span>
      <span className={s.scrim} />
    </span>
  );
}

function Media({ player }: { player: Player }) {
  if (player.video) {
    // the source is chosen on the client (see sourceFor): alpha needs a different codec per browser
    return (
      <video
        className={s.media}
        poster={player.poster}
        muted
        playsInline
        preload="auto"
        loop={player.loop}
        disablePictureInPicture
        tabIndex={-1}
      />
    );
  }
  if (player.poster) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={s.media} src={player.poster} alt="" />;
  }
  return <StandIn />;
}

/* Head and shoulders, arms crossed, cropped at the chest like a broadcast portrait. */
const HEAD =
  "M100 26C117 26 129 37 130 53C131 59 130 63 129 66C133 65 135 70 133 76C132 82 129 84 127 84" +
  "C124 94 116 103 105 106C101 107.5 99 107.5 95 106C84 103 76 94 73 84C71 84 68 82 67 76" +
  "C65 70 67 65 71 66C70 63 69 59 70 53C71 37 83 26 100 26Z";
const BODY =
  "M86 95C88 104 88 110 85 116C75 122 57 126 43 132C29 138 21 150 18 166C15 180 11 194 9 206" +
  "C7 214 9 226 11 240H189C191 226 193 214 191 206C189 194 185 180 182 166C179 150 171 138 157 132" +
  "C143 126 125 122 115 116C112 110 112 104 114 95Z";
/** the top edge of the crossed forearms */
const ARMS = "M16 203C52 186 118 181 178 196";

/**
 * Until the clips arrive: a figure backlit at the mouth of the tunnel, arms
 * crossed, with only its outline catching the light.
 */
function StandIn() {
  const rim = `rim-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg className={s.standIn} viewBox="0 0 200 240" preserveAspectRatio="xMidYMax meet">
      <defs>
        <linearGradient id={rim} x1="0" y1="36" x2="0" y2="210" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ede6de" stopOpacity="0.62" />
          <stop offset="0.45" stopColor="#ede6de" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ede6de" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill={`url(#${rim})`}>
        <path d={HEAD} />
        <path d={BODY} />
      </g>
      {/* the same figure, a hair smaller and lower, leaves only the lit edge showing */}
      <g fill="#060505" transform="translate(1.2 1.6) scale(0.988 1)">
        <path d={HEAD} />
        <path d={BODY} />
      </g>
      <path d={ARMS} fill="none" stroke="#ede6de" strokeOpacity="0.1" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
