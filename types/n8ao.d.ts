/** The parts of n8ao (ambient occlusion for pmndrs postprocessing) the Living Room uses. */
declare module "n8ao" {
  import type { Pass } from "postprocessing";
  import type { Camera, Color, Scene } from "three";

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      color: Color;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      transparencyAware: boolean;
      gammaCorrection: boolean;
      screenSpaceRadius: boolean;
      aoSamples: number;
      denoiseSamples: number;
      denoiseRadius: number;
      accumulate: boolean;
    };
    setQualityMode(mode: "Performance" | "Low" | "Medium" | "High" | "Ultra"): void;
  }
}
