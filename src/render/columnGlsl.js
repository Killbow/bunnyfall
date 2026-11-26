// @ts-check
// The caller declares uCamPos, uFogColor and FOG_GLSL first.

import { SURFACE_TEXTURE_TILING } from '../world/deepWaterLook.js';

export const COLUMN_GLSL = `
uniform sampler2D uSurfaceTex;
uniform vec3 uDwCamFwd;        // the camera's forward (uCamFwd is the lane's light clusters' vec4 - one program holds both)
uniform float uColumnOn;       // 1 while the camera is over the sea and the surfaces are drawn
uniform float uSeaY;           // the surface's world height
uniform vec4 uTopColor;        // the top's _Color (rgb tint, a alpha)
uniform float uTopVision;      // the top's _WaterSurfaceVisionDistance
uniform vec2 uSurfaceScroll;   // the top's texture offset now, in repeats
uniform vec3 uPixelOrigin;     // this pixel's world origin (the surface's uv is pixel-local)
vec3 dwColumn(vec3 col, vec3 worldPos) {
  if (uColumnOn > 0.5 && worldPos.y < uSeaY && uCamPos.y > worldPos.y) {
    // where the view ray crosses the sea, and the eye depth behind it
    vec3 toFrag = worldPos - uCamPos;
    float s = clamp((uSeaY - uCamPos.y) / min(toFrag.y, -1e-4), 0.0, 1.0);
    vec3 entry = uCamPos + toFrag * s;
    float behind = max(dot(worldPos - entry, uDwCamFwd), 0.0);
    float t = min(behind / max(uTopVision, 1.0), 1.0);
    vec2 uv = (entry.xz - uPixelOrigin.xz) / 819.2 * ${SURFACE_TEXTURE_TILING.toFixed(1)} + uSurfaceScroll;
    vec3 st = texture(uSurfaceTex, uv).rgb * uTopColor.rgb;
    st = mix(st, uTopColor.rgb * 0.32, 0.22);
    st = mix(uFogColor, st, fogFactorAt(entry));
    col = mix(col, st, t);
  }
  return col;
}`;
