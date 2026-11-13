import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import { RefreshCw, Copy, Check, Download, X, QrCode, Sparkles } from 'lucide-react';
import type { StudioToastType } from './layout/ToastContainer';

interface QRUtilityNodeProps {
  onNotify?: (title: string, description?: string, type?: StudioToastType) => void;
}

export const QRUtilityNode: React.FC<QRUtilityNodeProps> = ({ onNotify }) => {
  const [data, setData] = useState('https://soundlink.offline');
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState(256);
  const [stacked, setStacked] = useState(false);
  const qrRef = useRef<SVGSVGElement>(null);
  const [preview, setPreview] = useState<{ url: string; type: string; filename: string } | null>(
    null
  );

  const generatePreview = (type: 'png' | 'svg') => {
    const svg = qrRef.current;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const fileName = `soundlink_qr_${Date.now()}.${type}`;

    if (type === 'svg') {
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setPreview({ url, type: 'svg', filename: fileName });
      onNotify?.('SVG QR Preview Ready', `${size} × ${size} px vector`, 'success');
    } else {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = size;
        canvas.height = size;
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setPreview({ url, type: 'png', filename: fileName });
            onNotify?.('PNG QR Preview Ready', `${size} × ${size} px raster`, 'success');
          }
        });
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data);
    setCopied(true);
    onNotify?.('Copied QR Payload', `${data.length} characters copied to clipboard`, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`grid grid-cols-1 ${stacked ? '' : 'lg:grid-cols-12'} gap-5 relative`}
    >
      {/* Left Column: Input & Export Controls */}
      <div
        className={`${
          stacked ? '' : 'lg:col-span-6'
        } studio-card-hover p-5 sm:p-6 flex flex-col justify-between gap-5`}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center border shrink-0"
                style={{
                  background: 'var(--md-sys-color-primary-container)',
                  borderColor: 'color-mix(in srgb, var(--studio-accent) 30%, transparent)',
                  color: 'var(--studio-accent)',
                }}
              >
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[var(--md-sys-color-on-surface)]">
                  Optical QR Studio
                </h3>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  Encode links, keys, or offline notes into high-density QR codes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStacked((v) => !v)}
                className="hidden lg:inline-flex px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer m3-btn-tonal"
              >
                {stacked ? 'Split View' : 'Stack View'}
              </button>
              {data.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setData('');
                    onNotify?.('QR input cleared', undefined, 'info');
                  }}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="studio-inset p-4 space-y-2 focus-within:border-[var(--studio-accent)] transition-colors">
            <textarea
              value={data}
              onChange={(e) => setData(e.target.value)}
              placeholder="Type or paste a link, Wi-Fi credential, or note..."
              rows={5}
              className="w-full bg-transparent text-sm leading-relaxed resize-y min-h-[112px] focus:outline-none font-mono"
              style={{ color: 'var(--md-sys-color-on-surface)' }}
            />
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[var(--md-sys-color-on-surface-variant)] pt-1 border-t border-[var(--studio-border)]">
              <span>ECC Level H (30% recovery)</span>
              <span>{data.length} chars</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border"
            style={{
              background: 'var(--md-sys-color-surface-container)',
              borderColor: 'var(--studio-border)',
            }}
          >
            <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
              Resolution
            </span>
            <input
              type="range"
              min="128"
              max="1024"
              step="32"
              value={size}
              onChange={(e) => setSize(parseInt(e.target.value, 10))}
              className="flex-1 studio-range"
              aria-label="QR export resolution"
            />
            <span className="text-xs font-mono font-bold tabular-nums text-[var(--studio-accent)] whitespace-nowrap w-14 text-right">
              {size}px
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={copyToClipboard}
              disabled={!data.trim()}
              className="min-h-[46px] py-2.5 px-3 m3-btn-tonal flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-40"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              type="button"
              onClick={() => generatePreview('png')}
              disabled={!data.trim()}
              className="min-h-[46px] py-2.5 px-3 m3-btn-filled flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>Export PNG</span>
            </button>
            <button
              type="button"
              onClick={() => generatePreview('svg')}
              disabled={!data.trim()}
              className="min-h-[46px] py-2.5 px-3 m3-btn-tertiary flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>Export SVG</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Precision QR Output Stage */}
      <div
        className={`${
          stacked ? '' : 'lg:col-span-6'
        } studio-card-hover p-6 sm:p-8 flex flex-col items-center justify-center min-h-[340px] relative overflow-hidden`}
      >
        {data.trim().length === 0 ? (
          <div className="text-center space-y-3 max-w-xs">
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center border"
              style={{
                background: 'var(--md-sys-color-primary-container)',
                borderColor: 'color-mix(in srgb, var(--studio-accent) 30%, transparent)',
                color: 'var(--studio-accent)',
              }}
            >
              <QrCode className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              Enter Content to Render QR
            </h4>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
              Generate crisp vector SVG or high-DPI PNG codes completely offline.
            </p>
            <button
              type="button"
              onClick={() => setData('https://soundlink.offline')}
              className="m3-btn-tonal px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--studio-accent)]" />
              <span>Load Sample URL</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-2xl border border-zinc-200/80 w-fit max-w-full flex items-center justify-center aspect-square">
              <QRCodeSVG
                ref={qrRef}
                value={data || ' '}
                size={Math.min(size, 290)}
                level="H"
                bgColor="#ffffff"
                fgColor="#09090B"
                includeMargin={false}
              />
            </div>
            <span className="text-[11px] font-mono tabular-nums text-[var(--md-sys-color-on-surface-variant)] px-3 py-1 rounded-full border border-[var(--studio-border)] bg-[var(--md-sys-color-surface-container)]">
              Output Target: {size} × {size} px · Error Correction High
            </span>
          </div>
        )}
      </div>

      {/* Preview Modal Overlay */}
      {preview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            className="w-full max-w-lg studio-card p-6 space-y-5"
            style={{
              background: 'var(--md-sys-color-surface-container-low)',
              borderColor: 'var(--studio-border-strong)',
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
                  Export QR Image
                </h2>
                <p className="text-xs font-mono tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                  {preview.type.toUpperCase()} · {size} × {size} px
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="p-2 rounded-full hover:bg-white/10 text-[var(--md-sys-color-on-surface-variant)] cursor-pointer"
                aria-label="Close export preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="studio-inset p-6 flex items-center justify-center">
              <img
                src={preview.url}
                alt="QR Preview"
                referrerPolicy="no-referrer"
                className="max-w-[240px] max-h-[240px] object-contain rounded-2xl bg-white p-4 shadow-md"
              />
            </div>

            <div className="flex items-center gap-3">
              <a
                href={preview.url}
                download={preview.filename}
                onClick={() =>
                  onNotify?.('Downloaded QR Image', preview.filename, 'success')
                }
                className="flex-1 min-h-[46px] rounded-full m3-btn-filled font-bold text-xs flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download {preview.type.toUpperCase()}</span>
              </a>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="min-h-[46px] px-6 rounded-full m3-btn-tonal font-semibold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};
