import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Makes MapLibre's tile level of detail account for camera padding.
 *
 * MapLibre loads every tile in view at one zoom unless the camera is pitched past
 * 60° (strictly, past 78.5° less half the field of view): below that, it assumes
 * the top of the frame can't see far enough for distant tiles to matter. Padding
 * breaks that assumption. It moves the point the camera looks through, so the top
 * edge looks further up than pitch + fov/2. The Projects close-ups do exactly that:
 * they pad the top by most of the screen so the pin sits low under its case study,
 * which at 56–62° puts the top edge a degree or two short of the horizon. At 60° or
 * less, MapLibre then loads the ground all the way out at the close-up's zoom:
 * 9,000 tiles a source instead of ~25, and every tile it adds or drops rescans them
 * all, which froze the camera for seconds on the way in and out of a case.
 *
 * This keeps MapLibre's own rule and measures it from where the frame really
 * reaches: variable zoom whenever pitch plus the padded top edge's angle passes
 * 78.5°. Distant tiles then come in at lower zoom, as they do for any steep view;
 * they lie in the fog at the top of the frame, and the close-ups render the same
 * (checked pixel for pixel against the unpatched map). It patches the shared
 * prototype once, so every transform MapLibre clones gets it too.
 */

type Transform = { pitch: number; fov: number; height: number; padding?: { top: number; bottom: number } };
type Provider = { allowVariableZoom(t: Transform, o: unknown): boolean; __padAware?: boolean };

const CONSTANT_ZOOM_REACH = 78.5; // MapLibre's own limit (covering-tiles: maxConstantZoomPitch)

export function padAwareTileZoom(map: MapLibreMap) {
  const internal = map as unknown as { _camera?: { transform?: unknown }; painter?: { transform?: unknown } };
  const transform = (internal._camera?.transform ?? internal.painter?.transform) as
    | { getCoveringTilesDetailsProvider?: () => Provider }
    | undefined;
  const provider = transform?.getCoveringTilesDetailsProvider?.();
  if (!provider) return; // a MapLibre that no longer works this way: leave it be
  const proto = Object.getPrototypeOf(provider) as Provider;
  if (proto.__padAware || typeof proto.allowVariableZoom !== "function") return;
  const own = proto.allowVariableZoom;
  proto.allowVariableZoom = function (t, o) {
    if (own.call(this, t, o)) return true;
    const pad = t.padding;
    if (!pad || !t.height) return false;
    const half = t.height / 2;
    const focal = half / Math.tan((t.fov * Math.PI) / 360);
    const top = (Math.atan((half + (pad.top - pad.bottom) / 2) / focal) * 180) / Math.PI;
    return t.pitch + top > CONSTANT_ZOOM_REACH;
  };
  proto.__padAware = true;
}
