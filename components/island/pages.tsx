import s from "./island.module.css";
import type { IslandPage } from "./types";
import { STUDIO, formatLat, formatLng } from "../hero/geo";
import About from "../about/About";
import Projects from "../projects/Projects";
import Team from "../team/Team";
import { TEAM } from "../lineup/team";

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
 * wired. The team's roles are the owner's; their names, clips, bios and links
 * are still to come (lineup/team.ts).
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
          {/* the quiet second action: the team, one tap away, led by the squad's
              numbers (their portraits, once given) overlapping like a group's avatars */}
          <a className={s.squad} href="#team">
            <span className={s.faces} aria-hidden="true">
              {TEAM.map((p, k) => (
                <span key={p.id} className={s.face} style={{ zIndex: TEAM.length - k }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.poster ? <img src={p.poster} alt="" /> : p.number}
                </span>
              ))}
            </span>
            Meet the three
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
    // A nib writes "place." in and runs on as the thread to the studio pin; as it
    // touches down the place answers (components/about).
    content: <About />,
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
    // The lineup deals out as the page rises and the three walk out one by one
    // (components/lineup); a card lifts into its player's profile (components/team).
    content: <Team />,
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
