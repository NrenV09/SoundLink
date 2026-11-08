import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import { cn } from '../lib/utils';

interface VoiceMessagePlayerProps {
  id: string;
  audioData: string;
  isMe: boolean;
  senderColor?: string;
}

/**
 * Inspects magic bytes of the audio binary to detect the true container MIME type.
 * Fixes iOS/iPadOS/Safari issues where MP4/AAC or WAV audio was mislabeled as audio/webm.
 */
function detectAudioMimeType(bytes: Uint8Array, fallbackMime: string): string {
  if (bytes.length >= 12) {
    // RIFF....WAVE -> audio/wav
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45
    ) {
      return 'audio/wav';
    }
    // ....ftyp -> audio/mp4 (Safari / iOS / iPadOS MediaRecorder default)
    if (
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    ) {
      return 'audio/mp4';
    }
    // OggS -> audio/ogg
    if (
      bytes[0] === 0x4f &&
      bytes[1] === 0x67 &&
      bytes[2] === 0x67 &&
      bytes[3] === 0x53
    ) {
      return 'audio/ogg';
    }
    // EBML (\x1A\x45\xDF\xA3) -> audio/webm
    if (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    ) {
      return 'audio/webm';
    }
    // ID3 or MPEG sync -> audio/mpeg
    if (
      (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    ) {
      return 'audio/mpeg';
    }
  }
  return fallbackMime || 'audio/wav';
}

function base64ToArrayBuffer(base64Data: string): { buffer: ArrayBuffer; contentType: string } | null {
  try {
    let base64 = base64Data;
    let declaredType = 'audio/wav';
    if (base64Data.startsWith('data:')) {
      const parts = base64Data.split(';base64,');
      declaredType = parts[0].replace('data:', '').split(';')[0] || 'audio/wav';
      base64 = parts[1] || '';
    }
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const trueMime = detectAudioMimeType(bytes, declaredType);
    return { buffer: bytes.buffer, contentType: trueMime };
  } catch (e) {
    console.error('Failed to parse base64 audio:', e);
    return null;
  }
}

