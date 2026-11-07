import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Waves,
  Cpu,
  Shield,
  Zap,
  QrCode,
  Download,
  HardDrive,
  Radio,
  Volume2,
  Ear,
} from 'lucide-react';
import { LegalComplianceView } from './LegalComplianceView';

interface NexusInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'guide' | 'capabilities' | 'specs' | 'legal';
  onDownloadSingleFile?: () => void;
}

export const NexusInfoModal: React.FC<NexusInfoModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'guide',
  onDownloadSingleFile,
}) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'capabilities' | 'specs' | 'legal'>(
    initialTab
  );

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-4xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] border border-[var(--md-sys-color-outline-variant)] shadow-2xl"
          style={{
            background: 'var(--md-sys-color-surface-container)',
            color: 'var(--md-sys-color-on-surface)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-[var(--md-sys-color-outline-variant)]"
            style={{ background: 'var(--md-sys-color-surface-container-high)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'var(--md-sys-color-primary-container)',
                  color: 'var(--md-sys-color-on-primary-container)',
                }}
              >
                <Waves className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold tracking-tight">
                    Sound Link · Waver Acoustic Suite
                  </h2>
                  <span
                    className="px-2 py-0.5 text-[10px] font-mono uppercase rounded-md font-bold"
                    style={{
                      background: 'var(--md-sys-color-secondary-container)',
                      color: 'var(--md-sys-color-on-secondary-container)',
                    }}
                  >
                    ggwave WASM v0.4.0
                  </span>
                </div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  Air-Gapped Data-Over-Sound FSK Modulation & 100% Offline Memory Architecture
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-black/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b border-[var(--md-sys-color-outline-variant)]"
            style={{ background: 'var(--md-sys-color-surface-container)' }}
          >
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'guide', label: 'Acoustic Guide', icon: Radio },
                  { id: 'capabilities', label: 'Waver Capabilities', icon: Zap },
                  { id: 'specs', label: 'DSP & Offline Specs', icon: Cpu },
                  { id: 'legal', label: 'Privacy & Legal', icon: Shield },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                    style={{
                      background: active ? 'var(--md-sys-color-primary)' : 'transparent',
                      color: active
                        ? 'var(--md-sys-color-on-primary)'
                        : 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {onDownloadSingleFile && (
              <button
                onClick={onDownloadSingleFile}
                className="m3-btn-tonal px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Standalone Offline HTML</span>
              </button>
            )}
          </div>

          {/* Content Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
            {activeTab === 'guide' && (
              <div className="space-y-4">
                <div
                  className="p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] space-y-2"
                  style={{ background: 'var(--md-sys-color-surface-container-low)' }}
                >
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-[var(--md-sys-color-primary)]" />
                    <span>How Waver Acoustic Data-Over-Sound Works</span>
                  </h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                    Powered by the <strong>Waver / ggwave</strong> WebAssembly DSP engine, Sound Link encodes arbitrary text, JSON, cryptographic keys, and compressed files into multi-frequency FSK (Frequency-Shift Keying) audio waveforms protected by <strong>Reed-Solomon Error Correction Codes (ECC)</strong>. No Wi-Fi, Bluetooth, cellular, or WebRTC servers are ever needed.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div
                    className="p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] space-y-1.5"
                    style={{ background: 'var(--md-sys-color-surface-container-low)' }}
                  >
                    <div className="text-xs font-bold text-[var(--md-sys-color-primary)]">
                      1. Audible FSK (1.8–6.3 kHz)
                    </div>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      Maximum acoustic reliability across rooms, speakers, and mobile microphones at 8 to 16 bytes/sec.
                    </p>
                  </div>

                  <div
                    className="p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] space-y-1.5"
                    style={{ background: 'var(--md-sys-color-surface-container-low)' }}
                  >
                    <div className="text-xs font-bold text-[var(--md-sys-color-primary)]">
                      2. Ultrasonic Air-Gap (15–19.5 kHz)
                    </div>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      Near-silent high-frequency carrier above normal speech for discreet device-to-device proximity transfer.
                    </p>
                  </div>

                  <div
                    className="p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] space-y-1.5"
                    style={{ background: 'var(--md-sys-color-surface-container-low)' }}
                  >
                    <div className="text-xs font-bold text-[var(--md-sys-color-primary)]">
                      3. Dual-Tone Embedded (DT)
                    </div>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      2-tone FSK modulation tailored for low-power microcontrollers (ESP32, Arduino, RP2040) and piezo transducers.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'capabilities' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  {
                    icon: Cpu,
                    title: 'Instant WebAssembly Pre-Caching',
                    desc: 'The ggwave C++ WebAssembly engine is compiled in RAM and persisted to CacheStorage the instant the site loads.',
                  },
                  {
                    icon: HardDrive,
                    title: '100% Offline In-Memory Execution',
                    desc: 'Zero external CDN fonts, zero external scripts, and zero dynamic server calls. Runs completely air-gapped.',
                  },
                  {
                    icon: Ear,
                    title: 'Raw 48kHz DSP Capture',
                    desc: 'Automatically bypasses browser echo-cancellation and noise-suppression so ultrasonic 19.5kHz tones are never filtered out.',
                  },
                  {
                    icon: QrCode,
                    title: 'Optical QR & Base64 Studio',
                    desc: 'Complement acoustic transmission with offline high-density QR code generation, optical scanning, and Base64 file encoding.',
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="p-4 rounded-2xl border border-[var(--md-sys-color-outline-variant)] flex items-start gap-3"
                      style={{ background: 'var(--md-sys-color-surface-container-low)' }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: 'var(--md-sys-color-primary-container)',
                          color: 'var(--md-sys-color-on-primary-container)',
                        }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold">{item.title}</h4>
                        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'specs' && (
              <div className="space-y-3 text-xs font-mono">
                {[
                  ['Acoustic Engine', 'ggwave v0.4.0 (Waver FSK + Reed-Solomon ECC WebAssembly)'],
                  ['Audio Sample Rate', '48,000 Hz Native 32-bit Floating Point PCM'],
                  ['FFT Frame Size', '1,024 samples/frame (~21.33 ms window)'],
                  ['Modulation Bands', 'Audible (1.8–6.3 kHz), Ultrasound (15.0–19.5 kHz), Dual-Tone (1.8–4.8 kHz)'],
                  ['Spread Spectrum', 'Direct Sequence Spread Spectrum (GGWAVE_OPERATING_MODE_USE_DSS)'],
                  ['Multi-Frame Framing', 'WV1 Packet Header + CRC-16-CCITT Checksum + LZ-String Compression'],
                  ['Offline Persistence', 'Instant CacheStorage (app-cache-v1) + LocalStorage Sandbox'],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="p-3 rounded-xl border border-[var(--md-sys-color-outline-variant)] flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                    style={{ background: 'var(--md-sys-color-surface-container-low)' }}
                  >
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">{k}</span>
                    <span className="font-bold text-[var(--md-sys-color-primary)]">{v}</span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'legal' && <LegalComplianceView />}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
