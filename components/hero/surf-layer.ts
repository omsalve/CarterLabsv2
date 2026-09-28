import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import field from "./surf-field.json";

/**
 * Surf along Bandra's shoreline, drawn in the map's own GL context.
 *
 * The texture is a distance field baked from the OSM coastline
 * (scripts/build-surf-field.mjs): metres offshore, metres inland, and how exposed
 * each patch of water is to the Arabian Sea swell. The shader turns that into
 * swell lines travelling shoreward, whitewater where they break, and a swash line
 * that breathes on the sand. Sheltered water (Mahim creek, the lee of Uarashi
 * Reef) stays flat because the field says so, not because we masked it by hand.
 */

const VERT = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform float u_time;
uniform float u_opacity;
uniform vec2 u_metres;
uniform float u_waterRange;
uniform float u_landRange;
in vec2 v_uv;
out vec4 fragColor;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec3 f = texture(u_field, v_uv).rgb;
  float dw = f.r * u_waterRange;   // metres offshore
  float dl = f.b * u_landRange;    // metres inland
  float sd = dw - dl;
  if (sd < -6.0) discard;
  float expo = f.g;
  vec2 p = v_uv * u_metres;
  float t = u_time;

  // Swell: long crests travelling shoreward, bent gently by slow large-scale noise.
  float bend = snoise(p * 0.0017 + vec2(0.0, t * 0.01));
  float ripple = snoise(p * 0.0068 - vec2(t * 0.024, 0.0));
  float phase = dw / 92.0 + bend * 0.26 + ripple * 0.05 + t * 0.12;
  float s = fract(phase);
  float wave = floor(phase);

  // steep shoreward face, long soft back
  float crest = smoothstep(0.0, 0.045, s) * (1.0 - smoothstep(0.045, 0.34, s));
  crest *= crest;
  // each wave breaks in its own places along the beach
  float sets = smoothstep(-0.35, 0.55, snoise(p * 0.0048 + vec2(wave * 1.73, wave * 0.61 + t * 0.008)));
  // dissolve crests that get finer than a pixel toward the horizon
  float aa = 1.0 - smoothstep(0.06, 0.24, fwidth(phase));

  float swellZone = smoothstep(560.0, 180.0, dw);
  float surfZone = smoothstep(115.0, 14.0, dw);
  float swell = crest * sets * aa * expo * swellZone * (0.3 + 0.7 * surfZone);

  // Whitewater: foam streaks lying along the shore, dragged in behind each breaker.
  float streak = snoise(vec2(dw * 0.11 - t * 0.55, 0.0) + p * 0.009);
  float churn = snoise(p * 0.045 + vec2(t * 0.12, -t * 0.05));
  float trail = smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.04, 0.62, s));
  float foam = smoothstep(0.15, 0.85, streak * 0.55 + churn * 0.25 + 0.5) * trail * surfZone * expo * aa;

  // Swash: the waterline breathing up and down the sand.
  float reach = 4.0 + 5.0 * (0.5 + 0.5 * sin(t * 0.8 + bend * 3.0 + p.y * 0.0031));
  float swash = smoothstep(reach + 7.0, reach, sd) * smoothstep(-5.0, 0.5, sd);
  swash *= (0.2 + 0.8 * expo) * (0.75 + 0.25 * churn);

  // Shallow water carries a little light.
  float shallow = smoothstep(260.0, 0.0, dw) * (0.25 + 0.75 * expo) * step(0.0, sd);

  float a = swell * 0.58 + foam * 0.34 + swash * 0.52 + shallow * 0.045;
  vec2 edge = smoothstep(0.0, 0.07, v_uv) * smoothstep(0.0, 0.07, 1.0 - v_uv);
  a = clamp(a, 0.0, 0.85) * u_opacity * edge.x * edge.y;

  // bone foam; the long swell lines far out carry a trace of blood
  vec3 col = mix(vec3(0.66, 0.42, 0.41), vec3(0.93, 0.9, 0.86), clamp(surfZone + foam + swash, 0.0, 1.0));
  fragColor = vec4(col * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`surf shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** out = a · b for column-major 4×4 matrices, in double precision. */
function multiply(a: ArrayLike<number>, b: ArrayLike<number>) {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  return out;
}

export type SurfLayer = CustomLayerInterface & {
  setOpacity(value: number): void;
  setFrozen(frozen: boolean): void;
};

export function createSurfLayer(id = "surf", textureUrl = "/surf/bandra-surf.png"): SurfLayer {
  let map: MapLibreMap | null = null;
  let program: WebGLProgram | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  let pending: ImageBitmap | null = null;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let opacity = 0;
  let frozen = false;
  const start = performance.now();
  const { x0, y0, x1, y1 } = field.mercator;
  // local quad (0..1) → mercator
  const local = new Float64Array([x1 - x0, 0, 0, 0, 0, y1 - y0, 0, 0, 0, 0, 1, 0, x0, y0, 0, 1]);
  const metres = [field.size[0] * field.cellMetres, field.size[1] * field.cellMetres];

  return {
    id,
    type: "custom",
    renderingMode: "2d",

    setOpacity(value: number) {
      if (Math.abs(value - opacity) < 1e-3) return;
      opacity = value;
      map?.triggerRepaint();
    },
    setFrozen(value: boolean) {
      frozen = value;
    },

    onAdd(m, gl) {
      map = m;
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      for (const name of ["u_matrix", "u_field", "u_time", "u_opacity", "u_metres", "u_waterRange", "u_landRange"]) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      buffer = gl.createBuffer();
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, "a_pos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      fetch(textureUrl)
        .then((r) => r.blob())
        .then((blob) => createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" }))
        .then((bitmap) => {
          pending = bitmap;
          map?.triggerRepaint();
        })
        .catch(() => {
          /* no surf is a graceful state; the coast still reads */
        });
    },

    onRemove(_m, gl) {
      if (program) gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      if (vao) gl.deleteVertexArray(vao);
      if (texture) gl.deleteTexture(texture);
      pending?.close();
      map = null;
      uniforms = {};
    },

    render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput) {
      if (!program || !vao) return;
      // Upload inside render: MapLibre marks its cached GL state dirty afterwards.
      if (pending) {
        texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pending);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        pending.close();
        pending = null;
      }
      if (!texture || opacity <= 0.001) return;

      // mainMatrix maps mercator 0..1 to clip space; compose with the quad in float64
      // so the surf holds still at street zoom.
      const matrix = new Float32Array(multiply(options.defaultProjectionData.mainMatrix, local));
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniformMatrix4fv(uniforms.u_matrix, false, matrix);
      gl.uniform1i(uniforms.u_field, 0);
      gl.uniform1f(uniforms.u_time, frozen ? 21.5 : (performance.now() - start) / 1000);
      gl.uniform1f(uniforms.u_opacity, opacity);
      gl.uniform2f(uniforms.u_metres, metres[0], metres[1]);
      gl.uniform1f(uniforms.u_waterRange, field.waterRange);
      gl.uniform1f(uniforms.u_landRange, field.landRange);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);

      if (!frozen) map?.triggerRepaint();
    },
  };
}
