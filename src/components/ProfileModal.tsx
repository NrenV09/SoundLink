import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { X, User, Shield, Calendar, Palette, Info, RefreshCw, Camera, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { UserProfile } from '../types';
import { cn } from '../lib/utils';
import { generateRandomName } from '../lib/nameGenerator';

interface ProfileModalProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onClose: () => void;
}

const AVATAR_COLORS = [
  'bg-accent',
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
  'bg-zinc-800'
];

const PRESET_AVATARS = [
  {
    name: 'Cyberpunk',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0f172a"/><circle cx="50" cy="42" r="20" fill="url(#g1)"/><path d="M26 84c0-14 11-22 24-22s24 8 24 22" fill="url(#g1)"/><rect x="36" y="38" width="28" height="7" rx="3.5" fill="#38bdf8"/><circle cx="43" cy="41.5" r="2" fill="#fff"/><circle cx="57" cy="41.5" r="2" fill="#fff"/></svg>`)}`
  },
  {
    name: 'Quantum',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#064e3b"/><circle cx="50" cy="50" r="28" fill="none" stroke="url(#g2)" stroke-width="4"/><ellipse cx="50" cy="50" rx="34" ry="13" fill="none" stroke="#34d399" stroke-width="3" transform="rotate(30 50 50)"/><ellipse cx="50" cy="50" rx="34" ry="13" fill="none" stroke="#22d3ee" stroke-width="3" transform="rotate(-30 50 50)"/><circle cx="50" cy="50" r="9" fill="#fff"/></svg>`)}`
  },
  {
    name: 'Sentinel',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#ef4444"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#451a03"/><path d="M50 22 L74 36 L74 64 L50 78 L26 64 L26 36 Z" fill="url(#g3)"/><circle cx="50" cy="50" r="11" fill="#fff"/><circle cx="50" cy="50" r="5" fill="#78350f"/></svg>`)}`
  },
  {
    name: 'Vortex',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#3b0764"/><circle cx="50" cy="48" r="26" fill="url(#g4)"/><circle cx="42" cy="44" r="4.5" fill="#fff"/><circle cx="58" cy="44" r="4.5" fill="#fff"/><path d="M42 58 Q50 66 58 58" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`)}`
  },
  {
    name: 'Cosmos',
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g5" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0284c7"/><stop offset="100%" stop-color="#9333ea"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#030712"/><circle cx="50" cy="44" r="18" fill="url(#g5)"/><ellipse cx="50" cy="74" rx="26" ry="14" fill="url(#g5)"/><circle cx="50" cy="42" r="7" fill="#38bdf8"/></svg>`)}`
  }
];

export function ProfileModal({ profile, onSave, onClose }: ProfileModalProps) {
  const [editedProfile, setEditedProfile] = useState<UserProfile>({ ...profile });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValid = editedProfile.username.trim().length > 0;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Center square crop
        const minDim = Math.min(img.width, img.height);
        const startX = (img.width - minDim) / 2;
        const startY = (img.height - minDim) / 2;

        ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        setEditedProfile(prev => ({
          ...prev,
          avatarImage: dataUrl
        }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setEditedProfile(prev => {
      const next = { ...prev };
      delete next.avatarImage;
      return next;
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      ...editedProfile,
      username: editedProfile.username.trim()
    });
    onClose();
  };

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
            <div className={cn("p-2.5 rounded-2xl text-white shadow-2xs", editedProfile.avatarColor)}>
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">Your Profile</h2>
              <p className="text-xs text-muted">Customize how peers see you on Quantum Link</p>
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
          {/* Avatar & Photo Upload Section */}
          <div className="flex flex-col items-center gap-3">
            <input 
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleImageChange}
              className="hidden"
            />
            
            <div className="relative group">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-md border-4 border-[var(--md-sys-color-surface-container-high)] transition-all overflow-hidden cursor-pointer relative select-none",
                  editedProfile.avatarColor
                )}
                title="Click to choose a profile picture"
              >
                {editedProfile.avatarImage ? (
                  <img 
                    src={editedProfile.avatarImage} 
                    alt={editedProfile.username} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  editedProfile.username.charAt(0).toUpperCase() || '?'
                )}
                
                {/* Hover Camera Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[10px] font-semibold uppercase">Change</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 p-2 rounded-full m3-btn-filled shadow-md border-2 border-[var(--md-sys-color-surface-container)] transition-colors cursor-pointer"
                title="Upload Profile Picture"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Profile Picture Action Buttons */}
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-1.5 rounded-full m3-btn-tonal text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {editedProfile.avatarImage ? "Change Photo" : "Upload Photo"}
              </button>
              
              {editedProfile.avatarImage && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="px-3.5 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-red-500/25"
                  title="Remove custom picture"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>

            {/* Quick Avatar Presets */}
            <div className="w-full flex flex-col items-center gap-1.5 pt-1">
              <span className="text-xs font-medium text-muted">Or choose an icon:</span>
              <div className="flex items-center justify-center gap-2">
                {PRESET_AVATARS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setEditedProfile(prev => ({ ...prev, avatarImage: preset.url }))}
                    className={cn(
                      "w-8 h-8 rounded-full overflow-hidden border-2 transition-all hover:scale-105 cursor-pointer",
                      editedProfile.avatarImage === preset.url 
                        ? "border-[var(--md-sys-color-primary)] ring-2 ring-[var(--md-sys-color-primary)]/30" 
                        : "border-[var(--md-sys-color-outline-variant)] opacity-80 hover:opacity-100"
                    )}
                    title={`Choose ${preset.name} avatar`}
                  >
                    <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-text">
                Your Display Name
              </label>
              <button
                onClick={() => setEditedProfile({...editedProfile, username: generateRandomName()})}
                className="text-xs font-semibold text-[var(--md-sys-color-primary)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Random Name
              </button>
            </div>
            <input 
              type="text"
              value={editedProfile.username}
              onChange={(e) => setEditedProfile({ ...editedProfile, username: e.target.value.substring(0, 20) })}
              className="w-full m3-surface-low border border-[var(--md-sys-color-outline-variant)] rounded-2xl px-4 py-2.5 text-sm text-text focus:border-[var(--md-sys-color-primary)] outline-none transition-all"
              placeholder="Enter your name..."
            />
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text block">
              Short Status / Note
            </label>
            <textarea 
              value={editedProfile.bio}
              onChange={(e) => setEditedProfile({ ...editedProfile, bio: e.target.value.substring(0, 100) })}
              className="w-full m3-surface-low border border-[var(--md-sys-color-outline-variant)] rounded-2xl px-4 py-2.5 text-sm text-text focus:border-[var(--md-sys-color-primary)] outline-none transition-all min-h-[72px] resize-none"
              placeholder="Add a short status or note..."
            />
            <p className="text-[11px] text-right text-muted font-mono tabular-nums">{editedProfile.bio.length}/100</p>
          </div>

          {/* Avatar Colors */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-text block">
              Profile Color
            </label>
            <div className="grid grid-cols-6 gap-2 max-h-28 overflow-y-auto p-1 scrollbar-hide">
              {AVATAR_COLORS.map((color) => (
                <div
                  key={color}
                  onClick={() => setEditedProfile({ ...editedProfile, avatarColor: color })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setEditedProfile({ ...editedProfile, avatarColor: color });
                    }
                  }}
                  className={cn(
                    "h-8 rounded-full transition-all relative overflow-hidden cursor-pointer",
                    color,
                    editedProfile.avatarColor === color ? "ring-2 ring-[var(--md-sys-color-primary)] scale-105 shadow-xs border border-white/40" : "opacity-80 hover:opacity-100"
                  )}
                >
                  {editedProfile.avatarColor === color && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 m3-surface-low border-t border-[var(--md-sys-color-outline-variant)] flex gap-2.5">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-xs font-semibold m3-btn-tonal rounded-full transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!isValid}
            className={cn(
              "flex-[2] px-4 py-2.5 text-xs font-semibold rounded-full shadow-2xs transition-all cursor-pointer",
              isValid 
                ? "m3-btn-filled" 
                : "bg-gray-400 dark:bg-gray-700 opacity-50 cursor-not-allowed text-white"
            )}
          >
            Save Profile
          </button>
        </div>
      </motion.div>
    </div>
  );
}
