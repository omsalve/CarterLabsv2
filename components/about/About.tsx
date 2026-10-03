"use client";

import { useEffect, useRef } from "react";
import i from "../island/island.module.css";
import s from "./about.module.css";

/**
 * The About page: "Rooted in a real place.", signed onto the city.
 *
 * Its set piece is one gesture, from the hand to the ground (The Signature):
 * - The write. Once the page has the stage, a nib of light writes "place." in, left
 *   to right, over the faint trace the word waits as. The ink runs hot behind it.
 * - The run. The nib doesn't lift at the full stop: it hands over to the thread's
 *   bead and runs on, out of the glass and across the map into the studio pin. The
 *   island draws the thread, and holds it back (`data-thread="wait"`) until then.
 * - The answer. As the thread touches down the place answers (the hero, through the
 *   scene): Carter Road surges outward from the studio, a wave of light runs along
 *   Bandra's surf, and the pin reads out where it is.
 *
 * The beliefs come up one after another as the page rises, as the Projects page's
 * rows do, each hairline drawing in from the text column as its row lands.
 *
 * The word is written again each time the page takes the stage after leaving the
 * stack, as the lineup walks out again. Reduced motion: the word is already written,
 * nothing travels, and the thread cross-fades with its page.
 */

const WRITE = {
  delay: 140, // ms from taking the stage to the nib touching down
  ms: 860, // the stroke, from the word's first letter to where the thread begins
  handoff: 0.82, // how far through the stroke the thread is let go, so the bead runs straight on
};
/** Where the thread starts past its anchor: keep in step with THREAD.lead in Island.tsx. */
const LEAD = 10;

