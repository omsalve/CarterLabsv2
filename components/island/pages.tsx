import s from "./island.module.css";
import type { IslandPage } from "./types";
import { STUDIO, formatLat, formatLng } from "../hero/geo";
import Lineup from "../lineup/Lineup";
import Projects from "../projects/Projects";

const Arrow = () => (
  <span className={s.ctaIcon} aria-hidden="true">
    <svg viewBox="0 0 16 16">
      <path d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

/**
 * The island's pages, in stack order. Add a page here and it gets a place in the
 * stack, an anchor (`#id`), a page-control dot, and the turn for free.
 *
 * DRAFT: the section pages carry copy built only from what PRODUCT.md states (About
 * turns its principles into the studio's beliefs, as the owner approved). The
 * projects are the owner's; what we made for each is still to come
 * (projects/work.ts). No contact channel exists yet; the contact form is not
 * wired. The team's roles are the owner's; their names and clips are still to
 * come (lineup/team.ts).
 */
export const ISLAND_PAGES: IslandPage[] = [
  {
    id: "studio",
    label: "CarterLabs",
    content: (
      <>
        {/* The lockup, split where it steps: CARTER// rises, Labs is written in,
            and the pocket it leaves under CARTER carries the studio's rule. */}
        {/* eslint-disable @next/next/no-img-element */}
        <h1 id="hero-title" className={s.wordmark}>
          <span className={s.logoTop}>
            <img src="/logo-carter.png" width={1366} height={291} alt="CarterLabs" />
          </span>
          <span className={s.logoLower}>
            <span className={s.logoKicker} aria-hidden="true">Digital studio</span>
            <img className={s.logoLabs} src="/logo-labs.png" width={1366} height={283} alt="" />
          </span>
        </h1>
        {/* eslint-enable @next/next/no-img-element */}
        <p className={s.tagline}>
          Built in <span className={s.script}>Bandra</span>, designed for impact.
        </p>
        <p className={s.lede}>
          We design and build high-quality digital experiences for brands that want to stand out.
        </p>
        <div className={s.actions}>
          <a className={s.cta} href="#projects">
            Explore the work
            <Arrow />
          </a>
        </div>
        <div className={s.platter}>
          <span className={s.platterIcon} aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M8 14.5s4.75-4.2 4.75-8A4.75 4.75 0 0 0 3.25 6.5c0 3.8 4.75 8 4.75 8Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <circle cx="8" cy="6.5" r="1.6" fill="currentColor" />
            </svg>
          </span>
          <span className={s.platterText}>
            <span className={s.platterTitle}>Carter Road, Bandra West</span>
            <span className={s.platterMeta}>
              {formatLat(STUDIO[1])} · {formatLng(STUDIO[0])}
            </span>
          </span>
        </div>
      </>
    ),
  },
  {
    id: "about",
    label: "About us",
    content: (
      <>
        {/* The thread leaves from the marker after "place." and runs out of the glass
            to the studio pin on the map (Island.tsx draws it). */}
        <h2 className={s.statement}>
          Rooted in a real <span className={`${s.script} ${s.threadWord}`}>place</span>.
          <span data-thread aria-hidden="true" />
        </h2>
        <p className={`${s.lede} ${s.ledeWide}`}>
          <span className={s.leadIn}>
            CarterLabs is a digital studio on the Carter Road seafront, in Bandra West.
          </span>{" "}
          We design and build high-quality digital experiences for brands that want to stand out.
        </p>
        <ul className={s.beliefs}>
          <li className={s.belief}>
            <span className={s.beliefTitle}>Intentional over impressive</span>
            <span className={s.beliefText}>Every motion and every element has to earn its place.</span>
          </li>
          <li className={s.belief}>
            <span className={s.beliefTitle}>Restraint is the premium signal</span>
            <span className={s.beliefText}>Fewer, better moments, made with care.</span>
          </li>
          <li className={s.belief}>
            <span className={s.beliefTitle}>Never a template</span>
            <span className={s.beliefText}>Nothing we make should look like it came from one.</span>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "projects",
    label: "Projects",
    // The camera pulls back over Bandra and pins the work; a row lifts into its
    // case study as the camera comes down onto it (components/projects).
    content: <Projects />,
  },
  {
    id: "team",
    label: "Team",
    content: (
      <>
        {/* The lineup deals out as the page rises, then the three walk out one by one
            (components/lineup). */}
        <h2 className={s.statement}>
          The starting <span className={s.script}>three</span>.
        </h2>
        <p className={s.lede}>A small squad, on purpose. The people you meet are the people who build it.</p>
        <Lineup />
      </>
    ),
  },
  {
    id: "contact",
    label: "Contact us",
    content: (
      <>
        <h2 className={s.statement}>
          Tell us what you&rsquo;re <span className={s.script}>building</span>.
        </h2>
        {/* TODO: not wired to anything yet; submitting does nothing. */}
        <form className={s.form} onSubmit={(e) => e.preventDefault()}>
          <label className={s.field}>
            <span className={s.fieldLabel}>Name</span>
            <input className={s.input} name="name" autoComplete="name" placeholder="Your name" required />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Email</span>
            <input className={s.input} name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Project</span>
            <textarea className={s.input} name="message" rows={3} placeholder="A few lines about what you have in mind" required />
          </label>
          <div className={s.formActions}>
            <button className={s.cta} type="submit">
              Send message
              <Arrow />
            </button>
          </div>
        </form>
      </>
    ),
  },
];
