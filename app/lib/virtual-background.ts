/**
 * Camera Virtual Backgrounds and Video Processing Pipeline.
 * 100% Client-Side Person Segmentation, Adjustable Bokeh Blur, and Custom/Preset Virtual Backdrops.
 */

export type BackgroundMode =
  | "none"
  | "blur"
  | "image"
  | "studio"
  | "cyberpunk"
  | "sunset"
  | "matrix"
  | "cosmos";

export interface VirtualImagePreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  svgDataUri: string;
}

export interface CustomBackgroundItem {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: number;
}

// 7 Aesthetic built-in Discord-style virtual background images (offline vector SVGs)
export const BUILTIN_BACKGROUND_IMAGES: VirtualImagePreset[] = [
  {
    id: "preset:cyberpunk",
    name: "Cyberpunk Den",
    emoji: "🌆",
    description: "Neon lit battlestation room with purple and cyan glow",
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%230f0a1c"/><stop offset="100%" stop-color="%231a0b2e"/></linearGradient>
        <linearGradient id="neon1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%2300f0ff"/><stop offset="100%" stop-color="%230044ff"/></linearGradient>
        <linearGradient id="neon2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%23ff007f"/><stop offset="100%" stop-color="%237b00ff"/></linearGradient>
        <linearGradient id="desk" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="%23120d24"/><stop offset="50%" stop-color="%23231a42"/><stop offset="100%" stop-color="%23120d24"/></linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(%23wall)"/>
      <rect x="80" y="80" width="340" height="380" rx="16" fill="%23090614" stroke="%233b2066" stroke-width="4"/>
      <rect x="95" y="95" width="310" height="350" fill="%2305020d"/>
      <rect x="130" y="180" width="40" height="265" fill="%2300f0ff" opacity="0.15"/>
      <rect x="190" y="220" width="55" height="225" fill="%23ff007f" opacity="0.2"/>
      <rect x="270" y="140" width="45" height="305" fill="%2300f0ff" opacity="0.25"/>
      <rect x="335" y="260" width="50" height="185" fill="%239d00ff" opacity="0.18"/>
      <line x1="900" y1="60" x2="900" y2="440" stroke="url(%23neon1)" stroke-width="8" stroke-linecap="round"/>
      <line x1="925" y1="100" x2="925" y2="400" stroke="url(%23neon2)" stroke-width="8" stroke-linecap="round"/>
      <rect x="740" y="140" width="80" height="16" rx="8" fill="%23ff007f" opacity="0.75"/>
      <rect x="710" y="170" width="140" height="12" rx="6" fill="%2300f0ff" opacity="0.6"/>
      <rect x="0" y="520" width="1280" height="200" fill="url(%23desk)"/>
      <rect x="0" y="520" width="1280" height="4" fill="%23ff007f" opacity="0.5"/>
    </svg>`,
  },
  {
    id: "preset:office",
    name: "Cozy Bookshelf",
    emoji: "📚",
    description: "Modern minimalist wooden bookshelves with greenery and warm pendant lighting",
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%231e2124"/><stop offset="100%" stop-color="%232b2f36"/></linearGradient>
        <linearGradient id="shelf" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="%238c5b36"/><stop offset="100%" stop-color="%236e4325"/></linearGradient>
        <linearGradient id="lamp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(255,220,150,0.3)"/><stop offset="100%" stop-color="rgba(255,220,150,0)"/></linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(%23wall)"/>
      <polygon points="640,0 480,480 800,480" fill="url(%23lamp)"/>
      <circle cx="640" cy="50" r="14" fill="%23ffd580"/>
      <rect x="80" y="120" width="460" height="16" rx="4" fill="url(%23shelf)"/>
      <rect x="80" y="280" width="460" height="16" rx="4" fill="url(%23shelf)"/>
      <rect x="80" y="440" width="460" height="16" rx="4" fill="url(%23shelf)"/>
      <rect x="740" y="120" width="460" height="16" rx="4" fill="url(%23shelf)"/>
      <rect x="740" y="280" width="460" height="16" rx="4" fill="url(%23shelf)"/>
      <rect x="740" y="440" width="460" height="16" rx="4" fill="url(%23shelf)"/>
      <!-- Books on shelves -->
      <rect x="110" y="50" width="22" height="70" fill="%23d97736" rx="2"/>
      <rect x="135" y="40" width="26" height="80" fill="%232d6a4f" rx="2"/>
      <rect x="165" y="60" width="20" height="60" fill="%234361ee" rx="2"/>
      <rect x="190" y="45" width="28" height="75" fill="%23e63946" rx="2"/>
      <!-- Plant pot -->
      <path d="M420,80 L460,80 L452,120 L428,120 Z" fill="%23c27ba0"/>
      <circle cx="435" cy="65" r="18" fill="%2352b788"/>
      <circle cx="448" cy="55" r="16" fill="%2374c69d"/>
      <circle cx="440" cy="72" r="14" fill="%2340916c"/>
      <!-- Right shelf decor -->
      <rect x="780" y="200" width="24" height="80" fill="%23f4a261" rx="2"/>
      <rect x="808" y="210" width="20" height="70" fill="%232a9d8f" rx="2"/>
      <rect x="832" y="195" width="30" height="85" fill="%23e76f51" rx="2"/>
    </svg>`,
  },
  {
    id: "preset:cafe",
    name: "Rainy Cafe",
    emoji: "☕",
    description: "Atmospheric evening coffee shop with warm ambient lighting",
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="cafebg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%231a1412"/><stop offset="100%" stop-color="%232e221d"/></linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(%23cafebg)"/>
      <!-- Bokeh circles -->
      <circle cx="200" cy="180" r="60" fill="%23ffbe76" opacity="0.15"/>
      <circle cx="340" cy="120" r="45" fill="%23f0932b" opacity="0.18"/>
      <circle cx="150" cy="320" r="50" fill="%23ff7979" opacity="0.12"/>
      <circle cx="950" cy="160" r="75" fill="%23ffbe76" opacity="0.14"/>
      <circle cx="1080" cy="240" r="55" fill="%23badc58" opacity="0.1"/>
      <circle cx="820" cy="220" r="40" fill="%23f0932b" opacity="0.2"/>
      <!-- Window frame panes -->
      <line x1="640" y1="0" x2="640" y2="720" stroke="%233e2e25" stroke-width="12"/>
      <line x1="0" y1="360" x2="1280" y2="360" stroke="%233e2e25" stroke-width="12"/>
      <!-- Soft floor table -->
      <rect x="0" y="580" width="1280" height="140" fill="%23221915"/>
      <rect x="0" y="580" width="1280" height="6" fill="%23ffbe76" opacity="0.2"/>
    </svg>`,
  },
  {
    id: "preset:sunset",
    name: "Golden Sunset",
    emoji: "🌅",
    description: "Vibrant golden hour gradient over quiet mountain peaks",
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="%23301934"/>
          <stop offset="35%" stop-color="%236b2d5c"/>
          <stop offset="65%" stop-color="%23c24b58"/>
          <stop offset="85%" stop-color="%23f78361"/>
          <stop offset="100%" stop-color="%23ffd166"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(%23sky)"/>
      <circle cx="640" cy="460" r="90" fill="%23fff1c5" opacity="0.85"/>
      <!-- Mountain silhouettes -->
      <polygon points="0,520 220,380 440,540 680,340 920,530 1140,390 1280,480 1280,720 0,720" fill="%23241429"/>
      <polygon points="0,580 320,470 580,600 840,460 1100,580 1280,510 1280,720 0,720" fill="%23140a18"/>
    </svg>`,
  },
  {
    id: "preset:lofi",
    name: "Lo-Fi Bedroom",
    emoji: "🎧",
    description: "Chill anime evening room with moonlit window and fairy lights",
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="room" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23130d24"/><stop offset="100%" stop-color="%23261738"/></linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(%23room)"/>
      <!-- Window -->
      <rect x="760" y="80" width="420" height="420" rx="12" fill="%230b0819" stroke="%23432c63" stroke-width="6"/>
      <circle cx="1080" cy="180" r="45" fill="%23f5f3ce"/>
      <circle cx="1065" cy="175" r="42" fill="%230b0819"/>
      <!-- Stars -->
      <circle cx="820" cy="140" r="2" fill="%23ffffff" opacity="0.8"/>
      <circle cx="880" cy="220" r="2" fill="%23ffffff" opacity="0.6"/>
      <circle cx="960" cy="120" r="2.5" fill="%23ffffff" opacity="0.9"/>
      <circle cx="1140" cy="290" r="2" fill="%23ffffff" opacity="0.7"/>
      <!-- Fairy lights -->
      <path d="M100,100 Q400,180 740,120" stroke="%23ffd166" stroke-width="2" fill="none" opacity="0.5"/>
      <circle cx="180" cy="125" r="5" fill="%23ffbe76"/>
      <circle cx="300" cy="150" r="5" fill="%23ff7979"/>
      <circle cx="440" cy="158" r="5" fill="%23badc58"/>
      <circle cx="580" cy="146" r="5" fill="%237ed6df"/>
      <circle cx="690" cy="126" r="5" fill="%23e056fd"/>
    </svg>`,
  },
  {
    id: "preset:scifi",
    name: "Spaceship Bridge",
    emoji: "🚀",
    description: "Starship cockpit overlooking a ringed gas giant in outer space",
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <radialGradient id="space" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="%23151733"/><stop offset="100%" stop-color="%23060712"/></radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(%23space)"/>
      <!-- Planet -->
      <circle cx="640" cy="300" r="160" fill="%233a86ff"/>
      <ellipse cx="640" cy="300" rx="280" ry="24" fill="none" stroke="%23ffbe0b" stroke-width="8" opacity="0.8" transform="rotate(-15 640 300)"/>
      <!-- Cockpit bulkheads -->
      <polygon points="0,0 260,0 180,720 0,720" fill="%2311131a"/>
      <polygon points="1280,0 1020,0 1100,720 1280,720" fill="%2311131a"/>
      <polygon points="0,0 1280,0 1080,100 200,100" fill="%23171a24"/>
      <polygon points="160,620 1120,620 1280,720 0,720" fill="%230c0e14"/>
      <!-- Glowing cockpit status LEDs -->
      <circle cx="120" cy="200" r="4" fill="%2300f0ff"/>
      <circle cx="120" cy="220" r="4" fill="%2300f0ff"/>
      <circle cx="120" cy="240" r="4" fill="%2339ff14"/>
      <circle cx="1160" cy="200" r="4" fill="%23ff007f"/>
      <circle cx="1160" cy="220" r="4" fill="%23ff007f"/>
    </svg>`,
  },
  {
    id: "preset:studio",
    name: "Studio Spotlight",
    emoji: "🎙️",
    description: "Deep obsidian violet backdrop with smooth architectural spotlight",
    svgDataUri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <radialGradient id="spot" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stop-color="%23382759"/>
          <stop offset="45%" stop-color="%231e1533"/>
          <stop offset="100%" stop-color="%230d0a17"/>
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(%23spot)"/>
    </svg>`,
  },
];

export interface BackgroundPreset {
  id: BackgroundMode;
  name: string;
  emoji: string;
  description: string;
  badge: string;
}

export const VIRTUAL_BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "none", name: "Off", emoji: "🚫", description: "Natural camera feed without modifications", badge: "Normal" },
  { id: "blur", name: "Bokeh Blur", emoji: "✨", description: "Smooth client-side depth-of-field background blur with adjustable strength", badge: "Bokeh" },
  { id: "image", name: "Virtual Background", emoji: "🖼️", description: "Replace your room with custom images or Discord aesthetic presets", badge: "Custom" },
  { id: "studio", name: "Studio Light", emoji: "🎙️", description: "Warm cinematic studio grading and soft vignette", badge: "Warm" },
  { id: "cyberpunk", name: "Neon Cyber", emoji: "🌆", description: "Electric cyan and magenta futuristic rim glow", badge: "Cyber" },
  { id: "sunset", name: "Golden Sunset", emoji: "🌅", description: "Cozy golden hour amber sunset ambiance", badge: "Warm" },
  { id: "matrix", name: "Digital Matrix", emoji: "🟩", description: "Subtle sci-fi green digital rain backdrop", badge: "FX" },
  { id: "cosmos", name: "Deep Space", emoji: "🌌", description: "Starlit nebula cosmic particles", badge: "Cosmic" },
];

export function loadCustomBackgrounds(): CustomBackgroundItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem("huddle_custom_backgrounds");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomBackground(name: string, dataUrl: string): CustomBackgroundItem {
  const items = loadCustomBackgrounds();
  const newItem: CustomBackgroundItem = {
    id: `custom:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.slice(0, 30),
    dataUrl,
    createdAt: Date.now(),
  };
  const updated = [newItem, ...items].slice(0, 12); // keep up to 12 custom backgrounds
  try {
    localStorage.setItem("huddle_custom_backgrounds", JSON.stringify(updated));
  } catch {
    // ignore
  }
  return newItem;
}

