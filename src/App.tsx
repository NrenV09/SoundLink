import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ProfileModal } from './components/ProfileModal';
import { SecureChatNode } from './components/SecureChatNode';
import { QRUtilityNode } from './components/QRUtilityNode';
import { Base64ToolNode } from './components/Base64ToolNode';
import { WaverSonicNode, DecodedAcousticPacket } from './components/WaverSonicNode';
import { generateRandomName } from './lib/nameGenerator';
import { UserProfile, ChatMessage } from './types';
import { EasterEggModal } from './components/EasterEggModal';
import { NexusInfoModal } from './components/NexusInfoModal';
import { QuantumAppIcon } from './components/QuantumAppIcon';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { cacheStorageManager, CachedFileMetadata } from './lib/cacheStorage';
import {
  MaterialThemeState,
  DEFAULT_MATERIAL_THEME,
  MATERIAL_SEED_PRESETS,
  applyMaterialThemeToDocument,
  triggerHaptic,
  MaterialSymbol,
} from './lib/materialTheme';
import { MaterialYouSettingsModal } from './components/MaterialYouSettingsModal';
import {
  preloadWaverWasmEngine,
  subscribeWaverEngineStatus,
  WaverEngineStatus,
} from './lib/waverEngine';

type ActiveModuleTab = 'waver' | 'chat' | 'qr' | 'base64';

