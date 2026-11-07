import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HardDrive, Download, X, ShieldCheck, User, Smartphone, Monitor } from 'lucide-react';
import { cn } from '../lib/utils';
import { getDiskStreamSupport } from '../lib/diskStreamer';

interface DirectDownloadPromptModalProps {
  isOpen: boolean;
  fileName: string;
  fileSize: number;
  senderName: string;
  onAccept: () => void;
  onDecline: () => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const DirectDownloadPromptModal: React.FC<DirectDownloadPromptModalProps> = ({
  isOpen,
  fileName,
  fileSize,
  senderName,
  onAccept,
  onDecline
}) => {
  const streamSupport = getDiskStreamSupport();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[270] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.96, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 10, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 360 }}
            className="relative w-full max-w-md m3-card-xl p-6 shadow-2xl overflow-hidden text-text flex flex-col gap-4"
          >
            {/* Header Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] text-xs font-semibold">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Direct File Save</span>
              </div>

              <button
                onClick={onDecline}
                className="p-2 rounded-full text-muted hover:text-text m3-surface-high transition-colors cursor-pointer"
                title="Decline download"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Prompt Content */}
            <div className="space-y-3">
              <div className="text-base sm:text-lg font-bold text-text leading-snug tracking-tight">
                Incoming File Ready to Save
              </div>

              <div className="p-4 rounded-2xl m3-surface-low border border-[var(--md-sys-color-outline-variant)] space-y-2">
                <div className="font-semibold text-sm text-text break-all">
                  {fileName}
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Size: <strong className="text-text font-mono tabular-nums">{formatBytes(fileSize)}</strong></span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-[var(--md-sys-color-primary)]" />
                    <span>From: <strong className="text-text">{senderName}</strong></span>
                  </span>
                </div>
              </div>

              {/* Platform Engine Status */}
              <div className="p-3.5 rounded-2xl bg-[var(--md-sys-color-secondary-container)]/50 border border-[var(--md-sys-color-outline-variant)] flex items-start gap-2.5 text-xs text-muted leading-relaxed">
                {streamSupport.isIOS ? (
                  <Smartphone className="w-4 h-4 text-[var(--md-sys-color-primary)] shrink-0 mt-0.5" />
                ) : (
                  <Monitor className="w-4 h-4 text-[var(--md-sys-color-primary)] shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-text text-xs flex items-center gap-1.5">
                    <span>Large File Support</span>
                    <span className="px-2 py-0.5 bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] rounded-full text-[10px] uppercase font-bold">Ready</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    This file will save directly to your device storage so even very large files download smoothly.
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted leading-relaxed">
                <strong className="text-text">{senderName}</strong> is waiting for you to accept this file. Click the download button below to start saving it.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onDecline}
                className="flex-1 py-2.5 px-4 rounded-full m3-btn-tonal text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                Decline
              </button>

              <button
                onClick={onAccept}
                className="flex-2 py-2.5 px-5 rounded-full m3-btn-filled text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>{streamSupport.isIOS ? "Save to Device" : "Save to Computer"}</span>
              </button>
            </div>

            <div className="text-[11px] text-muted text-center flex items-center justify-center gap-1.5 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-success" />
              <span>Quantum Link • Private Device-to-Device File Transfer</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