export function deleteCustomBackground(id: string): void {
  const items = loadCustomBackgrounds().filter((i) => i.id !== id);
  try {
    localStorage.setItem("huddle_custom_backgrounds", JSON.stringify(items));
  } catch {
    // ignore
  }
}

export interface VirtualBackgroundController {
  outputStream: MediaStream;
  setMode: (mode: BackgroundMode) => void;
  getMode: () => BackgroundMode;
  setBlurAmount: (blurPx: number) => void;
  getBlurAmount: () => number;
  setBackgroundImage: (imageUrlOrPresetId: string | null) => void;
  getBackgroundImage: () => string | null;
  stop: () => void;
}

/**
 * Dynamically loads MediaPipe SelfieSegmentation.
 * Falls back safely to CDN script injection if bundling environment requires it.
 */
let selfieSegmentationClass: any = null;
let selfieSegmentationLoading = false;

async function getSelfieSegmentationClass(): Promise<any> {
  if (selfieSegmentationClass) return selfieSegmentationClass;
  if (typeof window === "undefined") return null;

  if ((window as any).SelfieSegmentation) {
    selfieSegmentationClass = (window as any).SelfieSegmentation;
    return selfieSegmentationClass;
  }

  if (selfieSegmentationLoading) {
    // Wait for in-flight load
    await new Promise((r) => setTimeout(r, 200));
    return selfieSegmentationClass || (window as any).SelfieSegmentation || null;
  }

  selfieSegmentationLoading = true;
  try {
    const mod = await import("@mediapipe/selfie_segmentation");
    if (mod?.SelfieSegmentation) {
      selfieSegmentationClass = mod.SelfieSegmentation;
      selfieSegmentationLoading = false;
      return selfieSegmentationClass;
    }
  } catch {
    // Fall back to script injection from CDN
  }

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      selfieSegmentationClass = (window as any).SelfieSegmentation || null;
      selfieSegmentationLoading = false;
      resolve(selfieSegmentationClass);
    };
    script.onerror = () => {
      selfieSegmentationLoading = false;
      resolve(null);
    };
    document.head.appendChild(script);
  });
}