/** The studio's principles, as its beliefs (PRODUCT.md, as the owner approved). */
const BELIEFS = [
  { title: "Intentional over impressive", text: "Every motion and every element has to earn its place." },
  { title: "Restraint is the premium signal", text: "Fewer, better moments, made with care." },
  { title: "Never a template", text: "Nothing we make should look like it came from one." },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** The stroke, on the house in-out curve, cubic-bezier(0.65, 0, 0.35, 1), as "Labs" is written in. */
const stroke = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export default function About() {
  const headRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const head = headRef.current;
    const list = listRef.current;
    if (!head || !list) return;
    const page = head.closest<HTMLElement>("[data-page]");
    const signed = head.querySelector<HTMLElement>(`.${s.signed}`)!;
    const word = head.querySelector<HTMLElement>(`.${s.word}`)!;
    const anchor = head.querySelector<HTMLElement>("[data-thread]")!;
    const nib = head.querySelector<HTMLElement>(`.${s.nib}`)!;
    const rows = Array.from(list.children) as HTMLElement[];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const offsetNow = () => {
      if (!page) return 0; // outside the island there is no stack: always on stage
      const v = parseFloat(page.style.getPropertyValue("--page-offset"));
      return Number.isFinite(v) ? v : 1;
    };

    // ---------------------------------------------------------------- the write
    let due = Infinity; // when the nib touches down
    let at = 0; // …and when it did (0: it hasn't)
    let written = false;
    let onStage = false;

    /** The word waits to be written, and the thread for the nib. */
    const ready = () => {
      due = Infinity;
      at = 0;
      written = false;
      anchor.dataset.thread = "wait";
      signed.dataset.ink = "";
      signed.style.setProperty("--ink", "0px");
      nib.style.opacity = "0";
    };
    /** Written: the ink is the word's own, and the thread is the page's to draw. */
    const done = () => {
      written = true;
      anchor.dataset.thread = "";
      delete signed.dataset.ink;
      nib.style.opacity = "0";
    };
    if (reduced) done();
    else ready();

    const sync = (o: number, now: number) => {
      if (reduced) return;
      if (Math.abs(o) >= 0.999) {
        // off the stack: the next time the page takes the stage, the word is written again
        onStage = false;
        if (at || written || due < Infinity) ready();
        return;
      }
      const on = Math.abs(o) < 0.5;
      if (on && !onStage && !at && !written) due = now + WRITE.delay;
      else if (!on && onStage && !at) due = Infinity; // it left before the nib touched down
      onStage = on;
      if (now >= due) {
        due = Infinity;
        at = now;
      }
    };

    /** The nib along its stroke, and the ink up to it. Whether the write is still under way. */
    const paintWrite = (now: number) => {
      if (!at || written) return due < Infinity;
      const t = (now - at) / WRITE.ms;
      // from the word's first letter to where the thread will start; measured as it
      // goes, so a font arriving late can't leave the nib behind
      const h = head.getBoundingClientRect();
      const box = signed.getBoundingClientRect();
      const w = word.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      const x0 = w.left - h.left;
      const x1 = a.left - h.left + LEAD;
      const x = x0 + (x1 - x0) * stroke(clamp(t, 0, 1));
      const y = a.top - h.top + a.height * 0.58; // the thread's level, through the lowercase
      signed.style.setProperty("--ink", `${(x - (box.left - h.left)).toFixed(1)}px`);
      nib.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      nib.style.opacity = (smooth(0, 0.06, t) * (1 - smooth(WRITE.handoff, 1, t))).toFixed(3);
      // near the full stop the thread is let go, so its bead runs straight on from the nib
      if (t >= WRITE.handoff && anchor.dataset.thread === "wait") anchor.dataset.thread = "";
      if (t < 1) return true;
      done();
      return false;
    };

    // ---------------------------------------------------------------- the beliefs
    /** From below the rows come up one after another; from above they are already there. */
    const paintRows = (o: number) => {
      const q = 1 - Math.min(1, Math.abs(o)); // how much of the page is showing
      const arrival = (k: number) => (reduced || o <= 0 ? 1 : smooth(0.25 + 0.14 * k, 0.7 + 0.14 * k, q));
      // the list's fill comes with its first row
      list.style.setProperty("--bg", arrival(0).toFixed(3));
      rows.forEach((li, k) => {
        const a = arrival(k);
        // the hairline above it draws in from the text column as it lands
        li.style.setProperty("--line", a.toFixed(3));
        li.style.opacity = a > 0.998 ? "" : a.toFixed(3);
        li.style.transform = a > 0.999 ? "" : `translate3d(0, ${((1 - a) * 22).toFixed(2)}px, 0)`;
        const b = (1 - a) * 5;
        li.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "";
      });
    };

    // ---------------------------------------------------------------- one clock, only while something moves
    let raf = 0;
    let lastO = NaN;
    const tick = (now: number) => {
      const o = offsetNow();
      sync(o, now);
      const writing = paintWrite(now);
      if (o !== lastO) {
        lastO = o;
        paintRows(o);
      }
      raf = writing ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    wake();

    // the island writes the page's offset into its style as the stack moves
    const mo = new MutationObserver(wake);
    if (page) mo.observe(page, { attributes: true, attributeFilter: ["style"] });

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, []);

  return (
    <>
      <h2 ref={headRef} className={s.statement}>
        Rooted in a real{" "}
        <span className={s.signed}>
          <span className={s.word}>place</span>.
        </span>
        {/* the thread leaves from here once the nib hands it over (Island.tsx draws it) */}
        <span data-thread="wait" aria-hidden="true" />
        <span className={s.nib} aria-hidden="true" />
      </h2>
      <p className={`${i.lede} ${i.ledeWide}`}>
        <span className={i.leadIn}>CarterLabs is a digital studio on the Carter Road seafront, in Bandra West.</span>{" "}
        We design and build high-quality digital experiences for brands that want to stand out.
      </p>
      <ul ref={listRef} className={s.beliefs} data-concentric="">
        {BELIEFS.map((b) => (
          <li key={b.title} className={s.belief}>
            <span className={s.beliefTitle}>{b.title}</span>
            <span className={s.beliefText}>{b.text}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
