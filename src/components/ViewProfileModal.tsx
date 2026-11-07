import React from 'react';
import { motion } from 'motion/react';
import { X, User, Calendar, Info, Phone, Video, MonitorUp } from 'lucide-react';
import { UserProfile } from '../types';
import { cn } from '../lib/utils';

interface ViewProfileModalProps {
  profile: UserProfile;
  onClose: () => void;
  onStartCall?: (type: 'audio' | 'video' | 'screen') => void;
}

export function ViewProfileModal({ profile, onClose, onStartCall }: ViewProfileModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        className="relative w-full max-w-md m3-card-xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[var(--md-sys-color-outline-variant)] flex items-center justify-between m3-surface-low">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-2xl text-white shadow-2xs", profile.avatarColor || "bg-[var(--md-sys-color-primary)]")}>
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">Peer Contact Info</h2>
              <p className="text-xs text-muted">Connected Quantum Link Node</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 m3-surface-high rounded-full text-muted hover:text-text transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Avatar Display */}
          <div className="flex flex-col items-center gap-3">
            <div className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-md border-4 border-[var(--md-sys-color-surface-container-high)] overflow-hidden relative",
              profile.avatarColor || "bg-[var(--md-sys-color-primary)]"
            )}>
              {profile.avatarImage ? (
                <img 
                  src={profile.avatarImage} 
                  alt={profile.username} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                profile.username.charAt(0).toUpperCase() || '?'
              )}
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-xl font-bold text-text flex items-center justify-center gap-2">
                {profile.username}
              </h3>
              <div className="inline-flex items-center gap-1.5 text-xs text-muted justify-center m3-surface-low border border-[var(--md-sys-color-outline-variant)] px-3 py-1 rounded-full">
                <Calendar className="w-3.5 h-3.5" />
                Joined {new Date(profile.joinedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-2 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
            <label className="text-xs font-bold text-text block">
              Status / Note
            </label>
            <div className="m3-surface-low border border-[var(--md-sys-color-outline-variant)] rounded-2xl px-4 py-3 text-sm text-text leading-relaxed min-h-[70px]">
              {profile.bio || "No status note added."}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 m3-surface-low border-t border-[var(--md-sys-color-outline-variant)] flex flex-wrap gap-2">
          {onStartCall && (
            <>
              <button 
                onClick={() => { onClose(); onStartCall('audio'); }}
                className="flex-1 min-w-[90px] px-3 py-2.5 text-xs font-semibold m3-btn-tertiary rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Phone className="w-3.5 h-3.5" />
                Voice Call
              </button>
              <button 
                onClick={() => { onClose(); onStartCall('video'); }}
                className="flex-1 min-w-[90px] px-3 py-2.5 text-xs font-semibold m3-btn-filled rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Video className="w-3.5 h-3.5" />
                Video Call
              </button>
              <button 
                onClick={() => { onClose(); onStartCall('screen'); }}
                className="flex-1 min-w-[110px] px-3 py-2.5 text-xs font-semibold m3-btn-tonal rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                title="Share your screen with this person"
              >
                <MonitorUp className="w-3.5 h-3.5" />
                Share Screen
              </button>
            </>
          )}
          <button 
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold m3-surface-high border border-[var(--md-sys-color-outline-variant)] text-text rounded-full transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
