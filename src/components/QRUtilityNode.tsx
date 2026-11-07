import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import { RefreshCw, Copy, Check, Download, X } from 'lucide-react';

export const QRUtilityNode: React.FC = () => {
  const [data, setData] = useState('https://soundlink.offline');
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState(256);
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
          }
        });
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative"
    >
      {/* Left Column: Input & Export Controls */}
      <div
        className="lg:col-span-6 rounded-[32px] p-5 sm:p-6 flex flex-col justify-between gap-5"
        style={{ background: 'var(--md-sys-color-surface-container-low)' }}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
                Optical QR Studio
              </h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Encode links, keys, or offline notes into high-density QR codes
              </p>
            </div>
            {data.length > 0 && (
              <button
                onClick={() => setData('')}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold text-rose-400 hover:bg-rose-500/10 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          <div
            className="rounded-[24px] p-4 space-y-2"
            style={{ background: 'var(--md-sys-color-surface-container-lowest)' }}
          >
            <textarea
              value={data}
              onChange={(e) => setData(e.target.value)}
              placeholder="Type or paste a link, Wi-Fi credential, or note..."
              rows={4}
              className="w-full bg-transparent text-sm leading-relaxed resize-none focus:outline-none"
              style={{ color: 'var(--md-sys-color-on-surface)' }}
            />
            <div className="text-right text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
              {data.length} characters
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
              Resolution
            </span>
            <input
              type="range"
              min="128"
              max="1024"
              step="32"
              value={size}
              onChange={(e) => setSize(parseInt(e.target.value, 10))}
              className="flex-1 accent-[var(--md-sys-color-primary)] h-1.5 rounded-full cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-[var(--md-sys-color-primary)] whitespace-nowrap">
              {size}px
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={copyToClipboard}
              className="min-h-[48px] py-3 px-3 rounded-full m3-btn-tonal flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95 whitespace-nowrap"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={() => generatePreview('png')}
              className="min-h-[48px] py-3 px-3 rounded-full m3-btn-filled flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>PNG</span>
            </button>
            <button
              onClick={() => generatePreview('svg')}
              className="min-h-[48px] py-3 px-3 rounded-full m3-btn-tertiary flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>SVG</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Clean Unboxed QR Stage */}
      <div
        className="lg:col-span-6 rounded-[32px] p-8 flex flex-col items-center justify-center min-h-[340px]"
        style={{ background: 'var(--md-sys-color-surface-container-low)' }}
      >
        <div className="bg-white p-6 rounded-[28px] shadow-lg w-fit max-w-full flex items-center justify-center aspect-square">
          <QRCodeSVG
            ref={qrRef}
            value={data || ' '}
            size={Math.min(size, 240)}
            level="H"
            bgColor="#ffffff"
            fgColor="#111827"
            includeMargin={false}
          />
        </div>
      </div>

      {/* Preview Modal Overlay */}
      {preview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            className="w-full max-w-lg rounded-[32px] p-6 space-y-5 shadow-2xl"
            style={{ background: 'var(--md-sys-color-surface-container-high)' }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
                  Export QR Image
                </h2>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {preview.type.toUpperCase()} · {size} × {size} px
                </p>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="p-2 rounded-full hover:bg-black/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 rounded-[24px] flex items-center justify-center bg-black/20">
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
                className="flex-1 min-h-[48px] rounded-full m3-btn-filled font-bold text-xs flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download {preview.type.toUpperCase()}</span>
              </a>
              <button
                onClick={() => setPreview(null)}
                className="min-h-[48px] px-6 rounded-full m3-btn-tonal font-bold text-xs cursor-pointer"
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
