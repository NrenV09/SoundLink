import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MaterialThemeState,
  MATERIAL_SEED_PRESETS,
  WALLPAPER_PRESETS,
  AppIconPresetId,
  AppIconShape,
  extractColorsFromImage,
  triggerHaptic,
  MaterialSymbol,
} from '../lib/materialTheme';
import { QuantumAppIcon } from './QuantumAppIcon';
import { cn } from '../lib/utils';

interface MaterialYouSettingsProps {
  themeState: MaterialThemeState;
  onUpdateTheme: (updater: (prev: MaterialThemeState) => MaterialThemeState) => void;
  isModal?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

const APP_ICON_PRESETS: { id: AppIconPresetId; name: string; desc: string }[] = [
  {
    id: 'dynamic-adaptive',
    name: 'Dynamic Adaptive',
    desc: 'Tonal Material You layers that adapt to wallpaper or seed color',
  },
  {
    id: 'monochrome',
    name: 'Monochrome Themed',
    desc: 'Android 16 minimal monochrome glyph with tonal surface contrast',
  },
  {
    id: 'quantum-core',
    name: 'Quantum Core',
    desc: 'Branded Quantum Link deep indigo & orbital cyan emblem',
  },
  {
    id: 'obsidian-pulse',
    name: 'Obsidian Pulse',
    desc: 'Branded stealth obsidian surface with emerald wave',
  },
  {
    id: 'solar-flare',
    name: 'Solar Horizon',
    desc: 'Branded warm amber & coral expressive gradient',
  },
  {
    id: 'cyber-blueprint',
    name: 'Blueprint Grid',
    desc: 'Branded engineering blueprint with precision vector mesh',
  },
];

const APP_ICON_SHAPES: { id: AppIconShape; label: string; icon: string }[] = [
  { id: 'squircle', label: 'Squircle', icon: 'crop_square' },
  { id: 'circle', label: 'Circle', icon: 'circle' },
  { id: 'teardrop', label: 'Teardrop', icon: 'water_drop' },
  { id: 'cookie', label: 'Soft Clover', icon: 'filter_vintage' },
  { id: 'rounded-square', label: 'Rounded 16dp', icon: 'check_box_outline_blank' },
];

export const MaterialYouSettingsContent: React.FC<{
  themeState: MaterialThemeState;
  onUpdateTheme: (updater: (prev: MaterialThemeState) => MaterialThemeState) => void;
  onClose?: () => void;
}> = ({ themeState, onUpdateTheme, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      const colors = await extractColorsFromImage(dataUrl);
      triggerHaptic('success', themeState.hapticsEnabled);
      onUpdateTheme((prev) => ({
        ...prev,
        source: 'wallpaper',
         wallpaperId: 'custom',
        customWallpaperUrl: dataUrl,
        extractedColors: colors,
        seedHex: colors[0] || prev.seedHex,
      }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-full h-full overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
      {/* Top Expressive Hero Banner */}
      <div className="m3-card-xl p-6 sm:p-8 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2 text-xs font-medium text-[color:var(--md-sys-color-primary)]">
            <MaterialSymbol name="palette" size={18} filled />
            <span>Android 16 • Material You (M3 Expressive)</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">
            Wallpaper, Style & App Icon
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            Personalize Quantum Link with dynamic wallpaper color extraction, custom hex seeds, high-contrast accessibility modes, and adaptive launcher icons.
          </p>
        </div>

        {/* Live Launcher Preview Pill */}
        <div
          className="p-4 rounded-[24px] border flex items-center gap-4 shrink-0 self-stretch md:self-auto justify-between md:justify-start"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <QuantumAppIcon
            preset={themeState.appIconPreset}
            shape={themeState.appIconShape}
            size="lg"
          />
          <div className="pr-2">
            <div className="text-sm font-bold text-text">Quantum Link</div>
            <div className="text-xs text-muted mt-0.5">
              {APP_ICON_PRESETS.find((p) => p.id === themeState.appIconPreset)?.name} •{' '}
              <span className="font-mono uppercase">{themeState.seedHex}</span>
            </div>
          </div>
          {onClose && (
            <button
              onClick={() => {
                triggerHaptic('light', themeState.hapticsEnabled);
                onClose();
              }}
              className="m3-btn-tonal px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
      </div>

      {/* Main 12-Column Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Dynamic Color Engine (Wallpaper Extraction + Custom Seed) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Theme Mode & Contrast */}
          <div className="m3-card p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <MaterialSymbol name="contrast" className="text-[color:var(--md-sys-color-primary)]" />
                <div>
                  <h3 className="text-base font-bold text-text">Appearance & Contrast</h3>
                  <p className="text-xs text-muted">Switch between Light, Dark, and High-Contrast tonal surfaces</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Light Mode */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light', themeState.hapticsEnabled);
                  onUpdateTheme((prev) => ({ ...prev, mode: 'light', contrast: 'standard' }));
                }}
                className={cn(
                  'p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 active:scale-[0.98]',
                  themeState.mode === 'light' && themeState.contrast === 'standard'
                    ? 'm3-tonal-active'
                    : 'm3-surface-interactive'
                )}
              >
                <MaterialSymbol
                  name="light_mode"
                  filled={themeState.mode === 'light' && themeState.contrast === 'standard'}
                />
                <div>
                  <div className="text-sm font-bold">Light</div>
                  <div className="text-[11px] opacity-75">Daylight tonal</div>
                </div>
              </button>

              {/* Dark Mode */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light', themeState.hapticsEnabled);
                  onUpdateTheme((prev) => ({ ...prev, mode: 'dark', contrast: 'standard' }));
                }}
                className={cn(
                  'p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 active:scale-[0.98]',
                  themeState.mode === 'dark' && themeState.contrast === 'standard'
                    ? 'm3-tonal-active'
                    : 'm3-surface-interactive'
                )}
              >
                <MaterialSymbol
                  name="dark_mode"
                  filled={themeState.mode === 'dark' && themeState.contrast === 'standard'}
                />
                <div>
                  <div className="text-sm font-bold">Dark</div>
                  <div className="text-[11px] opacity-75">OLED expressive</div>
                </div>
              </button>

              {/* High Contrast Mode */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium', themeState.hapticsEnabled);
                  onUpdateTheme((prev) => ({
                    ...prev,
                    contrast: prev.contrast === 'high' ? 'standard' : 'high',
                  }));
                }}
                className={cn(
                  'p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 active:scale-[0.98]',
                  themeState.contrast === 'high' ? 'm3-tonal-active' : 'm3-surface-interactive'
                )}
              >
                <MaterialSymbol name="accessibility_new" filled={themeState.contrast === 'high'} />
                <div>
                  <div className="text-sm font-bold">High Contrast</div>
                  <div className="text-[11px] opacity-75">
                    {themeState.contrast === 'high' ? 'Active (Enhanced)' : 'Standard outlines'}
                  </div>
                </div>
              </button>
            </div>

            {/* Haptic Feedback Hook Toggle */}
            <div
              className="pt-4 border-t flex items-center justify-between gap-4"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
            >
              <div className="flex items-center gap-3">
                <MaterialSymbol name="vibration" className="text-[color:var(--md-sys-color-primary)]" />
                <div>
                  <div className="text-sm font-semibold text-text">System Haptic Feedback</div>
                  <div className="text-xs text-muted">
                    Tactile micro-vibration feedback on pill buttons, switches, and gestures
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !themeState.hapticsEnabled;
                  if (next) triggerHaptic('medium', true);
                  onUpdateTheme((prev) => ({ ...prev, hapticsEnabled: next }));
                }}
                className={cn(
                  'px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer active:scale-95',
                  themeState.hapticsEnabled ? 'm3-btn-filled' : 'm3-surface-interactive border'
                )}
              >
                {themeState.hapticsEnabled ? 'Haptics ON' : 'Haptics OFF'}
              </button>
            </div>
          </div>

