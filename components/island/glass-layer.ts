import type { CustomLayerInterface, Map as MapLibreMap } from "maplibre-gl";

/**
 * Liquid glass, rendered in the map's own GL context so it can bend the map
 * rather than just blur it.
 *
 * Each frame, after every map layer has drawn, this layer:
 *   1. lays the atmosphere over the map (vignette, and the horizon haze once the
 *      camera tilts) so the glass refracts the finished scene;
 *   2. copies the region under the glass shapes into a mipmapped texture;
 *   3. draws each shape as a slab of glass: frosted body, a lensing rim that drags
 *      the outside in, a little chromatic dispersion at the edge, specular light
 *      on the rim that follows the pointer, and a soft shadow beneath.
 *
 * Shapes are given in CSS pixels, viewport coordinates, the same space the DOM
 * uses, so HTML content can sit exactly on top.
 */

export type GlassShape = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  opacity: number;
};

export type GlassLayer = CustomLayerInterface & {
  setShapes(shapes: GlassShape[]): void;
  /** pointer in -1..1, drives where the light sits */
  setLight(x: number, y: number): void;
  /** 0..1, the top-of-frame haze used once the camera is pitched */
  setHaze(value: number): void;
  /** "failed" means this GPU cannot read back the map; callers fall back to CSS glass */
  readonly status: "pending" | "ok" | "failed";
};

const QUAD_VERT = `#version 300 es
precision highp float;
uniform vec4 u_bounds;   // x0, y0, x1, y1 in GL pixels
uniform vec2 u_viewport;
in vec2 a_pos;
void main() {
  vec2 px = mix(u_bounds.xy, u_bounds.zw, a_pos);
  gl_Position = vec4(px / u_viewport * 2.0 - 1.0, 0.0, 1.0);
}`;

const ATMOS_FRAG = `#version 300 es
precision highp float;
uniform vec2 u_viewport;
uniform float u_haze;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_viewport;           // y up
  vec2 q = (uv - vec2(0.58, 0.44)) / vec2(0.65, 0.475);
  float vignette = smoothstep(0.42, 1.0, length(q));
  float a = mix(0.0, 0.5, smoothstep(0.0, 0.78, vignette)) + 0.38 * smoothstep(0.78, 1.0, vignette);
  float top = 1.0 - uv.y;                            // 0 at the top edge
  float haze = u_haze * (0.92 * (1.0 - smoothstep(0.0, 0.14, top)) + 0.55 * (1.0 - smoothstep(0.14, 0.34, top)) * smoothstep(0.0, 0.14, top));
  a = 1.0 - (1.0 - a) * (1.0 - haze);
  fragColor = vec4(0.0, 0.0, 0.0, a);
}`;

const GLASS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_bg;
uniform vec2 u_texSize;
uniform vec4 u_copy;      // copied region: origin xy, size zw (GL px)
uniform vec4 u_rect;      // centre xy, half size zw (GL px)
uniform float u_radius;
uniform float u_px;       // device pixels per CSS pixel
uniform vec2 u_light;     // unit vector toward the light, GL coords
uniform float u_opacity;
out vec4 fragColor;

