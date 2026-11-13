import React from 'react';
import { motion } from 'motion/react';
import {
  Radio,
  MessageSquare,
  QrCode,
  Code2,
  Database,
  HelpCircle,
  Maximize2,
  Minimize2,
  Columns3,
  User,
} from 'lucide-react';
import { QuantumAppIcon } from '../QuantumAppIcon';
import { MaterialThemeState, triggerHaptic } from '../../lib/materialTheme';
import { UserProfile } from '../../types';
import { WaverEngineStatus } from '../../lib/waverEngine';
import { ThemeSwitcher } from './ThemeSwitcher';

export type ActiveModuleTab = 'waver' | 'chat' | 'qr' | 'base64';

interface HeaderProps {
  activeTab: ActiveModuleTab;
  onSelectTab: (tab: ActiveModuleTab) => void;
  unreadChatCount: number;
  profile: UserProfile;
  onOpenProfile: () => void;
  themeState: MaterialThemeState;
  onUpdateTheme: React.Dispatch<React.SetStateAction<MaterialThemeState>>;
  isColorPickerOpen: boolean;
  onToggleColorPicker: () => void;
  onCloseColorPicker: () => void;
  onOpenFullStudio: () => void;
  isCacheDrawerOpen: boolean;
  onToggleCacheDrawer: () => void;
  cachedFileCount: number;
  workspaceWidth: 'standard' | 'wide' | 'full';
  onCycleWorkspaceWidth: () => void;
  containerWidthClass: string;
  wasmStatus: WaverEngineStatus;
  isMicActive?: boolean;
  onOpenGuide: () => void;
  onLogoClick: () => void;
  onNotify?: (title: string, description?: string) => void;
}

