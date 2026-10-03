import type { CSSProperties } from "react";
import s from "./study.module.css";
import Gallery from "./Gallery";
import { fromStudio, type Growth, type Project } from "./work";

/**
 * A project's case study, hung on its pin on the map: the work in photographs, the
 * brand in a line, what we did for it and what it did for them. The pin's numbered
 * disc springs open into it the way the Dynamic Island opens into a Live Activity:
 * the shape grows up and out of the disc with its lower edge held on the stem, the
 * disc riding its top corner and the pin's name moving up to become its header (so
 * the card only keeps their room). Then the figures roll up, digit by digit, like
 * iOS's numeric text.
 *
 * Top to bottom: the header (the pin's own), the photographs (Gallery.tsx, paged
 * like the Photos app), the description, the owner's story once told (work.ts:
 * summary, services, growth, period), and where it is.
 *
 * The hero hangs it on the pin and measures it (components/hero); the Projects page
 * opens it, writing --o, --c and --roll on the pin as its spring moves (see
 * study.module.css). The map is hidden from assistive tech; the case in the island
 * says the same for them.
 */

/** One character of a figure: a digit rolls (`order` across the card), anything else stays put. */
type Glyph = { ch: string; digit?: number; order?: number };

/** The figures, split into what rolls and what doesn't, digits numbered across the whole card. */
const glyphs = (growth: Growth[]): Glyph[][] => {
  let order = 0;
  return growth.map((g) => Array.from(g.figure).map((ch) => (/\d/.test(ch) ? { ch, digit: Number(ch), order: order++ } : { ch })));
};

const REEL = "0\n1\n2\n3\n4\n5\n6\n7\n8\n9";

export default function Study({ project: p }: { project: Project }) {
  const figures = p.growth?.length ? glyphs(p.growth) : [];
  return (
    <div className={s.study} data-study="">
      <span className={s.fill} />
      <div className={s.body}>
        <Gallery project={p} />
        {p.description && <p className={s.description}>{p.description}</p>}
        {p.summary && <p className={s.brief}>{p.summary}</p>}
        {p.services?.length ? <p className={s.services}>{p.services.join(" · ")}</p> : null}
        {p.growth?.length ? (
          <div className={s.growth}>
            {p.growth.map((g, j) => (
              <div key={g.label} className={s.result}>
                <span className={s.figure}>
                  {figures[j].map((c, n) =>
                    c.digit === undefined ? (
                      <span key={n}>{c.ch}</span>
                    ) : (
                      <span
                        key={n}
                        className={s.digit}
                        // each digit rolls up from 0 a beat after the one before it
                        style={{ "--n": c.digit, "--a": Math.min(0.4, c.order! * 0.06) } as CSSProperties}
                      >
                        <span className={s.reel}>{REEL}</span>
                      </span>
                    ),
                  )}
                </span>
                <span className={s.label}>{g.label}</span>
              </div>
            ))}
          </div>
        ) : null}
        {p.period && <p className={s.period}>{p.period}</p>}
        <p className={s.place}>
          <span>
            {p.street}, {p.area}
          </span>
          <span className={s.measure}>{fromStudio(p)}</span>
        </p>
      </div>
    </div>
  );
}
