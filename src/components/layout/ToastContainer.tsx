import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';

export type StudioToastType = 'success' | 'info' | 'warning' | 'error';

export interface StudioToastItem {
  id: string;
  title: string;
  description?: string;
  type: StudioToastType;
}

interface ToastContainerProps {
  toasts: StudioToastItem[];
  onDismiss: (id: string) => void;
}

const TOAST_ICONS: Record<StudioToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
  info: <Info className="w-4 h-4 text-[var(--studio-accent)] shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  error: <XCircle className="w-4 h-4 text-rose-400 shrink-0" />,
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-20 md:bottom-5 right-4 sm:right-6 z-50 flex flex-col gap-2.5 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.94 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="pointer-events-auto rounded-2xl px-4 py-3 flex items-start gap-3 backdrop-blur-xl"
            style={{
              background: 'color-mix(in srgb, var(--md-sys-color-surface-container-low) 94%, transparent)',
              border: '1px solid var(--studio-border-strong)',
              boxShadow: '0 14px 36px -8px rgba(0,0,0,0.48), var(--studio-top-highlight)',
            }}
          >
            <div className="mt-0.5">{TOAST_ICONS[toast.type]}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] leading-snug">
                {toast.title}
              </div>
              {toast.description && (
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5 leading-snug break-words">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="p-1 rounded-full hover:bg-white/10 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