const NAV_ITEMS: Array<{
  id: ActiveModuleTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'waver', label: 'Acoustic Studio', icon: Radio },
  { id: 'chat', label: 'Sonic Chat', icon: MessageSquare },
  { id: 'qr', label: 'QR Code', icon: QrCode },
  { id: 'base64', label: 'Base64', icon: Code2 },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  unreadChatCount,
  profile,
  onOpenProfile,
  themeState,
  onUpdateTheme,
  isColorPickerOpen,
  onToggleColorPicker,
  onCloseColorPicker,
  onOpenFullStudio,
  isCacheDrawerOpen,
  onToggleCacheDrawer,
  cachedFileCount,
  workspaceWidth,
  onCycleWorkspaceWidth,
  containerWidthClass,
  wasmStatus,
  isMicActive = false,
  onOpenGuide,
  onLogoClick,
  onNotify,
}) => {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md border-b transition-colors"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--md-sys-color-surface) 80%, transparent)',
        borderColor: 'var(--studio-border)',
      }}
    >
      <div
        className={`${containerWidthClass} mx-auto px-3.5 sm:px-6 h-15 sm:h-16 flex items-center justify-between gap-2.5 transition-[max-width] duration-300`}
      >
        {/* Zone 1: Brand Lockup + Live Engine Status Indicator Pill */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink-0">
          <button
            type="button"
            onClick={onLogoClick}
            className="relative flex items-center justify-center cursor-pointer select-none transition-transform active:scale-95 rounded-xl"
            title="Click 5 times for secret telemetry"
            aria-label="Sound Link Brand Emblem"
          >
            <QuantumAppIcon
              preset={themeState.appIconPreset}
              shape={themeState.appIconShape}
              size="sm"
            />
          </button>

          <div className="flex items-center gap-2.5">
            <span className="text-sm sm:text-base font-bold tracking-tight text-[var(--md-sys-color-on-surface)] whitespace-nowrap font-[var(--font-display)]">
              Sound Link
            </span>

            {/* Live Status Indicator Pill */}
            <div
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border"
              style={{
                background: 'var(--md-sys-color-surface-container)',
                borderColor: 'var(--studio-border)',
                color: 'var(--md-sys-color-on-surface-variant)',
              }}
              title={
                wasmStatus.ready
                  ? `WASM Engine Ready (${wasmStatus.initTimeMs}ms) · 48kHz Offline`
                  : 'Compiling WebAssembly DSP Engine'
              }
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isMicActive
                      ? 'bg-rose-400'
                      : wasmStatus.ready
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isMicActive
                      ? 'bg-rose-500'
                      : wasmStatus.ready
                      ? 'bg-emerald-500'
                      : 'bg-amber-500'
                  }`}
                />
              </span>
              <span className="whitespace-nowrap">
                {isMicActive
                  ? 'Rx Mic Live'
                  : wasmStatus.ready
                  ? 'WASM Online'
                  : 'Booting'}
              </span>
            </div>
          </div>
        </div>

        {/* Zone 2: Desktop Segmented Navigation Bar with Sliding layoutId Pill */}
        <nav
          aria-label="Workspace Modules"
          className="hidden md:flex items-center p-1 rounded-full gap-0.5 border"
          style={{
            background: 'var(--md-sys-color-surface-container-lowest)',
            borderColor: 'var(--studio-border)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
          }}
        >
          {NAV_ITEMS.map((tab) => {
            const isActive = activeTab === tab.id;
            const IconComponent = tab.icon;
            const badge = tab.id === 'chat' ? unreadChatCount : 0;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light', themeState.hapticsEnabled);
                  onSelectTab(tab.id);
                }}
                className="relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-tight cursor-pointer whitespace-nowrap shrink-0 z-0"
                style={{
                  color: isActive
                    ? '#FFFFFF'
                    : 'var(--md-sys-color-on-surface-variant)',
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="header-active-tab-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-full -z-10"
                    style={{
                      background: 'var(--studio-accent)',
                      boxShadow:
                        '0 2px 10px -2px color-mix(in srgb, var(--studio-accent) 60%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.22)',
                    }}
                  />
                )}
                <IconComponent className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                {badge > 0 && (
                  <span
                    className="px-1.5 py-0.5 text-[10px] rounded-full font-mono font-bold leading-none"
                    style={{
                      background: isActive
                        ? 'rgba(255,255,255,0.22)'
                        : 'var(--studio-accent)',
                      color: '#FFFFFF',
                    }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Quick Actions & Theme/Accent Switcher */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Identity Chip */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light', themeState.hapticsEnabled);
              onOpenProfile();
            }}
            className="h-9 px-2.5 sm:px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap border transition-all active:scale-[0.98]"
            style={{
              background: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--studio-border)',
              color: 'var(--md-sys-color-on-surface)',
              boxShadow: 'var(--studio-top-highlight)',
            }}
            title="Node Identity Profile"
          >
            <User className="w-3.5 h-3.5 text-[var(--studio-accent)] shrink-0" />
            <span className="truncate max-w-[74px] sm:max-w-[110px]">
              {profile.username}
            </span>
          </button>

          {/* Offline Vault Drawer Trigger */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light', themeState.hapticsEnabled);
              onToggleCacheDrawer();
            }}
            className="relative h-9 px-2.5 rounded-full flex items-center justify-center gap-1.5 border cursor-pointer transition-all active:scale-[0.98]"
            style={{
              background: isCacheDrawerOpen
                ? 'var(--md-sys-color-primary-container)'
                : 'var(--md-sys-color-surface-container)',
              borderColor: isCacheDrawerOpen
                ? 'var(--studio-accent)'
                : 'var(--studio-border)',
              color: isCacheDrawerOpen
                ? 'var(--studio-accent)'
                : 'var(--md-sys-color-on-surface-variant)',
              boxShadow: 'var(--studio-top-highlight)',
            }}
            title="Offline Memory & CacheStorage Vault"
            aria-label="Open Offline Vault Drawer"
          >
            <Database className="w-3.5 h-3.5" />
            {cachedFileCount > 0 && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-[var(--studio-accent)] text-white leading-none">
                {cachedFileCount}
              </span>
            )}
          </button>

          {/* Workspace Canvas Width Switcher */}
          <button
            type="button"
            onClick={onCycleWorkspaceWidth}
            className="hidden md:flex h-9 px-2.5 rounded-full items-center justify-center gap-1.5 border text-xs font-semibold cursor-pointer transition-all active:scale-[0.98]"
            style={{
              background: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--studio-border)',
              color: 'var(--md-sys-color-on-surface-variant)',
              boxShadow: 'var(--studio-top-highlight)',
            }}
            title={`Workspace Width: ${
              workspaceWidth === 'standard'
                ? 'Compact (1024px)'
                : workspaceWidth === 'wide'
                ? 'Wide (1440px)'
                : 'Full Canvas (100%)'
            }`}
          >
            {workspaceWidth === 'full' ? (
              <Maximize2 className="w-3.5 h-3.5" />
            ) : workspaceWidth === 'wide' ? (
              <Columns3 className="w-3.5 h-3.5" />
            ) : (
              <Minimize2 className="w-3.5 h-3.5" />
            )}
            <span className="hidden xl:inline capitalize text-[11px]">{workspaceWidth}</span>
          </button>

          {/* Theme / Accent Switcher */}
          <ThemeSwitcher
            themeState={themeState}
            onUpdateTheme={onUpdateTheme}
            isOpen={isColorPickerOpen}
            onToggleOpen={onToggleColorPicker}
            onClose={onCloseColorPicker}
            onOpenFullStudio={onOpenFullStudio}
            onNotify={onNotify}
          />

          {/* Guide / Specs Button */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light', themeState.hapticsEnabled);
              onOpenGuide();
            }}
            className="h-9 w-9 rounded-full flex items-center justify-center border cursor-pointer transition-all active:scale-[0.98]"
            style={{
              background: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--studio-border)',
              color: 'var(--md-sys-color-on-surface-variant)',
              boxShadow: 'var(--studio-top-highlight)',
            }}
            title="Acoustic Guide & Offline Specs"
            aria-label="Open Acoustic Guide & Offline Specs"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
