import type { CustomLayerInterface, Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { GlassLayer } from "../island/glass-layer";

/**
 * The map, taken apart into its layers for the teardown (Teardown.tsx).
 *
 * Invisible custom layers ("taps") sit between groups of the map's own layers, one
 * at the end of each slice. Idle, they do nothing. To lift one slice out of a frame,
 * the tap before it clears the frame to transparent and the tap after it copies the
 * frame into a texture, so the texture holds that slice alone; a presenter drawn
 * after everything else (the glass included) puts the texture back on screen. The
 * canvas is read with drawImage in the same task, straight after a synchronous
 * redraw. Nothing in the style changes, so no tiles reload and the map never shows
 * a half-built frame.
 *
 * The opaque pass draws the ground's fills before any tap runs, and the sky before
 * that, so both land in the first slice. Depth still resolves as it does on screen:
 * clearing colour leaves the depth buffer alone, so the relief stays hidden under
 * the water that covers it.
 */

/** Bottom to top, in the order the map draws them. */
export const SLICES = [
  "ground", // the sky and the ground's fills (land, parks, airfield, water)
  "relief", // hillshade
  "edges", // the water's and the airfield's anti-aliased edges
  "coast",
  "contours", // with the survey grid
  "surf",
  "streets", // runways, roads, rail and the arterial veins
  "carter",
  "buildings",
  "names", // the map's own labels (and the work's landmarks, when raised)
] as const;
export type Slice = (typeof SLICES)[number];

/** Each slice ends just before this layer (map-style.ts; the surf and the glass are Hero's). */
const ENDS_BEFORE: Record<Slice, string> = {
  ground: "relief",
  relief: "airfield",
  edges: "coast-glow",
  coast: "grid",
  contours: "surf",
  surf: "runways",
  streets: "carter-glow",
  carter: "work-glow",
  buildings: "sea-name",
  names: "glass",
};

/** What the map was showing when it was taken apart, measured from what it drew. */
export type Facts = {
  /** metres on the ground per metre on screen, at the centre (one CSS pixel is 1/96 in) */
  scale: number;
  /** the contour lines in view: their interval and the highest one, in metres */
  contours: { step: number; top: number } | null;
  /** road, rail and runway segments drawn (the tiles merge buildings into blocks, so they aren't counted) */
  roads: number;
  /** distinct names the map placed */
  names: number;
};

export type Layers = {
  /** the frame, in CSS pixels, that every canvas covers */
  w: number;
  h: number;
  slices: Record<Slice, HTMLCanvasElement>;
  /** the vignette and the horizon haze, alone */
  atmosphere: HTMLCanvasElement;
  /** the glass and its shadow, alone; null where the glass is CSS */
  glass: HTMLCanvasElement | null;
  facts: Facts;
};

export type LayerSource = {
  /** every slice of the frame on screen, each on its own canvas; null if the map can't be taken apart */
  capture(): Layers | null;
  /**
   * draw `slice` alone into `into` every frame the map draws (the surf keeps breaking),
   * `gain` times as bright; or stop, with null
   */
  live(slice: Slice | null, into?: HTMLCanvasElement, gain?: number): void;
};

const BLIT_VERT = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const BLIT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_frame;
out vec4 fragColor;
void main() {
  fragColor = texelFetch(u_frame, ivec2(gl_FragCoord.xy), 0);
}`;

function program(gl: WebGL2RenderingContext) {
  const p = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, BLIT_VERT],
    [gl.FRAGMENT_SHADER, BLIT_FRAG],
  ] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`teardown shader: ${gl.getShaderInfoLog(sh)}`);
    gl.attachShader(p, sh);
  }
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`teardown program: ${gl.getProgramInfoLog(p)}`);
  return p;
}

/** Adds the taps and the presenter to the map (after the surf and the glass are in). */
export function installLayers(map: MapLibreMap, glass: GlassLayer | null): LayerSource | null {
  if (!Object.values(ENDS_BEFORE).every((id) => map.getLayer(id))) return null;

  // which tap clears the frame, which one copies it, and whether the presenter shows the copy
  let clearAt = -1;
  let copyAt = -1;
  let present = false;
  const set = (clear: number, copy: number, show: boolean) => {
    clearAt = clear;
    copyAt = copy;
    present = show;
  };

  let blit: WebGLProgram | null = null;
  let uFrame: WebGLUniformLocation | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  let texW = 0;
  let texH = 0;

  const copy = (gl: WebGL2RenderingContext) => {
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    gl.activeTexture(gl.TEXTURE0);
    if (!texture || texW !== W || texH !== H) {
      if (texture) gl.deleteTexture(texture);
      texture = gl.createTexture();
      texW = W;
      texH = H;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);
  };

  const wipe = (gl: WebGL2RenderingContext) => {
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };

  const taps: CustomLayerInterface[] = SLICES.map((slice, j) => ({
    id: `teardown-${slice}`,
    type: "custom",
    renderingMode: "2d",
    render(gl) {
      if (copyAt === j) copy(gl as WebGL2RenderingContext);
      if (clearAt === j) wipe(gl as WebGL2RenderingContext);
    },
  }));

  const presenter: CustomLayerInterface = {
    id: "teardown-present",
    type: "custom",
    renderingMode: "2d",
    onAdd(_m, context) {
      const gl = context as WebGL2RenderingContext;
      try {
        blit = program(gl);
      } catch (err) {
        console.warn("[teardown]", err);
        return;
      }
      uFrame = gl.getUniformLocation(blit, "u_frame");
      buffer = gl.createBuffer();
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    },
    onRemove(_m, context) {
      const gl = context as WebGL2RenderingContext;
      if (blit) gl.deleteProgram(blit);
      if (vao) gl.deleteVertexArray(vao);
      if (buffer) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      blit = null;
    },
    render(context) {
      if (!present || !texture || !blit) return;
      const gl = context as WebGL2RenderingContext;
      gl.viewport(0, 0, texW, texH);
      for (const cap of [gl.BLEND, gl.DEPTH_TEST, gl.STENCIL_TEST, gl.SCISSOR_TEST, gl.CULL_FACE]) gl.disable(cap);
      gl.colorMask(true, true, true, true);
      gl.useProgram(blit);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uFrame, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    },
  };

  SLICES.forEach((slice, j) => map.addLayer(taps[j], ENDS_BEFORE[slice]));
  map.addLayer(presenter);

  let onRender: (() => void) | null = null;

  return {
    capture() {
      if (!blit) return null;
      const canvas = map.getCanvas();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 2 || h < 2) return null;
      // the planes are seen shrunk back, so they needn't be sharper than 1.5×
      const k = Math.min(canvas.width / w, Math.max(1, Math.min(window.devicePixelRatio || 1, 1.5)));
      const grab = () => {
        const c = document.createElement("canvas");
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        c.getContext("2d")!.drawImage(canvas, 0, 0, c.width, c.height);
        return c;
      };

      const facts = measure(map);
      const slices = {} as Record<Slice, HTMLCanvasElement>;
      let atmosphere: HTMLCanvasElement;
      let plate: HTMLCanvasElement | null = null;
      glass?.capture("mute");
      try {
        SLICES.forEach((slice, j) => {
          set(j - 1, j, true);
          map.redraw();
          slices[slice] = grab();
        });
        // the atmosphere is the glass layer's first pass: clear everything the map drew, then let it draw only that
        set(SLICES.length - 1, -1, false);
        glass?.capture("atmosphere");
        map.redraw();
        atmosphere = grab();
        if (glass?.status === "ok") {
          set(-1, -1, false);
          glass.capture("isolate");
          map.redraw();
          plate = grab();
        }
      } finally {
        set(-1, -1, false);
        glass?.capture("off");
        map.redraw();
      }
      return { w, h, slices, atmosphere, glass: plate, facts };
    },

    live(slice, into, gain = 1) {
      if (onRender) map.off("render", onRender);
      onRender = null;
      if (!slice || !into) {
        set(-1, -1, false);
        glass?.capture("off");
        map.triggerRepaint();
        return;
      }
      const j = SLICES.indexOf(slice);
      const ctx = into.getContext("2d")!;
      set(j - 1, j, true);
      glass?.capture("mute");
      onRender = () => {
        ctx.clearRect(0, 0, into.width, into.height);
        ctx.filter = gain === 1 ? "none" : `brightness(${gain})`;
        ctx.drawImage(map.getCanvas(), 0, 0, into.width, into.height);
      };
      map.on("render", onRender);
      map.triggerRepaint();
    },
  };
}

/** Features drawn, each counted once however many tiles it was cut across. */
function distinct(features: MapGeoJSONFeature[]) {
  const seen = new Set<string>();
  let n = 0;
  for (const f of features) {
    if (f.id === undefined) {
      n++;
      continue;
    }
    const key = `${f.sourceLayer}:${f.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    n++;
  }
  return n;
}

function measure(map: MapLibreMap): Facts {
  const drawn = (ids: string[]) => {
    const layers = ids.filter((id) => map.getLayer(id));
    return layers.length ? map.queryRenderedFeatures({ layers }) : [];
  };
  const c = map.getCenter();
  const metresPerPixel = (40075016.686 * Math.cos((c.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());

  const levels = [...new Set(drawn(["contours"]).map((f) => Number(f.properties?.ele)).filter(Number.isFinite))].sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < levels.length; i++) step = Math.min(step, levels[i] - levels[i - 1]);

  const names = new Set(
    drawn(["sea-name", "street-names", "neighbourhoods"])
      .map((f) => f.properties?.["name:en"] ?? f.properties?.name)
      .filter(Boolean),
  );

  return {
    scale: metresPerPixel / (0.0254 / 96),
    contours: levels.length > 1 ? { step, top: levels.at(-1)! } : null,
    roads: distinct(drawn(["runways", "roads-minor", "roads", "rail", "veins"])),
    names: names.size,
  };
}
