import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor,
  MonitorUp,
  Users,
  Volume2,
  Pin,
  PinOff,
  Sparkles,
  LayoutGrid,
  Maximize2,
  Minimize2,
  GripHorizontal,
  ShieldCheck,
  Radio,
  Activity,
  FlipHorizontal,
  RotateCw,
  RotateCcw,
  Scan
} from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';

function useAudioActivity(stream: MediaStream | null, isMuted: boolean = false) {
  const [speaking, setSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  useEffect(() => {
    if (!stream || isMuted) {
      setSpeaking(false);
      setVolumeLevel(0);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks.some(t => t.enabled && t.readyState === 'live')) {
      setSpeaking(false);
      setVolumeLevel(0);
      return;
    }

    let animId: number;
    let audioCtx: AudioContext | null = null;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const check = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setVolumeLevel(avg);
        setSpeaking(avg > 14);
        animId = requestAnimationFrame(check);
      };
      check();
    } catch (e) {
      // AudioContext may be restricted in some iframe contexts
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [stream, isMuted]);

  return { speaking, volumeLevel };
}

// Persistent audio sink for every remote participant:
// Keeps audio playing continuously in background even when switching tabs or minimized in PiP!
function RemoteAudioSink({ stream, isMuted = false }: { stream: MediaStream; isMuted?: boolean; key?: React.Key }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (audioRef.current && audioRef.current.srcObject !== stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(e => console.warn("Remote audio sink play error:", e));
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline muted={isMuted} />;
}

// Fallback presentation display stream generator for restricted iframe / preview environments
function createSimDisplayStream(): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  let frame = 0;
  let activeTab = 0;
  const tabs = ["QuantumArchitecture.tsx", "DirectTunnel.rs", "PeerBroadcast.proto"];
  
  const timer = setInterval(() => {
    if (!ctx) return;
    frame++;
    if (frame % 150 === 0) activeTab = (activeTab + 1) % tabs.length;

    // Desktop wallpaper
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, 1280, 720);

    // Subtle grid background
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1280; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 720);
      ctx.stroke();
    }
    for (let y = 0; y < 720; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1280, y);
      ctx.stroke();
    }

    // Top system bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 1280, 36);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('⚡ QUANTUM DISPLAY MIRROR • 1080p PRESENTATION STAGE', 20, 23);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText(new Date().toLocaleTimeString(), 1180, 23);

    // Presentation IDE / Window
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.roundRect(80, 60, 1120, 590, 12);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Window top bar
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.roundRect(80, 60, 1120, 42, [12, 12, 0, 0]);
    ctx.fill();

    // Window controls
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(104, 81, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eab308';
    ctx.beginPath(); ctx.arc(124, 81, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(144, 81, 6, 0, Math.PI * 2); ctx.fill();

    // Tabs
    tabs.forEach((tab, idx) => {
      ctx.fillStyle = idx === activeTab ? '#111827' : '#1f2937';
      ctx.fillRect(170 + idx * 190, 64, 180, 38);
      ctx.fillStyle = idx === activeTab ? '#38bdf8' : '#94a3b8';
      ctx.font = '12px monospace';
      ctx.fillText(tab, 185 + idx * 190, 88);
    });

    // Content area with code/slides
    ctx.fillStyle = '#f8fafc';
    ctx.font = '14px monospace';
    const lines = [
      "// PRESENTATION: DIRECT WEBRTC P2P SCREEN MIRRORING",
      "export class QuantumPresentationStream {",
      `  public readonly timestamp = "${new Date().toISOString()}";`,
      "  public readonly resolution = '1920x1080@60fps HD (Lossless Detail)';",
      "  public readonly cipherSuite = 'ChaCha20-Poly1305 / AES-GCM-256';",
      "",
      "  // Full Screen Presenter Stage Active:",
      "  public broadcastToPeers(): PresentationStats {",
      `    const packetsDelivered = ${Math.floor(frame * 4.2)};`,
      "    const streamMode = 'FULLSCREEN_THEATER_CONTAIN';",
      "    return { status: 'OPTIMAL_MIRROR', latency: '< 15ms' };",
      "  }",
      "}"
    ];
    lines.forEach((line, i) => {
      ctx.fillStyle = line.startsWith('//') ? '#64748b' : line.includes('public') ? '#38bdf8' : '#e2e8f0';
      ctx.fillText(line, 110, 140 + i * 28);
    });

    // Animated pointer / cursor
    const mouseX = 420 + Math.sin(frame * 0.04) * 260;
    const mouseY = 340 + Math.cos(frame * 0.04) * 140;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(mouseX, mouseY);
    ctx.lineTo(mouseX + 16, mouseY + 14);
    ctx.lineTo(mouseX + 6, mouseY + 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

  }, 1000 / 30);

  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0];
  if (track) {
    const origStop = track.stop.bind(track);
    track.stop = () => {
      clearInterval(timer);
      origStop();
    };
  }
  return stream;
}

