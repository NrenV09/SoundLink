import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Database, Download, Trash2, X, Cpu, HardDrive, FileArchive } from 'lucide-react';
import { CachedFileMetadata } from '../../lib/cacheStorage';
import { WaverEngineStatus } from '../../lib/waverEngine';

interface OfflineVaultDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wasmStatus: WaverEngineStatus;
  cachedFiles: CachedFileMetadata[];
  onDownloadCachedFile: (url: string, name: string) => void;
  onDeleteCachedFile: (url: string) => Promise<void>;
  onClearAllFiles: () => Promise<void>;
  onDownloadSingleFile: () => void;
}

export const OfflineVaultDrawer: React.FC<OfflineVaultDrawerProps> = ({
  isOpen,
  onClose,
  wasmStatus,
  cachedFiles,
  onDownloadCachedFile,
  onDeleteCachedFile,
  onClearAllFiles,
  onDownloadSingleFile,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Slide-Over Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            aria-label="Offline Memory & CacheStorage Vault"
            className="relative z-10 w-full max-w-md h-full flex flex-col border-l overflow-hidden"
            style={{
              background: 'var(--md-sys-color-surface-container-low)',
              borderColor: 'var(--studio-border-strong)',
              boxShadow: '-16px 0 48px rgba(0, 0, 0, 0.55)',
            }}
          >
            {/* Header */}
            <div
              className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0"
              style={{ borderColor: 'var(--studio-border)' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                  style={{
                    background: 'var(--md-sys-color-primary-container)',
                    borderColor: 'color-mix(in srgb, var(--studio-accent) 30%, transparent)',
                    color: 'var(--studio-accent)',
                  }}
                >
                  <Database className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate">
                    Offline Memory Vault
                  </h2>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                    Zero-network CacheStorage &amp; WASM runtime
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close Vault Drawer"
                className="p-2 rounded-full hover:bg-white/10 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* WASM Engine Binary Card */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] block">
                  Acoustic DSP Runtime
                </span>
                <div
                  className="p-4 rounded-2xl border flex items-center justify-between gap-3"
                  style={{
                    background: 'var(--md-sys-color-primary-container)',
                    borderColor: 'color-mix(in srgb, var(--studio-accent) 35%, transparent)',
                    color: 'var(--md-sys-color-on-primary-container)',
                    boxShadow: 'var(--studio-top-highlight)',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Cpu className="w-5 h-5 shrink-0 text-[var(--studio-accent)]" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">
                        ggwave-waver-engine.wasm
                      </div>
                      <p className="text-[11px] font-mono tabular-nums opacity-85 mt-0.5">
                        {wasmStatus.wasmSizeKB} KB · {wasmStatus.sampleRate.toLocaleString()} Hz ·{' '}
                        {wasmStatus.ready ? `${wasmStatus.initTimeMs}ms init` : 'Compiling'}
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                    {wasmStatus.cachedInStorage ? 'CACHED' : 'RAM'}
                  </span>
                </div>
              </div>

              {/* Cached Decoded / Exported Artifacts */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
                    Stored Artifacts ({cachedFiles.length})
                  </span>
                  {cachedFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearAllFiles}
                      className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {cachedFiles.length === 0 ? (
                  <div
                    className="p-6 rounded-2xl border text-center space-y-2"
                    style={{
                      background: 'var(--md-sys-color-surface-container-lowest)',
                      borderColor: 'var(--studio-border)',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center border"
                      style={{
                        background: 'var(--md-sys-color-surface-container)',
                        borderColor: 'var(--studio-border)',
                      }}
                    >
                      <FileArchive className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)]" />
                    </div>
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                      No cached files yet
                    </p>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                      Exported .WAV tones and reconstructed acoustic files automatically persist here for offline retrieval.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cachedFiles.map((file) => (
                      <div
                        key={file.url}
                        className="p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-colors hover:border-[var(--studio-border-strong)]"
                        style={{
                          background: 'var(--md-sys-color-surface-container)',
                          borderColor: 'var(--studio-border)',
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <HardDrive className="w-4 h-4 text-[var(--studio-accent)] shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate text-[var(--md-sys-color-on-surface)]">
                              {file.name}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                              {(file.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onDownloadCachedFile(file.url, file.name)}
                            className="p-2 rounded-full hover:bg-white/10 text-[var(--studio-accent)] cursor-pointer"
                            title="Download from Offline Cache"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCachedFile(file.url)}
                            className="p-2 rounded-full hover:bg-rose-500/15 text-rose-400 cursor-pointer"
                            title="Remove from Cache"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Action */}
            <div
              className="p-5 border-t shrink-0"
              style={{ borderColor: 'var(--studio-border)' }}
            >
              <button
                type="button"
                onClick={onDownloadSingleFile}
                className="w-full min-h-[44px] py-2.5 px-4 m3-btn-filled text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Save Standalone Offline HTML</span>
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
