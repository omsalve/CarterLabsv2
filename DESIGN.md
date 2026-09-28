---
name: CarterLabs
description: Built in Bandra, designed for impact. A night survey of a real city, carried by one island of liquid glass.
colors:
  void: "#000000"
  ink: "#070606"
  bone: "#ede6de"
  bone-soft: "rgb(237 230 222 / 0.72)"
  ash: "#948a84"
  hairline: "rgb(237 230 222 / 0.1)"
  blood: "#8a0c12"
  blood-deep: "#5c070b"
  blood-lit: "#c4202a"
  glass-fill: "rgb(255 255 255 / 0.045)"
  glass-raised: "rgb(255 255 255 / 0.07)"
  glass-edge: "rgb(255 255 255 / 0.08)"
  glass-highlight: "rgb(255 255 255 / 0.12)"
  glass-rim: "rgb(255 255 255 / 0.16)"
  map-ground: "#0d0a0a"
  map-water: "#030304"
  map-vein: "#6e0e14"
  map-building: "#1c1616"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11.05cqi"
    fontWeight: 900
    lineHeight: 0.86
    letterSpacing: "-0.02em"
    fontVariation: "\"wdth\" 125"
  headline:
    fontFamily: "CL Onyx, Onyx, Oranienbaum, Times New Roman, serif"
    fontSize: "clamp(2.4rem, 5.2vw, 4.75rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.015em"
  statement:
    fontFamily: "CL Onyx, Onyx, Oranienbaum, Times New Roman, serif"
    fontSize: "clamp(1.8rem, 2.6vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "0.01em"
  title:
    fontFamily: "CL Onyx, Onyx, Oranienbaum, Times New Roman, serif"
    fontSize: "clamp(1.4rem, 1.9vw, 1.9rem)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "0.01em"
  script:
    fontFamily: "CL Edwardian, Edwardian Script ITC, Pinyon Script, cursive"
    fontSize: "1.75em"
    fontWeight: 400
    lineHeight: 0.5
  place:
    fontFamily: "CL Onyx, Onyx, Oranienbaum, Times New Roman, serif"
    fontSize: "clamp(1.1rem, 1.5vw, 1.5rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.28em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.975rem"
    fontWeight: 400
    lineHeight: 1.6
  button:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    letterSpacing: "-0.005em"
  ui:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "0.005em"
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.01em"
  measure:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    letterSpacing: "0.12em"
    fontFeature: "\"tnum\""
  fine:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 400
    letterSpacing: "0.06em"
rounded:
  capsule: "999px"
  island: "40px"
  platter: "32px"
  control: "15px"
  cut: "14px"
  tag: "0.3em"
spacing:
  edge: "clamp(18px, 2.4vw, 36px)"
  island-pad: "32px"
  island-pad-compact: "22px"
  concentric-inset: "8px"
  leader: "clamp(28px, 3.4vw, 52px)"
components:
  button-primary:
    backgroundColor: "{colors.blood}"
    textColor: "{colors.bone}"
    typography: "{typography.button}"
    rounded: "{rounded.capsule}"
    height: "50px"
    padding: "0 8px 0 22px"
  island:
    textColor: "{colors.bone}"
    rounded: "{rounded.island}"
    padding: "{spacing.island-pad}"
    width: "clamp(380px, 42vw, 560px)"
  island-status:
    textColor: "{colors.bone}"
    typography: "{typography.ui}"
    rounded: "{rounded.capsule}"
    height: "44px"
  platter:
    backgroundColor: "{colors.glass-fill}"
    textColor: "{colors.bone}"
    rounded: "{rounded.platter}"
    padding: "12px 18px 12px 12px"
  page-control:
    rounded: "{rounded.control}"
    width: "30px"
  skip-control:
    backgroundColor: "{colors.glass-fill}"
    textColor: "{colors.bone-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.capsule}"
    padding: "10px 16px 11px"
---

# Design System: CarterLabs

## Overview

**Creative North Star: "The Night Survey, seen through glass"**

CarterLabs presents itself the way a surveyor sees a city at night: from altitude, in near-darkness, with only the structure that matters picked out. The ground is almost black. Mumbai's arteries are traced in a dim blood red, its hills in red contour lines from real elevation data, and Bandra's coast in bone-white surf that moves. Carter Road itself burns in Lit Blood, dissolving into the street at both ends. Every mark on the map comes from OpenStreetMap or the terrain model. The map is the ground of the whole site: it never scrolls away.

