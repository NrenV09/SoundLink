import React from 'react';
import { Cpu, Activity, Radio, HardDrive } from 'lucide-react';
import { WaverEngineStatus } from '../../lib/waverEngine';
import { CachedFileMetadata } from '../../lib/cacheStorage';

export interface LiveStudioTelemetry {
  decodedCount: number;
  isListening: boolean;
  isTransmitting: boolean;
  liveRmsDb: number;
  dominantFreqHz: number;
  activeBandLabel: string;
}

interface TelemetryStripProps {
  wasmStatus: WaverEngineStatus;
  liveTelemetry: LiveStudioTelemetry;
  chatMessageCount: number;
  cachedFiles: CachedFileMetadata[];
  onOpenVaultDrawer: () => void;
}

export const TelemetryStrip: React.FC<TelemetryStripProps> = ({
  wasmStatus,
  liveTelemetry,
  chatMessageCount,
  cachedFiles,
  onOpenVaultDrawer,
}) => {
  const totalCachedKb = Math.round(
    (cachedFiles.reduce((acc, f) => acc + f.size, 0) + wasmStatus.wasmSizeKB * 1024) / 1024
  );

  return (
    <section
      aria-label="Live Acoustic Telemetry"
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
    >
      {/* Card 1: DSP Engine */}
      <div className="studio-card-hover px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
            <Cpu className="w-3.5 h-3.5 text-[var(--studio-accent)] shrink-0" />
            <span className="truncate">WASM Engine</span>
          </div>
          <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-[var(--md-sys-color-on-surface)] truncate">
            {wasmStatus.ready ? `${wasmStatus.initTimeMs} ms` : 'Loading...'}
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold shrink-0 border ${
            wasmStatus.ready
              ? 'bg-emerald-500/12 text-emerald-400 border-emerald-500/25'
              : 'bg-amber-500/12 text-amber-400 border-amber-500/25'
          }`}
        >
          {wasmStatus.ready ? 'READY' : 'INIT'}
        </span>
      </div>

      {/* Card 2: Audio Carrier & Signal */}
      <div className="studio-card-hover px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
            <Activity className="w-3.5 h-3.5 text-[var(--studio-accent)] shrink-0" />
            <span className="truncate">Acoustic Carrier</span>
          </div>
          <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-[var(--md-sys-color-on-surface)] truncate">
            {liveTelemetry.dominantFreqHz > 0
              ? `${liveTelemetry.dominantFreqHz} Hz`
              : '48,000 Hz'}
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold shrink-0 border tabular-nums ${
            liveTelemetry.isTransmitting
              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-400/30'
              : liveTelemetry.isListening
              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              : 'bg-white/5 text-[var(--md-sys-color-on-surface-variant)] border-[var(--studio-border)]'
          }`}
        >
          {liveTelemetry.isTransmitting
            ? 'TX LIVE'
            : liveTelemetry.isListening
            ? `${liveTelemetry.liveRmsDb} dB`
            : liveTelemetry.activeBandLabel}
        </span>
      </div>

      {/* Card 3: Stream & Chat Packets */}
      <div className="studio-card-hover px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
            <Radio className="w-3.5 h-3.5 text-[var(--studio-accent)] shrink-0" />
            <span className="truncate">Packets &amp; Chat</span>
          </div>
          <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-[var(--md-sys-color-on-surface)] truncate">
            {liveTelemetry.decodedCount} Rx · {chatMessageCount} Msg
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold shrink-0 border bg-white/5 text-[var(--md-sys-color-on-surface-variant)] border-[var(--studio-border)]">
          RS-ECC
        </span>
      </div>

      {/* Card 4: Offline Vault */}
      <button
        type="button"
        onClick={onOpenVaultDrawer}
        className="studio-card-hover px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer transition-all active:scale-[0.99]"
        title="Open Offline CacheStorage & WASM Vault"
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
            <HardDrive className="w-3.5 h-3.5 text-[var(--studio-accent)] shrink-0" />
            <span className="truncate">Offline Vault</span>
          </div>
          <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-[var(--md-sys-color-on-surface)] truncate">
            {cachedFiles.length} {cachedFiles.length === 1 ? 'File' : 'Files'} · {totalCachedKb} KB
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold shrink-0 border bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-transparent">
          VAULT
        </span>
      </button>
    </section>
  );
};
