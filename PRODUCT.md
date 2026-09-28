# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Brand owners, founders and marketing leads evaluating a digital agency. They arrive from a referral, a social post or a search, usually on a laptop or phone, deciding within seconds whether CarterLabs feels established enough to trust with their brand.

## Product Purpose

CarterLabs is a digital agency based in Bandra, Mumbai. It creates high-quality digital experiences for brands that want to stand out. The website's first job is to set the tone: premium, confident, and rooted in a real place. Its second job is to move the visitor toward the work.

## Positioning

Built in Bandra, designed for impact. The agency's identity is tied to a real locality: the studio sits on the Carter Road seafront in Bandra West (confirmed by the owner). A studio anywhere else can't honestly make that claim.

## Capabilities and Constraints

- Existing stack: Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.
- Map data must come from OpenStreetMap, with real topography.
- Every visit opens with one line of type (about 4 seconds; a press cuts it short), then the visitor flies the descent from the city to Carter Road themselves: hold, tap, scroll or swipe. An autopilot lands it after 5.5 seconds without input. Skip intro and Esc jump straight to the landing (owner's decision).
- Site architecture (owner's decision): the Mumbai map is the fixed background of the whole site; scrolling only changes what the left-hand island shows. Sections are added as island pages. The one exception is the work (owner's request, 2026-09-29): as the Projects page arrives the camera pulls back over Bandra and pins each project; opening one brings the camera down onto it while its row lifts into the case study.
- Sections (owner's decision): after the landing page, the island carries About us, Projects, Team, and a Contact us form, in that order. Their content is still to be designed; the pages carry draft copy built only from this file.
- "Explore the work" goes to Projects, which lists the owner's three projects (components/projects/work.ts). Each opens a case study; what was made for each is still to come.
- The case-study motion is the App Store's Today card (owner's choice, 2026-09-29, over a Maps-style navigation push and the island folding back into its pill).
- Scrolling turns the island's pages like an iPhone widget stack (owner's choice of motion, over a Dynamic-Island "breath" and a liquid-glass split).

## Brand Commitments

- Name: CarterLabs (wordmark set as CARTERLABS).
- Palette: blood red and black (owner-pinned).
- Typography: Edwardian Script ITC and Onyx (owner-pinned), mixed with a bold, high-energy display face. The Monotype fonts are used only when installed locally; visitors without them get free look-alikes (owner's decision; no web licence yet).
- Voice: calm, confident, slightly mysterious. Never loud, flashy or over-designed.

## Evidence on Hand

Three projects, supplied by the owner: Third Entity (clothing brand, Hill Road), Vakratunda Vedantaa (real estate tower, Kher Nagar) and Goancho (Pali Hill; Cafe Goancho, a Goan café at Pali Bazaar, per its public listings). The exact buildings for Third Entity and Vakratunda Vedantaa are not confirmed, so their pins sit on the street and neighbourhood and their distances read as approximate. What was made for each, results, testimonials, metrics and awards have not been supplied. Do not invent any.

The team (owner-supplied): three people, a design head, a frontend engineer and a backend and framework engineer, titled Design Director, Frontend Lead and Systems Architect (owner's choice). Their names and portrait clips are still to come. The Team page presents them as a matchday line-up (owner's choice, "The Walkout", over a picker-wheel team sheet and a one-at-a-time tunnel).

## Product Principles

1. Intentional over impressive: every motion and element must earn its place.
2. Rooted in a real place: Bandra and Mumbai are shown as real geography, not decoration.
3. Established, not emerging: nothing may read as a template or a beginner portfolio.
4. Restraint is the premium signal: fewer, better moments.

## Accessibility & Inclusion

Honor `prefers-reduced-motion` (skip the cinematic sequence). The skip control and CTA must be keyboard reachable. The descent flies from the keyboard too: Space or ↓ to dive, ↑ to climb, Esc to skip.