The visitor gets there by flying: after one line of type, the city appears with a lock-on reticle over Carter Road, and they hold, tap, scroll or swipe their way down to it.

Over it floats one object: the island, a slab of liquid glass that carries all the content. It bends the map at its rim, frosts it in its body, and catches light on its edge from wherever the pointer is. It arrives as a Dynamic-Island pill (a live status: place and Mumbai time), springs open, and reshapes itself to fit each page as the visitor scrolls. The map is the world; the island is the instrument you read it through.

Type carries the emotion. A tall condensed Didone (Onyx) speaks, a copperplate script (Edwardian) signs the word a sentence turns on, and a wide black grotesk (Archivo Expanded) says the name. Everything the hand touches, such as buttons, status and addresses, speaks the platform's quiet sentence-case sans (Geist). Measurements are set in a small tracked mono.

**Key Characteristics:**
- A fixed, living map as the only background; scroll changes the island, and moves the world only for the work (The Survey).
- One liquid-glass island: refraction at the rim, frost in the body, pointer-lit specular edge, soft shadow.
- Continuous corners and concentric insets; capsules for every control.
- Blood red reserved for the story's turning points: the script word, the studio pin and Carter Road, the one action.
- Motion as physics: springs for geometry, exponential ease-out for content.

## Colors

A restrained palette: black and bone carry almost everything, glass is expressed as light (whites at low alpha) rather than colour, and one blood red appears at deliberate moments.

