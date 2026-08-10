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