/**
 * `@3d-dice/dice-box` ships no TypeScript declarations. These are the minimal
 * types for the pieces Huddle uses.
 */
declare module "@3d-dice/dice-box" {
  export interface DiceBoxResultRoll {
    value: number;
    sides?: number;
    rollId?: number;
    groupId?: number;
  }

  export interface DiceBoxResultGroup {
    id?: number;
    qty?: number;
    value?: number;
    rolls?: DiceBoxResultRoll[];
  }

  export interface DiceBoxConfig {
    assetPath: string;
    theme?: string;
    themeColor?: string;
    gravity?: number;
    settleTimeout?: number;
    spin?: boolean[];
    sound?: boolean;
    lighting?: boolean;
    preloadThemes?: string[];
  }

  export default class DiceBox {
    constructor(target: string, config: DiceBoxConfig);
    init(): Promise<void>;
    roll(
      notation: unknown,
      options?: { theme?: string; themeColor?: string; newStartPoint?: boolean },
    ): Promise<DiceBoxResultGroup[]>;
    add(
      notation: unknown,
      options?: { theme?: string; themeColor?: string; newStartPoint?: boolean },
    ): Promise<DiceBoxResultGroup[]>;
    clear(): void;
    hide(className?: string): void;
    show(): void;
    getRollResults(): DiceBoxResultGroup[];
    updateConfig(config: Partial<DiceBoxConfig>): void;
    onRollComplete: ((results: DiceBoxResultGroup[]) => void) | null;
    onDieComplete: ((result: DiceBoxResultRoll) => void) | null;
    onRemoveComplete: ((results: DiceBoxResultRoll[]) => void) | null;
    onThemeConfigLoaded: ((theme: unknown) => void) | null;
    onThemeLoaded: ((theme: unknown) => void) | null;
    config: DiceBoxConfig;
  }
}

declare module "@3d-dice/dice-box-threejs" {
  export interface DiceBoxThreeJSConfig {
    assetPath?: string;
    framerate?: number;
    sounds?: boolean;
    volume?: number;
    color_spotlight?: number;
    shadows?: boolean;
    theme_surface?: string;
    sound_dieMaterial?: string;
    theme_customColorset?: any;
    theme_colorset?: string;
    theme_texture?: string;
    theme_material?: string;
    gravity_multiplier?: number;
    light_intensity?: number;
    baseScale?: number;
    strength?: number;
    scale?: number;
    onRollComplete?: (results: any) => void;
  }

  export default class DiceBoxThreeJS {
    constructor(target: string, config?: DiceBoxThreeJSConfig);
    initialize(): Promise<void>;
    roll(notation: string): Promise<any>;
    clearDice(): void;
    renderer?: { dispose?: () => void; domElement?: HTMLElement };
  }
}