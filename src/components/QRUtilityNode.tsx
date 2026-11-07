import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'motion/react';
import { Type, Maximize2, RefreshCw, Copy, Check, Eye, Download, X, GripHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';

export const QRUtilityNode: React.FC = () => {
  const [data, setData] = useState("https://nexus.p2p");
  const [copied, setCopied] = useState(false);
  const [size, setSize] = useState(256);
  const qrRef = useRef<SVGSVGElement>(null);
  const [preview, setPreview] = useState<{ url: string; type: string; filename: string } | null>(null);

  const generatePreview = (type: 'png' | 'svg') => {
    const svg = qrRef.current;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const fileName = `nexus_qr_${Date.now()}.${type}`;

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
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="grid grid-cols-12 gap-6 h-full overflow-y-auto pb-20 lg:pb-0 relative"
    >
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-5">
        {/* Source Data Input */}
        <div className="m3-card p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-4 text-text">
            <div className="w-9 h-9 rounded-2xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Enter Link or Text</h3>
              <p className="text-xs text-muted">Type any website URL, Wi-Fi password, or note</p>
            </div>
          </div>
          
          <textarea 
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="Type or paste a website link or text here..."
            className="w-full m3-surface-low border border-[var(--md-sys-color-outline-variant)] text-text p-4 rounded-2xl min-h-[120px] outline-none focus:border-[var(--md-sys-color-primary)] resize-none placeholder:text-muted/60 mb-3 text-sm leading-relaxed transition-colors"
          />

          <div className="flex justify-between items-center m3-surface-low px-4 py-2.5 rounded-full border border-[var(--md-sys-color-outline-variant)]">
            <span className="text-xs text-muted font-mono tabular-nums">{data.length} characters</span>
            <button 
              onClick={() => setData("")}
              className="text-xs text-red-600 dark:text-red-400 hover:bg-red-500/15 transition-colors flex items-center gap-1 font-semibold bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>

        {/* Config Panel */}
        <div className="m3-card p-6 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-5 text-text">
            <div className="w-9 h-9 rounded-2xl bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] flex items-center justify-center">
              <Maximize2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Save or Copy QR Code</h3>
              <p className="text-xs text-muted">Adjust image size and download</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-xs font-medium text-muted mb-2.5">
                <span>Image Size</span>
                <span className="text-[var(--md-sys-color-primary)] font-mono font-bold tabular-nums">{size} × {size} px</span>
              </div>
              <input 
                type="range"
                min="128"
                max="1024"
                step="32"
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value))}
                className="w-full accent-[var(--md-sys-color-primary)] m3-surface-high h-2 rounded-full cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <button 
                onClick={copyToClipboard}
                className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 rounded-2xl m3-btn-tonal transition-all text-xs font-semibold cursor-pointer active:scale-95"
              >
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "Copied!" : "Copy Text"}</span>
              </button>
              <button 
                onClick={() => generatePreview('png')}
                className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 rounded-2xl m3-btn-filled transition-all text-xs font-semibold cursor-pointer shadow-2xs active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Save PNG</span>
              </button>
              <button 
                onClick={() => generatePreview('svg')}
                className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 rounded-2xl m3-btn-tertiary transition-all text-xs font-semibold cursor-pointer active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Save SVG</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Viewport */}
      <div className="col-span-12 lg:col-span-7 m3-card relative flex items-center justify-center overflow-hidden p-8 sm:p-12 min-h-[380px]">
        <div className="absolute top-4 left-4 text-xs text-muted flex items-center gap-2 font-semibold m3-surface-high px-3.5 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)]">
          <div className="h-2 w-2 rounded-full bg-success" />
          QR Code Preview
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-[24px] relative shadow-md border border-[var(--md-sys-color-outline-variant)] w-fit max-w-full flex items-center justify-center aspect-square mx-auto">
          <QRCodeSVG 
            ref={qrRef}
            value={data || " "}
            size={size}
            level="H"
            bgColor="#ffffff"
            fgColor="#111827"
            includeMargin={false}
            style={{ width: '100%', height: '100%', maxWidth: `${size}px`, maxHeight: `${size}px` }}
          />
        </div>
      </div>

      {/* Preview Overlay */}
      {preview && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-50 m3-card-xl flex flex-col p-5 sm:p-8 shadow-2xl overflow-y-auto"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 mb-6 border-b border-[var(--md-sys-color-outline-variant)] pb-4">
            <div className="flex flex-col">
              <h2 className="text-lg sm:text-xl font-bold text-text">Download QR Code Image</h2>
              <p className="text-xs text-muted mt-0.5">
                Format: {preview.type.toUpperCase()} ({size} × {size} px)
              </p>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap gap-2.5 w-full sm:w-auto">
              <a 
                href={preview.url} 
                download={preview.filename}
                className="flex-1 sm:flex-none justify-center flex items-center gap-2 py-2.5 px-5 rounded-full m3-btn-filled font-semibold text-xs transition-all shadow-2xs"
              >
                <Download className="w-4 h-4" /> Save Image
              </a>
              <button 
                onClick={() => setPreview(null)}
                className="flex-1 sm:flex-none justify-center flex items-center gap-2 py-2.5 px-5 rounded-full m3-btn-tonal font-semibold text-xs transition-all cursor-pointer"
              >
                <X className="w-4 h-4" /> Back
              </button>
            </div>
          </div>

          <div className="flex-1 border border-[var(--md-sys-color-outline-variant)] m3-surface-low rounded-2xl flex items-center justify-center relative overflow-hidden group p-6">
            <img 
              src={preview.url} 
              alt="QR Preview" 
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("DownloadURL", `image/${preview.type}:${preview.filename}:${preview.url}`);
              }}
              className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing rounded-2xl bg-white p-4 shadow-md border border-[var(--md-sys-color-outline-variant)]"
            />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};
