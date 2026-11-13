import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProfileModal } from './components/ProfileModal';
import { SecureChatNode } from './components/SecureChatNode';
import { QRUtilityNode } from './components/QRUtilityNode';
import { Base64ToolNode } from './components/Base64ToolNode';
import { WaverSonicNode, DecodedAcousticPacket } from './components/WaverSonicNode';
import { generateRandomName } from './lib/nameGenerator';
import { UserProfile, ChatMessage } from './types';
import { EasterEggModal } from './components/EasterEggModal';
import { NexusInfoModal } from './components/NexusInfoModal';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { cacheStorageManager, CachedFileMetadata } from './lib/cacheStorage';
import {
  MaterialThemeState,
  DEFAULT_MATERIAL_THEME,
  applyMaterialThemeToDocument,
  triggerHaptic,
} from './lib/materialTheme';
import { MaterialYouSettingsModal } from './components/MaterialYouSettingsModal';
import {
  preloadWaverWasmEngine,
  subscribeWaverEngineStatus,
  WaverEngineStatus,
} from './lib/waverEngine';
import { Header, ActiveModuleTab } from './components/layout/Header';
import { TelemetryStrip, LiveStudioTelemetry } from './components/layout/TelemetryStrip';
import { OfflineVaultDrawer } from './components/layout/OfflineVaultDrawer';
import { MobileDock } from './components/layout/MobileDock';
import {
  ToastContainer,
  StudioToastItem,
  StudioToastType,
} from './components/layout/ToastContainer';

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
      avatarColor: 'bg-indigo-500',
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
  const [workspaceWidth, setWorkspaceWidth] = useState<'standard' | 'wide' | 'full'>(() => {
    try {
      const saved = localStorage.getItem('soundlink_workspace_width');
      if (saved === 'standard' || saved === 'wide' || saved === 'full') return saved;
    } catch {
      // Ignore
    }
    return 'wide';
  });

  const [wasmStatus, setWasmStatus] = useState<WaverEngineStatus>({
    ready: false,
    cachedInStorage: false,
    wasmSizeKB: 134,
    sampleRate: 48000,
    initTimeMs: 0,
    engineVersion: 'ggwave v0.4.0',
    error: null,
  });

  const [liveTelemetry, setLiveTelemetry] = useState<LiveStudioTelemetry>({
    decodedCount: 0,
    isListening: false,
    isTransmitting: false,
    liveRmsDb: -60,
    dominantFreqHz: 0,
    activeBandLabel: 'AUDIBLE',
  });

  const [toasts, setToasts] = useState<StudioToastItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Easter Egg State
  const [, setLogoClicks] = useState(0);
  const [isEasterEggOpen, setIsEasterEggOpen] = useState(false);
  const logoClickTimeoutRef = useRef<number | null>(null);

  const pushToast = useCallback(
    (title: string, description?: string, type: StudioToastType = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, type }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3800);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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

  useEffect(() => {
    try {
      localStorage.setItem('soundlink_workspace_width', workspaceWidth);
    } catch {
      // Ignore
    }
  }, [workspaceWidth]);

  const containerWidthClass =
    workspaceWidth === 'standard'
      ? 'max-w-5xl'
      : workspaceWidth === 'wide'
      ? 'max-w-[1440px]'
      : 'max-w-none';

  const cycleWorkspaceWidth = () => {
    triggerHaptic('light', themeState.hapticsEnabled);
    setWorkspaceWidth((prev) => {
      const next = prev === 'standard' ? 'wide' : prev === 'wide' ? 'full' : 'standard';
      pushToast(`Workspace Width: ${next}`, undefined, 'info');
      return next;
    });
  };

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
    pushToast('Node Profile Updated', `Active handle: ${newProfile.username}`, 'success');
  };

  const lastIncomingDedupeRef = useRef<{ signature: string; time: number }>({
    signature: '',
    time: 0,
  });

  const handleSendChatMessage = (
    text: string,
    filePayload?: ChatMessage['filePayload']
  ) => {
    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'me',
      senderName: profile.username,
      text,
      filePayload,
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
    pushToast('Voice Note Recorded', 'Encoded as 16-bit PCM WAV', 'success');
  };

  const handleIncomingAcousticChat = useCallback(
    (
      text: string,
      protocolLabel: string,
      filePayload?: ChatMessage['filePayload']
    ) => {
      const normalized = (filePayload
        ? `FILE:${filePayload.fileName}:${filePayload.fileSize}:${filePayload.crc}`
        : text
      ).trim();
      const now = Date.now();
      if (
        lastIncomingDedupeRef.current.signature === normalized &&
        now - lastIncomingDedupeRef.current.time < 4500
      ) {
        return;
      }
      lastIncomingDedupeRef.current = { signature: normalized, time: now };

      const msg: ChatMessage = {
        id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'them',
        senderName: `Acoustic Rx (${protocolLabel})`,
        text,
        filePayload,
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
    const filePayload: ChatMessage['filePayload'] | undefined =
      pkt.isFilePayload && pkt.fileName && pkt.fileBlobUrl
        ? {
            fileName: pkt.fileName,
            fileSize: pkt.fileSize || pkt.byteLength,
            fileMime: pkt.fileMime || 'application/octet-stream',
            fileBlobUrl: pkt.fileBlobUrl,
            crc: pkt.crc,
            mode: pkt.frameInfo || pkt.protocolHint,
          }
        : undefined;

    const textBody =
      pkt.isFilePayload && pkt.fileContent ? pkt.fileContent : pkt.text;
    const normalized = (filePayload
      ? `FILE:${filePayload.fileName}:${filePayload.fileSize}:${filePayload.crc}`
      : textBody
    ).trim();
    const now = Date.now();
    if (
      lastIncomingDedupeRef.current.signature === normalized &&
      now - lastIncomingDedupeRef.current.time < 4500
    ) {
      return;
    }
    lastIncomingDedupeRef.current = { signature: normalized, time: now };

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
      text: textBody,
      filePayload,
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
      pushToast('Exported Standalone HTML', 'SoundLink_Waver_Offline.html saved', 'success');
    } catch {
      pushToast('HTML Export Failed', undefined, 'error');
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col selection:bg-indigo-500/30 relative overflow-x-hidden pb-28 sm:pb-10"
      style={{
        background: 'var(--md-sys-color-surface)',
        color: 'var(--md-sys-color-on-surface)',
      }}
    >
      {/* Ambient Radial Studio Glow + Micro Dot-Grid Texture */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {themeState.customWallpaperUrl && (
          <img
            src={themeState.customWallpaperUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-15 scale-110 blur-3xl transition-opacity duration-700"
          />
        )}
        <div
          className="absolute -top-48 left-1/2 -translate-x-1/2 w-[56rem] h-[28rem] rounded-full opacity-20 blur-3xl transition-colors duration-700"
          style={{
            background: `radial-gradient(circle, ${themeState.seedHex} 0%, transparent 70%)`,
          }}
        />
        <div className="absolute inset-0 studio-dot-grid opacity-80" />
      </div>

      {/* Sticky Frosted-Glass Command Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        unreadChatCount={unreadChatCount}
        profile={profile}
        onOpenProfile={() => setIsProfileOpen(true)}
        themeState={themeState}
        onUpdateTheme={setThemeState}
        isColorPickerOpen={isColorPickerOpen}
        onToggleColorPicker={() => setIsColorPickerOpen((v) => !v)}
        onCloseColorPicker={() => setIsColorPickerOpen(false)}
        onOpenFullStudio={() => setIsM3SettingsOpen(true)}
        isCacheDrawerOpen={isCacheDrawerOpen}
        onToggleCacheDrawer={() => {
          refreshCachedFiles();
          setIsCacheDrawerOpen((v) => !v);
        }}
        cachedFileCount={cachedFiles.length}
        workspaceWidth={workspaceWidth}
        onCycleWorkspaceWidth={cycleWorkspaceWidth}
        containerWidthClass={containerWidthClass}
        wasmStatus={wasmStatus}
        isMicActive={liveTelemetry.isListening}
        onOpenGuide={() => {
          setInfoModalTab('guide');
          setIsInfoModalOpen(true);
        }}
        onLogoClick={handleLogoClick}
        onNotify={(title, desc) => pushToast(title, desc, 'success')}
      />

      {/* Main Content Container */}
      <main
        className={`flex-1 ${containerWidthClass} w-full mx-auto px-3 sm:px-6 pt-4 pb-6 flex flex-col gap-4 relative z-10 transition-[max-width] duration-300`}
      >
        {/* Live Telemetry Summary Strip */}
        <TelemetryStrip
          wasmStatus={wasmStatus}
          liveTelemetry={liveTelemetry}
          chatMessageCount={chatMessages.length}
          cachedFiles={cachedFiles}
          onOpenVaultDrawer={() => {
            refreshCachedFiles();
            setIsCacheDrawerOpen(true);
          }}
        />

        {/* Active Module Workspace (100% Preserved Logic) */}
        {activeTab === 'waver' && (
          <WaverSonicNode
            senderName={profile.username}
            onPacketDecoded={handlePacketDecodedFromWaver}
            onCacheUpdated={refreshCachedFiles}
            onNotify={pushToast}
            onTelemetryUpdate={setLiveTelemetry}
          />
        )}

        {activeTab === 'chat' && (
          <SecureChatNode
            messages={chatMessages}
            onSendMessage={handleSendChatMessage}
            onSendVoiceMessage={handleSendVoiceMessage}
            onIncomingAcousticMessage={handleIncomingAcousticChat}
            senderName={profile.username}
            onNotify={pushToast}
          />
        )}

        {activeTab === 'qr' && (
          <div className="w-full flex-1">
            <QRUtilityNode onNotify={pushToast} />
          </div>
        )}

        {activeTab === 'base64' && (
          <div className="w-full flex-1">
            <Base64ToolNode onNotify={pushToast} />
          </div>
        )}
      </main>

      {/* Subtle Unboxed Studio Footer (Desktop) */}
      <footer
        className={`hidden sm:flex ${containerWidthClass} w-full mx-auto px-6 py-5 items-center justify-between gap-4 text-xs text-[var(--md-sys-color-on-surface-variant)] transition-[max-width] duration-300 relative z-10 border-t`}
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <span className="font-mono text-[11px]">
          Sound Link · Waver ggwave WebAssembly · 100% Offline Air-Gapped Audio Suite
        </span>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => {
              setInfoModalTab('legal');
              setIsInfoModalOpen(true);
            }}
            className="hover:text-[var(--studio-accent)] transition-colors cursor-pointer"
          >
            Privacy &amp; Legal
          </button>
          <button
            type="button"
            onClick={handleDownloadSingleFile}
            className="hover:text-[var(--studio-accent)] font-semibold transition-colors cursor-pointer"
          >
            Export Offline HTML
          </button>
        </div>
      </footer>

      {/* Contextual Slide-Over Offline Vault Drawer */}
      <OfflineVaultDrawer
        isOpen={isCacheDrawerOpen}
        onClose={() => setIsCacheDrawerOpen(false)}
        wasmStatus={wasmStatus}
        cachedFiles={cachedFiles}
        onDownloadCachedFile={(url, name) => {
          cacheStorageManager.downloadCachedFile(url, name);
          pushToast('Downloading Artifact', name, 'success');
        }}
        onDeleteCachedFile={async (url) => {
          await cacheStorageManager.deleteCachedFile(url);
          refreshCachedFiles();
          pushToast('Removed from Vault', undefined, 'info');
        }}
        onClearAllFiles={async () => {
          await cacheStorageManager.clearCache();
          refreshCachedFiles();
          pushToast('Cleared Offline Vault', undefined, 'info');
        }}
        onDownloadSingleFile={handleDownloadSingleFile}
      />

      {/* Mobile Floating Dock */}
      <MobileDock
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        unreadChatCount={unreadChatCount}
        isM3SettingsOpen={isM3SettingsOpen}
        onOpenThemeStudio={() => setIsM3SettingsOpen(true)}
        themeState={themeState}
      />

      {/* Bottom-Right Live Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

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
