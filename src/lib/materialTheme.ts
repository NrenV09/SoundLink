import React from 'react';
import {
  Activity,
  AudioLines,
  Binary,
  Bolt,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Code2,
  Cookie,
  Cpu,
  Database,
  Download,
  Ear,
  Eye,
  FileCheck2,
  FileCode2,
  FileText,
  FileUp,
  FlaskConical,
  FolderKanban,
  Gauge,
  Gavel,
  HardDrive,
  Headphones,
  HelpCircle,
  ImagePlus,
  Info,
  KeyRound,
  Layers,
  LayoutGrid,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  Music,
  Palette,
  Pause,
  Pipette,
  Play,
  QrCode,
  Radio,
  RefreshCw,
  Repeat,
  RotateCcw,
  Save,
  ScanLine,
  Send,
  Settings2,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Speaker,
  Square,
  Sun,
  Terminal,
  Trash2,
  Upload,
  UserCheck,
  Vibrate,
  Volume2,
  VolumeX,
  Wallpaper,
  Wand2,
  Waves,
  WifiOff,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type AppIconPresetId =
  | 'dynamic-adaptive'
  | 'monochrome'
  | 'quantum-core'
  | 'obsidian-pulse'
  | 'solar-flare'
  | 'cyber-blueprint';

export type AppIconShape =
  | 'squircle'
  | 'circle'
  | 'teardrop'
  | 'cookie'
  | 'rounded-square';

export interface MaterialThemeState {
  mode: 'light' | 'dark';
  contrast: 'standard' | 'high';
  source: 'wallpaper' | 'seed';
  seedHex: string;
  wallpaperId: string;
  customWallpaperUrl?: string;
  extractedColors?: string[];
  appIconPreset: AppIconPresetId;
  appIconShape: AppIconShape;
  hapticsEnabled: boolean;
}

export interface MaterialYouConfig {
  seedColor: string;
  paletteStyle: 'tonal-spot' | 'vibrant' | 'expressive' | 'neutral' | 'monochrome';
  contrastLevel: 'standard' | 'medium' | 'high';
  surfaceBlur: boolean;
  cornerRoundness: 'sharp' | 'standard' | 'expressive';
  reducedMotion: boolean;
  hapticFeedback: boolean;
  oledTrueBlack: boolean;
  wallpaperUrl?: string;
}

export const DEFAULT_M3_CONFIG: MaterialYouConfig = {
  seedColor: '#3B82F6',
  paletteStyle: 'tonal-spot',
  contrastLevel: 'standard',
  surfaceBlur: true,
  cornerRoundness: 'expressive',
  reducedMotion: false,
  hapticFeedback: true,
  oledTrueBlack: false,
};

export const DEFAULT_MATERIAL_THEME: MaterialThemeState = {
  mode: 'dark',
  contrast: 'standard',
  source: 'wallpaper',
  seedHex: '#3B82F6',
  wallpaperId: 'pixel-aurora',
  appIconPreset: 'dynamic-adaptive',
  appIconShape: 'squircle',
  hapticsEnabled: true,
};

export const MATERIAL_SEED_PRESETS = [
  { id: 'pixel-blue', name: 'Pixel Blue', hex: '#3B82F6', desc: 'Android 16 Default' },
  { id: 'emerald-mint', name: 'Emerald Mint', hex: '#10B981', desc: 'Acoustic Signal' },
  { id: 'iris-violet', name: 'Iris Violet', hex: '#8B5CF6', desc: 'Ultrasonic Carrier' },
  { id: 'amber-gold', name: 'Amber Gold', hex: '#F59E0B', desc: 'Solar Flare' },
  { id: 'coral-rose', name: 'Coral Rose', hex: '#F43F5E', desc: 'Crimson Pulse' },
  { id: 'cyan-wave', name: 'Cyan Wave', hex: '#06B6D4', desc: 'Harmonic Aqua' },
  { id: 'sage-olive', name: 'Sage Olive', hex: '#84CC16', desc: 'Organic Moss' },
  { id: 'magenta-bloom', name: 'Magenta Bloom', hex: '#D946EF', desc: 'Expressive Pop' },
];

export const M3_PRESET_SEEDS = MATERIAL_SEED_PRESETS;

export const WALLPAPER_PRESETS = [
  {
    id: 'pixel-aurora',
    name: 'Pixel Aurora',
    subtitle: 'Deep Indigo & Electric Cyan',
    seedHex: '#3B82F6',
    secondaryHex: '#06B6D4',
    tertiaryHex: '#8B5CF6',
    gradientCss: 'linear-gradient(135deg, #1e3a8a 0%, #0284c7 50%, #4f46e5 100%)',
  },
  {
    id: 'sonic-emerald',
    name: 'Sonic Wavefront',
    subtitle: 'Bio-Acoustic Mint & Teal',
    seedHex: '#10B981',
    secondaryHex: '#14B8A6',
    tertiaryHex: '#3B82F6',
    gradientCss: 'linear-gradient(135deg, #064e3b 0%, #059669 50%, #0d9488 100%)',
  },
  {
    id: 'ultrasonic-nebula',
    name: 'Ultrasonic Nebula',
    subtitle: 'High-Band Violet & Magenta',
    seedHex: '#8B5CF6',
    secondaryHex: '#D946EF',
    tertiaryHex: '#6366F1',
    gradientCss: 'linear-gradient(135deg, #2e1065 0%, #7c3aed 50%, #c026d3 100%)',
  },
  {
    id: 'solar-horizon',
    name: 'Solar Horizon',
    subtitle: 'Warm Amber & Coral Glow',
    seedHex: '#F59E0B',
    secondaryHex: '#F43F5E',
    tertiaryHex: '#EC4899',
    gradientCss: 'linear-gradient(135deg, #78350f 0%, #d97706 50%, #e11d48 100%)',
  },
];

export function getIconShapeRadiusClass(shape: AppIconShape): string {
  switch (shape) {
    case 'circle':
      return 'rounded-full';
    case 'teardrop':
      return 'rounded-tl-full rounded-tr-full rounded-bl-full rounded-br-xl';
    case 'cookie':
      return 'rounded-[34%]';
    case 'rounded-square':
      return 'rounded-2xl';
    case 'squircle':
    default:
      return 'rounded-[28%]';
  }
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = (hex || '#3B82F6').replace('#', '');
  const r = parseInt(clean.substring(0, 2) || '3b', 16) / 255;
  const g = parseInt(clean.substring(2, 4) || '82', 16) / 255;
  const b = parseInt(clean.substring(4, 6) || 'f6', 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const normH = ((h % 360) + 360) % 360;
  const normS = Math.max(0, Math.min(100, s)) / 100;
  const normL = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * normL - 1)) * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normL - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (normH >= 0 && normH < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (normH >= 60 && normH < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (normH >= 120 && normH < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (normH >= 180 && normH < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (normH >= 240 && normH < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  const toHex = (n: number) => {
    const val = Math.round((n + m) * 255);
    return Math.max(0, Math.min(255, val)).toString(16).padStart(2, '0');
  };

  return `#${toHex(rPrime)}${toHex(gPrime)}${toHex(bPrime)}`.toUpperCase();
}

export async function extractColorsFromImage(dataUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 48;
      canvas.height = 48;
      if (!ctx) {
        resolve(['#3B82F6', '#10B981', '#8B5CF6']);
        return;
      }
      ctx.drawImage(img, 0, 0, 48, 48);
      const data = ctx.getImageData(0, 0, 48, 48).data;
      const buckets = Array.from({ length: 12 }, () => ({
        r: 0,
        g: 0,
        b: 0,
        count: 0,
        score: 0,
      }));

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 128) continue;
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        const { h, s, l } = hexToHsl(hex);
        if (l < 15 || l > 88 || s < 15) continue;
        const idx = Math.floor(h / 30) % 12;
        const weight = (s / 100) * (1 - Math.abs(l - 50) / 50);
        buckets[idx].r += r;
        buckets[idx].g += g;
        buckets[idx].b += b;
        buckets[idx].count += 1;
        buckets[idx].score += weight;
      }

      const sorted = buckets
        .filter((b) => b.count > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((b) => {
          const r = Math.round(b.r / b.count);
          const g = Math.round(b.g / b.count);
          const bl = Math.round(b.b / b.count);
          return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`.toUpperCase();
        });

      resolve(sorted.length > 0 ? sorted : ['#3B82F6', '#10B981', '#8B5CF6']);
    };
    img.onerror = () => resolve(['#3B82F6', '#10B981', '#8B5CF6']);
    img.src = dataUrl;
  });
}

export function applyMaterialThemeToDocument(theme: MaterialThemeState): void {
  const isDark = theme.mode === 'dark';
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }

  applyMaterialYouTheme(
    {
      seedColor: theme.seedHex || '#3B82F6',
      paletteStyle: 'tonal-spot',
      contrastLevel: theme.contrast === 'high' ? 'high' : 'standard',
      surfaceBlur: true,
      cornerRoundness: 'expressive',
      reducedMotion: false,
      hapticFeedback: theme.hapticsEnabled,
      oledTrueBlack: false,
      wallpaperUrl: theme.customWallpaperUrl,
    },
    isDark
  );
}

export function applyMaterialYouTheme(config: MaterialYouConfig, isDark: boolean): void {
  const root = document.documentElement;
  const { h, s } = hexToHsl(config.seedColor || '#3B82F6');

  const pSat = Math.max(45, s);
  const secHue = (h + 15) % 360;
  const secSat = Math.max(18, Math.round(s * 0.45));
  const tertHue = (h + 65) % 360;
  const tertSat = Math.max(30, Math.round(s * 0.75));
  const neutralSat = Math.min(14, Math.round(s * 0.14));
  const neutralVarSat = Math.min(22, Math.round(s * 0.24));
  const cBoost = config.contrastLevel === 'high' ? 12 : config.contrastLevel === 'medium' ? 6 : 0;

  if (isDark) {
    root.style.setProperty('--md-sys-color-primary', hslToHex(h, pSat, Math.min(94, 78 + cBoost)));
    root.style.setProperty('--md-sys-color-on-primary', hslToHex(h, pSat, Math.max(4, 15 - cBoost)));
    root.style.setProperty('--md-sys-color-primary-container', hslToHex(h, Math.max(pSat - 10, 0), Math.max(18, 26 - Math.round(cBoost / 2))));
    root.style.setProperty('--md-sys-color-on-primary-container', hslToHex(h, pSat, Math.min(98, 90 + Math.round(cBoost / 2))));

    root.style.setProperty('--md-sys-color-secondary', hslToHex(secHue, secSat, Math.min(92, 76 + cBoost)));
    root.style.setProperty('--md-sys-color-on-secondary', hslToHex(secHue, secSat, Math.max(6, 18 - cBoost)));
    root.style.setProperty('--md-sys-color-secondary-container', hslToHex(secHue, secSat, Math.max(16, 25 - Math.round(cBoost / 2))));
    root.style.setProperty('--md-sys-color-on-secondary-container', hslToHex(secHue, secSat, Math.min(96, 88 + Math.round(cBoost / 2))));

    root.style.setProperty('--md-sys-color-tertiary', hslToHex(tertHue, tertSat, Math.min(94, 78 + cBoost)));
    root.style.setProperty('--md-sys-color-on-tertiary', hslToHex(tertHue, tertSat, Math.max(6, 16 - cBoost)));
    root.style.setProperty('--md-sys-color-tertiary-container', hslToHex(tertHue, tertSat, Math.max(18, 27 - Math.round(cBoost / 2))));
    root.style.setProperty('--md-sys-color-on-tertiary-container', hslToHex(tertHue, tertSat, Math.min(97, 90 + Math.round(cBoost / 2))));

    root.style.setProperty('--md-sys-color-surface', hslToHex(h, neutralSat, 6));
    root.style.setProperty('--md-sys-color-surface-dim', hslToHex(h, neutralSat, 5));
    root.style.setProperty('--md-sys-color-surface-container-lowest', hslToHex(h, neutralSat, 4));
    root.style.setProperty('--md-sys-color-surface-container-low', hslToHex(h, neutralSat, 9));
    root.style.setProperty('--md-sys-color-surface-container', hslToHex(h, neutralSat, 12));
    root.style.setProperty('--md-sys-color-surface-container-high', hslToHex(h, neutralSat, 16));
    root.style.setProperty('--md-sys-color-surface-container-highest', hslToHex(h, neutralSat, 21));

    root.style.setProperty('--md-sys-color-on-surface', hslToHex(h, neutralSat, Math.min(99, 92 + cBoost)));
    root.style.setProperty('--md-sys-color-on-surface-variant', hslToHex(h, neutralVarSat, Math.min(94, 76 + cBoost)));
    root.style.setProperty('--md-sys-color-outline', hslToHex(h, neutralVarSat, Math.min(82, 54 + cBoost)));
    root.style.setProperty('--md-sys-color-outline-variant', hslToHex(h, neutralVarSat, Math.min(62, 26 + cBoost)));
  } else {
    root.style.setProperty('--md-sys-color-primary', hslToHex(h, pSat, Math.max(18, 40 - cBoost)));
    root.style.setProperty('--md-sys-color-on-primary', '#FFFFFF');
    root.style.setProperty('--md-sys-color-primary-container', hslToHex(h, pSat, Math.min(95, 90 - Math.round(cBoost / 2))));
    root.style.setProperty('--md-sys-color-on-primary-container', hslToHex(h, pSat, Math.max(4, 14 - Math.round(cBoost / 2))));

    root.style.setProperty('--md-sys-color-secondary', hslToHex(secHue, secSat, Math.max(22, 42 - cBoost)));
    root.style.setProperty('--md-sys-color-on-secondary', '#FFFFFF');
    root.style.setProperty('--md-sys-color-secondary-container', hslToHex(secHue, secSat, 90));
    root.style.setProperty('--md-sys-color-on-secondary-container', hslToHex(secHue, secSat, 16));

    root.style.setProperty('--md-sys-color-tertiary', hslToHex(tertHue, tertSat, Math.max(20, 40 - cBoost)));
    root.style.setProperty('--md-sys-color-on-tertiary', '#FFFFFF');
    root.style.setProperty('--md-sys-color-tertiary-container', hslToHex(tertHue, tertSat, 90));
    root.style.setProperty('--md-sys-color-on-tertiary-container', hslToHex(tertHue, tertSat, 15));

    root.style.setProperty('--md-sys-color-surface', hslToHex(h, neutralSat, 98));
    root.style.setProperty('--md-sys-color-surface-dim', hslToHex(h, neutralSat, 90));
    root.style.setProperty('--md-sys-color-surface-container-lowest', '#FFFFFF');
    root.style.setProperty('--md-sys-color-surface-container-low', hslToHex(h, neutralSat, 96));
    root.style.setProperty('--md-sys-color-surface-container', hslToHex(h, neutralSat, 93));
    root.style.setProperty('--md-sys-color-surface-container-high', hslToHex(h, neutralSat, 90));
    root.style.setProperty('--md-sys-color-surface-container-highest', hslToHex(h, neutralSat, 86));

    root.style.setProperty('--md-sys-color-on-surface', hslToHex(h, neutralSat, Math.max(2, 10 - cBoost)));
    root.style.setProperty('--md-sys-color-on-surface-variant', hslToHex(h, neutralVarSat, Math.max(12, 32 - cBoost)));
    root.style.setProperty('--md-sys-color-outline', hslToHex(h, neutralVarSat, Math.max(22, 48 - cBoost)));
    root.style.setProperty('--md-sys-color-outline-variant', hslToHex(h, neutralVarSat, Math.max(55, 80 - cBoost)));
  }
}

export function triggerHaptic(
  typeOrConfig?: 'light' | 'medium' | 'heavy' | 'success' | MaterialYouConfig,
  enabledOrDuration?: boolean | number
): void {
  if (typeof enabledOrDuration === 'boolean' && !enabledOrDuration) return;
  if (
    typeOrConfig &&
    typeof typeOrConfig === 'object' &&
    'hapticFeedback' in typeOrConfig &&
    !typeOrConfig.hapticFeedback
  ) {
    return;
  }

  const ms =
    typeof enabledOrDuration === 'number'
      ? enabledOrDuration
      : typeOrConfig === 'medium'
      ? 16
      : typeOrConfig === 'heavy' || typeOrConfig === 'success'
      ? 24
      : 10;

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // Ignore on unsupported browsers
    }
  }
}

const OFFLINE_ICON_MAP: Record<string, LucideIcon> = {
  hub: Waves,
  graphic_eq: AudioLines,
  waves: Waves,
  surround_sound: Radio,
  radio: Radio,
  mic: Mic,
  mic_off: MicOff,
  volume_up: Volume2,
  volume_off: VolumeX,
  speaker: Speaker,
  hearing: Ear,
  equalizer: Sliders,
  memory: Cpu,
  offline_bolt: Zap,
  wifi_off: WifiOff,
  globe_off: WifiOff,
  forum: MessageSquare,
  qr_code_2: QrCode,
  qr_code_scanner: ScanLine,
  data_object: Code2,
  palette: Palette,
  science: FlaskConical,
  colors: Sparkles,
  help: HelpCircle,
  info: Info,
  light_mode: Sun,
  dark_mode: Moon,
  verified: ShieldCheck,
  verified_user: UserCheck,
  shield: Shield,
  gpp_maybe: ShieldAlert,
  lock: Lock,
  key: KeyRound,
  bolt: Bolt,
  widgets: LayoutGrid,
  policy: Gavel,
  gavel: Gavel,
  upload_file: FileUp,
  upload: Upload,
  download: Download,
  download_done: FileCheck2,
  delete: Trash2,
  delete_sweep: Trash2,
  content_copy: ClipboardCopy,
  check: Check,
  check_circle: CheckCircle2,
  close: X,
  tune: Settings2,
  wallpaper: Wallpaper,
  add_photo_alternate: ImagePlus,
  apps: Layers,
  category: FolderKanban,
  accessibility_new: Eye,
  vibration: Vibrate,
  colorize: Pipette,
  cookie: Cookie,
  database: Database,
  hard_drive: HardDrive,
  save: Save,
  play_arrow: Play,
  pause: Pause,
  stop: Square,
  replay: RotateCcw,
  refresh: RefreshCw,
  repeat: Repeat,
  send: Send,
  share: Share2,
  terminal: Terminal,
  binary: Binary,
  speed: Gauge,
  music_note: Music,
  headphones: Headphones,
  smartphone: Smartphone,
  auto_fix_high: Wand2,
  description: FileText,
  code: FileCode2,
  activity: Activity,
};

const ICON_SIZE_MAP: Record<string, number> = {
  'text-xs': 14,
  'text-sm': 16,
  'text-base': 18,
  'text-lg': 20,
  'text-xl': 22,
  'text-2xl': 24,
  'text-3xl': 28,
  'text-4xl': 32,
  'text-[11px]': 12,
  'text-[13px]': 14,
  'text-[14px]': 15,
  'text-[15px]': 16,
  'text-[16px]': 17,
  'text-[18px]': 18,
  'text-[20px]': 20,
  'text-[22px]': 22,
};

export const MaterialSymbol: React.FC<{
  name: string;
  filled?: boolean;
  className?: string;
  size?: number;
}> = ({ name, filled = false, className = '', size }) => {
  const IconComponent = OFFLINE_ICON_MAP[name] || Sparkles;

  let resolvedSize = size || 18;
  if (!size && className) {
    for (const [token, px] of Object.entries(ICON_SIZE_MAP)) {
      if (className.includes(token)) {
        resolvedSize = px;
        break;
      }
    }
  }

  return React.createElement(
    'span',
    {
      className: `inline-flex items-center justify-center shrink-0 select-none ${className}`,
      'aria-hidden': 'true',
    },
    React.createElement(IconComponent, {
      size: resolvedSize,
      strokeWidth: filled ? 2.4 : 2,
      className: 'shrink-0',
    })
  );
};
