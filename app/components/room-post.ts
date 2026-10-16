/**
 * The Living Room's picture, finished like a film frame: ambient occlusion
 * where things meet (N8AO), real bloom off lamps, flames and screens, filmic
 * tone mapping on HDR buffers, a soft vignette and SMAA edges. Every effect but
 * the AO is merged into one full-screen pass (pmndrs postprocessing).
 *
 * Three tiers: "high" has all of it, "medium" drops the AO, "low" skips the
 * finishing altogether and draws straight to the screen as before.
 */
import * as THREE from "three";
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect } from "postprocessing";
import { N8AOPostPass } from "n8ao";

export type RoomQuality = "high" | "medium" | "low";
export const QUALITIES: RoomQuality[] = ["low", "medium", "high"];

export interface PostLook {
  /** How far the ambient occlusion reaches, in metres: small rooms want less. */
  aoRadius: number;
  aoIntensity: number;
  bloom: number;
  /** Linear brightness above which a pixel blooms. */
  bloomThreshold: number;
  vignette: number;
  tone: "aces" | "agx" | "neutral";
}

export const ROOM_POST: PostLook = { aoRadius: 0.55, aoIntensity: 2.4, bloom: 0.85, bloomThreshold: 1.0, vignette: 0.42, tone: "aces" };

/** While the finishing is on: how much brighter emitters are drawn, and how bright additive glows are. */
const EMIT = { value: 1 };
const GLOW = { value: 1 };

/** Whether a material is a light source drawn as a flat colour, a fake glow, or neither. */
function lightKind(material: THREE.Material): "emitter" | "glow" | null {
  if (material.userData.noGlow) return null;
  if (material.blending === THREE.AdditiveBlending) return "glow";
  const basic = material as THREE.MeshBasicMaterial;
  // A bright flat colour with no picture on it, drawn solid: a bulb, a flame, a neon tube, an exit sign.
  if (basic.isMeshBasicMaterial && !basic.map && basic.depthWrite && Math.max(basic.color.r, basic.color.g, basic.color.b) > 0.35) return "emitter";
  return null;
}

/** Multiplies what the material draws by `strength` (shared, so a tier change costs no recompiles). */
function shine(material: THREE.Material, strength: { value: number }) {
  const key = strength === EMIT ? "lit-emit" : "lit-glow";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.litStrength = strength;
    shader.fragmentShader = `uniform float litStrength;\n${shader.fragmentShader.replace("#include <tonemapping_fragment>", "gl_FragColor.rgb *= litStrength;\n#include <tonemapping_fragment>")}`;
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}

export class RoomPost {
  private composer: EffectComposer;
  private ao: N8AOPostPass;
  private finish: EffectPass;
  private edges: EffectPass;
  private tier: RoomQuality = "high";
  private adaptedAt = 0;
  /** How the renderer maps tones when the finishing is off (it is the finishing's job otherwise). */
  private directToneMapping: THREE.ToneMapping;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, camera: THREE.PerspectiveCamera, look: PostLook = ROOM_POST) {
    this.directToneMapping = renderer.toneMapping;
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new N8AOPostPass(scene, camera, Math.max(1, size.x), Math.max(1, size.y));
    Object.assign(this.ao.configuration, {
      aoRadius: look.aoRadius,
      distanceFalloff: 1,
      intensity: look.aoIntensity,
      color: new THREE.Color(0, 0, 0),
      halfRes: true,
      depthAwareUpsampling: true,
      // Glows and sprites never write depth; drawing them twice for the AO buys nothing.
      transparencyAware: false,
      gammaCorrection: false,
    });
    this.ao.setQualityMode("Medium");
    this.composer.addPass(this.ao);
    const bloom = new BloomEffect({ mipmapBlur: true, intensity: look.bloom, luminanceThreshold: look.bloomThreshold, luminanceSmoothing: 0.3, radius: 0.72 });
    const tone = new ToneMappingEffect({ mode: look.tone === "agx" ? ToneMappingMode.AGX : look.tone === "neutral" ? ToneMappingMode.NEUTRAL : ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: look.vignette });
    this.finish = new EffectPass(camera, bloom, tone, vignette);
    this.composer.addPass(this.finish);
    this.edges = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM }));
    this.composer.addPass(this.edges);
    this.setQuality("high");
  }

  get quality() { return this.tier; }

  setQuality(tier: RoomQuality) {
    this.tier = tier;
    this.ao.enabled = tier === "high";
    // The finishing does the tone mapping; doing it in the materials too would apply it twice.
    const toneMapping = tier === "low" ? this.directToneMapping : THREE.NoToneMapping;
    if (this.renderer.toneMapping !== toneMapping) this.renderer.toneMapping = toneMapping;
    EMIT.value = tier === "low" ? 1 : 2.4;
    GLOW.value = tier === "low" ? 1 : 0.5;
    this.adaptedAt = 0;
  }

  /**
   * Lamps, bulbs, flames and neon are flat colours drawn just under white, which bloom would never catch
   * (it would catch the walls they light instead). The rooms' glow sprites, the other way, were drawn for a
   * clamped picture where each tops out at white: in an HDR buffer they would stack far past it. So while
   * the finishing is on, emitters shine brighter and glow sprites at half, through a shared uniform patched
   * into their shaders (their colours stay theirs to animate). Run again now and then: props and people add more.
   */
  private adaptGlows() {
    this.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!material || Array.isArray(material) || material.userData.lit !== undefined) return;
      const kind = lightKind(material);
      material.userData.lit = kind;
      if (kind) shine(material, kind === "emitter" ? EMIT : GLOW);
    });
  }

  setSize(width: number, height: number) {
    this.composer.setSize(width, height, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, dt: number) {
    const now = performance.now();
    if (now - this.adaptedAt > 2000) { this.adaptedAt = now; this.adaptGlows(); }
    if (this.tier === "low") this.renderer.render(scene, camera);
    else this.composer.render(dt);
  }

  dispose() {
    this.renderer.toneMapping = this.directToneMapping;
    EMIT.value = 1;
    GLOW.value = 1;
    this.composer.dispose();
  }
}
