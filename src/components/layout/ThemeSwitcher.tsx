import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Sun, Moon, Check, Sparkles } from 'lucide-react';
import {
  MaterialThemeState,
  triggerHaptic,
} from '../../lib/materialTheme';

const QUICK_ACCENT_PRESETS = [
  { id: 'indigo', name: 'Indigo', hex: '#6366F1' },
  { id: 'emerald', name: 'Emerald', hex: '#10B981' },
  { id: 'blue', name: 'Pixel Blue', hex: '#3B82F6' },
  { id: 'violet', name: 'Violet', hex: '#8B5CF6' },
];

interface ThemeSwitcherProps {
  themeState: MaterialThemeState;
  onUpdateTheme: React.Dispatch<React.SetStateAction<MaterialThemeState>>;
  isOpen: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onOpenFullStudio: () => void;
  onNotify?: (title: string, description?: string) => void;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  themeState,
  onUpdateTheme,
  isOpen,
  onToggleOpen,
  onClose,
  onOpenFullStudio,
  onNotify,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = themeState.mode === 'dark';

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light', themeState.hapticsEnabled);
          onToggleOpen();
        }}
        className="h-9 px-2.5 sm:px-3 rounded-full flex items-center gap-2 text-xs font-semibold cursor-pointer border transition-all active:scale-[0.98]"
        style={{
          background: 'var(--md-sys-color-surface-container)',
          borderColor: isOpen ? 'var(--studio-accent)' : 'var(--studio-border)',
          color: 'var(--md-sys-color-on-surface)',
          boxShadow: 'var(--studio-top-highlight)',
        }}
        title="Theme & Accent Switcher"
        aria-expanded={isOpen}
        aria-label="Theme & Accent Switcher"
      >
        <span
          className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/30"
          style={{ backgroundColor: themeState.seedHex }}
        />
        <Palette className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-variant)]" />
        <span className="hidden xl:inline text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
          Theme
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            className="absolute right-0 mt-2.5 p-4 rounded-2xl z-50 w-64 space-y-4 backdrop-blur-xl"
            style={{
              background: 'color-mix(in srgb, var(--md-sys-color-surface-container-low) 96%, transparent)',
              border: '1px solid var(--studio-border-strong)',
              boxShadow: '0 20px 44px -10px rgba(0, 0, 0, 0.55), var(--studio-top-highlight)',
            }}
          >
            {/* Dark / Light Segmented Switcher */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
                  Surface Mode
                </span>
                <span className="text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                  {isDark ? 'Dark Studio' : 'Light Studio'}
                </span>
              </div>
              <div
                className="grid grid-cols-2 p-1 rounded-xl gap-1"
                style={{
                  background: 'var(--md-sys-color-surface-container-lowest)',
                  border: '1px solid var(--studio-border)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light', themeState.hapticsEnabled);
                    onUpdateTheme((prev) => ({ ...prev, mode: 'dark' }));
                    onNotify?.('Switched to Dark Studio');
                  }}
                  className="py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  style={{
                    background: isDark ? 'var(--studio-accent)' : 'transparent',
                    color: isDark ? '#FFFFFF' : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light', themeState.hapticsEnabled);
                    onUpdateTheme((prev) => ({ ...prev, mode: 'light' }));
                    onNotify?.('Switched to Light Studio');
                  }}
                  className="py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  style={{
                    background: !isDark ? 'var(--studio-accent)' : 'transparent',
                    color: !isDark ? '#FFFFFF' : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </button>
              </div>
            </div>

            {/* 4 Curated Accent Presets */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] block">
                Studio Accent
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_ACCENT_PRESETS.map((preset) => {
                  const selected =
                    themeState.seedHex.toUpperCase() === preset.hex.toUpperCase();
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
                        onNotify?.(`Accent set to ${preset.name}`, preset.hex);
                      }}
                      className="px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer border transition-all active:scale-[0.98]"
                      style={{
                        background: selected
                          ? 'var(--md-sys-color-primary-container)'
                          : 'var(--md-sys-color-surface-container)',
                        borderColor: selected
                          ? preset.hex
                          : 'var(--studio-border)',
                        color: 'var(--md-sys-color-on-surface)',
                      }}
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: preset.hex }}
                      >
                        {selected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                      </span>
                      <span className="truncate">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullStudio();
              }}
              className="w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border transition-all hover:brightness-110"
              style={{
                background: 'var(--md-sys-color-surface-container)',
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-accent)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Open Material You Studio</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