function extractWaveformFromBuffer(audioBuffer: AudioBuffer, numBars = 24): number[] {
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const blockSize = Math.max(1, Math.floor(totalSamples / numBars));
  const heights: number[] = [];

  for (let i = 0; i < numBars; i++) {
    const start = i * blockSize;
    let sum = 0;
    const count = Math.min(blockSize, totalSamples - start);
    for (let j = 0; j < count; j++) {
      sum += Math.abs(channelData[start + j]);
    }
    const avg = count > 0 ? sum / count : 0;
    const height = Math.min(100, Math.max(25, Math.round(avg * 420)));
    heights.push(height);
  }
  return heights;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  id,
  audioData,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const decodedBufferRef = useRef<AudioBuffer | null>(null);
  const webAudioCtxRef = useRef<AudioContext | null>(null);
  const webAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const webAudioStartTimeRef = useRef<number>(0);
  const webAudioOffsetRef = useRef<number>(0);
  const usingWebAudioFallbackRef = useRef<boolean>(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mimeExt, setMimeExt] = useState<string>('wav');

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [waveHeights, setWaveHeights] = useState<number[]>(() => [
    30, 45, 60, 80, 50, 65, 90, 75, 55, 70, 85, 95, 60, 70, 80, 50, 40, 60, 75, 85, 65, 45, 35, 25,
  ]);

  const stopWebAudioPlayback = useCallback(() => {
    if (webAudioSourceRef.current) {
      try {
        webAudioSourceRef.current.onended = null;
        webAudioSourceRef.current.stop();
        webAudioSourceRef.current.disconnect();
      } catch {
        // Ignore
      }
      webAudioSourceRef.current = null;
    }
  }, []);

  // Decode audio data in memory for waveform + universal WebAudio playback fallback
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    const analyzeAudio = async () => {
      try {
        let arrayBuf: ArrayBuffer | null = null;
        let mime = 'audio/wav';

        if (audioData.startsWith('blob:') || audioData.startsWith('http')) {
          setBlobUrl(audioData);
          try {
            const resp = await fetch(audioData);
            arrayBuf = await resp.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuf);
            mime = detectAudioMimeType(uint8, resp.headers.get('Content-Type') || 'audio/wav');
          } catch {
            // Ignore fetch error
          }
        } else {
          const parsed = base64ToArrayBuffer(audioData);
          if (parsed) {
            arrayBuf = parsed.buffer;
            mime = parsed.contentType;
            const blob = new Blob([arrayBuf], { type: mime });
            createdUrl = URL.createObjectURL(blob);
            setBlobUrl(createdUrl);
          }
        }

        if (mime.includes('mp4')) setMimeExt('m4a');
        else if (mime.includes('webm')) setMimeExt('webm');
        else if (mime.includes('ogg')) setMimeExt('ogg');
        else setMimeExt('wav');

        if (arrayBuf && active) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            try {
              const ctx = new AudioCtx();
              const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
              if (active) {
                decodedBufferRef.current = decoded;
                if (decoded.duration > 0 && isFinite(decoded.duration)) {
                  setDuration(decoded.duration);
                }
                setWaveHeights(extractWaveformFromBuffer(decoded, 24));
                setIsLoaded(true);
              }
              ctx.close().catch(() => {});
            } catch {
              if (active) setIsLoaded(true);
            }
          }
        }
      } catch {
        if (active) setIsLoaded(true);
      }
    };

    analyzeAudio();

    return () => {
      active = false;
      stopWebAudioPlayback();
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [audioData, stopWebAudioPlayback]);

  // Smooth 60fps progress loop for both <audio> and Web Audio API fallback
  useEffect(() => {
    let animId: number | null = null;
    if (isPlaying) {
      const loop = () => {
        if (usingWebAudioFallbackRef.current && webAudioCtxRef.current && decodedBufferRef.current) {
          const elapsed =
            (webAudioCtxRef.current.currentTime - webAudioStartTimeRef.current) * playbackRate;
          const pos = Math.min(decodedBufferRef.current.duration, webAudioOffsetRef.current + elapsed);
          setCurrentTime(pos);
          if (pos < decodedBufferRef.current.duration) {
            animId = requestAnimationFrame(loop);
          }
        } else if (audioRef.current) {
          const t = audioRef.current.currentTime;
          setCurrentTime(t);
          const d = audioRef.current.duration;
          if (isFinite(d) && !isNaN(d) && d > 0 && duration === 0) {
            setDuration(d);
          }
          if (!audioRef.current.paused && !audioRef.current.ended) {
            animId = requestAnimationFrame(loop);
          }
        }
      };
      animId = requestAnimationFrame(loop);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, duration, playbackRate]);

  useEffect(() => {
    const handlePauseAll = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id !== id) {
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
        }
        stopWebAudioPlayback();
        setIsPlaying(false);
      }
    };

    window.addEventListener('quantum-pause-voice-notes', handlePauseAll);
    return () => {
      window.removeEventListener('quantum-pause-voice-notes', handlePauseAll);
    };
  }, [id, stopWebAudioPlayback]);

  // Play using Web Audio API decoded buffer (universal fallback when <audio> codec fails)
  const playViaWebAudioBuffer = async (startOffset: number) => {
    const buffer = decodedBufferRef.current;
    if (!buffer) return false;

    try {
      stopWebAudioPlayback();
      if (!webAudioCtxRef.current || webAudioCtxRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        webAudioCtxRef.current = new AudioCtx();
      }
      if (webAudioCtxRef.current.state === 'suspended') {
        await webAudioCtxRef.current.resume();
      }

      const source = webAudioCtxRef.current.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
      source.connect(webAudioCtxRef.current.destination);

      const safeOffset = startOffset >= buffer.duration ? 0 : Math.max(0, startOffset);
      webAudioOffsetRef.current = safeOffset;
      webAudioStartTimeRef.current = webAudioCtxRef.current.currentTime;
      usingWebAudioFallbackRef.current = true;
      webAudioSourceRef.current = source;

      source.onended = () => {
        setIsPlaying(false);
        setCurrentTime(buffer.duration);
        webAudioOffsetRef.current = 0;
      };

      source.start(0, safeOffset);
      setIsPlaying(true);
      return true;
    } catch {
      return false;
    }
  };

  const togglePlay = async () => {
    window.dispatchEvent(new CustomEvent('quantum-pause-voice-notes', { detail: { id } }));

    if (isPlaying) {
      if (usingWebAudioFallbackRef.current && webAudioCtxRef.current) {
        const elapsed =
          (webAudioCtxRef.current.currentTime - webAudioStartTimeRef.current) * playbackRate;
        webAudioOffsetRef.current = webAudioOffsetRef.current + elapsed;
        stopWebAudioPlayback();
      } else if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      return;
    }

    const totalDur =
      duration > 0
        ? duration
        : decodedBufferRef.current?.duration ||
          (audioRef.current && isFinite(audioRef.current.duration)
            ? audioRef.current.duration
            : 0);

    let startFrom = currentTime;
    if (totalDur > 0 && startFrom >= totalDur - 0.05) {
      startFrom = 0;
      setCurrentTime(0);
    }

    // Prefer Web Audio buffer if already decoded (100% immune to <audio> container quirks on iOS/iPadOS)
    if (decodedBufferRef.current) {
      const ok = await playViaWebAudioBuffer(startFrom);
      if (ok) return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    usingWebAudioFallbackRef.current = false;
    audio.currentTime = startFrom;
    audio.playbackRate = playbackRate;

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      // Fallback to Web Audio API
      await playViaWebAudioBuffer(startFrom);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const effectiveDuration =
      duration > 0
        ? duration
        : decodedBufferRef.current?.duration ||
          (audioRef.current && isFinite(audioRef.current.duration)
            ? audioRef.current.duration
            : 0);
    if (effectiveDuration <= 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clickPos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = clickPos * effectiveDuration;

    setCurrentTime(newTime);
    webAudioOffsetRef.current = newTime;

    if (usingWebAudioFallbackRef.current && isPlaying) {
      playViaWebAudioBuffer(newTime);
    } else if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSpeed = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
    if (webAudioSourceRef.current) {
      webAudioSourceRef.current.playbackRate.value = nextSpeed;
    }
  };

  const downloadAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = blobUrl || audioData;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice-note-${Date.now().toString().slice(-6)}.${mimeExt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const effectiveDuration =
    duration > 0
      ? duration
      : decodedBufferRef.current?.duration ||
        (audioRef.current && isFinite(audioRef.current.duration)
          ? audioRef.current.duration
          : 1);
  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  return (
    <div className="w-full min-w-[220px] max-w-[310px] rounded-2xl p-2.5 select-none bg-black/15 dark:bg-white/10 backdrop-blur-md">
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="metadata"
          onLoadedMetadata={() => {
            if (audioRef.current) {
              const d = audioRef.current.duration;
              if (isFinite(d) && !isNaN(d) && d > 0 && duration === 0) {
                setDuration(d);
              }
              setIsLoaded(true);
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current && !isPlaying && !usingWebAudioFallbackRef.current) {
              setCurrentTime(audioRef.current.currentTime);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(effectiveDuration);
          }}
        />
      )}

      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all active:scale-95 cursor-pointer',
            isPlaying
              ? 'bg-white text-zinc-900'
              : 'bg-white/90 text-zinc-900 hover:bg-white hover:scale-105'
          )}
          title={isPlaying ? 'Pause voice note' : 'Play voice note'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Waveform & Scrubber Area */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <div
            onClick={handleSeek}
            className="h-7 flex items-center gap-[2.5px] cursor-pointer group py-1"
            title="Tap to seek"
          >
            {waveHeights.map((height, i) => {
              const barProgress = i / waveHeights.length;
              const isPassed = barProgress <= progress;
              return (
                <div
                  key={i}
                  style={{ height: `${height}%` }}
                  className={cn(
                    'flex-1 rounded-full transition-all duration-75 min-w-[2.5px]',
                    isPassed ? 'bg-current opacity-100' : 'bg-current opacity-35 group-hover:opacity-55'
                  )}
                />
              );
            })}
          </div>

          {/* Timers, Speed & Download */}
          <div className="flex items-center justify-between text-[10px] opacity-85 font-mono font-medium leading-none px-0.5">
            <span>{formatTime(isPlaying || currentTime > 0 ? currentTime : effectiveDuration)}</span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cycleSpeed}
                className="px-1.5 py-0.5 rounded-full bg-black/15 dark:bg-white/15 font-bold transition-colors cursor-pointer text-[9px]"
                title="Playback speed"
              >
                {playbackRate}x
              </button>
              <button
                type="button"
                onClick={downloadAudio}
                className="p-1 rounded-full hover:bg-black/15 dark:hover:bg-white/15 transition-colors cursor-pointer"
                title="Download audio"
              >
                <Download className="w-3 h-3" />
              </button>
              <span className="opacity-70">
                {effectiveDuration > 0 ? formatTime(effectiveDuration) : isLoaded ? '0:01' : '...'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