function resolveImageSource(idOrUrl: string | null): string | null {
  if (!idOrUrl) return null;
  if (idOrUrl.startsWith("preset:")) {
    const found = BUILTIN_BACKGROUND_IMAGES.find((p) => p.id === idOrUrl);
    return found ? found.svgDataUri : null;
  }
  if (idOrUrl.startsWith("custom:")) {
    const custom = loadCustomBackgrounds().find((c) => c.id === idOrUrl);
    return custom ? custom.dataUrl : null;
  }
  return idOrUrl;
}

/**
 * Creates the real-time client-side video processing pipeline for camera streams.
 * Handles AI person segmentation (SelfieSegmentation), custom blur amounts, and virtual background images.
 */
export function createVirtualBackgroundPipeline(
  rawStream: MediaStream,
  initialMode: BackgroundMode = "none",
  initialBlurAmount = 14,
  initialBackgroundImage: string | null = "preset:cyberpunk"
): VirtualBackgroundController {
  let currentMode = initialMode;
  let currentBlur = Math.max(4, Math.min(36, initialBlurAmount));
  let currentBgIdentifier = initialBackgroundImage;
  let animId: number | null = null;
  let isStopped = false;
  let segmenter: any = null;
  let isProcessingSegment = false;
  let latestSegmentationMask: any = null;

  const rawTrack = rawStream.getVideoTracks()[0];
  if (!rawTrack) {
    return {
      outputStream: rawStream,
      setMode: () => {},
      getMode: () => "none",
      setBlurAmount: () => {},
      getBlurAmount: () => 14,
      setBackgroundImage: () => {},
      getBackgroundImage: () => null,
      stop: () => {},
    };
  }

  // Pre-load background image element
  let bgImgElement: HTMLImageElement | null = null;
  function updateBgImgElement(src: string | null) {
    if (!src) {
      bgImgElement = null;
      return;
    }
    const resolved = resolveImageSource(src);
    if (!resolved) {
      bgImgElement = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = resolved;
    bgImgElement = img;
  }
  updateBgImgElement(currentBgIdentifier);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = rawStream;
  void video.play().catch(() => undefined);

  // Initialize MediaPipe Selfie Segmentation
  void getSelfieSegmentationClass().then((SelfieClass) => {
    if (isStopped || !SelfieClass) return;
    try {
      const seg = new SelfieClass({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });
      seg.setOptions({
        modelSelection: 1, // 1: landscape (optimized for webcams / video calls)
        selfieMode: false,
      });
      seg.onResults((results: any) => {
        latestSegmentationMask = results.segmentationMask;
        isProcessingSegment = false;
      });
      segmenter = seg;
    } catch {
      // Non-fatal, fallback pipeline continues
    }
  });

  // Matrix stream particles state
  const matrixChars = "010189ABCDEFΣΩΨλπ";
  const matrixDrops: number[] = [];
  let lastParticleTime = 0;

  function render(time: number) {
    if (isStopped) return;

    if (video.readyState >= 2) {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
        const cols = Math.floor(vw / 20);
        matrixDrops.length = 0;
        for (let i = 0; i < cols; i++) {
          matrixDrops.push(Math.random() * -50);
        }
      }

      // Send frame to MediaPipe segmenter if available
      if (segmenter && !isProcessingSegment && currentMode !== "none") {
        isProcessingSegment = true;
        segmenter.send({ image: video }).catch(() => {
          isProcessingSegment = false;
        });
      }

      if (ctx) {
        const w = canvas.width;
        const h = canvas.height;

        if (currentMode === "none") {
          ctx.filter = "none";
          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(video, 0, 0, w, h);
        } else if (latestSegmentationMask && (currentMode === "blur" || currentMode === "image")) {
          // TRUE AI CLIENT-SIDE PERSON SEGMENTATION
          ctx.save();
          ctx.clearRect(0, 0, w, h);

          // 1. Draw segmentation mask
          ctx.drawImage(latestSegmentationMask, 0, 0, w, h);

          // 2. Keep only the person using source-in
          ctx.globalCompositeOperation = "source-in";
          ctx.drawImage(video, 0, 0, w, h);

          // 3. Composite the virtual background or blur behind the person
          ctx.globalCompositeOperation = "destination-over";

          if (currentMode === "blur") {
            ctx.filter = `blur(${currentBlur}px)`;
            ctx.drawImage(video, 0, 0, w, h);
            ctx.filter = "none";
          } else if (currentMode === "image" && bgImgElement && bgImgElement.complete) {
            // Draw background image scaled cover-fit
            drawCoverImage(ctx, bgImgElement, w, h);
          } else {
            // Fallback dark room plate
            ctx.fillStyle = "#161324";
            ctx.fillRect(0, 0, w, h);
          }

          ctx.restore();
        } else if (currentMode === "blur") {
          // Smooth focal depth-of-field fallback while segmenter warms up
          ctx.save();
          ctx.filter = `blur(${currentBlur}px)`;
          ctx.drawImage(video, 0, 0, w, h);
          ctx.filter = "none";

          // Focal center
          const radial = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.55);
          radial.addColorStop(0, "rgba(0,0,0,0)");
          radial.addColorStop(1, "rgba(10, 10, 20, 0.4)");
          ctx.fillStyle = radial;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        } else if (currentMode === "image") {
          // Virtual image fallback while segmenter warms up
          if (bgImgElement && bgImgElement.complete) {
            drawCoverImage(ctx, bgImgElement, w, h);
          } else {
            ctx.fillStyle = "#1e1b2e";
            ctx.fillRect(0, 0, w, h);
          }
        } else if (currentMode === "studio") {
          ctx.filter = "contrast(1.08) brightness(1.04) saturate(1.1)";
          ctx.drawImage(video, 0, 0, w, h);

          const grad = ctx.createRadialGradient(w / 2, h * 0.4, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
          grad.addColorStop(0, "rgba(255, 230, 180, 0.08)");
          grad.addColorStop(0.7, "rgba(240, 160, 80, 0.12)");
          grad.addColorStop(1, "rgba(20, 12, 10, 0.4)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        } else if (currentMode === "cyberpunk") {
          ctx.filter = "contrast(1.14) saturate(1.22)";
          ctx.drawImage(video, 0, 0, w, h);

          const leftGrad = ctx.createLinearGradient(0, 0, w * 0.4, 0);
          leftGrad.addColorStop(0, "rgba(0, 240, 255, 0.25)");
          leftGrad.addColorStop(1, "rgba(0, 240, 255, 0)");
          ctx.fillStyle = leftGrad;
          ctx.fillRect(0, 0, w, h);

          const rightGrad = ctx.createLinearGradient(w, 0, w * 0.6, 0);
          rightGrad.addColorStop(0, "rgba(255, 0, 128, 0.25)");
          rightGrad.addColorStop(1, "rgba(255, 0, 128, 0)");
          ctx.fillStyle = rightGrad;
          ctx.fillRect(0, 0, w, h);
        } else if (currentMode === "sunset") {
          ctx.filter = "brightness(1.04) contrast(1.05) saturate(1.2)";
          ctx.drawImage(video, 0, 0, w, h);

          const sunsetGrad = ctx.createLinearGradient(0, 0, 0, h);
          sunsetGrad.addColorStop(0, "rgba(255, 120, 80, 0.16)");
          sunsetGrad.addColorStop(0.5, "rgba(255, 180, 60, 0.12)");
          sunsetGrad.addColorStop(1, "rgba(90, 20, 80, 0.28)");
          ctx.fillStyle = sunsetGrad;
          ctx.fillRect(0, 0, w, h);
        } else if (currentMode === "matrix") {
          ctx.filter = "contrast(1.08) hue-rotate(15deg)";
          ctx.drawImage(video, 0, 0, w, h);

          ctx.fillStyle = "rgba(0, 30, 10, 0.22)";
          ctx.fillRect(0, 0, w, h);

          ctx.font = "14px monospace";
          ctx.fillStyle = "rgba(0, 255, 128, 0.7)";

          if (time - lastParticleTime > 50) {
            lastParticleTime = time;
            for (let i = 0; i < matrixDrops.length; i++) {
              const char = matrixChars[Math.floor(Math.random() * matrixChars.length)];
              const x = i * 20;
              const y = matrixDrops[i] * 18;
              if (y > 0 && y < h) {
                ctx.fillText(char, x, y);
              }
              if (y > h && Math.random() > 0.975) {
                matrixDrops[i] = 0;
              } else {
                matrixDrops[i]++;
              }
            }
          }
        } else if (currentMode === "cosmos") {
          ctx.filter = "contrast(1.1) brightness(0.98)";
          ctx.drawImage(video, 0, 0, w, h);

          const nebula = ctx.createRadialGradient(w * 0.8, h * 0.2, 50, w * 0.5, h * 0.5, w);
          nebula.addColorStop(0, "rgba(147, 51, 234, 0.2)");
          nebula.addColorStop(0.5, "rgba(59, 130, 246, 0.15)");
          nebula.addColorStop(1, "rgba(15, 23, 42, 0.35)");
          ctx.fillStyle = nebula;
          ctx.fillRect(0, 0, w, h);

          const starSeed = Math.floor(time / 200);
          ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
          for (let s = 0; s < 25; s++) {
            const sx = (s * 97 + starSeed * 13) % w;
            const sy = (s * 61 + starSeed * 7) % h;
            const size = (s % 3) + 1;
            ctx.beginPath();
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    animId = requestAnimationFrame(render);
  }

  animId = requestAnimationFrame(render);

  const canvasStream = canvas.captureStream(30);

  return {
    outputStream: canvasStream,
    setMode: (mode: BackgroundMode) => {
      currentMode = mode;
      latestSegmentationMask = null;
    },
    getMode: () => currentMode,
    setBlurAmount: (blurPx: number) => {
      currentBlur = Math.max(4, Math.min(36, blurPx));
    },
    getBlurAmount: () => currentBlur,
    setBackgroundImage: (imageUrlOrPresetId: string | null) => {
      currentBgIdentifier = imageUrlOrPresetId;
      updateBgImgElement(imageUrlOrPresetId);
    },
    getBackgroundImage: () => currentBgIdentifier,
    stop: () => {
      isStopped = true;
      if (animId !== null) cancelAnimationFrame(animId);
      if (segmenter) {
        try {
          segmenter.close?.();
        } catch {
          // ignore
        }
        segmenter = null;
      }
      video.pause();
      video.srcObject = null;
      canvasStream.getTracks().forEach((t) => t.stop());
    },
  };
}

/**
 * Draws an image with object-fit: cover scaling onto a 2D canvas context.
 */
function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, canvasW: number, canvasH: number) {
  const imgW = img.naturalWidth || img.width || canvasW;
  const imgH = img.naturalHeight || img.height || canvasH;
  const imgRatio = imgW / imgH;
  const canvasRatio = canvasW / canvasH;

  let renderW = canvasW;
  let renderH = canvasH;
  let offsetX = 0;
  let offsetY = 0;

  if (imgRatio > canvasRatio) {
    renderW = canvasH * imgRatio;
    offsetX = (canvasW - renderW) / 2;
  } else {
    renderH = canvasW / imgRatio;
    offsetY = (canvasH - renderH) / 2;
  }

  ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
}
