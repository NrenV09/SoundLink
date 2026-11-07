import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MaterialSymbol } from '../lib/materialTheme';

interface CookieConsentBannerProps {
  onOpenLegal: () => void;
}

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ onOpenLegal }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('nexus_cookie_consent');
      if (!consent) {
        const timer = setTimeout(() => setIsVisible(true), 1200);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleAcceptAll = () => {
    try {
      localStorage.setItem('nexus_cookie_consent', 'accepted_all');
      localStorage.setItem('nexus_consent_cache_storage', 'true');
      localStorage.setItem('nexus_consent_opfs', 'true');
      setIsVisible(false);
    } catch {
      setIsVisible(false);
    }
  };

  const handleEssentialOnly = () => {
    try {
      localStorage.setItem('nexus_cookie_consent', 'essential_only');
      localStorage.setItem('nexus_consent_cache_storage', 'false');
      localStorage.setItem('nexus_consent_opfs', 'false');
      setIsVisible(false);
    } catch {
      setIsVisible(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[200]"
        >
          <div
            className="m3-card-xl rounded-[28px] p-5 shadow-2xl backdrop-blur-xl text-text space-y-3.5 border"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <MaterialSymbol name="cookie" size={20} />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-text flex items-center gap-2 flex-wrap">
                    <span>On-Device Storage Notice</span>
                    <span
                      className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--md-sys-color-tertiary-container)',
                        color: 'var(--md-sys-color-on-tertiary-container)',
                      }}
                    >
                      Zero Trackers
                    </span>
                  </h4>
                  <p className="text-[11px] text-muted">
                    Quantum Link never uses advertising or tracking cookies.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsVisible(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-text m3-surface-interactive border transition-colors cursor-pointer shrink-0"
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                title="Dismiss banner"
                aria-label="Dismiss storage notice"
              >
                <MaterialSymbol name="close" size={16} />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Quantum Link stores essential connection parameters, Material You theme preferences, and offline sandbox file cache directly on your device disk. Zero personal data ever touches a remote server.
            </p>

            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
              <button
                onClick={onOpenLegal}
                className="text-[11px] font-semibold text-[color:var(--md-sys-color-primary)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <MaterialSymbol name="verified_user" size={14} />
                <span>Legal & Regulatory Hub</span>
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleEssentialOnly}
                  className="px-4 py-2 rounded-full m3-surface-interactive border text-text text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                  style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  Essential Only
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="px-4 py-2 rounded-full m3-btn-filled text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  Accept All
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