### Primary
- **Blood** (#8a0c12): the single action colour, the base of the primary capsule's gradient and text selection. It never tints large areas.
- **Lit Blood** (#c4202a): blood red raised for legibility on black. Used for script words, the live status dot, the studio pin and the lit Carter Road, always at display size or as a light source.
- **Deep Blood** (#5c070b): the pressed and lower end of the primary capsule, and the scrollbar thumb.

### Neutral
- **Void** (#000000): the stage before the map exists.
- **Ink** (#070606): the base neutral.
- **Bone** (#ede6de): primary text. Warm, never pure white.
- **Soft Bone** (bone at 72%): supporting prose and secondary status text.
- **Ash** (#948a84): measurements, attribution. Clears 4.5:1 on the ground; don't dim it further.
- **Hairline** (bone at 10%): map-layer rules such as the scale bar.

### Glass light
The glass has no colour of its own; it is built from light on the map beneath.
- **Glass Fill** (white at 4.5%): platters and small capsules sitting on or near the glass.
- **Glass Raised** (white at 7%): icon wells inside platters.
- **Glass Edge** (white at 8%): the inner 1px edge of capsules.
- **Glass Highlight** (white at 12%): top inner highlight on icon wells.
- **Glass Rim** (white at 16%): the top inner highlight of CSS-fallback glass.

### Named Rules
**The Turning-Point Rule.** Blood red marks where the story turns: the script word, the live dot, the studio pin (with Carter Road, which is the same place drawn as a line), the single primary action. If two red things compete on one screen, one of them is wrong. While a case study is open the red is the project's: its pin takes it, and the studio pin and Carter Road step back (desaturated, dimmed) for as long as it is open.

**The Glass Is Light Rule.** Glass is never filled with a colour. Its presence comes from refraction, frost, rim light and shadow; any tint is darkness for legibility, never hue.

## Typography

**Display Font:** Archivo, extended width (wdth 125), weight 900
**Voice Font:** Onyx (visitors without it get Oranienbaum)
**Script Font:** Edwardian Script ITC (visitors without it get Pinyon Script)
**Interface Font:** Geist
**Measure Font:** Geist Mono

**Character:** A quiet, tall Didone narrates, a copperplate hand signs the key words, and one very wide black grotesk says the name. Around them, the interface speaks like a phone OS: sentence case, medium weight, small and calm. Onyx and Edwardian are referenced with `local()` only (as `CL Onyx` and `CL Edwardian`; no web licence yet). Their fallbacks keep the same silhouette.

### Hierarchy
- **Display** (900, 11.05cqi of the island page, 0.86): the CARTERLABS wordmark only, sized to fill the island's inner width.
- **Headline** (Onyx, clamp(2.4rem, 5.2vw, 4.75rem), 1): single cinematic lines on black.
- **Statement** (Onyx, clamp(1.8rem, 2.6vw, 2.5rem), 1.08, balanced): the line a section page opens on, as the first page opens on the wordmark.
- **Title** (Onyx, clamp(1.4rem, 1.9vw, 1.9rem), 1.15): statements inside the island.
- **Script** (Edwardian, 1.62–1.75em of its line, Lit Blood): one word inside a Headline, Statement or Title.
- **Place** (Onyx, uppercase, 0.28em tracking): map callouts and the pin name.
- **Body** (Geist 400, 0.975rem, 1.6, max 36ch): island prose.
- **Button** (Geist 600, 0.9375rem, sentence case): capsule labels.
- **UI** (Geist 500, 0.8125rem): the status row and platter titles.
- **Label** (Geist 500, 0.75rem): small capsules such as Skip intro.
- **Measure** (Geist Mono, 0.6875rem, 0.12em tracking, tabular): coordinates, altitude, scale.
- **Fine** (Geist, 0.625rem): attribution only.

### Named Rules
**The Signature Rule.** Script appears inside a line of Onyx, in Lit Blood, on the word the sentence turns on. Never set script alone, in bone, or at body size.

**The Two Registers Rule.** Brand faces (Onyx, Edwardian, Archivo) say things; Geist does things. Controls, status and addresses are always Geist, in sentence case.

**The Measure Rule.** Mono is only for numbers that measure something real. It is never used for flavour.

## Layout

Two planes. The **stage** is fixed and fills the viewport: the map, grain, callouts, HUD, the intro line and the attribution. It ignores pointer events so wheel and touch fall through. The **island** floats above it. The document itself never scrolls: once landed, the island's stack takes the wheel, swipes and keys and turns its pages (see The Stack). Native scroll and CSS snapping were both set aside because they hand the timing curve to the browser, and a page turn must track the gesture and settle on a spring.

**Desktop:** the island rests at the left, `clamp(24px, 4.5vw, 80px)` in, `clamp(380px, 42vw, 560px)` wide, vertically centred (never above 96px, to clear the HUD). A vertical page control floats 14px to its right when there is more than one page, in its own small glass. The map camera is padded by the island's right edge, so the studio pin always lands in open map.

**Compact (below 760px):** the island is inset 10px from the sides and bottom, full width, and grows upward. The page control lies across the middle of its status row, shown only while the stack moves. The camera pads by its height, the scale bar and altitude drop out, and the attribution moves under the top HUD.

HUD chrome sits in the corners at the fluid `spacing.edge` inset. Callouts hang from their exact coordinate with a dot, a `spacing.leader` hairline and text to one side.

## Elevation & Depth

Depth comes from the world and from one material. The world: camera pitch up to 60°, extruded buildings, hillshade, and cursor parallax (the camera moves ±2.6° in bearing and ±2.2° in pitch, the island −7/−5px). The material: liquid glass, rendered in the map's own WebGL pass after the map and its atmosphere (vignette and horizon haze) have drawn:

- **Rim lens:** within 30px of the edge, the glass samples outward along its normal (cubic falloff), dragging what lies beyond the edge into the rim.
- **Frost:** a 15px mip-based blur, with the body magnified to 97.2%.
- **Dispersion:** red and blue sampled ±7% apart in the rim only.
- **Smoke:** a 30% darkening toward ink with a small lift, so text reads without the glass going flat.
- **Light:** a 1.6px specular rim brightest where the edge faces the light, an echo on the far edge, a faint inner glow and a top sheen. The light follows the pointer.
- **Shadow:** a lowered, softened copy of the shape (26px down, 70px soft) plus a tight contact shadow.

Without WebGL, or on a GPU that can't read the map back, the island falls back to `backdrop-filter: blur(24px) saturate(160%)` with an inset rim and a soft drop shadow.

### Shadow Vocabulary
- **Glass shadow** (drawn in GL: offset 26px, softness 70px, 50%): the island and page control.
- **Capsule seat** (`box-shadow: 0 14px 30px -16px rgb(0 0 0 / 0.95)`): the primary capsule.
- **Legibility halo** (`text-shadow: 0 0 14px rgb(0 0 0 / 0.95), 0 0 3px rgb(0 0 0 / 0.9)`): callout and pin text over busy map.

### Named Rules
**The One Glass Rule.** There is one piece of liquid glass on screen, plus its page control. Content inside it does not become glass again. Platters are light on glass, not glass on glass.

**The Black Shadow Rule.** Shadows are black and fall downward. The only red light is the pin, Carter Road and the live dot.

## Shapes

Continuous corners, concentric everywhere. The island's radius is 40px. Anything inset inside it takes the island's radius minus the inset: the address platter sits 8px in, so it is 32px. Controls are capsules. The pill state is the same island at 44px tall, so its radius is 22px. The page control is 30px wide with a 15px radius. When one platter is cut into cards (the Team page's lineup), its outer corners stay concentric at 32px and the corners at each cut are 14px. The GL glass uses a superellipse corner (exponent 2.7) rather than a circular arc, which gives the Apple-style continuous curve.

The map layer keeps its own language: hairline leaders, 6px dots and an open-bracket scale bar, all unrounded.

## Components

### Island
The site's single container.
- **States:** hidden, then a pill (status only, 44px), then open. Geometry is driven by damped springs (response 0.6s, damping 0.76–0.8) on x, y, width and height. As it stretches taller it draws in slightly at the sides (the liquid squash).
- **Status row:** a Lit Blood live dot with a breathing halo, the place ("Bandra, Mumbai") on the left and Mumbai time on the right, in the UI style. The row grows its padding and drops 12px as the island opens.
- **Pages:** laid out at the resting width, so they measure true while the glass is still a pill. On first opening, the page's children rise 12px out of an 8px blur with a 40–500ms stagger, and the wordmark rises out of its own mask. After that, pages change by turning the stack. A page that ends on a platter keeps it 8px in; one that ends on text or a control keeps 32px below, as beside it. Anything else set 8px in (the lineup) is marked `data-concentric` to keep it so.
- **Once open**, the geometry springs quicken (response 0.32s, damping 0.84) so the glass keeps close company with the stack while staying liquid.

### Buttons
- **Primary capsule:** 50px tall, a Blood gradient (#b5161f → #8e0c13 → #7a0a10) with a 1px top highlight and a lower shade. Sentence-case Button label, followed by a 34px dark well holding a 1.6px-stroke arrow.
- **Hover:** brightens 12% and the arrow slides 2px.
- **Press:** scales to 96.5% in 120ms.
- **Focus:** a 2px Bone outline offset 3px.
- **Small capsule (Skip intro):** Glass Fill with a Glass Edge ring and a 12px backdrop blur. A 1px progress line fills along its lower edge as the visitor descends.
- **Hint capsule:** the same small capsule, centred at the foot of the city view: "Hold to descend" ("Hold or swipe up" on touch) with the secondary words in Ash, led by a 16px ring whose core presses in and flushes Lit Blood. It appears 1.4s after the city and leaves once the visitor has moved.

### Platter
Light on glass for facts that belong together, such as the studio address. Concentric (32px radius, 8px inset), Glass Fill with a hairline inner ring, a 36px circular icon well in Glass Raised, a title in the UI style and a meta line in Measure.

### Grouped List
A platter holding rows that belong together, like an iOS inset grouped list, such as the About page's beliefs. Concentric (32px radius, 8px inset), Glass Fill with a hairline inner ring, 6px padding top and bottom. Each row sets a semibold Body-size title in Bone over one Soft Bone line at 0.9375rem, both on the page's text column; rows are parted by Hairline rules that start and end on that column, never full width.

### Page Control
A vertical glass capsule (30px wide) floating right of the island, only when there is more than one page. Dots are 6px at 32% bone. The knob is an 8px bone dot that follows the stack position exactly, and at speed pulls out into a capsule (up to 18px) like a drop running between the dots. Each dot is a tab that turns the stack to its page; arrow keys move the selection and the focus together. On compact screens there is no room beside the island, so the control turns on its side and its dots (12px apart) lie centred in the gap between the place and the time, first page on the left, like an iPhone's page dots: light on the glass, shown while the stack moves and for 1.4s after, and briefly on arrival to say there is more.

### Field
Platters you can type in, for forms inside the island. The field spans 8px in from the island edge (so a 48px capsule, or a 32px radius when multi-line) and its text and label sit on the page's text column. Glass Fill with a hairline inner ring; Label-style caption above in Soft Bone; placeholder in Ash; 16px text so iOS never zooms; caret in Lit Blood; focus raises the fill and turns the ring to 45% bone.

### Map Callout (signature)
A place name hung from its true coordinate: dot, hairline leader, Place-style name, Measure-style coordinates. It enters dot, then leader, then text, and exits farthest first.

### Studio Pin (signature)
The one red point on the map: an 8px Lit Blood dot with a slow pulse ring and a vertical hairline leader, labelled "Carter Road" in Place style and "The studio" in script. While the thread holds it (below), it swells up to 1.6× and its glow widens, like a selected pin in Maps.

### The Thread (signature)
The About page reaches out of the glass: a hairline runs from its script word ("place.") to the studio pin, so the page points at the real place. Any page element marked `data-thread` gets one; Island.tsx draws it in a fixed SVG above the island.
- **Route:** on desktop it leaves the word level, crosses the glass edge, and eases into the pin from the left. On compact screens it runs along the line, climbs the island's right margin (18px in, turning on a 14px radius), leaves the top edge, and enters the pin from below, running on into the pin's own stem. When the pin is hidden or too close to the glass (under 28px clear), there is no thread.
- **Stroke:** 1.25px, Bone at 62% warming to Lit Blood where it meets the pin (it links two red points, so it is one gesture, not a third red), over a 4px black under-stroke for legibility on busy map.
- **Motion:** how far it has drawn follows how much of its page is showing, from 35% up, through its own critically damped spring (0.9s out, 0.38s back). So it scrubs with the stack but trails it like a cable. A bone bead with a soft glow leads the draw and fades as it touches down; the pin swells over the last 14%. When the page recedes upward, its word slips under the status row almost at once, so the page lets go: the thread keeps its last shape and reels into the pin (0.42s), the bead trailing. Brought back, the page takes up a fresh thread.
- **Reduced motion:** nothing draws; the finished thread cross-fades with its page and the pin only half swells.

### Carter Road (signature)
The road the studio sits on, drawn from the OSM centreline between its two carriageways: a Lit Blood core over a blurred glow at half strength, under the buildings so the city still stands in front of it. It lights outward from the studio toward both ends as the camera comes down, its leading edges running hot (toward a pale blood-pink) while they draw, and the last fifth of each end always dissolves into the street, so it never stops on a hard edge. It stays lit once the visitor has landed. OSM's own "Carter Road" street label is suppressed, since the pin names it.

### The Stack (signature)
The island's pages turn like an iPhone widget stack. They sit on one vertical strip behind the glass, 28px apart: the page above has receded into the frost, the next waits below the lower edge. Everything (the strip, the glass's height, the page-control knob) is drawn from a single number, the stack position, so a turn can be scrubbed, held, reversed or caught mid-flight. It never comes to rest between pages.
- **Leaving (upward):** the page rides the strip up at 1:1, shrinks back to 94% from its top edge, blurs to 10px and fades, and dissolves under the status row rather than touching it.
- **Arriving (from below):** the page rises on the strip with its lines 20% further apart than at rest, closing up as it lands (the stack settling). It is soft (6px) only as it crosses the lower edge and sharp by halfway, so what is under the finger can be read.
- **Scroll-edge effect:** while the stack moves, the body gets a 30px dissolve under the status row and 26px along the lower edge. At rest both are zero.
- **Glass:** its height runs between the two pages' heights; the liquid squash comes from the speed of that change. Past either end, the stack gives up to 0.3 of a page on iOS's rubber-band curve and the glass stretches with it like a gel, then springs back.
- **Touch and pen:** 8px of slop, then the strip tracks the finger 1:1. On release, 0.16s of velocity is projected; a flick faster than 0.5 pages/s turns the page in its direction, and a pause over 90ms before letting go spends the fling. One page per gesture. A touch catches a moving stack.
- **Trackpad:** scrubs the strip, then settles when the events pause (140ms), turning if it travelled a tenth of a page. Reaching the next page turns it at once, and the rest of that swipe, its acceleration and momentum included, is spent. A new swipe counts once the deltas climb again after the old momentum has died down.
- **Mouse wheel:** one notch, one page (once the previous turn is two-thirds done).
- **Keys:** Down, Page Down and Space turn forward; Up, Page Up and Shift+Space back; Home and End go to the ends. Never while typing, and Space still presses a focused button.
- **Links:** any `#id` link to a page turns the stack to it; so does the page's hash on arrival. The island clips with `overflow: clip`, so the browser's own jump to that hash can't scroll the island's box.
- **Page offset:** every page carries `--page-offset`, where it sits on the stack (+1 waiting below, 0 on stage, −1 gone above), written as the stack moves. What a page holds can ride the turn with it (see The Lineup).
- **Settle:** a spring (response 0.5s, damping 0.86), a little longer for multi-page jumps, carrying the gesture's release velocity. A push against either end kicks the stack past it and back.
- **Reduced motion:** nothing travels, scales or blurs; the two pages cross-fade (the leaving page gone by halfway, the arriving one in from halfway) on a critically damped 0.34s spring, and the glass still changes height.

### The Lineup (signature)
The Team page introduces the studio like a matchday line-up: "The starting three." Three portrait cards, one platter cut into three (8px in, 32px outer corners, 14px at the cuts, 6px apart), each a dark window in the glass: the tunnel. Lineup order is left to right, and each card carries a shirt number for the position the role plays: 10 (Design Director, the playmaker, with the captain's tag), 7 (Frontend Lead, the one on show), 4 (Systems Architect, holding the shape at the back). The data lives in `components/lineup/team.ts`.
- **Card, back to front:** a Bone backlight behind where the player stands; the shirt number in Onyx at 108% of the card's width, Bone at 20%; the player; a black scrim over the lower half; the role (or the name, once given, with the role under it) in bold Title at 10% of the card's width, the captain's C as a small Bone tag after it; then the light. With a matte (footage with a transparent background), the player stands in front of the number, like the Lock Screen depth effect. Without one, the number is printed over the footage in overlay. Footage is set in warm monochrome (grayscale, a touch of sepia), like the map.
- **The deal (scrubbed):** as the page rises from below, the cards come off one deck: the side cards start under the middle one, fanned 5°, 10px lower and 6% smaller, and deal out to their places as `--page-offset` runs from 0.9 to 0.1, through a quick spring (0.34s, 0.8) so they settle with a little life. A swipe scrubs, holds or takes back the deal. Arriving from above, the cards are already dealt.
- **The walkout (sprung):** once the page has the stage (offset under 0.5), the players walk out one by one, 160ms in and 320ms apart, each on its own spring (0.62s, 0.8). The number rises out of the floor of the card, the backlight comes up, the player steps forward (12% lower, 106% and 7px soft to rest; footage also comes up out of the dark, from 8% brightness) and their clip starts, the name is written in left to right, the role settles under it, and one pass of light (a 104° specular band) crosses the card. Leaving mid-walkout, nobody else comes out, and those out stay lit as the page recedes. Once the page is fully off the stack, the tunnel resets and the lineup walks out again next time.
- **Clips:** a 2–3s clip (the broadcast turn to camera) plays once as its player steps out and holds on its last frame; hovering or tapping the card plays it again, and `loop` makes it a seamless loop instead. Muted, inline, never in a hidden tab, and never at all under reduced motion (the poster shows). Alpha footage is VP9 WebM for Chrome, Edge and Firefox, HEVC for Safari. With no media, a backlit stand-in holds the place: a head-and-shoulders figure, arms crossed, only its outline catching the light.
- **Tilt (fine pointers):** the card leans under the pointer like an Apple TV poster (7° across, 5° up and down, lifting 2.2%), its layers parting in depth: the number moves against the tilt, the player and the name with it, and a soft highlight sits where the light would catch. A touch lifts the card under the finger, and lets go if the finger moves off to turn the page.
- **Reduced motion:** no deal and no tilt. The number, the player and the name come up in place together, on a critically damped 0.34s spring.

### The Survey (signature)
The Projects page is the one place the world moves. The hero's camera answers to the page (`scene.survey`, written by components/projects): everything is a pure function of three values, so it scrubs with the stack, a swipe or a spring.
- **Pull back:** as the page rises (its stack presence), the camera lifts off Carter Road until the studio and all the work fit beside the glass (pitch 42°, the landing's bearing), zooming about the studio so it glides rather than slides. The HUD reads the real altitude as it climbs.
- **Come down:** as a case opens (`focus`), the camera comes down onto the project (zoom 16.2–16.7, pitch 56–62°, each its own bearing), zooming about the project. Up close the project sits a little low in the open map, under its name; on a phone, a little left too.
- **Fly:** between cases (`hop`) it flies pin to pin on van Wijk's path (MapLibre's flyTo), rising while it crosses.
- The pointer's parallax rides on top. Bandra's callout steps aside over the survey.
- **Reduced motion:** each move is a cut at halfway.

### Project Pins (signature)
The work, pinned: a 6px bone dot on the exact coordinate, a hairline stem up to a 24px numbered disc (the row's number), and the name in Place style with the kind in UI beside it, shown on hover and while its case is open. Each pin drops as its row lands on the page (the dot, the stem drawing up, the disc landing on a spring with a little give, one ring sent out), and lifts off in reverse as the page leaves. Hovering a pin lights its row, and hovering or focusing a row lights its pin (the disc turns bone). Pressing a pin opens its case, or flies there from the one that is open. While a case is open its pin swells 1.28× and takes Lit Blood; the others dim. A name reads to the right unless only the left has room.

### The Card (signature)
A row on the Projects page lifts into its case study like a card on the App Store's Today tab, on one spring (`focus`, response 0.56s, damping 0.84): the row's own light rises out from under it and grows to the glass's edges (8px in, 32px radius) as a black shadow falls under it, then lets go as the case lands. The row's number, name and kind fly to the case's header, scaling up as they go (the row's parts fade as the case's own take over along the same path). The other rows part from it, shrink back and sink into the frost; the back capsule, the facts and "Next project" rise in behind, their lines closing up. The glass grows with it, and the camera comes down on the same spring.
- **Back:** the "Projects" capsule, Esc, or a swipe to the right (a finger, or two on a trackpad), which takes the card back under the finger, camera rising with it. Let go past halfway (or flick) and it closes, carrying the release velocity.
- **Next project** turns the case over like a page of the stack while the camera flies to the next pin.
- A case left open when the page leaves the stack is back in its row next time.
- **Reduced motion:** nothing travels; the list and the case cross-fade in place.

### The Descent (signature)
The city survey is flown by the visitor, not played at them. Progress runs 0 (the city) to 1 (Carter Road); zoom is linear in it, the landing's centre stays pinned to a point that glides to its final place on screen, and pitch and bearing ramp in over the second half.
- **Hold** (pointer, Space or ↓) dives, accelerating the longer it is held; a tap drops a little straight away. ↑ climbs.
- **Wheel and swipe** scrub either way; a swipe carries its release velocity on. Above the city the goal springs back like pulling past the top of a list.
- A critically damped spring (0.42s) turns all input into motion, so every gesture reads as physical.
- **Speed** widens the vertical field of view (up to +12° once pitched) and closes a black vignette over the frame's edges.
- **Reticle:** four 11px hairline brackets over the studio, closing from 42px to 24px as the visitor descends, labelled "Carter Road" in Place style with the live altitude in Measure. Past 90% the camera lands itself: the brackets snap in and turn Lit Blood, and phones get a 12ms haptic tick.
- **Cursor:** on fine pointers the system cursor gives way to a 34px bone ring with a 4px core, which tightens and glows Lit Blood while held.
- **Autopilot:** after 5.5s without input the camera takes the stick and flies down on its own, so no one is left stranded.
- District callouts let go as the visitor drops through them; Bandra's name hands over to the reticle and returns on landing.

## Do's and Don'ts

### Do:
- **Do** keep the map fixed; new sections are new island pages (`components/island/pages.tsx`), never new scrolling panels. Only the Projects page moves the camera, and only through `scene.survey`.
- **Do** keep radii concentric: inner radius = island radius (40px) minus the inset.
- **Do** use capsules for every control, and set their labels in Geist sentence case.
- **Do** animate geometry with springs and content with exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **Do** drive every page change through the stack position; never swap pages on a timer or a scroll threshold.
- **Do** credit the map: © OpenStreetMap, OpenFreeMap, Mapzen terrain.
- **Do** honour `prefers-reduced-motion`: the island appears open over the landed frame, Carter Road already lit, and the surf and parallax are still.
- **Do** keep the opening line to about 4 seconds; everything after it belongs to the visitor.

### Don't:
- **Don't** nest glass in glass or put square cards inside the island.
- **Don't** colour the glass; tint is darkness for legibility, never hue.
- **Don't** use bezier overshoot or bounce easing; the springs already carry the life.
- **Don't** set Edwardian or Onyx at body sizes, or script in bone.
- **Don't** add eyebrows or kickers above headings.
- **Don't** use cool greys or blue-blacks for neutrals.
