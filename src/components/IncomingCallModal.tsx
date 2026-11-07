import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { MaterialSymbol } from '../lib/materialTheme';

export interface IncomingCallData {
  peerId: string;
  callerName: string;
  callerAvatar?: string;
  callerColor?: string;
  callType: 'audio' | 'video';
  isScreenMirror?: boolean;
  sdp: RTCSessionDescriptionInit;
}

interface IncomingCallModalProps {
  incomingCall: IncomingCallData | null;
  onAccept: (call: IncomingCallData) => void;
  onDecline: (call: IncomingCallData) => void;
}

export function IncomingCallModal({
  incomingCall,
  onAccept,
  onDecline
}: IncomingCallModalProps) {
  const isScreen = Boolean(incomingCall?.isScreenMirror);
  const isVideo = incomingCall?.callType === 'video' || isScreen;

  return (
    <AnimatePresence>
      {incomingCall && (
        <motion.div
          key="incoming-call-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-md flex items-center justify-center p-4 font-sans"
        >
          <motion.div
            initial={{ scale: 0.92, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="m3-card-xl rounded-[28px] p-6 sm:p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden text-text border"
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              borderColor: 'var(--md-sys-color-outline-variant)',
            }}
          >
            {/* Expressive M3 Tonal Ambient Glow */}
            <div
              className="absolute -top-20 -left-16 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-45"
              style={{ backgroundColor: 'var(--md-sys-color-primary-container)' }}
            />
            <div
              className="absolute -bottom-20 -right-16 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-45"
              style={{ backgroundColor: 'var(--md-sys-color-tertiary-container)' }}
            />

            {/* Top Quantum Link E2EE Call Chip */}
            <div
              className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-semibold tracking-wide mb-6 border relative z-10"
              style={{
                backgroundColor: 'var(--md-sys-color-secondary-container)',
                color: 'var(--md-sys-color-on-secondary-container)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Quantum Link • DTLS-SRTP Encrypted</span>
            </div>

            {/* Caller Avatar with Android 16 Expressive Squircle / Ring */}
            <div className="relative mb-6">
              <div
                className="absolute -inset-3 rounded-[32px] animate-ping opacity-35"
                style={{ backgroundColor: 'var(--md-sys-color-primary)' }}
              />
              <div
                className="absolute -inset-1.5 rounded-[30px] opacity-60 border"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary-container)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              />
              <div
                className={cn(
                  "w-24 h-24 rounded-[26px] flex items-center justify-center text-3xl font-bold uppercase shadow-xl border relative z-10 overflow-hidden",
                  incomingCall.callerColor || "m3-btn-filled"
                )}
                style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              >
                {incomingCall.callerAvatar ? (
                  <img
                    src={incomingCall.callerAvatar}
                    alt={incomingCall.callerName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  incomingCall.callerName.substring(0, 2)
                )}
              </div>
              <div
                className="absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-2xl flex items-center justify-center shadow-md border-2 z-20"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary)',
                  color: 'var(--md-sys-color-on-primary)',
                  borderColor: 'var(--md-sys-color-surface-container-high)',
                }}
              >
                <MaterialSymbol
                  name={isScreen ? 'screen_share' : isVideo ? 'videocam' : 'call'}
                  size={18}
                  filled
                />
              </div>
            </div>

            {/* Caller Identity & Call Mode */}
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-text mb-1 relative z-10">
              {incomingCall.callerName}
            </h3>
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3 relative z-10"
              style={{
                backgroundColor: 'var(--md-sys-color-primary-container)',
                color: 'var(--md-sys-color-on-primary-container)',
              }}
            >
              <MaterialSymbol
                name={isScreen ? 'present_to_all' : isVideo ? 'video_call' : 'record_voice_over'}
                size={15}
              />
              <span>
                {isScreen
                  ? 'Incoming Screen Mirror Broadcast'
                  : isVideo
                    ? 'Incoming HD Video Call'
                    : 'Incoming Voice Call'}
              </span>
            </div>

            <p className="text-xs text-muted mb-7 max-w-[260px] leading-relaxed relative z-10">
              {isScreen
                ? 'Direct peer-to-peer screen presentation over Quantum Link Mesh.'
                : 'Zero-server, end-to-end encrypted peer tunnel over Quantum Link.'}
            </p>

            {/* Android 16 M3 Expressive Pill / Squircle Action Controls */}
            <div className="grid grid-cols-2 gap-3.5 w-full relative z-10">
              {/* Decline Pill */}
              <button
                type="button"
                onClick={() => onDecline(incomingCall)}
                className="h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                title="Decline Call"
              >
                <MaterialSymbol name="call_end" size={20} filled />
                <span>Decline</span>
              </button>

              {/* Accept Pill */}
              <button
                type="button"
                onClick={() => onAccept(incomingCall)}
                className="h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                title={isScreen ? "Watch Screen" : "Answer Call"}
              >
                <MaterialSymbol
                  name={isScreen ? 'screen_share' : isVideo ? 'videocam' : 'call'}
                  size={20}
                  filled
                />
                <span>{isScreen ? 'Watch' : 'Answer'}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
