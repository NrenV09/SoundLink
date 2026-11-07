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
      className="min-h-screen flex flex-col selection:bg-blue-500/30 relative overflow-x-hidden pb-24 sm:pb-8"
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
            className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20 blur-3xl transition-colors duration-700"
            style={{ background: 'var(--md-sys-color-primary-container)' }}
          />
          <div
            className="absolute top-1/3 -right-32 w-96 h-96 rounded-full opacity-15 blur-3xl transition-colors duration-700"
            style={{ background: 'var(--md-sys-color-tertiary-container)' }}
          />
        </div>
      )}

      {/* Android 16 Material You Expressive Top App Bar */}
      <header className="sticky top-0 z-30 px-3 sm:px-6 pt-2 sm:pt-3 pb-2">
        <div className="max-w-6xl mx-auto m3-card px-3.5 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-2 backdrop-blur-xl bg-[var(--md-sys-color-surface-container)]/90">
          <div className="flex items-center gap-3">
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
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--md-sys-color-on-surface)]">
                  Sound Link
                </h1>
                <span
                  className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: wasmStatus.ready
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'var(--md-sys-color-surface-container-highest)',
                    color: wasmStatus.ready
                      ? 'var(--md-sys-color-on-secondary-container)'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  <MaterialSymbol name="memory" className="text-[11px]" />
                  <span>{wasmStatus.ready ? 'WASM Cached' : 'Loading WASM'}</span>
                </span>
              </div>
              <p className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] hidden sm:block">
                Waver Acoustic Data-Over-Sound · 100% Offline M3 Expressive Suite
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Identity Chip */}
            <button
              onClick={() => {
                triggerHaptic('light', themeState.hapticsEnabled);
                setIsProfileOpen(true);
              }}
              className="m3-btn-tonal flex items-center gap-2 px-3 py-2 text-xs sm:text-sm cursor-pointer"
              title="Node Identity Profile"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: 'var(--md-sys-color-primary)' }}
              />
              <span className="font-bold truncate max-w-[96px] sm:max-w-[140px]">
                {profile.username}
              </span>
            </button>

            {/* Offline Cache Drawer Toggle */}
            <button
              onClick={() => {
                triggerHaptic('light', themeState.hapticsEnabled);
                refreshCachedFiles();
                setIsCacheDrawerOpen((v) => !v);
              }}
              className="m3-btn-tonal p-2 sm:px-3 sm:py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              title="Offline Sandbox Cache & WASM Storage"
            >
              <MaterialSymbol name="database" className="text-base" />
              <span className="hidden lg:inline">Cache ({cachedFiles.length + 1})</span>
            </button>

            {/* Material You Settings Modal Trigger */}
            <button
              onClick={() => {
                triggerHaptic('medium', themeState.hapticsEnabled);
                setIsM3SettingsOpen(true);
              }}
              className="m3-btn-tonal p-2 sm:px-3 sm:py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              title="Material You Theme & Wallpaper Studio"
            >
              <MaterialSymbol name="palette" filled className="text-base" />
              <span className="hidden md:inline">Material You</span>
            </button>

            {/* Quick Seed Color Swatch Popover */}
            <div className="relative">
              <button
                onClick={() => {
                  triggerHaptic('light', themeState.hapticsEnabled);
                  setIsColorPickerOpen((v) => !v);
                }}
                className="p-2 rounded-2xl transition-all hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] cursor-pointer flex items-center justify-center"
                title="Quick Dynamic Color Seed"
              >
                <MaterialSymbol name="colors" className="text-lg" />
              </button>

              <AnimatePresence>
                {isColorPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 8 }}
                    className="absolute right-0 mt-2 p-3.5 rounded-3xl shadow-2xl border border-[var(--md-sys-color-outline-variant)] z-50 w-56 flex flex-col gap-3"
                    style={{ background: 'var(--md-sys-color-surface-container-high)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
                        M3 Seed Palette
                      </span>
                      <button
                        onClick={() => {
                          setIsColorPickerOpen(false);
                          setIsM3SettingsOpen(true);
                        }}
                        className="text-[10px] font-bold text-[var(--md-sys-color-primary)] hover:underline cursor-pointer"
                      >
                        Full Studio
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
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
                          className={`w-9 h-9 rounded-full transition-transform hover:scale-110 flex items-center justify-center cursor-pointer ${
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
              className="p-2 rounded-2xl transition-all hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] cursor-pointer flex items-center justify-center"
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
              className="p-2 rounded-2xl transition-all hover:bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] cursor-pointer flex items-center justify-center"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <MaterialSymbol name={isDark ? 'light_mode' : 'dark_mode'} className="text-lg" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-5 flex flex-col gap-5 relative z-10">
        {/* Desktop Segmented Navigation Bar */}
        <div className="hidden sm:flex justify-center">
          <div className="m3-card p-1.5 inline-flex items-center gap-1.5 shadow-sm">
            {(
              [
                { id: 'waver', label: 'Waver Acoustic Transceiver', icon: 'surround_sound' },
                { id: 'chat', label: 'Sonic Chat', icon: 'forum', badge: unreadChatCount },
                { id: 'qr', label: 'QR Studio', icon: 'qr_code_2' },
                { id: 'base64', label: 'Base64 Studio', icon: 'data_object' },
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
                  className="relative flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold tracking-wide transition-all cursor-pointer"
                  style={{
                    background: isActive
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'transparent',
                    color: isActive
                      ? 'var(--md-sys-color-on-secondary-container)'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  <MaterialSymbol name={tab.icon} filled={isActive} className="text-base" />
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
          </div>
        </div>

        {/* Collapsible Offline Cache & WebAssembly Storage Drawer */}
        <AnimatePresence>
          {isCacheDrawerOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="m3-card-xl p-4 sm:p-5 border border-[var(--md-sys-color-outline-variant)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <MaterialSymbol
                      name="database"
                      className="text-lg text-[var(--md-sys-color-primary)]"
                    />
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                        Offline Memory & CacheStorage Vault (app-cache-v1)
                      </h3>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                        The ggwave WebAssembly binary and exported .WAV waveforms are persisted locally for 100% offline use.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownloadSingleFile}
                      className="m3-btn-tonal px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <MaterialSymbol name="download" className="text-xs" />
                      <span>Save Full Offline HTML</span>
                    </button>
                    {cachedFiles.length > 0 && (
                      <button
                        onClick={async () => {
                          await cacheStorageManager.clearCache();
                          refreshCachedFiles();
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        Clear User Files
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {/* Pinned WASM Engine Cache Card */}
                  <div
                    className="p-3 rounded-2xl border border-[var(--md-sys-color-primary)]/50 flex items-center justify-between gap-2"
                    style={{ background: 'var(--md-sys-color-primary-container)' }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <MaterialSymbol
                          name="memory"
                          className="text-sm text-[var(--md-sys-color-on-primary-container)]"
                        />
                        <span className="text-xs font-bold text-[var(--md-sys-color-on-primary-container)] truncate">
                          ggwave-waver-engine.wasm
                        </span>
                      </div>
                      <p className="text-[10px] font-mono opacity-80 text-[var(--md-sys-color-on-primary-container)] mt-0.5">
                        {wasmStatus.wasmSizeKB} KB · Instant RAM + CacheStorage
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/20 text-[var(--md-sys-color-on-primary-container)]">
                      LOCKED
                    </span>
                  </div>

                  {cachedFiles.map((file) => (
                    <div
                      key={file.url}
                      className="p-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2"
                      style={{ background: 'var(--md-sys-color-surface-container)' }}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate text-[var(--md-sys-color-on-surface)]">
                          {file.name}
                        </div>
                        <div className="text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                          {(file.size / 1024).toFixed(1)} KB · {file.type || 'binary'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => cacheStorageManager.downloadCachedFile(file.url, file.name)}
                          className="p-1.5 rounded-lg hover:bg-black/10 text-[var(--md-sys-color-primary)] cursor-pointer"
                          title="Download from Offline Cache"
                        >
                          <MaterialSymbol name="download" className="text-sm" />
                        </button>
                        <button
                          onClick={async () => {
                            await cacheStorageManager.deleteCachedFile(file.url);
                            refreshCachedFiles();
                          }}
                          className="p-1.5 rounded-lg hover:bg-black/10 text-rose-400 cursor-pointer"
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
          <div className="max-w-3xl mx-auto w-full">
            <QRUtilityNode />
          </div>
        )}

        {activeTab === 'base64' && (
          <div className="max-w-3xl mx-auto w-full">
            <Base64ToolNode />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto px-4 py-6 border-t border-[var(--md-sys-color-outline-variant)]/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--md-sys-color-on-surface-variant)]">
        <div className="flex items-center gap-2">
          <MaterialSymbol name="verified_user" className="text-sm text-[var(--md-sys-color-primary)]" />
          <span>
            Sound Link · Powered by Waver (ggwave WebAssembly) · 100% Offline Air-Gapped Audio Suite
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => {
              setInfoModalTab('legal');
              setIsInfoModalOpen(true);
            }}
            className="hover:text-[var(--md-sys-color-primary)] transition-colors cursor-pointer"
          >
            Privacy & Legal Compliance
          </button>
          <button
            onClick={handleDownloadSingleFile}
            className="hover:text-[var(--md-sys-color-primary)] font-semibold transition-colors cursor-pointer"
          >
            Export Single-File Offline HTML
          </button>
        </div>
      </footer>

      {/* Android 16 Material You Expressive Mobile Bottom Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 m3-nav-bar px-2 py-2 pb-safe">
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {(
            [
              { id: 'waver', label: 'Waver', icon: 'surround_sound' },
              { id: 'chat', label: 'Chat', icon: 'forum', badge: unreadChatCount },
              { id: 'qr', label: 'QR Studio', icon: 'qr_code_2' },
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
                className="flex flex-col items-center justify-center py-1 rounded-2xl transition-all relative cursor-pointer"
              >
                <div
                  className={`w-14 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
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
                  <MaterialSymbol name={item.icon} filled={isActive} className="text-lg" />
                </div>
                <span
                  className={`text-[10px] mt-1 tracking-tight ${
                    isActive
                      ? 'font-extrabold text-[var(--md-sys-color-on-surface)]'
                      : 'font-medium text-[var(--md-sys-color-on-surface-variant)]'
                  }`}
                >
                  {item.label}
                </span>
                {'badge' in item && item.badge ? (
                  <span
                    className="absolute top-0.5 right-3 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
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