float sdShape(vec2 p) {
  vec2 b = u_rect.zw;
  float r = min(u_radius, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  vec2 m = max(q, 0.0);
  // continuous corners: a superellipse blend rather than a circular arc
  float n = 2.7;
  float len = pow(pow(m.x, n) + pow(m.y, n), 1.0 / n);
  return len + min(max(q.x, q.y), 0.0) - r;
}

vec2 toUV(vec2 pos) {
  pos = clamp(pos, u_copy.xy + 1.0, u_copy.xy + u_copy.zw - 1.0);
  return (pos - u_copy.xy) / u_texSize;
}

const vec2 TAPS[8] = vec2[8](
  vec2(0.0, 1.0), vec2(0.7071, 0.7071), vec2(1.0, 0.0), vec2(0.7071, -0.7071),
  vec2(0.0, -1.0), vec2(-0.7071, -0.7071), vec2(-1.0, 0.0), vec2(-0.7071, 0.7071)
);

vec3 frost(vec2 pos, float radius, float lod) {
  vec3 acc = textureLod(u_bg, toUV(pos), lod).rgb * 2.0;
  for (int i = 0; i < 8; i++) {
    vec2 o = TAPS[i] * radius * (i % 2 == 0 ? 1.0 : 0.62);
    acc += textureLod(u_bg, toUV(pos + o), lod).rgb;
  }
  return acc / 10.0;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = frag - u_rect.xy;
  float px = u_px;
  float d = sdShape(p);

  // shadow: a lowered, softened copy of the shape, plus a tight contact shadow
  float ds = sdShape(p + vec2(0.0, 26.0 * px));
  float shadow = (1.0 - smoothstep(-30.0 * px, 70.0 * px, ds)) * 0.5;
  float contact = (1.0 - smoothstep(-1.0 * px, 12.0 * px, d)) * 0.4;
  float inside = 1.0 - smoothstep(-0.65 * px, 0.65 * px, d);
  float outer = max(shadow, contact);
  if (inside <= 0.0 && outer <= 0.002) discard;

  vec3 col = vec3(0.0);
  if (inside > 0.0) {
    float e = max(-d, 0.0);
    vec2 h = vec2(1.0, 0.0);
    vec2 n = normalize(vec2(sdShape(p + h.xy) - sdShape(p - h.xy), sdShape(p + h.yx) - sdShape(p - h.yx)) + 1e-6);

    // the rim is a lens: near the edge the glass drags in what lies beyond it
    float L = 30.0 * px;
    float rim = clamp(1.0 - e / L, 0.0, 1.0);
    float bend = rim * rim * rim;
    vec2 base = u_rect.xy + p * 0.972;
    vec2 disp = n * bend * L * 1.4;

    float blurR = 15.0 * px;
    float lod = log2(max(1.0, blurR / 3.2));
    vec3 body = frost(base + disp, blurR, lod);
    if (bend > 0.004) {
      vec2 ca = n * bend * 3.5 * px;
      body.r = frost(base + disp * 1.07 + ca, blurR, lod).r;
      body.b = frost(base + disp * 0.93 - ca, blurR, lod).b;
    }

    // a smoked slab: darkened for legibility, never flat
    col = mix(body, vec3(0.03, 0.024, 0.024), 0.3) * 1.1 + 0.03;

    // light: a crisp specular line on the rim, brightest where the rim faces
    // the light, a softer echo on the far side, and a faint inner glow
    float facing = dot(n, u_light);
    float edge = 1.0 - smoothstep(0.0, 1.6 * px, e);
    float spec = edge * (0.7 * pow(max(facing, 0.0), 1.5) + 0.28 * pow(max(-facing, 0.0), 2.4) + 0.08);
    float glow = pow(rim, 2.4) * (0.1 * max(facing, 0.0) + 0.03);
    float sheen = smoothstep(-u_rect.w * 0.1, u_rect.w, p.y) * 0.045;
    col += vec3(1.0, 0.965, 0.945) * (spec + glow + sheen);

    float grain = fract(sin(dot(frag, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) / 255.0;
  }

  float a = inside + (1.0 - inside) * outer;
  fragColor = vec4(col * inside, a) * u_opacity;
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`glass shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(program, 0, "a_pos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`glass program: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

export function createGlassLayer(id = "glass"): GlassLayer {
  let map: MapLibreMap | null = null;
  let glass: WebGLProgram | null = null;
  let atmos: WebGLProgram | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  let texW = 0;
  let texH = 0;
  let hasAlpha = true;
  let shapes: GlassShape[] = [];
  let light: [number, number] = [-0.55, 0.835];
  let haze = 0;
  let status: "pending" | "ok" | "failed" = "pending";
  const uGlass: Record<string, WebGLUniformLocation | null> = {};
  const uAtmos: Record<string, WebGLUniformLocation | null> = {};

  const settle = (ok: boolean) => {
    if (status === "pending") status = ok ? "ok" : "failed";
  };

  const ensureTexture = (gl: WebGL2RenderingContext, w: number, h: number) => {
    if (texture && w <= texW && h <= texH) return;
    if (texture) gl.deleteTexture(texture);
    texW = Math.max(w, texW, 256);
    texH = Math.max(h, texH, 256);
    texW = Math.ceil(texW / 128) * 128;
    texH = Math.ceil(texH / 128) * 128;
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const [internal, format] = hasAlpha ? [gl.RGBA8, gl.RGBA] : [gl.RGB8, gl.RGB];
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, texW, texH, 0, format, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  return {
    id,
    type: "custom",
    renderingMode: "2d",

    get status() {
      return status;
    },
    setShapes(next) {
      shapes = next;
      map?.triggerRepaint();
    },
    setLight(x, y) {
      // pointer right/down moves the light with it; GL y points up
      const lx = -0.55 + x * 0.6;
      const ly = 0.835 - y * 0.55;
      const len = Math.hypot(lx, ly) || 1;
      light = [lx / len, ly / len];
    },
    setHaze(value) {
      haze = value;
      map?.triggerRepaint();
    },

    onAdd(m, gl) {
      map = m;
      try {
        glass = link(gl, QUAD_VERT, GLASS_FRAG);
        atmos = link(gl, QUAD_VERT, ATMOS_FRAG);
      } catch (err) {
        console.warn("[glass]", err);
        settle(false);
        return;
      }
      for (const name of ["u_bounds", "u_viewport", "u_bg", "u_texSize", "u_copy", "u_rect", "u_radius", "u_px", "u_light", "u_opacity"]) {
        uGlass[name] = gl.getUniformLocation(glass, name);
      }
      for (const name of ["u_bounds", "u_viewport", "u_haze"]) uAtmos[name] = gl.getUniformLocation(atmos, name);
      hasAlpha = gl.getContextAttributes()?.alpha !== false;
      buffer = gl.createBuffer();
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    },

    onRemove(_m, gl) {
      if (glass) gl.deleteProgram(glass);
      if (atmos) gl.deleteProgram(atmos);
      if (vao) gl.deleteVertexArray(vao);
      if (buffer) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      map = null;
    },

    render(gl) {
      if (!glass || !atmos || !vao || status === "failed") return;
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      const canvas = gl.canvas as HTMLCanvasElement;
      const px = W / Math.max(1, canvas.clientWidth);

      gl.bindVertexArray(vao);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      // 1. atmosphere
      gl.useProgram(atmos);
      gl.uniform4f(uAtmos.u_bounds, 0, 0, W, H);
      gl.uniform2f(uAtmos.u_viewport, W, H);
      gl.uniform1f(uAtmos.u_haze, haze);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const live = shapes.filter((s) => s.opacity > 0.002 && s.w > 2 && s.h > 2);
      if (!live.length) {
        gl.bindVertexArray(null);
        return;
      }

      // 2. copy what lies under (and just around) the glass
      const reach = 80 * px;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of live) {
        const gx = s.x * px;
        const gy = H - (s.y + s.h) * px;
        x0 = Math.min(x0, gx - reach);
        y0 = Math.min(y0, gy - reach);
        x1 = Math.max(x1, gx + s.w * px + reach);
        y1 = Math.max(y1, gy + s.h * px + reach);
      }
      x0 = Math.max(0, Math.floor(x0));
      y0 = Math.max(0, Math.floor(y0));
      x1 = Math.min(W, Math.ceil(x1));
      y1 = Math.min(H, Math.ceil(y1));
      const cw = x1 - x0;
      const ch = y1 - y0;
      if (cw <= 2 || ch <= 2) {
        gl.bindVertexArray(null);
        return;
      }
      gl.activeTexture(gl.TEXTURE0);
      ensureTexture(gl, cw, ch);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, x0, y0, cw, ch);
      gl.generateMipmap(gl.TEXTURE_2D);
      if (status === "pending" && gl.getError() !== gl.NO_ERROR) {
        console.warn("[glass] could not read the map framebuffer; falling back to CSS glass");
        settle(false);
        gl.bindVertexArray(null);
        return;
      }

      // 3. the glass itself
      gl.useProgram(glass);
      gl.uniform2f(uGlass.u_viewport, W, H);
      gl.uniform1i(uGlass.u_bg, 0);
      gl.uniform2f(uGlass.u_texSize, texW, texH);
      gl.uniform4f(uGlass.u_copy, x0, y0, cw, ch);
      gl.uniform1f(uGlass.u_px, px);
      gl.uniform2f(uGlass.u_light, light[0], light[1]);
      const pad = 110 * px;
      for (const s of live) {
        const cx = (s.x + s.w / 2) * px;
        const cy = H - (s.y + s.h / 2) * px;
        const hw = (s.w / 2) * px;
        const hh = (s.h / 2) * px;
        gl.uniform4f(uGlass.u_bounds, cx - hw - pad, cy - hh - pad, cx + hw + pad, cy + hh + pad);
        gl.uniform4f(uGlass.u_rect, cx, cy, hw, hh);
        gl.uniform1f(uGlass.u_radius, s.r * px);
        gl.uniform1f(uGlass.u_opacity, s.opacity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindVertexArray(null);
      settle(true);
    },
  };
}
