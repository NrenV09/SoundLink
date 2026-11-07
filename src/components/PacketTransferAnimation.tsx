import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, FileText, XCircle, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { TransferProgress } from '../types';

interface PacketTransferAnimationProps {
  transfer: TransferProgress;
  myUsername: string;
  onCancel?: () => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export function PacketTransferAnimation({ transfer, myUsername, onCancel }: PacketTransferAnimationProps) {
  const isSending = transfer.type === 'sending';
  const actualSizeTransferred = formatBytes(transfer.transferredBytes || 0);
  const totalSize = formatBytes(transfer.totalBytes || 0);

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="w-full p-5 flex flex-col gap-3.5 relative overflow-hidden bg-gray-50 dark:bg-[#18191c] border border-gray-300 dark:border-[#343842] rounded-xl shadow-xs mb-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border",
              isSending ? "bg-accent/10 border-accent/25 text-accent" : "bg-success/10 border-success/25 text-success"
            )}>
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-text truncate" title={transfer.name}>
                {transfer.name}
              </div>
              <div className="text-xs text-muted flex items-center gap-1.5">
                <span>{isSending ? `Sending to ${transfer.peerUsername || "Friend"}` : `Receiving from ${transfer.peerUsername || "Friend"}`}</span>
                <span>•</span>
                <span className="font-mono tabular-nums">{actualSizeTransferred} of {totalSize}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className={cn("text-sm font-bold font-mono tabular-nums", isSending ? "text-accent" : "text-success")}>
              {transfer.progress}%
            </span>
            {onCancel && (
              <button 
                onClick={onCancel}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#22242a] hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white text-xs font-semibold transition-all border border-red-500/30 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>

        {/* Classic Progress Bar */}
        <div className="w-full h-2.5 bg-gray-200 dark:bg-[#2a2d35] rounded-full overflow-hidden">
          <motion.div 
            className={cn("h-full rounded-full transition-all duration-150", isSending ? "bg-accent" : "bg-success")}
            style={{ width: `${Math.max(2, transfer.progress)}%` }}
          />
        </div>

        {transfer.isWaitingForReceiver && (
          <div className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
            <span>Waiting for the other person to click "Save File" on their screen...</span>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
