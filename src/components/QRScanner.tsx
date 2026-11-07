import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ isOpen, onClose, onScan }) => {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader-container";

  useEffect(() => {
    if (isOpen) {
      setError(null);
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 10,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
      };

      html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          onScan(decodedText);
          stopScanner();
        },
        () => {
          // ignore scan failures
        }
      ).catch((err) => {
        setError("Camera access failed. Check permissions.");
        console.error(err);
      });
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const stopScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().then(() => {
        scannerRef.current?.clear();
      }).catch(console.error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md bg-[#12151e] border border-white/[0.1] rounded-2xl overflow-hidden aspect-square shadow-2xl">
        <div id={containerId} className="w-full h-full [&>video]:object-cover" />
        
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <div className="w-60 h-60 border-2 border-accent/70 rounded-2xl shadow-[0_0_24px_rgba(59,130,246,0.25)] animate-pulse" />
          <div className="mt-6 text-white font-semibold text-xs tracking-wider uppercase bg-[#0a0c12]/80 backdrop-blur-md px-5 py-2 rounded-xl shadow-lg border border-white/[0.1]">
            Scanning QR Payload...
          </div>
        </div>

        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-black/50 hover:bg-black/70 text-white border border-white/10 backdrop-blur-md transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {error && (
          <div className="absolute bottom-4 inset-x-4 bg-red-500/15 border border-red-500/30 backdrop-blur-md text-red-300 font-medium p-3.5 rounded-xl text-center text-xs shadow-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