export function CallOverlay({
  active,
  type,
  localStream,
  remoteStreams,
  localProfile,
  peerProfiles,
  peerTrackStates,
  screenSharingPeers,
  getPeerName,
  onEndCall,
  onToggleTrack,
  onRequestAddTrack,
  onToggleScreenShare,
  isMinimized = false,
  onToggleMinimize
}: {
  active: boolean;
  type: 'audio' | 'video' | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  localProfile?: UserProfile;
  peerProfiles?: Record<string, UserProfile>;
  peerTrackStates?: Record<string, { video?: boolean; audio?: boolean }>;
  screenSharingPeers?: Record<string, boolean>;
  getPeerName?: (peerId: string) => string;
  onEndCall: () => void;
  onToggleTrack?: (kind: 'audio' | 'video', enabled: boolean) => void;
  onRequestAddTrack?: (track: MediaStreamTrack) => void;
  onToggleScreenShare?: (sharing: boolean) => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}) {
  const [screenTrack, setScreenTrack] = useState<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(type === 'audio');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const meetingContainerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const pipConstraintsRef = useRef<HTMLDivElement>(null);

  // Internal minimize fallback
  const [internalMinimized, setInternalMinimized] = useState(false);
  const minimized = isMinimized !== undefined ? isMinimized : internalMinimized;
  const toggleMinimize = () => {
    if (onToggleMinimize) onToggleMinimize();
    else setInternalMinimized(prev => !prev);
  };

  // Rotation states per tile (0, 90, 180, 270)
  const [tileRotations, setTileRotations] = useState<Record<string, number>>({});
  const rotateTile = (id: string) => {
    setTileRotations(prev => ({
      ...prev,
      [id]: ((prev[id] || 0) + 90) % 360
    }));
  };
  const resetTileRotation = (id: string) => {
    setTileRotations(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Floating controls auto-hide in Theater / Full Screen Mode
  const [showTheaterControls, setShowTheaterControls] = useState(true);
  const theaterControlsTimeoutRef = useRef<any>(null);

  const resetTheaterControlsTimer = () => {
    setShowTheaterControls(true);
    if (theaterControlsTimeoutRef.current) {
      clearTimeout(theaterControlsTimeoutRef.current);
    }
    theaterControlsTimeoutRef.current = setTimeout(() => {
      setShowTheaterControls(false);
    }, 3500);
  };

  useEffect(() => {
    if (isTheaterMode) {
      resetTheaterControlsTimer();
    } else {
      setShowTheaterControls(true);
      if (theaterControlsTimeoutRef.current) {
        clearTimeout(theaterControlsTimeoutRef.current);
      }
    }
  }, [isTheaterMode]);

  // Escape key to exit Full Screen Theater Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTheaterMode) {
        setIsTheaterMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTheaterMode]);

  // Full Screen / Theater Presenter Mode toggle
  const toggleTheaterMode = () => {
    setIsTheaterMode(prev => {
      const next = !prev;
      if (next && viewMode === 'grid') {
        setViewMode('spotlight');
        setSpotlightId(activeSharerId || (remoteEntries.length > 0 ? remoteEntries[0][0] : 'local'));
      }
      try {
        if (next && !document.fullscreenElement) {
          meetingContainerRef.current?.requestFullscreen?.().catch(() => {});
        } else if (!next && document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      } catch (_) {}
      return next;
    });
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && isTheaterMode) {
        setIsTheaterMode(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [isTheaterMode]);

  // Spotlight & Layout State
  const [viewMode, setViewMode] = useState<'grid' | 'spotlight'>('grid');
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  
  // Fit modes per tile ('contain' for non-cropped full landscape, 'cover' for zoomed fill)
  const [tileFitModes, setTileFitModes] = useState<Record<string, 'contain' | 'cover'>>({
    local: 'contain'
  });

  const { speaking: isLocalSpeaking } = useAudioActivity(localStream, isMicMuted);

  // Find active screen sharer (remote or local)
  const remoteScreenSharerId = useMemo(() => {
    if (!screenSharingPeers) return null;
    return Object.keys(screenSharingPeers).find(id => screenSharingPeers[id]) || null;
  }, [screenSharingPeers]);

  const activeSharerId = isScreenSharing ? 'local' : remoteScreenSharerId;
  const isAnyScreenSharing = Boolean(activeSharerId);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setIsVideoOff(type === 'audio');
  }, [type]);

  // Clean up screen sharing on unmount or when call becomes inactive
  useEffect(() => {
    if (!active) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setScreenTrack(null);
      setIsScreenSharing(false);
    }
    return () => {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
    };
  }, [active]);

  const toggleMic = () => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    const nextState = !isMicMuted;
    const newEnabled = !nextState;
    audioTracks.forEach(track => {
      track.enabled = newEnabled;
    });
    setIsMicMuted(nextState);
    onToggleTrack?.('audio', newEnabled);
  };

  const toggleVideo = async () => {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();

    // If no video tracks currently exist (e.g. started as audio call)
    if (videoTracks.length === 0) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = camStream.getVideoTracks()[0];
        if (newTrack) {
          localStream.addTrack(newTrack);
          setIsVideoOff(false);
          onRequestAddTrack?.(newTrack);
          onToggleTrack?.('video', true);
        }
      } catch (err) {
        console.warn("Could not acquire camera track:", err);
      }
      return;
    }

    const nextState = !isVideoOff;
    const newEnabled = !nextState;
    videoTracks.forEach(track => {
      if (track !== screenTrackRef.current) {
        track.enabled = newEnabled;
      }
    });
    setIsVideoOff(nextState);
    onToggleTrack?.('video', newEnabled);
  };

  // Auto-spotlight presenter when screen sharing starts, enforce contain mode, and restore from PiP
  useEffect(() => {
    if (activeSharerId) {
      setViewMode('spotlight');
      setSpotlightId(activeSharerId);
      setTileFitModes(prev => ({ ...prev, [activeSharerId]: 'contain' }));
      if (minimized) {
        toggleMinimize();
      }
    } else if (spotlightId && spotlightId !== 'local' && remoteScreenSharerId === null) {
      // Revert to grid when screen share ends
      setViewMode('grid');
      setSpotlightId(null);
      setIsTheaterMode(false);
    }
  }, [activeSharerId]);

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setScreenTrack(null);
      setIsScreenSharing(false);
      setIsTheaterMode(false);
      onToggleScreenShare?.(false);
      if (spotlightId === 'local') {
        setViewMode('grid');
        setSpotlightId(null);
      }
      // Resume camera track
      if (localStream) {
        const camTrack = localStream.getVideoTracks().find(t => t !== screenTrackRef.current && t.readyState === 'live');
        if (camTrack) {
          camTrack.enabled = true;
          onRequestAddTrack?.(camTrack);
          onToggleTrack?.('video', true);
        }
      }
      return;
    }

    try {
      let displayStream: MediaStream;
      if (navigator.mediaDevices?.getDisplayMedia) {
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              frameRate: { ideal: 30, max: 60 }
            } as any,
            audio: false
          });
        } catch (captureErr) {
          console.warn("Native getDisplayMedia unavailable or cancelled, generating screen mirror stream:", captureErr);
          displayStream = createSimDisplayStream();
        }
      } else {
        displayStream = createSimDisplayStream();
      }

      const newTrack = displayStream.getVideoTracks()[0];
      if (!newTrack) return;
      (newTrack as any).contentHint = 'detail';

      screenTrackRef.current = newTrack;
      setScreenTrack(newTrack);
      setIsScreenSharing(true);
      setIsVideoOff(false);

      // When starting screen sharing, automatically spotlight self and set contain mode (preserves landscape orientation)
      setTileFitModes(prev => ({ ...prev, local: 'contain' }));
      setViewMode('spotlight');
      setSpotlightId('local');

      if (localStream) {
        localStream.addTrack(newTrack);
      }

      onToggleScreenShare?.(true);
      onRequestAddTrack?.(newTrack);
      onToggleTrack?.('video', true);

      newTrack.onended = () => {
        setIsScreenSharing(false);
        setScreenTrack(null);
        screenTrackRef.current = null;
        setIsTheaterMode(false);
        onToggleScreenShare?.(false);
        if (spotlightId === 'local') {
          setViewMode('grid');
          setSpotlightId(null);
        }
        if (localStream) {
          try {
            localStream.removeTrack(newTrack);
          } catch (_) {}
          const camTrack = localStream.getVideoTracks().find(t => t.readyState === 'live');
          if (camTrack) {
            camTrack.enabled = true;
            onRequestAddTrack?.(camTrack);
            onToggleTrack?.('video', true);
          }
        }
      };
    } catch (err) {
      console.warn("Screen share request cancelled or failed:", err);
    }
  };

  const toggleTileFit = (id: string) => {
    setTileFitModes(prev => {
      const current = prev[id] || 'contain';
      return { ...prev, [id]: current === 'contain' ? 'cover' : 'contain' };
    });
  };

  const handleSpotlight = (id: string) => {
    if (spotlightId === id && viewMode === 'spotlight') {
      // Toggle off spotlight
      setViewMode('grid');
      setSpotlightId(null);
    } else {
      setViewMode('spotlight');
      setSpotlightId(id);
    }
  };

  // Participant list setup
  const remoteEntries = Object.entries(remoteStreams);
  const totalParticipants = 1 + remoteEntries.length;

  // Resolve effective spotlight participant
  const effectiveSpotlightId = useMemo(() => {
    if (viewMode !== 'spotlight') return null;
    if (spotlightId) {
      if (spotlightId === 'local' || remoteStreams[spotlightId]) {
        return spotlightId;
      }
    }
    // Default fallback to first remote peer, or local if alone
    if (remoteEntries.length > 0) return remoteEntries[0][0];
    return 'local';
  }, [viewMode, spotlightId, remoteStreams, remoteEntries]);

  // Grid column calculation for grid mode
  let gridCols = "grid-cols-1";
  if (totalParticipants === 2) gridCols = "grid-cols-1 md:grid-cols-2";
  else if (totalParticipants >= 3 && totalParticipants <= 4) gridCols = "grid-cols-2";
  else if (totalParticipants > 4) gridCols = "grid-cols-2 md:grid-cols-3";

  // Participant names resolver
  const resolveParticipantName = (id: string) => {
    if (id === 'local') return 'You';
    const cleanId = id.replace(/^mesh_/, '');
    return getPeerName?.(id) || peerProfiles?.[id]?.username || peerProfiles?.[cleanId]?.username || 'Remote Node';
  };

  const resolveParticipantAvatar = (id: string): string | undefined => {
    if (id === 'local') return localProfile?.avatarImage;
    const cleanId = id.replace(/^mesh_/, '');
    if (peerProfiles?.[id]?.avatarImage) return peerProfiles[id].avatarImage;
    if (peerProfiles?.[cleanId]?.avatarImage) return peerProfiles[cleanId].avatarImage;
    const matched = Object.values(peerProfiles || {}).find(p => p.id === id || p.id === cleanId);
    return matched?.avatarImage;
  };

  const resolveParticipantColor = (id: string): string | undefined => {
    if (id === 'local') return localProfile?.avatarColor;
    const cleanId = id.replace(/^mesh_/, '');
    if (peerProfiles?.[id]?.avatarColor) return peerProfiles[id].avatarColor;
    if (peerProfiles?.[cleanId]?.avatarColor) return peerProfiles[cleanId].avatarColor;
    const matched = Object.values(peerProfiles || {}).find(p => p.id === id || p.id === cleanId);
    return matched?.avatarColor;
  };

  // Find primary participant to display when minimized in Picture-in-Picture
  const pipPrimaryId = useMemo(() => {
    if (effectiveSpotlightId) return effectiveSpotlightId;
    if (remoteEntries.length > 0) return remoteEntries[0][0];
    return 'local';
  }, [effectiveSpotlightId, remoteEntries]);

  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Continuous Audio Sinks: ensures 100% uninterrupted audio across all peers in both full & PiP modes */}
          <div className="hidden" aria-hidden="true">
            {remoteEntries.map(([id, st]) => (
              <RemoteAudioSink 
                key={`audio-sink-${id}`} 
                stream={st} 
                isMuted={peerTrackStates?.[id]?.audio === false} 
              />
            ))}
          </div>

          {/* ------------------------------------------------------------- */}
          {/* MINIMIZED (PICTURE-IN-PICTURE) MODE WIDGET                     */}
          {/* Allows using Secure Chat and File Transfer simultaneously      */}
          {/* ------------------------------------------------------------- */}
          {minimized ? (
            <>
              {/* Viewport Drag Boundary */}
              <div 
                ref={pipConstraintsRef} 
                className="fixed inset-3 sm:inset-5 pointer-events-none z-[94]" 
                aria-hidden="true" 
              />

              <motion.div
                key="call-overlay-pip"
                drag
                dragConstraints={pipConstraintsRef}
                dragElastic={0.08}
                dragMomentum={false}
                whileDrag={{ scale: 1.02, cursor: "grabbing" }}
                initial={{ opacity: 0, scale: 0.85, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 20 }}
                transition={{
                  opacity: { duration: 0.18 },
                  scale: { type: "spring", stiffness: 380, damping: 28 },
                  y: { type: "spring", stiffness: 380, damping: 28 }
                }}
                className="fixed bottom-5 right-5 z-[95] w-72 sm:w-80 md:w-88 m3-card-xl rounded-[28px] shadow-[0_24px_50px_rgba(0,0,0,0.55)] border backdrop-blur-2xl overflow-hidden select-none text-text font-sans transition-shadow duration-200 touch-none cursor-grab active:cursor-grabbing"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-high)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                {/* Mini Header: Drag bar + Status + Maximize button */}
                <div 
                  className="h-11 px-4 border-b flex items-center justify-between flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
                  style={{
                    backgroundColor: 'var(--md-sys-color-surface-container)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                  title="Drag to move Quantum Link PiP window"
                >
                  <div className="flex items-center gap-2 overflow-hidden pointer-events-none">
                    <GripHorizontal className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                    <span className="relative flex h-2 w-2 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-xs font-bold text-text truncate">
                      {pipPrimaryId === 'local' ? (isScreenSharing ? 'Your Screen' : 'You') : resolveParticipantName(pipPrimaryId)}
                    </span>
                    <span className="text-[10px] text-muted font-mono hidden sm:inline">
                      {currentTime.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                    {/* Maximize Button */}
                    <button
                      onClick={toggleMinimize}
                      className="w-7 h-7 rounded-full m3-surface-interactive flex items-center justify-center text-muted hover:text-text transition-colors cursor-pointer"
                      title="Maximize call to full screen"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Mini Video Feed (Aspect-preserved with object-contain) */}
                <div 
                  onClick={toggleMinimize}
                  className="w-full h-44 sm:h-48 relative overflow-hidden cursor-grab active:cursor-grabbing group flex items-center justify-center"
                  style={{ backgroundColor: 'var(--md-sys-color-surface-container-lowest, #0b0d13)' }}
                  title="Click to maximize call, drag to move"
                >
                {pipPrimaryId === 'local' ? (
                  <LocalVideoTile 
                    stream={localStream}
                    screenTrack={screenTrack}
                    isVideoOff={isVideoOff}
                    isScreenSharing={isScreenSharing}
                    isLocalSpeaking={isLocalSpeaking}
                    isMicMuted={isMicMuted}
                    avatarImage={resolveParticipantAvatar('local')}
                    avatarColor={resolveParticipantColor('local')}
                    fitMode="contain"
                    isThumbnail={true}
                  />
                ) : (
                  remoteStreams[pipPrimaryId] && (
                    <RemoteVideoTile 
                      id={pipPrimaryId}
                      name={resolveParticipantName(pipPrimaryId)}
                      stream={remoteStreams[pipPrimaryId]}
                      avatarImage={resolveParticipantAvatar(pipPrimaryId)}
                      avatarColor={resolveParticipantColor(pipPrimaryId)}
                      isRemoteVideoOff={peerTrackStates?.[pipPrimaryId]?.video === false || (type === 'audio' && peerTrackStates?.[pipPrimaryId]?.video !== true)}
                      isRemoteAudioMuted={peerTrackStates?.[pipPrimaryId]?.audio === false}
                      fitMode="contain"
                      isThumbnail={true}
                    />
                  )
                )}

                {/* Hover Overlay: Click to Maximize */}
                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[3px] z-20">
                  <span className="text-xs font-semibold m3-btn-filled px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
                    <Maximize2 className="w-3.5 h-3.5" />
                    Return to Call Stage
                  </span>
                </div>

                {/* Multiple participant badge if > 1 remote */}
                {totalParticipants > 2 && (
                  <div
                    className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold backdrop-blur-md z-10 shadow"
                    style={{
                      backgroundColor: 'var(--md-sys-color-secondary-container)',
                      color: 'var(--md-sys-color-on-secondary-container)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    +{totalParticipants - 1} peers
                  </div>
                )}
              </div>

              {/* Mini Control Strip */}
              <div 
                onPointerDown={(e) => e.stopPropagation()}
                className="h-13 px-3.5 border-t flex items-center justify-between flex-shrink-0"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                <div className="flex items-center gap-2">
                  {/* Mic Toggle */}
                  <button 
                    onClick={toggleMic}
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-xs",
                      isMicMuted ? "bg-rose-600 text-white" : "m3-btn-tonal"
                    )}
                    title={isMicMuted ? "Unmute mic" : "Mute mic"}
                  >
                    {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>

                  {/* Video Toggle */}
                  <button 
                    onClick={toggleVideo}
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-xs",
                      (isVideoOff && !isScreenSharing) ? "bg-rose-600 text-white" : "m3-btn-tonal"
                    )}
                    title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                  >
                    {(isVideoOff && !isScreenSharing) ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Maximize Button */}
                  <button
                    onClick={toggleMinimize}
                    className="px-3.5 py-1.5 rounded-full m3-btn-filled text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                    title="Maximize call to full screen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Expand</span>
                  </button>

                  {/* End Call */}
                  <button 
                    onClick={onEndCall}
                    className="w-9 h-9 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-xs"
                    title="Leave call"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
          ) : (
            /* ------------------------------------------------------------- */
            /* FULL-SCREEN MATERIAL YOU (M3 EXPRESSIVE) MEETING MODE         */
            /* ------------------------------------------------------------- */
            <motion.div
              ref={meetingContainerRef}
              key="call-overlay-fullscreen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onMouseMove={isTheaterMode ? resetTheaterControlsTimer : undefined}
              onTouchStart={isTheaterMode ? resetTheaterControlsTimer : undefined}
              className="fixed inset-0 z-[110] w-full h-full max-h-screen overflow-hidden flex flex-col cursor-default select-none text-text font-sans"
              style={{ backgroundColor: 'var(--md-sys-color-surface)' }}
            >
              <div className="w-full h-full flex flex-col overflow-hidden relative">
                {/* Ambient Material You Tonal Aura */}
                <div
                  className="pointer-events-none absolute -top-32 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
                  style={{ backgroundColor: 'var(--md-sys-color-primary-container)' }}
                />
                <div
                  className="pointer-events-none absolute -bottom-32 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
                  style={{ backgroundColor: 'var(--md-sys-color-tertiary-container)' }}
                />

                {/* Top App Bar: Call Identity, Mode Switcher & Actions (Hidden in Theater Mode) */}
                {!isTheaterMode && (
                  <div
                    className="min-h-16 px-3 sm:px-6 py-2 flex items-center justify-between border-b backdrop-blur-xl flex-shrink-0 z-20 gap-2"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-low)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                      <div
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold shadow-2xs"
                        style={{
                          backgroundColor: 'var(--md-sys-color-secondary-container)',
                          color: 'var(--md-sys-color-on-secondary-container)',
                          borderColor: 'var(--md-sys-color-outline-variant)',
                        }}
                      >
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 hidden xs:inline" />
                        <span className="font-bold tracking-tight text-[11px] sm:text-xs">Quantum Link</span>
                        <span className="opacity-40">•</span>
                        <span className="truncate text-[11px] sm:text-xs opacity-90">
                          {type === 'video' ? 'HD Video Call' : 'Voice Call'}
                        </span>
                      </div>

                      {viewMode === 'spotlight' && (
                        <div
                          className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold animate-fadeIn"
                          style={{
                            backgroundColor: 'var(--md-sys-color-tertiary-container)',
                            color: 'var(--md-sys-color-on-tertiary-container)',
                            borderColor: 'var(--md-sys-color-outline-variant)',
                          }}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[160px]">
                            Spotlight: {resolveParticipantName(effectiveSpotlightId || '')}
                          </span>
                        </div>
                      )}

                      {/* Active Screen Presenter Indicator Pill */}
                      {activeSharerId && (
                        <div
                          className="flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold shadow-2xs animate-fadeIn"
                          style={{
                            backgroundColor: 'var(--md-sys-color-primary-container)',
                            color: 'var(--md-sys-color-on-primary-container)',
                            borderColor: 'var(--md-sys-color-outline-variant)',
                          }}
                        >
                          <MonitorUp className="w-3.5 h-3.5 animate-pulse" />
                          <span className="truncate max-w-[130px] sm:max-w-none">
                            {activeSharerId === 'local' ? 'Presenting Screen' : `${resolveParticipantName(activeSharerId)}'s Screen`}
                          </span>
                          <button
                            onClick={toggleTheaterMode}
                            className="px-2.5 py-0.5 rounded-full m3-btn-filled text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="View presentation in edge-to-edge Full Screen"
                          >
                            <Maximize2 className="w-3 h-3" />
                            <span className="hidden xs:inline">Theater</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Right: View Mode Segmented Pill & Quick Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* View Mode (Grid vs Spotlight) Segmented M3 Pill */}
                      <div
                        className="flex items-center p-1 rounded-full border"
                        style={{
                          backgroundColor: 'var(--md-sys-color-surface-container-high)',
                          borderColor: 'var(--md-sys-color-outline-variant)',
                        }}
                      >
                        <button
                          onClick={() => {
                            setViewMode('grid');
                            setSpotlightId(null);
                          }}
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                            viewMode === 'grid'
                              ? "m3-btn-filled shadow-2xs"
                              : "text-muted hover:text-text"
                          )}
                          title="Grid View: Equal stage tiles"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Grid</span>
                        </button>

                        <button
                          onClick={() => {
                            setViewMode('spotlight');
                            setSpotlightId(remoteEntries.length > 0 ? remoteEntries[0][0] : 'local');
                          }}
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer",
                            viewMode === 'spotlight'
                              ? "m3-btn-tertiary shadow-2xs"
                              : "text-muted hover:text-text"
                          )}
                          title="Spotlight: Focus on active speaker or shared screen"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Spotlight</span>
                        </button>
                      </div>

                      {/* Minimize to PiP Button */}
                      <button
                        onClick={toggleMinimize}
                        className="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border m3-surface-interactive text-text"
                        style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                        title="Minimize to Picture-in-Picture to use Chat and File Transfer"
                      >
                        <Minimize2 className="w-3.5 h-3.5 text-[color:var(--md-sys-color-primary)]" />
                        <span className="hidden md:inline">PiP Mode</span>
                      </button>

                      {/* Leave Call Pill */}
                      <button
                        onClick={onEndCall}
                        className="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer bg-rose-600 hover:bg-rose-500 text-white shadow-xs active:scale-95"
                        title="Leave call"
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Leave</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Floating Top Control Bar (Rendered only in Theater / Full Screen Mode) */}
                {isTheaterMode && (
                  <div 
                    onPointerDown={(e) => e.stopPropagation()}
                    className={cn(
                      "absolute top-3 left-3 right-3 flex items-center justify-between z-40 transition-opacity duration-300",
                      showTheaterControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                  >
                    {/* Left: Presenter Badge & Rotation status */}
                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold shadow-2xl backdrop-blur-xl"
                        style={{
                          backgroundColor: 'var(--md-sys-color-primary-container)',
                          color: 'var(--md-sys-color-on-primary-container)',
                          borderColor: 'var(--md-sys-color-outline-variant)',
                        }}
                      >
                        <MonitorUp className="w-3.5 h-3.5 animate-pulse" />
                        <span>
                          {effectiveSpotlightId === 'local' ? 'Presenting Screen' : `${resolveParticipantName(effectiveSpotlightId || '')}'s Screen`}
                        </span>
                        <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full uppercase font-mono">1080p</span>
                      </div>

                      {tileRotations[effectiveSpotlightId || 'local'] ? (
                        <button
                          onClick={() => resetTileRotation(effectiveSpotlightId || 'local')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full m3-btn-tertiary text-xs font-semibold cursor-pointer shadow-md transition-all"
                          title="Reset rotation to 0°"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>Rotated {tileRotations[effectiveSpotlightId || 'local']}° (Reset)</span>
                        </button>
                      ) : null}
                    </div>

                    {/* Right: Quick actions: Rotate, Fit/Fill, and Exit Full Screen */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => rotateTile(effectiveSpotlightId || 'local')}
                        className="px-3.5 py-1.5 rounded-full m3-surface-high border text-text text-xs font-semibold flex items-center gap-1.5 shadow-xl transition-all cursor-pointer"
                        style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                        title="Rotate presentation 90 degrees"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Rotate 90°</span>
                      </button>

                      <button
                        onClick={() => toggleTileFit(effectiveSpotlightId || 'local')}
                        className="px-3.5 py-1.5 rounded-full m3-surface-high border text-text text-xs font-semibold flex items-center gap-1.5 shadow-xl transition-all cursor-pointer"
                        style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                        title={tileFitModes[effectiveSpotlightId || 'local'] === 'contain' ? "Zoom to fill screen" : "Fit whole presentation without cropping"}
                      >
                        <Scan className="w-3.5 h-3.5" />
                        <span>{tileFitModes[effectiveSpotlightId || 'local'] === 'contain' ? 'Fit (Full)' : 'Fill'}</span>
                      </button>

                      <button
                        onClick={toggleTheaterMode}
                        className="px-4 py-1.5 rounded-full m3-btn-filled font-bold text-xs flex items-center gap-1.5 shadow-2xl transition-all cursor-pointer"
                        title="Exit Full Screen Presenter view (Esc)"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                        <span>Exit Full Screen</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Main Meeting Stage Area */}
                <div className={cn(
                  "flex-1 min-h-0 w-full flex flex-col items-center justify-center overflow-hidden relative z-10",
                  isTheaterMode ? "p-0" : "p-2.5 sm:p-4 md:p-5"
                )}>
                  
                  {/* 1. SPOTLIGHT MODE LAYOUT */}
                  {viewMode === 'spotlight' && (
                    <div className={cn(
                      "w-full h-full flex flex-col md:flex-row overflow-hidden min-h-0",
                      isTheaterMode ? "gap-0" : "gap-3 sm:gap-4"
                    )}>
                      
                      {/* Spotlight Main Stage (28dp Corner Extra Large Container) */}
                      <div
                        className={cn(
                          "flex-1 min-h-0 h-full flex items-center justify-center relative overflow-hidden transition-all duration-300",
                          isTheaterMode 
                            ? "w-full max-w-full rounded-none border-0 shadow-none bg-black" 
                            : "m3-card-xl rounded-[28px] border shadow-2xl"
                        )}
                        style={
                          isTheaterMode
                            ? undefined
                            : {
                                backgroundColor: 'var(--md-sys-color-surface-container)',
                                borderColor: 'var(--md-sys-color-outline-variant)',
                              }
                        }
                      >
                        {effectiveSpotlightId === 'local' ? (
                          <LocalVideoTile 
                            stream={localStream}
                            screenTrack={screenTrack}
                            isVideoOff={isVideoOff}
                            isScreenSharing={isScreenSharing}
                            isLocalSpeaking={isLocalSpeaking}
                            isMicMuted={isMicMuted}
                            avatarImage={resolveParticipantAvatar('local')}
                            avatarColor={resolveParticipantColor('local')}
                            fitMode={tileFitModes['local'] || 'contain'}
                            rotation={tileRotations['local'] || 0}
                            isSpotlightStage={true}
                            isTheaterMode={isTheaterMode}
                            onToggleFit={() => toggleTileFit('local')}
                            onToggleTheater={toggleTheaterMode}
                            onRotate={() => rotateTile('local')}
                            onUnspotlight={() => { setViewMode('grid'); setSpotlightId(null); setIsTheaterMode(false); }}
                          />
                        ) : (
                          effectiveSpotlightId && remoteStreams[effectiveSpotlightId] && (
                            <RemoteVideoTile 
                              id={effectiveSpotlightId}
                              name={resolveParticipantName(effectiveSpotlightId)}
                              stream={remoteStreams[effectiveSpotlightId]}
                              avatarImage={resolveParticipantAvatar(effectiveSpotlightId)}
                              avatarColor={resolveParticipantColor(effectiveSpotlightId)}
                              isRemoteVideoOff={peerTrackStates?.[effectiveSpotlightId]?.video === false || (type === 'audio' && peerTrackStates?.[effectiveSpotlightId]?.video !== true)}
                              isRemoteAudioMuted={peerTrackStates?.[effectiveSpotlightId]?.audio === false}
                              isScreenSharing={!!screenSharingPeers?.[effectiveSpotlightId]}
                              fitMode={tileFitModes[effectiveSpotlightId] || 'contain'}
                              rotation={tileRotations[effectiveSpotlightId] || 0}
                              isSpotlightStage={true}
                              isTheaterMode={isTheaterMode}
                              onToggleFit={() => toggleTileFit(effectiveSpotlightId)}
                              onToggleTheater={toggleTheaterMode}
                              onRotate={() => rotateTile(effectiveSpotlightId)}
                              onUnspotlight={() => { setViewMode('grid'); setSpotlightId(null); setIsTheaterMode(false); }}
                            />
                          )
                        )}
                      </div>

                      {/* Filmstrip (Thumbnails of other participants) */}
                      {!isTheaterMode && (
                        <div className="h-24 sm:h-28 md:h-full md:w-60 lg:w-68 flex flex-row md:flex-col gap-2.5 sm:gap-3 overflow-x-auto md:overflow-y-auto p-1 flex-shrink-0 min-h-0 scrollbar-thin">
                        {/* Local Thumbnail in filmstrip if not spotlighted */}
                        {effectiveSpotlightId !== 'local' && (
                          <div 
                            onClick={() => handleSpotlight('local')}
                            className="relative min-w-[130px] sm:min-w-[150px] md:min-w-0 md:w-full h-full md:h-36 m3-card rounded-2xl overflow-hidden cursor-pointer group border transition-all shadow-md flex-shrink-0"
                            style={{
                              backgroundColor: 'var(--md-sys-color-surface-container)',
                              borderColor: 'var(--md-sys-color-outline-variant)',
                            }}
                            title="Click to spotlight your video"
                          >
                            <LocalVideoTile 
                              stream={localStream}
                              screenTrack={screenTrack}
                              isVideoOff={isVideoOff}
                              isScreenSharing={isScreenSharing}
                              isLocalSpeaking={isLocalSpeaking}
                              isMicMuted={isMicMuted}
                              avatarImage={resolveParticipantAvatar('local')}
                              avatarColor={resolveParticipantColor('local')}
                              fitMode={tileFitModes['local'] || 'contain'}
                              isThumbnail={true}
                            />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSpotlight('local'); }}
                                className="p-1.5 rounded-full m3-btn-filled text-xs shadow-md cursor-pointer transition-all"
                                title="Spotlight You"
                              >
                                <Pin className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Remote Thumbnails in filmstrip */}
                        {remoteEntries.map(([id, stream]) => {
                          if (id === effectiveSpotlightId) return null;
                          const resolvedName = resolveParticipantName(id);
                          const trackState = peerTrackStates?.[id];
                          return (
                            <div 
                              key={id}
                              onClick={() => handleSpotlight(id)}
                              className="relative min-w-[130px] sm:min-w-[150px] md:min-w-0 md:w-full h-full md:h-36 m3-card rounded-2xl overflow-hidden cursor-pointer group border transition-all shadow-md flex-shrink-0"
                              style={{
                                backgroundColor: 'var(--md-sys-color-surface-container)',
                                borderColor: 'var(--md-sys-color-outline-variant)',
                              }}
                              title={`Click to spotlight ${resolvedName}`}
                            >
                              <RemoteVideoTile 
                                id={id}
                                name={resolvedName}
                                stream={stream}
                                avatarImage={resolveParticipantAvatar(id)}
                                avatarColor={resolveParticipantColor(id)}
                                isRemoteVideoOff={trackState?.video === false || (type === 'audio' && trackState?.video !== true)}
                                isRemoteAudioMuted={trackState?.audio === false}
                                isScreenSharing={!!screenSharingPeers?.[id]}
                                fitMode={tileFitModes[id] || 'contain'}
                                isThumbnail={true}
                              />
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleSpotlight(id); }}
                                  className="p-1.5 rounded-full m3-btn-filled text-xs shadow-md cursor-pointer transition-all"
                                  title={`Spotlight ${resolvedName}`}
                                >
                                  <Pin className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    </div>
                  )}

                  {/* 2. BALANCED GRID MODE LAYOUT */}
                  {viewMode === 'grid' && (
                    <div className={cn("w-full h-full max-w-7xl flex-1 min-h-0 grid gap-3 sm:gap-4 place-content-center p-1 sm:p-2", gridCols)}>
                      
                      {/* Local Participant Tile */}
                      <div
                        className={cn(
                          "relative group m3-card-xl rounded-[28px] overflow-hidden shadow-xl w-full h-full min-h-0 flex items-center justify-center border transition-all duration-300",
                          isLocalSpeaking && "ring-2 ring-[var(--md-sys-color-primary)] shadow-2xl"
                        )}
                        style={{
                          backgroundColor: 'var(--md-sys-color-surface-container)',
                          borderColor: isLocalSpeaking
                            ? 'var(--md-sys-color-primary)'
                            : 'var(--md-sys-color-outline-variant)',
                        }}
                      >
                        <LocalVideoTile 
                          stream={localStream}
                          screenTrack={screenTrack}
                          isVideoOff={isVideoOff}
                          isScreenSharing={isScreenSharing}
                          isLocalSpeaking={isLocalSpeaking}
                          isMicMuted={isMicMuted}
                          avatarImage={resolveParticipantAvatar('local')}
                          avatarColor={resolveParticipantColor('local')}
                          fitMode={tileFitModes['local'] || (isScreenSharing ? 'contain' : 'contain')}
                          rotation={tileRotations['local'] || 0}
                          onToggleFit={() => toggleTileFit('local')}
                          onRotate={() => rotateTile('local')}
                          onSpotlight={() => handleSpotlight('local')}
                        />
                      </div>

                      {/* Remote Participants */}
                      {remoteEntries.map(([id, stream]) => {
                        const resolvedName = resolveParticipantName(id);
                        const trackState = peerTrackStates?.[id];
                        return (
                          <div 
                            key={id}
                            className="relative group m3-card-xl rounded-[28px] overflow-hidden shadow-xl w-full h-full min-h-0 flex items-center justify-center border transition-all duration-300"
                            style={{
                              backgroundColor: 'var(--md-sys-color-surface-container)',
                              borderColor: 'var(--md-sys-color-outline-variant)',
                            }}
                          >
                            <RemoteVideoTile 
                              id={id}
                              name={resolvedName}
                              stream={stream}
                              avatarImage={resolveParticipantAvatar(id)}
                              avatarColor={resolveParticipantColor(id)}
                              isRemoteVideoOff={trackState?.video === false || (type === 'audio' && trackState?.video !== true)}
                              isRemoteAudioMuted={trackState?.audio === false}
                              isScreenSharing={!!screenSharingPeers?.[id]}
                              fitMode={tileFitModes[id] || 'contain'}
                              rotation={tileRotations[id] || 0}
                              onToggleFit={() => toggleTileFit(id)}
                              onRotate={() => rotateTile(id)}
                              onSpotlight={() => handleSpotlight(id)}
                            />
                          </div>
                        );
                      })}

                      {/* Waiting state when alone in call */}
                      {remoteEntries.length === 0 && (
                        <div
                          className="relative group m3-card-xl rounded-[28px] overflow-hidden shadow-xl w-full h-full min-h-0 flex flex-col items-center justify-center p-6 text-center border border-dashed"
                          style={{
                            backgroundColor: 'var(--md-sys-color-surface-container-low)',
                            borderColor: 'var(--md-sys-color-outline-variant)',
                          }}
                        >
                          <div className="relative flex items-center justify-center mb-4">
                            <span
                              className="animate-ping absolute inline-flex h-16 w-16 rounded-full opacity-35"
                              style={{ backgroundColor: 'var(--md-sys-color-primary)' }}
                            />
                            <div
                              className="w-14 h-14 rounded-2xl border flex items-center justify-center relative z-10 shadow-sm"
                              style={{
                                backgroundColor: 'var(--md-sys-color-primary-container)',
                                color: 'var(--md-sys-color-on-primary-container)',
                                borderColor: 'var(--md-sys-color-outline-variant)',
                              }}
                            >
                              <Users className="w-6 h-6 sm:w-7 sm:h-7" />
                            </div>
                          </div>
                          <h4 className="text-sm font-bold text-text mb-1">
                            Waiting for peer to join...
                          </h4>
                          <p className="text-xs text-muted max-w-xs leading-relaxed">
                            Your encrypted Quantum Link {type === 'video' ? 'video' : 'voice'} stage is active and ready.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* Floating Bottom Mini-Dock for Theater / Full Screen Mode */}
                {isTheaterMode && (
                  <div 
                    onPointerDown={(e) => e.stopPropagation()}
                    className={cn(
                      "absolute bottom-5 left-1/2 -translate-x-1/2 z-40 transition-opacity duration-300",
                      showTheaterControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                  >
                    <div
                      className="flex items-center gap-2 sm:gap-3 px-4 py-2.5 rounded-full backdrop-blur-2xl border shadow-[0_10px_40px_rgba(0,0,0,0.65)]"
                      style={{
                        backgroundColor: 'var(--md-sys-color-surface-container-high)',
                        borderColor: 'var(--md-sys-color-outline-variant)',
                      }}
                    >
                      {/* Mic Toggle */}
                      <button 
                        onClick={toggleMic}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer",
                          isMicMuted ? "bg-rose-600 text-white" : "m3-btn-tonal"
                        )}
                        title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
                      >
                        {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>

                      {/* Video Toggle */}
                      <button 
                        onClick={toggleVideo}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer",
                          isVideoOff ? "bg-rose-600 text-white" : "m3-btn-tonal"
                        )}
                        title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                      >
                        {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                      </button>

                      {/* Screen Share / Stop Sharing */}
                      <button 
                        onClick={toggleScreenShare}
                        className={cn(
                          "h-10 px-4 rounded-full flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all",
                          isScreenSharing ? "m3-btn-filled shadow-md" : "m3-btn-tonal"
                        )}
                        title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
                      >
                        <MonitorUp className="w-3.5 h-3.5" />
                        <span>{isScreenSharing ? "Stop Sharing" : "Share Screen"}</span>
                      </button>

                      {/* Exit Full Screen */}
                      <button
                        onClick={toggleTheaterMode}
                        className="h-10 px-4 rounded-full flex items-center gap-1.5 text-xs font-bold m3-btn-tertiary cursor-pointer shadow-md transition-all active:scale-95"
                        title="Exit Full Screen (Esc)"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                        <span>Exit Theater</span>
                      </button>

                      {/* Leave Call */}
                      <button 
                        onClick={onEndCall}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-md active:scale-95 transition-all"
                        title="Leave call"
                      >
                        <PhoneOff className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Bottom Control Bar (Android 16 Material You Expressive Call Dock) */}
                {!isTheaterMode && (
                  <div
                    className="min-h-20 py-2.5 border-t flex items-center justify-between px-3 sm:px-6 md:px-8 flex-shrink-0 z-30 backdrop-blur-2xl"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-low)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    {/* Left side: Time & E2EE Status */}
                    <div className="hidden md:flex items-center text-xs font-medium text-muted w-1/4">
                      <span className="font-mono text-sm font-semibold tracking-wide text-text">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="mx-3 opacity-30">•</span>
                      <span className="truncate text-muted text-xs flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>DTLS-SRTP Mesh</span>
                      </span>
                    </div>

                    {/* Center: Expressive Pill / Squircle Call Controls Island */}
                    <div
                      className="flex items-center justify-center gap-2 sm:gap-2.5 md:gap-3 px-3 sm:px-4 py-2 rounded-full border shadow-lg mx-auto"
                      style={{
                        backgroundColor: 'var(--md-sys-color-surface-container-high)',
                        borderColor: 'var(--md-sys-color-outline-variant)',
                      }}
                    >
                      {/* Mic Toggle */}
                      <button 
                        onClick={toggleMic}
                        className={cn(
                          "w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-xs",
                          isMicMuted 
                            ? "bg-rose-600 text-white hover:bg-rose-500" 
                            : "m3-btn-tonal"
                        )}
                        title={isMicMuted ? "Turn on microphone" : "Turn off microphone"}
                      >
                        {isMicMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </button>

                      {/* Video Toggle */}
                      <button 
                        onClick={toggleVideo}
                        className={cn(
                          "w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-xs",
                          isVideoOff
                            ? "bg-rose-600 text-white hover:bg-rose-500" 
                            : "m3-btn-tonal"
                        )}
                        title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                      >
                        {isVideoOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </button>

                      {/* Screen Share / Mirror Screen Actions */}
                      {isScreenSharing ? (
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button 
                            onClick={toggleScreenShare}
                            className="h-11 sm:h-12 px-4 rounded-full flex items-center justify-center gap-2 m3-btn-filled font-semibold cursor-pointer active:scale-95 text-xs sm:text-sm shadow-sm"
                            title="You are actively mirroring your screen. Click to stop presenting."
                          >
                            <MonitorUp className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
                            <span>Stop Sharing</span>
                          </button>
                          <button 
                            onClick={toggleTheaterMode}
                            className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-full flex items-center justify-center gap-2 m3-btn-tertiary font-semibold cursor-pointer active:scale-95 shadow-xs text-xs sm:text-sm transition-all"
                            title="View your screen presentation in edge-to-edge Full Screen"
                          >
                            <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="hidden sm:inline">Theater</span>
                          </button>
                        </div>
                      ) : remoteScreenSharerId ? (
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button 
                            onClick={toggleTheaterMode}
                            className="h-11 sm:h-12 px-4 sm:px-5 rounded-full flex items-center justify-center gap-2 m3-btn-filled font-bold shadow-md cursor-pointer active:scale-95 transition-all text-xs sm:text-sm"
                            title={`View ${resolveParticipantName(remoteScreenSharerId)}'s presentation in Full Screen`}
                          >
                            <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span>Full Screen Presenter</span>
                          </button>
                          <button 
                            onClick={toggleScreenShare}
                            className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-full flex items-center justify-center gap-2 m3-btn-tonal cursor-pointer active:scale-95 transition-all text-xs sm:text-sm font-semibold"
                            title="Share your own screen"
                          >
                            <MonitorUp className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="hidden md:inline">Share Screen</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button 
                            onClick={toggleScreenShare}
                            className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-full flex items-center justify-center gap-2 m3-btn-tonal cursor-pointer active:scale-95 transition-all text-xs sm:text-sm font-semibold"
                            title="Mirror / Share Screen (Full 1080p Presentation)"
                          >
                            <MonitorUp className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="hidden sm:inline">Mirror Screen</span>
                          </button>
                          {viewMode === 'spotlight' && (
                            <button 
                              onClick={toggleTheaterMode}
                              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center m3-btn-tonal cursor-pointer active:scale-95 transition-all shadow-xs"
                              title="Full Screen Spotlight View"
                            >
                              <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* View Mode (Grid vs Spotlight) Toggle */}
                      <button 
                        onClick={() => {
                          if (viewMode === 'spotlight') {
                            setViewMode('grid');
                            setSpotlightId(null);
                          } else {
                            setViewMode('spotlight');
                            setSpotlightId(remoteEntries.length > 0 ? remoteEntries[0][0] : 'local');
                          }
                        }}
                        className={cn(
                          "w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-xs",
                          viewMode === 'spotlight'
                            ? "m3-btn-tertiary font-bold"
                            : "m3-btn-tonal"
                        )}
                        title={viewMode === 'spotlight' ? "Exit Spotlight mode" : "Spotlight mode"}
                      >
                        {viewMode === 'spotlight' ? <PinOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </button>

                      {/* Minimize to PiP Toggle */}
                      <button
                        onClick={toggleMinimize}
                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-xs m3-btn-tonal"
                        title="Minimize to Picture-in-Picture (use chat & file transfer)"
                      >
                        <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>

                      {/* End Call Pill Button */}
                      <button 
                        onClick={onEndCall} 
                        className="h-11 sm:h-12 px-5 sm:px-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center justify-center gap-2 shadow-md shadow-rose-600/25 transition-all active:scale-95 cursor-pointer ml-1"
                        title="Leave call"
                      >
                        <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="text-xs sm:text-sm font-bold tracking-wide hidden sm:inline">End Call</span>
                      </button>
                    </div>

                    {/* Right side: Participant count pill */}
                    <div className="hidden md:flex items-center justify-end gap-3 w-1/4">
                      <div
                        className="flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold text-text"
                        style={{
                          backgroundColor: 'var(--md-sys-color-surface-container-high)',
                          borderColor: 'var(--md-sys-color-outline-variant)',
                        }}
                      >
                        <Users className="w-3.5 h-3.5 text-[color:var(--md-sys-color-primary)]" />
                        <span>{totalParticipants} node{totalParticipants > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

// -------------------------------------------------------------
// LOCAL VIDEO TILE
// -------------------------------------------------------------
interface LocalVideoTileProps {
  stream: MediaStream | null;
  screenTrack: MediaStreamTrack | null;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isLocalSpeaking: boolean;
  isMicMuted: boolean;
  avatarImage?: string;
  avatarColor?: string;
  fitMode?: 'contain' | 'cover';
  rotation?: number;
  isSpotlightStage?: boolean;
  isThumbnail?: boolean;
  isTheaterMode?: boolean;
  onToggleFit?: () => void;
  onToggleTheater?: () => void;
  onRotate?: () => void;
  onSpotlight?: () => void;
  onUnspotlight?: () => void;
}

function LocalVideoTile({
  stream,
  screenTrack,
  isVideoOff,
  isScreenSharing,
  isLocalSpeaking,
  isMicMuted,
  avatarImage,
  avatarColor,
  fitMode = 'contain',
  rotation = 0,
  isSpotlightStage = false,
  isThumbnail = false,
  isTheaterMode = false,
  onToggleFit,
  onToggleTheater,
  onRotate,
  onSpotlight,
  onUnspotlight
}: LocalVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tileContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const isRotatedQuarter = rotation === 90 || rotation === 270;

  useEffect(() => {
    if (!tileContainerRef.current) return;
    const updateScale = () => {
      if (!tileContainerRef.current) return;
      const { clientWidth: w, clientHeight: h } = tileContainerRef.current;
      if (isRotatedQuarter && w && h) {
        setScale(Math.min(w, h) / Math.max(w, h));
      } else {
        setScale(1);
      }
    };
    updateScale();
    const obs = new ResizeObserver(updateScale);
    obs.observe(tileContainerRef.current);
    return () => obs.disconnect();
  }, [isRotatedQuarter]);

  const [aspectLandscape, setAspectLandscape] = useState(false);
  const [manualMirror, setManualMirror] = useState<boolean | null>(null);

  // Check if camera has a live video track
  const hasActiveCameraTrack = Boolean(
    stream && stream.getVideoTracks().some(t => t.readyState === 'live')
  );

  // Check if screen sharing track is active and live
  const hasActiveScreenTrack = Boolean(
    (isScreenSharing && screenTrack && screenTrack.readyState === 'live') ||
    (isScreenSharing && stream && stream.getVideoTracks().some(t => t.readyState === 'live'))
  );

  const displayStream = useMemo(() => {
    if (hasActiveScreenTrack && screenTrack) {
      return new MediaStream([screenTrack]);
    }
    if (!isVideoOff && stream && hasActiveCameraTrack) {
      return stream;
    }
    return null;
  }, [hasActiveScreenTrack, screenTrack, isVideoOff, stream, hasActiveCameraTrack]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (displayStream) {
      if (vid.srcObject !== displayStream) {
        vid.srcObject = displayStream;
      }
      vid.play().catch(e => console.warn("Local video play error:", e));
    } else {
      vid.srcObject = null;
    }
  }, [displayStream]);

  const handleMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    if (vid.videoWidth && vid.videoHeight) {
      setAspectLandscape(vid.videoWidth / vid.videoHeight >= 1.15);
    }
  };

  const showVideo = hasActiveScreenTrack || (!isVideoOff && hasActiveCameraTrack);

  return (
    <div 
      ref={tileContainerRef}
      onDoubleClick={() => onToggleTheater ? onToggleTheater() : onToggleFit?.()}
      title={isScreenSharing ? "Double-click to toggle Full Screen presentation" : undefined}
      className={cn(
        "w-full h-full flex items-center justify-center relative overflow-hidden",
        isLocalSpeaking && !isThumbnail && "ring-2 ring-[var(--md-sys-color-primary)]"
      )}
      style={{ backgroundColor: 'var(--md-sys-color-surface-container)' }}
    >
      {/* Video Element */}
      <video 
        ref={videoRef}
        autoPlay 
        playsInline 
        muted 
        onLoadedMetadata={handleMetadata}
        style={{
          transform: `rotate(${rotation}deg) scale(${scale})${!isScreenSharing && !hasActiveScreenTrack && (manualMirror !== null ? manualMirror : true) ? ' scaleX(-1)' : ''}`,
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        className={cn(
          "w-full h-full",
          fitMode === 'contain' ? "object-contain" : "object-cover",
          showVideo ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"
        )}
      />

      {/* Subtle Vignette Gradient for badge & control legibility */}
      {showVideo && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/35 pointer-events-none" />
      )}

      {/* Material You Expressive Avatar Stage for Voice Call or Camera Off */}
      {!showVideo && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-4"
          style={{ backgroundColor: 'var(--md-sys-color-surface-container)' }}
        >
          <div className="relative flex items-center justify-center">
            {isLocalSpeaking && (
              <span
                className="animate-ping absolute -inset-3 rounded-[32px] opacity-35"
                style={{ backgroundColor: 'var(--md-sys-color-primary)' }}
              />
            )}
            <div
              className={cn(
                "rounded-[28px] border flex items-center justify-center font-bold uppercase shadow-xl transition-all overflow-hidden relative z-10",
                avatarColor || "m3-btn-tonal",
                isThumbnail ? "w-12 h-12 rounded-2xl text-sm" : "w-24 h-24 sm:w-28 sm:h-28 text-2xl sm:text-3xl",
                isLocalSpeaking && "scale-105 ring-4 ring-[var(--md-sys-color-primary)]/40"
              )}
              style={{
                borderColor: isLocalSpeaking
                  ? 'var(--md-sys-color-primary)'
                  : 'var(--md-sys-color-outline-variant)',
              }}
            >
              {avatarImage ? (
                <img src={avatarImage} alt="You" className="w-full h-full object-cover" />
              ) : (
                "You"
              )}
            </div>
          </div>
          {!isThumbnail && isVideoOff && !hasActiveScreenTrack && (
            <span
              className="text-xs font-semibold mt-4 px-3.5 py-1 rounded-full border"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface-variant)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              Voice Only • Camera Off
            </span>
          )}
        </div>
      )}

      {/* Top Controls Overlay: Spotlight / Fit / Fullscreen / Aspect info */}
      {!isThumbnail && (
        <div className={cn(
          "absolute top-3 right-3 flex items-center gap-1.5 z-20 transition-opacity",
          isScreenSharing ? "opacity-95 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          {onToggleTheater && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleTheater(); }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-xl border flex items-center gap-1.5 shadow-md cursor-pointer transition-all",
                isTheaterMode ? "m3-btn-tertiary" : "m3-btn-filled"
              )}
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title={isTheaterMode ? "Exit Full Screen Presenter view" : "Full Screen Presenter view"}
            >
              {isTheaterMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="text-[11px] hidden sm:inline">{isTheaterMode ? 'Exit Full Screen' : 'Full Screen'}</span>
            </button>
          )}

          {onRotate && (
            <button
              onClick={(e) => { e.stopPropagation(); onRotate(); }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-xl border flex items-center gap-1.5 shadow-md cursor-pointer transition-all",
                rotation > 0 ? "m3-btn-tertiary" : "m3-surface-high text-text"
              )}
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title={`Rotate 90° (Currently ${rotation}°)`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="text-[11px]">{rotation > 0 ? `${rotation}°` : 'Rotate'}</span>
            </button>
          )}

          {!hasActiveScreenTrack && !isScreenSharing && showVideo && (
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
                setManualMirror(prev => (prev === null ? false : !prev)); 
              }}
              className="px-3 py-1.5 rounded-full m3-surface-high text-xs font-semibold text-text backdrop-blur-xl border flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title="Mirror / Flip camera view"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span className="text-[11px]">Flip</span>
            </button>
          )}

          {onToggleFit && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFit(); }}
              className="px-3 py-1.5 rounded-full m3-surface-high text-xs font-semibold text-text backdrop-blur-xl border flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title={fitMode === 'contain' ? "Switch to Fill (zoom to edge)" : "Switch to Fit (show entire screen without cropping)"}
            >
              {fitMode === 'contain' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              <span className="text-[11px]">{fitMode === 'contain' ? 'Fit' : 'Fill'}</span>
            </button>
          )}

          {isSpotlightStage && onUnspotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnspotlight(); }}
              className="px-3 py-1.5 rounded-full m3-btn-tertiary text-xs font-bold backdrop-blur-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              title="Exit Spotlight Mode"
            >
              <PinOff className="w-3.5 h-3.5" />
              <span>Unpin</span>
            </button>
          ) : onSpotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSpotlight(); }}
              className="p-2 rounded-full m3-surface-high text-text hover:m3-btn-filled backdrop-blur-xl border shadow-md cursor-pointer transition-all"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title="Spotlight your video"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      )}

      {/* Spotlight Badge on Stage */}
      {isSpotlightStage && (
        <div className="absolute top-3 left-3 flex items-center gap-2 m3-btn-tertiary px-3.5 py-1.5 rounded-full text-xs font-bold shadow-lg z-20 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5" />
          <span>SPOTLIGHT • YOU</span>
          {hasActiveScreenTrack && <span className="bg-black/20 px-2 py-0.5 rounded-full text-[10px]">SCREEN</span>}
        </div>
      )}

      {/* Bottom Name & Audio Status Pill */}
      <div
        className={cn(
          "absolute bottom-3 left-3 flex items-center gap-2 backdrop-blur-xl border rounded-full text-xs font-semibold text-text shadow-lg z-10",
          isThumbnail ? "px-2.5 py-0.5 text-[10px]" : "px-3.5 py-1.5"
        )}
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
      >
        {avatarImage && (
          <div className="w-4 h-4 rounded-full overflow-hidden border border-white/30 flex-shrink-0">
            <img src={avatarImage} alt="You" className="w-full h-full object-cover" />
          </div>
        )}
        {isMicMuted ? (
          <MicOff className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
        ) : isLocalSpeaking ? (
          <div className="flex items-center gap-0.5 h-3">
            <span className="w-1 h-3 bg-emerald-500 rounded-full animate-pulse" />
            <span className="w-1 h-4 bg-emerald-500 rounded-full animate-pulse delay-75" />
            <span className="w-1 h-2 bg-emerald-500 rounded-full animate-pulse delay-150" />
          </div>
        ) : (
          <Mic className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        )}
        <span className="truncate max-w-[120px]">
          You {hasActiveScreenTrack ? '(Screen)' : ''}
        </span>
        {aspectLandscape && hasActiveScreenTrack && !isThumbnail && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-mono"
            style={{
              backgroundColor: 'var(--md-sys-color-tertiary-container)',
              color: 'var(--md-sys-color-on-tertiary-container)',
            }}
          >
            Landscape
          </span>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// REMOTE VIDEO TILE
// -------------------------------------------------------------
function RemoteVideoTile({ 
  stream, 
  id, 
  name,
  avatarImage,
  avatarColor,
  isRemoteVideoOff,
  isRemoteAudioMuted,
  isScreenSharing = false,
  fitMode = 'contain',
  rotation = 0,
  isSpotlightStage = false,
  isThumbnail = false,
  isTheaterMode = false,
  onToggleFit,
  onToggleTheater,
  onRotate,
  onSpotlight,
  onUnspotlight
}: { 
  stream: MediaStream; 
  id: string; 
  name: string; 
  avatarImage?: string;
  avatarColor?: string;
  isRemoteVideoOff?: boolean;
  isRemoteAudioMuted?: boolean;
  isScreenSharing?: boolean;
  fitMode?: 'contain' | 'cover';
  rotation?: number;
  isSpotlightStage?: boolean;
  isThumbnail?: boolean;
  isTheaterMode?: boolean;
  onToggleFit?: () => void;
  onToggleTheater?: () => void;
  onRotate?: () => void;
  onSpotlight?: () => void;
  onUnspotlight?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tileContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const isRotatedQuarter = rotation === 90 || rotation === 270;

  useEffect(() => {
    if (!tileContainerRef.current) return;
    const updateScale = () => {
      if (!tileContainerRef.current) return;
      const { clientWidth: w, clientHeight: h } = tileContainerRef.current;
      if (isRotatedQuarter && w && h) {
        setScale(Math.min(w, h) / Math.max(w, h));
      } else {
        setScale(1);
      }
    };
    updateScale();
    const obs = new ResizeObserver(updateScale);
    obs.observe(tileContainerRef.current);
    return () => obs.disconnect();
  }, [isRotatedQuarter]);

  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  const { speaking: isRemoteSpeaking } = useAudioActivity(stream, isRemoteAudioMuted);

  useEffect(() => {
    const checkTracks = () => {
      const vTracks = stream.getVideoTracks();
      const hasLive = vTracks.length > 0 && vTracks.some(t => t.readyState === 'live');
      setHasVideoTrack(hasLive);
    };

    checkTracks();
    stream.addEventListener('addtrack', checkTracks);
    stream.addEventListener('removetrack', checkTracks);

    if (videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.warn("Remote video play error:", e));
    }

    return () => {
      stream.removeEventListener('addtrack', checkTracks);
      stream.removeEventListener('removetrack', checkTracks);
    };
  }, [stream]);

  useEffect(() => {
    if ((!isRemoteVideoOff || isScreenSharing) && videoRef.current) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(e => console.warn("Remote video resume play error:", e));
    }
  }, [isRemoteVideoOff, hasVideoTrack, isScreenSharing, stream]);

  const handleMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    if (vid.videoWidth && vid.videoHeight) {
      const ratio = vid.videoWidth / vid.videoHeight;
      setIsLandscape(ratio >= 1.15);
    }
  };

  const initials = (name || id || "Node").substring(0, 2).toUpperCase();
  const showVideo = (hasVideoTrack && !isRemoteVideoOff) || isScreenSharing;

  return (
    <div 
      ref={tileContainerRef}
      onDoubleClick={() => onToggleTheater ? onToggleTheater() : onToggleFit?.()}
      title={isScreenSharing ? "Double-click to toggle Full Screen presentation" : undefined}
      className={cn(
        "w-full h-full flex items-center justify-center relative overflow-hidden",
        isRemoteSpeaking && !isThumbnail && "ring-2 ring-[var(--md-sys-color-primary)]"
      )}
      style={{ backgroundColor: 'var(--md-sys-color-surface-container)' }}
    >
      {/* Screen Sharing Badge */}
      {isScreenSharing && !isThumbnail && (
        <div 
          onClick={onToggleTheater}
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3.5 py-1 rounded-full m3-btn-filled text-[11px] font-semibold shadow-lg cursor-pointer transition-all"
          title="Click to toggle Full Screen presentation"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>{name}'s Screen</span>
          <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full">
            {isTheaterMode ? "Exit Full" : "Full Screen"}
          </span>
        </div>
      )}

      {/* Video Element */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted
        onLoadedMetadata={handleMetadata}
        style={{
          transform: `rotate(${rotation}deg) scale(${scale})`,
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        className={cn(
          "w-full h-full",
          fitMode === 'contain' ? "object-contain" : "object-cover",
          !showVideo ? "opacity-0 pointer-events-none absolute inset-0" : "opacity-100"
        )}
      />

      {/* Subtle Vignette Gradient for badge & control legibility */}
      {showVideo && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/35 pointer-events-none" />
      )}

      {/* Material You Expressive Avatar Stage for Voice Call or Camera Off */}
      {!showVideo && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-4"
          style={{ backgroundColor: 'var(--md-sys-color-surface-container)' }}
        >
          <div className="relative flex items-center justify-center">
            {isRemoteSpeaking && (
              <span
                className="animate-ping absolute -inset-3 rounded-[32px] opacity-35"
                style={{ backgroundColor: 'var(--md-sys-color-tertiary)' }}
              />
            )}
            <div
              className={cn(
                "rounded-[28px] border flex items-center justify-center font-bold uppercase shadow-xl transition-all overflow-hidden relative z-10",
                avatarColor || "m3-btn-tertiary",
                isThumbnail ? "w-12 h-12 rounded-2xl text-sm" : "w-24 h-24 sm:w-28 sm:h-28 text-2xl sm:text-3xl",
                isRemoteSpeaking && "scale-105 ring-4 ring-[var(--md-sys-color-tertiary)]/40"
              )}
              style={{
                borderColor: isRemoteSpeaking
                  ? 'var(--md-sys-color-tertiary)'
                  : 'var(--md-sys-color-outline-variant)',
              }}
            >
              {avatarImage ? (
                <img src={avatarImage} alt={name} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
          </div>
          {!isThumbnail && isRemoteVideoOff && (
            <p
              className="text-xs font-semibold mt-4 px-3.5 py-1 rounded-full border"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-high)',
                color: 'var(--md-sys-color-on-surface-variant)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              Voice Only • Camera Off
            </p>
          )}
        </div>
      )}

      {/* Top Controls: Spotlight, Rotate & Fit Mode */}
      {!isThumbnail && (
        <div className={cn(
          "absolute top-3 right-3 flex items-center gap-1.5 z-20 transition-opacity",
          isScreenSharing ? "opacity-95 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          {onToggleTheater && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleTheater(); }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-xl border flex items-center gap-1.5 shadow-md cursor-pointer transition-all",
                isTheaterMode ? "m3-btn-tertiary" : "m3-btn-filled"
              )}
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title={isTheaterMode ? "Exit Full Screen Presenter view" : "Full Screen Presenter view"}
            >
              {isTheaterMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="text-[11px] hidden sm:inline">{isTheaterMode ? 'Exit Full Screen' : 'Full Screen'}</span>
            </button>
          )}

          {onRotate && (
            <button
              onClick={(e) => { e.stopPropagation(); onRotate(); }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-xl border flex items-center gap-1.5 shadow-md cursor-pointer transition-all",
                rotation > 0 ? "m3-btn-tertiary" : "m3-surface-high text-text"
              )}
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title={`Rotate 90° (Currently ${rotation}°)`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="text-[11px]">{rotation > 0 ? `${rotation}°` : 'Rotate'}</span>
            </button>
          )}

          {onToggleFit && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFit(); }}
              className="px-3 py-1.5 rounded-full m3-surface-high text-xs font-semibold text-text backdrop-blur-xl border flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title={fitMode === 'contain' ? "Switch to Fill (zoom to edge)" : "Switch to Fit (show entire screen without cropping)"}
            >
              {fitMode === 'contain' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              <span className="text-[11px]">{fitMode === 'contain' ? 'Fit' : 'Fill'}</span>
            </button>
          )}

          {isSpotlightStage && onUnspotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnspotlight(); }}
              className="px-3 py-1.5 rounded-full m3-btn-tertiary text-xs font-bold backdrop-blur-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
              title="Exit Spotlight Mode"
            >
              <PinOff className="w-3.5 h-3.5" />
              <span>Unpin</span>
            </button>
          ) : onSpotlight ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSpotlight(); }}
              className="p-2 rounded-full m3-surface-high text-text hover:m3-btn-filled backdrop-blur-xl border shadow-md cursor-pointer transition-all"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title={`Spotlight ${name}`}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      )}

      {/* Spotlight Badge on Stage */}
      {isSpotlightStage && (
        <div className="absolute top-3 left-3 flex items-center gap-2 m3-btn-tertiary px-3.5 py-1.5 rounded-full text-xs font-bold shadow-lg z-20 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5" />
          <span>SPOTLIGHT: {name.toUpperCase()}</span>
          {isLandscape && <span className="bg-black/20 px-2 py-0.5 rounded-full text-[10px]">LANDSCAPE</span>}
        </div>
      )}

      {/* Participant Name Badge */}
      <div
        className={cn(
          "absolute bottom-3 left-3 flex items-center gap-2 backdrop-blur-xl border rounded-full text-xs font-semibold text-text shadow-lg z-10",
          isThumbnail ? "px-2.5 py-0.5 text-[10px]" : "px-3.5 py-1.5"
        )}
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
      >
        {avatarImage && (
          <div className="w-4 h-4 rounded-full overflow-hidden border border-white/30 flex-shrink-0">
            <img src={avatarImage} alt={name} className="w-full h-full object-cover" />
          </div>
        )}
        {isRemoteAudioMuted ? (
          <MicOff className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
        ) : isRemoteSpeaking ? (
          <div className="flex items-center gap-0.5 h-3">
            <span className="w-1 h-3 bg-emerald-500 rounded-full animate-pulse" />
            <span className="w-1 h-4 bg-emerald-500 rounded-full animate-pulse delay-75" />
            <span className="w-1 h-2 bg-emerald-500 rounded-full animate-pulse delay-150" />
          </div>
        ) : (
          <Volume2 className="w-3.5 h-3.5 text-muted flex-shrink-0" />
        )}
        <span className="truncate max-w-[120px]">{name}</span>
        {isLandscape && !isThumbnail && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-mono"
            style={{
              backgroundColor: 'var(--md-sys-color-tertiary-container)',
              color: 'var(--md-sys-color-on-tertiary-container)',
            }}
          >
            Landscape
          </span>
        )}
      </div>
    </div>
  );
}