          {/* Card 2: Dynamic Color Engine (Wallpaper Extraction vs Seed Color) */}
          <div className="m3-card p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <MaterialSymbol name="colorize" className="text-[color:var(--md-sys-color-primary)]" />
                <div>
                  <h3 className="text-base font-bold text-text">Dynamic Color Engine</h3>
                  <p className="text-xs text-muted">
                    Extract tonal palettes from wallpaper imagery or pick a custom hex seed
                  </p>
                </div>
              </div>

              {/* Segmented Pill Toggle */}
              <div
                className="flex p-1 rounded-full border self-start sm:self-auto"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-low)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light', themeState.hapticsEnabled);
                    onUpdateTheme((prev) => ({ ...prev, source: 'wallpaper' }));
                  }}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap',
                    themeState.source === 'wallpaper' ? 'm3-btn-filled' : 'text-muted hover:text-text'
                  )}
                >
                  <MaterialSymbol name="wallpaper" size={16} />
                  <span>Wallpaper Extraction</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light', themeState.hapticsEnabled);
                    onUpdateTheme((prev) => ({ ...prev, source: 'seed' }));
                  }}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap',
                    themeState.source === 'seed' ? 'm3-btn-filled' : 'text-muted hover:text-text'
                  )}
                >
                  <MaterialSymbol name="palette" size={16} />
                  <span>Custom Seed</span>
                </button>
              </div>
            </div>

            {themeState.source === 'wallpaper' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {WALLPAPER_PRESETS.map((wp) => {
                    const active = themeState.wallpaperId === wp.id;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light', themeState.hapticsEnabled);
                          onUpdateTheme((prev) => ({
                            ...prev,
                            source: 'wallpaper',
                            wallpaperId: wp.id,
                            seedHex: wp.seedHex,
                          }));
                        }}
                        className={cn(
                          'p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3.5 active:scale-[0.98]',
                          active ? 'm3-tonal-active' : 'm3-surface-interactive'
                        )}
                      >
                        <div
                          className="w-14 h-14 rounded-xl shrink-0 border border-white/20 shadow-xs relative overflow-hidden flex items-end p-1.5"
                          style={{ background: wp.gradientCss }}
                        >
                          <div className="flex gap-1">
                            <span
                              className="w-3 h-3 rounded-full border border-white/60"
                              style={{ backgroundColor: wp.seedHex }}
                            />
                            <span
                              className="w-3 h-3 rounded-full border border-white/60"
                              style={{ backgroundColor: wp.secondaryHex }}
                            />
                            <span
                              className="w-3 h-3 rounded-full border border-white/60"
                              style={{ backgroundColor: wp.tertiaryHex }}
                            />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate">{wp.name}</div>
                          <div className="text-xs opacity-75 truncate">{wp.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Upload Custom Wallpaper for Automatic Extraction */}
                <div
                  className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-low)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {themeState.customWallpaperUrl ? (
                      <img
                        src={themeState.customWallpaperUrl}
                        alt="Uploaded Wallpaper"
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-xl object-cover border"
                        style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center border"
                        style={{
                          backgroundColor: 'var(--md-sys-color-primary-container)',
                          color: 'var(--md-sys-color-on-primary-container)',
                          borderColor: 'var(--md-sys-color-outline-variant)',
                        }}
                      >
                        <MaterialSymbol name="add_photo_alternate" />
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold text-text">Extract from Your Own Wallpaper</div>
                      <div className="text-[11px] text-muted">
                        Upload any image to sample dominant primary, secondary & tertiary seeds
                      </div>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleWallpaperUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="m3-btn-tonal px-4 py-2.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5"
                  >
                    <MaterialSymbol name="upload_file" size={16} />
                    <span>Choose Image</span>
                  </button>
                </div>

                {themeState.extractedColors && themeState.extractedColors.length > 0 && (
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-xs font-medium text-muted">Extracted Swatches:</span>
                    <div className="flex items-center gap-2">
                      {themeState.extractedColors.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light', themeState.hapticsEnabled);
                            onUpdateTheme((prev) => ({ ...prev, seedHex: hex }));
                          }}
                          className={cn(
                            'w-8 h-8 rounded-full border-2 transition-transform cursor-pointer active:scale-90',
                            themeState.seedHex.toLowerCase() === hex.toLowerCase()
                              ? 'scale-110 border-white ring-2 ring-[color:var(--md-sys-color-primary)]'
                              : 'border-white/40'
                          )}
                          style={{ backgroundColor: hex }}
                          title={`Apply extracted seed ${hex}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Custom Seed Hex Palette Selector */
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {MATERIAL_SEED_PRESETS.map((preset) => {
                    const isSelected = themeState.seedHex.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light', themeState.hapticsEnabled);
                          onUpdateTheme((prev) => ({
                            ...prev,
                            source: 'seed',
                            seedHex: preset.hex,
                          }));
                        }}
                        className={cn(
                          'p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-2.5 active:scale-[0.97]',
                          isSelected ? 'm3-tonal-active' : 'm3-surface-interactive'
                        )}
                      >
                        <span
                          className="w-7 h-7 rounded-full shrink-0 border border-white/30 flex items-center justify-center shadow-2xs"
                          style={{ backgroundColor: preset.hex }}
                        >
                          {isSelected && (
                            <MaterialSymbol name="check" size={16} className="text-white" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{preset.name}</div>
                          <div className="text-[10px] font-mono opacity-75 uppercase">{preset.hex}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Hex Color Picker Input */}
                <div
                  className="p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-low)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor="custom-seed-color-picker"
                      className="w-10 h-10 rounded-full border-2 border-white/50 shadow-sm cursor-pointer shrink-0 overflow-hidden relative"
                      style={{ backgroundColor: themeState.seedHex }}
                    >
                      <input
                        id="custom-seed-color-picker"
                        type="color"
                        value={themeState.seedHex}
                        onChange={(e) =>
                          onUpdateTheme((prev) => ({
                            ...prev,
                            source: 'seed',
                            seedHex: e.target.value,
                          }))
                        }
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                      />
                    </label>
                    <div>
                      <div className="text-xs font-bold text-text">Custom Hex Seed Color</div>
                      <div className="text-[11px] text-muted">
                        Generates full primary, secondary, tertiary & tonal container roles
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={themeState.seedHex}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                          onUpdateTheme((prev) => ({
                            ...prev,
                            source: 'seed',
                            seedHex: val.length === 7 ? val : prev.seedHex,
                          }));
                        }
                      }}
                      className="w-28 px-3 py-2 rounded-xl border text-xs font-mono uppercase text-text bg-transparent outline-none"
                      style={{ borderColor: 'var(--md-sys-color-outline)' }}
                      aria-label="Custom Hex Seed"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Active M3 Color Roles Strip */}
            <div className="pt-2">
              <div className="text-xs font-medium text-muted mb-2">
                Active Material 3 Tonal Roles
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[10px] font-medium">
                <div
                  className="p-2.5 rounded-xl flex flex-col justify-between h-14 border"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary)',
                    color: 'var(--md-sys-color-on-primary)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <span>Primary</span>
                </div>
                <div
                  className="p-2.5 rounded-xl flex flex-col justify-between h-14 border"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <span>Primary Cont.</span>
                </div>
                <div
                  className="p-2.5 rounded-xl flex flex-col justify-between h-14 border"
                  style={{
                    backgroundColor: 'var(--md-sys-color-secondary-container)',
                    color: 'var(--md-sys-color-on-secondary-container)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <span>Secondary Cont.</span>
                </div>
                <div
                  className="p-2.5 rounded-xl flex flex-col justify-between h-14 border"
                  style={{
                    backgroundColor: 'var(--md-sys-color-tertiary-container)',
                    color: 'var(--md-sys-color-on-tertiary-container)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <span>Tertiary Cont.</span>
                </div>
                <div
                  className="p-2.5 rounded-xl flex flex-col justify-between h-14 border"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    color: 'var(--md-sys-color-on-surface)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <span>Surface High</span>
                </div>
                <div
                  className="p-2.5 rounded-xl flex flex-col justify-between h-14 border"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface)',
                    color: 'var(--md-sys-color-on-surface-variant)',
                    borderColor: 'var(--md-sys-color-outline)',
                  }}
                >
                  <span>Outline Token</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Custom App Icon Selection & Adaptive Shape */}
        <div className="lg:col-span-5 space-y-6">
          <div className="m3-card p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-2.5">
              <MaterialSymbol name="apps" className="text-[color:var(--md-sys-color-primary)]" />
              <div>
                <h3 className="text-base font-bold text-text">Custom App Icon & Imagery</h3>
                <p className="text-xs text-muted">
                  Choose Monochrome, Dynamic Adaptive, or Branded Quantum Link presets
                </p>
              </div>
            </div>

            {/* Preset Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {APP_ICON_PRESETS.map((item) => {
                const selected = themeState.appIconPreset === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light', themeState.hapticsEnabled);
                      onUpdateTheme((prev) => ({ ...prev, appIconPreset: item.id }));
                    }}
                    className={cn(
                      'p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 active:scale-[0.98]',
                      selected ? 'm3-tonal-active' : 'm3-surface-interactive'
                    )}
                  >
                    <QuantumAppIcon
                      preset={item.id}
                      shape={themeState.appIconShape}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{item.name}</div>
                      <div className="text-[11px] opacity-75 leading-snug mt-0.5 line-clamp-2">
                        {item.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Adaptive Icon Mask Shape Selector */}
            <div
              className="pt-4 border-t space-y-3"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
            >
              <div className="text-xs font-bold text-text flex items-center gap-1.5">
                <MaterialSymbol name="category" size={16} className="text-[color:var(--md-sys-color-primary)]" />
                <span>Android 16 Adaptive Icon Shape</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {APP_ICON_SHAPES.map((sh) => {
                  const active = themeState.appIconShape === sh.id;
                  return (
                    <button
                      key={sh.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light', themeState.hapticsEnabled);
                        onUpdateTheme((prev) => ({ ...prev, appIconShape: sh.id }));
                      }}
                      className={cn(
                        'px-3.5 py-2 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95',
                        active ? 'm3-btn-filled' : 'm3-surface-interactive'
                      )}
                    >
                      <MaterialSymbol name={sh.icon} size={15} />
                      <span>{sh.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const MaterialYouSettingsModal: React.FC<MaterialYouSettingsProps> = ({
  themeState,
  onUpdateTheme,
  isOpen,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 32, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 32, scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-t-[28px] sm:rounded-[28px] border shadow-2xl overflow-hidden"
            style={{
              backgroundColor: 'var(--md-sys-color-surface)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            {/* Bottom-sheet grab handle on mobile */}
            <div className="w-10 h-1.5 rounded-full bg-current opacity-20 mx-auto mt-3 sm:hidden shrink-0" />
            <MaterialYouSettingsContent
              themeState={themeState}
              onUpdateTheme={onUpdateTheme}
              onClose={onClose}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