export default function App() {
  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('quantum_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.username) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    const newProfile: UserProfile = {
      id: `NODE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      username: generateRandomName(),
      avatarColor: 'bg-blue-500',
      bio: 'Acoustic FSK Node · 100% Offline Air-Gapped',
      joinedAt: new Date().toLocaleDateString(),
    };
    try {
      localStorage.setItem('quantum_profile', JSON.stringify(newProfile));
    } catch {
      // Ignore
    }
    return newProfile;
  });

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoModalTab, setInfoModalTab] = useState<'guide' | 'capabilities' | 'specs' | 'legal'>('guide');
  const [activeTab, setActiveTab] = useState<ActiveModuleTab>('waver');

  const [themeState, setThemeState] = useState<MaterialThemeState>(() => {
    try {
      const saved = localStorage.getItem('quantum_m3_theme_state');
      if (saved) return { ...DEFAULT_MATERIAL_THEME, ...JSON.parse(saved) };
    } catch {
      // Ignore
    }
    return DEFAULT_MATERIAL_THEME;
  });

  const [isM3SettingsOpen, setIsM3SettingsOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isCacheDrawerOpen, setIsCacheDrawerOpen] = useState(false);
  const [cachedFiles, setCachedFiles] = useState<CachedFileMetadata[]>([]);

  const [wasmStatus, setWasmStatus] = useState<WaverEngineStatus>({
    ready: false,
    cachedInStorage: false,
    wasmSizeKB: 134,
    sampleRate: 48000,
    initTimeMs: 0,
    engineVersion: 'ggwave v0.4.0',
    error: null,
  });

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Easter Egg State
  const [, setLogoClicks] = useState(0);
  const [isEasterEggOpen, setIsEasterEggOpen] = useState(false);
  const logoClickTimeoutRef = useRef<number | null>(null);

  // Preload ggwave WASM engine immediately when App mounts
  useEffect(() => {
    const unsub = subscribeWaverEngineStatus((st) => {
      setWasmStatus(st);
    });
    preloadWaverWasmEngine().catch(() => {});
    return () => unsub();
  }, []);

  const refreshCachedFiles = useCallback(async () => {
    const files = await cacheStorageManager.getCachedFiles();
    setCachedFiles(files);
  }, []);

  useEffect(() => {
    refreshCachedFiles();
  }, [refreshCachedFiles]);

  // Apply Material You Dynamic Color Engine
  useEffect(() => {
    applyMaterialThemeToDocument(themeState);
    try {
      localStorage.setItem('quantum_m3_theme_state', JSON.stringify(themeState));
    } catch {
      // Ignore
    }
  }, [themeState]);

  useEffect(() => {
    if (activeTab === 'chat') {
      setUnreadChatCount(0);
    }
  }, [activeTab]);

  const handleLogoClick = () => {
    setLogoClicks((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        setIsEasterEggOpen(true);
        return 0;
      }
      return next;
    });

    if (logoClickTimeoutRef.current) {
      clearTimeout(logoClickTimeoutRef.current);
    }
    logoClickTimeoutRef.current = window.setTimeout(() => {
      setLogoClicks(0);
    }, 2000);
  };

  const handleSaveProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    try {
      localStorage.setItem('quantum_profile', JSON.stringify(newProfile));
    } catch {
      // Ignore
    }
  };

  const handleSendChatMessage = (text: string) => {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'me',
      senderName: profile.username,
      text,
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, msg]);
  };

  const handleSendVoiceMessage = (audioData: string) => {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'me',
      senderName: profile.username,
      text: '',
      timestamp: new Date(),
      audioData,
    };
    setChatMessages((prev) => [...prev, msg]);
  };

  const handleIncomingAcousticChat = useCallback(
    (text: string, protocolLabel: string) => {
      const msg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'them',
        senderName: `Acoustic Rx (${protocolLabel})`,
        text,
        timestamp: new Date(),
      };
      setChatMessages((prev) => [...prev, msg]);
      if (activeTab !== 'chat') {
        setUnreadChatCount((c) => c + 1);
      }
    },
    [activeTab]
  );

  const handlePacketDecodedFromWaver = useCallback((pkt: DecodedAcousticPacket) => {
    const msg: ChatMessage = {
      id: pkt.id,
      sender: 'them',
      senderName: `Waver ${
        pkt.source === 'microphone'
          ? 'Mic Rx'
          : pkt.source === 'loopback'
          ? 'Loopback'
          : 'WAV'
      }`,
      text: pkt.isFilePayload && pkt.fileContent ? pkt.fileContent : pkt.text,
      timestamp: new Date(pkt.timestamp),
    };
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  const handleDownloadSingleFile = () => {
    try {
      const htmlContent = document.documentElement.outerHTML;
      const fullHtml = '<!DOCTYPE html>\n' + htmlContent;
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SoundLink_Waver_Offline.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Ignore
    }
  };

  const isDark = themeState.mode === 'dark';

  return (
    <div
      className="min-h-screen flex flex-col selection:bg-blue-500/30 relative overflow-x-hidden pb-28 sm:pb-10"
      style={{
        background: 'var(--md-sys-color-surface)',
        color: 'var(--md-sys-color-on-surface)',
      }}
    >
      {/* Dynamic Material You Ambient Wallpaper Backdrop */}
      {themeState.customWallpaperUrl ? (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src={themeState.customWallpaperUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-20 dark:opacity-15 scale-110 blur-3xl transition-opacity duration-700"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 0%, transparent 0%, var(--md-sys-color-surface) 85%)',
            }}
          />
        </div>
      ) : (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div
            className="absolute -top-36 -left-36 w-[28rem] h-[28rem] rounded-full opacity-25 blur-3xl transition-colors duration-700"
            style={{ background: 'var(--md-sys-color-primary-container)' }}
          />
          <div
            className="absolute top-1/3 -right-36 w-[28rem] h-[28rem] rounded-full opacity-20 blur-3xl transition-colors duration-700"
            style={{ background: 'var(--md-sys-color-tertiary-container)' }}
          />
        </div>
      )}

      {/* Clean, Unboxed Android 16 Material You Top Bar */}
      <header
        className="sticky top-0 z-30 backdrop-blur-xl transition-colors"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--md-sys-color-surface) 82%, transparent)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          {/* Zone 1: Brand Lockup */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              onClick={handleLogoClick}
              className="relative flex items-center justify-center cursor-pointer select-none transition-transform active:scale-90"
              title="Click 5 times for secret telemetry"
            >
              <QuantumAppIcon
                preset={themeState.appIconPreset}
                shape={themeState.appIconShape}
                size="sm"
              />
            </div>
            <span className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
              Sound Link
            </span>
          </div>

          {/* Zone 2: Desktop Floating Pill Navigation */}
          <nav
            className="hidden md:flex items-center p-1 rounded-full gap-1"
            style={{ background: 'var(--md-sys-color-surface-container-low)' }}
          >
            {(
              [
                { id: 'waver', label: 'Acoustic Studio', icon: 'surround_sound' },
                { id: 'chat', label: 'Sonic Chat', icon: 'forum', badge: unreadChatCount },
                { id: 'qr', label: 'QR Code', icon: 'qr_code_2' },
                { id: 'base64', label: 'Base64', icon: 'data_object' },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    triggerHaptic('light', themeState.hapticsEnabled);
                    setActiveTab(tab.id);
                  }}
                  className="relative flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all cursor-pointer whitespace-nowrap shrink-0"
                  style={{
                    background: isActive
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'transparent',
                    color: isActive
                      ? 'var(--md-sys-color-on-secondary-container)'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  <MaterialSymbol name={tab.icon} filled={isActive} className="text-sm" />
                  <span>{tab.label}</span>
                  {'badge' in tab && tab.badge ? (
                    <span
                      className="px-1.5 py-0.5 text-[10px] rounded-full font-extrabold"
                      style={{
                        background: 'var(--md-sys-color-primary)',
                        color: 'var(--md-sys-color-on-primary)',
                      }}
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Compact Touch-Friendly Action Controls (44x44px hitboxes on mobile) */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Identity Chip */}
            <button
              onClick={() => {
                triggerHaptic('light', themeState.hapticsEnabled);
                setIsProfileOpen(true);
              }}
              className="m3-btn-tonal min-h-[40px] px-3 sm:px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Node Identity Profile"
            >
              <span className="truncate max-w-[84px] sm:max-w-[120px]">
                {profile.username}
              </span>
            </button>

            {/* Offline Cache Vault */}
            <button
              onClick={() => {
                triggerHaptic('light', themeState.hapticsEnabled);
                refreshCachedFiles();
                setIsCacheDrawerOpen((v) => !v);
              }}
              className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] cursor-pointer"
              title="Offline Sandbox Cache & WASM Vault"
            >
              <MaterialSymbol name="database" className="text-lg" />
            </button>

            {/* Quick Seed Color Swatch Popover (Desktop/Tablet) */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => {
                  triggerHaptic('light', themeState.hapticsEnabled);
                  setIsColorPickerOpen((v) => !v);
                }}
                className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] cursor-pointer"
                title="Material You Theme & Seed Color"
              >
                <MaterialSymbol name="palette" className="text-lg" />
              </button>

              <AnimatePresence>
                {isColorPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 8 }}
                    className="absolute right-0 mt-2 p-4 rounded-[28px] shadow-2xl z-50 w-60 flex flex-col gap-3"
                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                        Dynamic Seed
                      </span>
                      <button
                        onClick={() => {
                          setIsColorPickerOpen(false);
                          setIsM3SettingsOpen(true);
                        }}
                        className="text-xs font-bold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer"
                      >
                        Full Studio
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2.5">
                      {MATERIAL_SEED_PRESETS.map((seed) => (
                        <button
                          key={seed.hex}
                          onClick={() => {
                            triggerHaptic('light', themeState.hapticsEnabled);
                            setThemeState((prev) => ({
                              ...prev,
                              source: 'seed',
                              seedHex: seed.hex,
                            }));
                            setIsColorPickerOpen(false);
                          }}
                          className={`w-10 h-10 rounded-full transition-transform hover:scale-110 flex items-center justify-center cursor-pointer ${
                            themeState.seedHex.toUpperCase() === seed.hex.toUpperCase()
                              ? 'ring-2 ring-offset-2 ring-[var(--md-sys-color-on-surface)] ring-offset-[var(--md-sys-color-surface-container-high)] scale-105'
                              : ''
                          }`}
                          style={{ backgroundColor: seed.hex }}
                          title={seed.name}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Info & Documentation Modal */}
            <button
              onClick={() => {
                triggerHaptic('light', themeState.hapticsEnabled);
                setInfoModalTab('guide');
                setIsInfoModalOpen(true);
              }}
              className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] cursor-pointer"
              title="Waver Acoustic Guide & Offline Specs"
            >
              <MaterialSymbol name="help" className="text-lg" />
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              onClick={() => {
                triggerHaptic('light', themeState.hapticsEnabled);
                setThemeState((prev) => ({
                  ...prev,
                  mode: prev.mode === 'dark' ? 'light' : 'dark',
                }));
              }}
              className="min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center transition-colors hover:bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] cursor-pointer"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <MaterialSymbol name={isDark ? 'light_mode' : 'dark_mode'} className="text-lg" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 pt-2 pb-6 flex flex-col gap-5 relative z-10">
        {/* Collapsible Offline Cache & WebAssembly Storage Drawer */}
        <AnimatePresence>
          {isCacheDrawerOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className="p-5 sm:p-6 rounded-[32px] space-y-4"
                style={{ background: 'var(--md-sys-color-surface-container)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: 'var(--md-sys-color-primary-container)',
                        color: 'var(--md-sys-color-on-primary-container)',
                      }}
                    >
                      <MaterialSymbol name="database" className="text-lg" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                        Offline Memory & CacheStorage Vault
                      </h3>
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                        {wasmStatus.ready
                          ? `ggwave WASM (${wasmStatus.wasmSizeKB} KB) compiled in ${wasmStatus.initTimeMs}ms & locked in CacheStorage`
                          : 'Initializing ggwave WebAssembly in memory...'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleDownloadSingleFile}
                      className="m3-btn-tonal px-4 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <MaterialSymbol name="download" className="text-sm" />
                      <span>Save Standalone HTML</span>
                    </button>
                    {cachedFiles.length > 0 && (
                      <button
                        onClick={async () => {
                          await cacheStorageManager.clearCache();
                          refreshCachedFiles();
                        }}
                        className="px-3.5 py-2 rounded-full text-xs font-semibold text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        Clear Files
                      </button>
                    )}
                    <button
                      onClick={() => setIsCacheDrawerOpen(false)}
                      className="p-2 rounded-full hover:bg-black/10 text-[var(--md-sys-color-on-surface-variant)] cursor-pointer"
                    >
                      <MaterialSymbol name="close" className="text-sm" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div
                    className="p-4 rounded-3xl flex items-center justify-between gap-3"
                    style={{
                      background: 'var(--md-sys-color-primary-container)',
                      color: 'var(--md-sys-color-on-primary-container)',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">
                        ggwave-waver-engine.wasm
                      </div>
                      <p className="text-[11px] font-mono opacity-80 mt-0.5">
                        {wasmStatus.wasmSizeKB} KB · 48kHz FSK + ECC
                      </p>
                    </div>
                    <span className="text-[11px] font-bold opacity-90 shrink-0">
                      Cached
                    </span>
                  </div>

                  {cachedFiles.map((file) => (
                    <div
                      key={file.url}
                      className="p-4 rounded-3xl flex items-center justify-between gap-2"
                      style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate text-[var(--md-sys-color-on-surface)]">
                          {file.name}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => cacheStorageManager.downloadCachedFile(file.url, file.name)}
                          className="p-2 rounded-full hover:bg-black/10 text-[var(--md-sys-color-primary)] cursor-pointer"
                          title="Download from Offline Cache"
                        >
                          <MaterialSymbol name="download" className="text-sm" />
                        </button>
                        <button
                          onClick={async () => {
                            await cacheStorageManager.deleteCachedFile(file.url);
                            refreshCachedFiles();
                          }}
                          className="p-2 rounded-full hover:bg-black/10 text-rose-400 cursor-pointer"
                          title="Remove from Cache"
                        >
                          <MaterialSymbol name="delete" className="text-sm" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Module Workspace */}
        {activeTab === 'waver' && (
          <WaverSonicNode
            senderName={profile.username}
            onPacketDecoded={handlePacketDecodedFromWaver}
            onCacheUpdated={refreshCachedFiles}
          />
        )}

        {activeTab === 'chat' && (
          <SecureChatNode
            messages={chatMessages}
            onSendMessage={handleSendChatMessage}
            onSendVoiceMessage={handleSendVoiceMessage}
            onIncomingAcousticMessage={handleIncomingAcousticChat}
            senderName={profile.username}
          />
        )}

        {activeTab === 'qr' && (
          <div className="max-w-4xl mx-auto w-full">
            <QRUtilityNode />
          </div>
        )}

        {activeTab === 'base64' && (
          <div className="max-w-4xl mx-auto w-full">
            <Base64ToolNode />
          </div>
        )}
      </main>

      {/* Subtle Unboxed Footer (Desktop) */}
      <footer className="hidden sm:flex max-w-6xl w-full mx-auto px-6 py-6 items-center justify-between gap-4 text-xs text-[var(--md-sys-color-on-surface-variant)]">
        <span>
          Sound Link · Waver ggwave WebAssembly · 100% Offline Air-Gapped Audio Suite
        </span>
        <div className="flex items-center gap-5">
          <button
            onClick={() => {
              setInfoModalTab('legal');
              setIsInfoModalOpen(true);
            }}
            className="hover:text-[var(--md-sys-color-primary)] transition-colors cursor-pointer"
          >
            Privacy & Legal
          </button>
          <button
            onClick={handleDownloadSingleFile}
            className="hover:text-[var(--md-sys-color-primary)] font-semibold transition-colors cursor-pointer"
          >
            Export Offline HTML
          </button>
        </div>
      </footer>

      {/* Floating Expressive Pill Dock Navigation Bar (Mobile & Small Tablets) */}
      <nav className="md:hidden fixed bottom-3 left-3 right-3 z-40 m3-nav-bar rounded-full px-2 py-1.5">
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {(
            [
              { id: 'waver', label: 'Acoustic', icon: 'surround_sound' },
              { id: 'chat', label: 'Chat', icon: 'forum', badge: unreadChatCount },
              { id: 'qr', label: 'QR', icon: 'qr_code_2' },
              { id: 'base64', label: 'Base64', icon: 'data_object' },
              { id: 'theme', label: 'Theme', icon: 'palette' },
            ] as const
          ).map((item) => {
            const isActive = item.id === 'theme' ? isM3SettingsOpen : activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  triggerHaptic('light', themeState.hapticsEnabled);
                  if (item.id === 'theme') {
                    setIsM3SettingsOpen(true);
                  } else {
                    setActiveTab(item.id);
                  }
                }}
                className="flex flex-col items-center justify-center min-h-[48px] rounded-full transition-all relative cursor-pointer"
              >
                <div
                  className={`w-12 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${
                    isActive ? 'scale-105' : 'opacity-75'
                  }`}
                  style={{
                    background: isActive
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'transparent',
                    color: isActive
                      ? 'var(--md-sys-color-on-secondary-container)'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  <MaterialSymbol name={item.icon} filled={isActive} className="text-base" />
                </div>
                <span
                  className={`text-[10px] mt-0.5 tracking-tight whitespace-nowrap ${
                    isActive
                      ? 'font-extrabold text-[var(--md-sys-color-on-surface)]'
                      : 'font-medium text-[var(--md-sys-color-on-surface-variant)]'
                  }`}
                >
                  {item.label}
                </span>
                {'badge' in item && item.badge ? (
                  <span
                    className="absolute top-0.5 right-2.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                    style={{
                      background: 'var(--md-sys-color-primary)',
                      color: 'var(--md-sys-color-on-primary)',
                    }}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      <MaterialYouSettingsModal
        themeState={themeState}
        onUpdateTheme={setThemeState}
        isOpen={isM3SettingsOpen}
        onClose={() => setIsM3SettingsOpen(false)}
      />

      {isProfileOpen && (
        <ProfileModal
          profile={profile}
          onSave={(updated) => {
            handleSaveProfile(updated);
            setIsProfileOpen(false);
          }}
          onClose={() => setIsProfileOpen(false)}
        />
      )}

      <EasterEggModal
        isOpen={isEasterEggOpen}
        onClose={() => setIsEasterEggOpen(false)}
      />

      <NexusInfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        initialTab={infoModalTab}
        onDownloadSingleFile={handleDownloadSingleFile}
      />

      <CookieConsentBanner
        onOpenLegal={() => {
          setInfoModalTab('legal');
          setIsInfoModalOpen(true);
        }}
      />
    </div>
  );
}
