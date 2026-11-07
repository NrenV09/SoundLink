import React, { useState, useEffect, useRef, useCallback } from 'react';
import LZString from 'lz-string';
import { MaterialSymbol } from '../lib/materialTheme';
import {
  WAVER_PROTOCOLS,
  WaverProtocolKey,
  WaverEngineStatus,
  subscribeWaverEngineStatus,
  preloadWaverWasmEngine,
  encodeWaverWaveform,
  createWaverRxSession,
  decodeWaverFullBuffer,
  splitIntoAcousticFrames,
  parseAcousticFrame,
  crc16Hex,
} from '../lib/waverEngine';
import { cacheStorageManager } from '../lib/cacheStorage';

export interface DecodedAcousticPacket {
  id: string;
  timestamp: number;
  text: string;
  byteLength: number;
  crc: string;
  source: 'microphone' | 'loopback' | 'wav-file';
  protocolHint: string;
  isFilePayload?: boolean;
  fileName?: string;
  fileContent?: string;
  frameInfo?: string;
}

interface WaverSonicNodeProps {
  senderName: string;
  onPacketDecoded?: (packet: DecodedAcousticPacket) => void;
  onCacheUpdated?: () => void;
}

const QUICK_PRESETS = [
  {
    label: 'Acoustic Beacon',
    icon: 'surround_sound',
    text: 'WAVER://PING?node=SOUND-LINK&mode=FSK-ECC&status=AIRGAPPED-OK',
  },
  {
    label: 'Air-Gapped Key',
    icon: 'key',
    text: 'KEY::ED25519::9F8A-44C1-7B2E-09D3-A11F-8842',
  },
  {
    label: 'Offline Sync',
    icon: 'offline_bolt',
    text: '{"cmd":"SYNC","chan":1875,"ecc":"RS-25","ts":1735689600}',
  },
  {
    label: 'Ultrasonic Wake',
    icon: 'waves',
    text: 'USONIC::WAKE_NODE::CH_15KHZ::ACK',
  },
];

type BandCategory = 'audible' | 'ultrasound' | 'dualtone';
type SpeedTier = 'NORMAL' | 'FAST' | 'FASTEST';

function resolveProtocolFromBandAndSpeed(band: BandCategory, speed: SpeedTier): WaverProtocolKey {
  if (band === 'ultrasound') return `ULTRASOUND_${speed}` as WaverProtocolKey;
  if (band === 'dualtone') return `DT_${speed}` as WaverProtocolKey;
  return `AUDIBLE_${speed}` as WaverProtocolKey;
}

export const WaverSonicNode: React.FC<WaverSonicNodeProps> = ({
  senderName,
  onPacketDecoded,
  onCacheUpdated,
}) => {
  const [engineStatus, setEngineStatus] = useState<WaverEngineStatus>({
    ready: false,
    cachedInStorage: false,
    wasmSizeKB: 134,
    sampleRate: 48000,
    initTimeMs: 0,
    engineVersion: 'ggwave v0.4.0 · FSK + Reed-Solomon ECC',
    error: null,
  });

  // Ergonomic 2-Step Protocol State (Band + Speed)
  const [activeBand, setActiveBand] = useState<BandCategory>('audible');
  const [activeSpeed, setActiveSpeed] = useState<SpeedTier>('FAST');
  const selectedProtocol = resolveProtocolFromBandAndSpeed(activeBand, activeSpeed);

  const [txVolume, setTxVolume] = useState<number>(45);
  const [useDSS, setUseDSS] = useState<boolean>(false);
  const [fixedPayloadLength, setFixedPayloadLength] = useState<number>(-1);
  const [payloadText, setPayloadText] = useState<string>(
    `Hello from ${senderName || 'Sound Link'} via Waver Acoustic FSK!`
  );
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);

  // Tx / Loopback state
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [txProgress, setTxProgress] = useState<{
    currentFrame: number;
    totalFrames: number;
    durationSec: number;
  } | null>(null);
  const [lastEncodedInfo, setLastEncodedInfo] = useState<{
    durationSeconds: number;
    byteLength: number;
    frameCount: number;
    peakAmplitude: number;
    wavBlob: Blob | null;
  } | null>(null);

  // Receiver (Rx) state
  const [isListening, setIsListening] = useState<boolean>(false);
  const [rxBandAudible, setRxBandAudible] = useState<boolean>(true);
  const [rxBandUltrasound, setRxBandUltrasound] = useState<boolean>(true);
  const [rxBandDualTone, setRxBandDualTone] = useState<boolean>(true);
  const [rxError, setRxError] = useState<string | null>(null);
  const [decodedPackets, setDecodedPackets] = useState<DecodedAcousticPacket[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusBannerMsg, setStatusBannerMsg] = useState<string | null>(null);

  // Multi-frame reassembly buffer
  const multiFrameBufferRef = useRef<Map<string, { total: number; chunks: Map<number, string> }>>(
    new Map()
  );
  const [partialFrameStatus, setPartialFrameStatus] = useState<{
    crc: string;
    received: number;
    total: number;
  } | null>(null);

  // Visualizer state
  const [visualizerMode, setVisualizerMode] = useState<'spectrum' | 'waterfall' | 'waveform'>(
    'spectrum'
  );
  const [liveRmsDb, setLiveRmsDb] = useState<number>(-60);
  const [dominantFreqHz, setDominantFreqHz] = useState<number>(0);

  // Web Audio & Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const rxSessionRef = useRef<{
    decodeChunk: (chunk: Float32Array) => string | null;
    free: () => void;
  } | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wavDecodeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = subscribeWaverEngineStatus((st) => {
      setEngineStatus(st);
    });
    preloadWaverWasmEngine().catch(() => {});
    return () => unsub();
  }, []);

  const activeProtocolSpec =
    WAVER_PROTOCOLS.find((p) => p.key === selectedProtocol) || WAVER_PROTOCOLS[1];

  const ensureAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx({ sampleRate: 48000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    if (!analyserRef.current && audioCtxRef.current) {
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;
    }
    return audioCtxRef.current;
  }, []);

  const handleRawDecodedText = useCallback(
    (rawText: string, source: 'microphone' | 'loopback' | 'wav-file') => {
      const parsed = parseAcousticFrame(rawText);

      let completedText: string | null = null;
      let frameBadge: string | undefined;

      if (parsed.isMultiFrame) {
        const existing = multiFrameBufferRef.current.get(parsed.crc) || {
          total: parsed.total,
          chunks: new Map<number, string>(),
        };
        existing.chunks.set(parsed.index, parsed.body);
        multiFrameBufferRef.current.set(parsed.crc, existing);

        setPartialFrameStatus({
          crc: parsed.crc,
          received: existing.chunks.size,
          total: parsed.total,
        });

        if (existing.chunks.size >= existing.total) {
          const ordered: string[] = [];
          for (let i = 1; i <= existing.total; i++) {
            ordered.push(existing.chunks.get(i) || '');
          }
          completedText = ordered.join('');
          frameBadge = `${existing.total}/${existing.total} Frames`;
          multiFrameBufferRef.current.delete(parsed.crc);
          setPartialFrameStatus(null);
        } else {
          setStatusBannerMsg(
            `Received frame ${parsed.index}/${parsed.total} (CRC ${parsed.crc}) — waiting for remaining frames...`
          );
          return;
        }
      } else {
        completedText = parsed.body;
      }

      if (!completedText) return;

      let isFilePayload = false;
      let fileName: string | undefined;
      let fileContent: string | undefined;
      let displayBody = completedText;

      if (completedText.startsWith('WVF::')) {
        const parts = completedText.split('::');
        if (parts.length >= 3) {
          isFilePayload = true;
          fileName = parts[1];
          const compressed = parts.slice(2).join('::');
          const decompressed = LZString.decompressFromBase64(compressed);
          fileContent = decompressed ?? compressed;
          displayBody = `[Acoustic File: ${fileName}] (${
            new TextEncoder().encode(fileContent).length
          } bytes)`;
        }
      }

      const packet: DecodedAcousticPacket = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        text: displayBody,
        byteLength: new TextEncoder().encode(completedText).length,
        crc: crc16Hex(completedText),
        source,
        protocolHint: activeProtocolSpec.shortLabel,
        isFilePayload,
        fileName,
        fileContent,
        frameInfo: frameBadge,
      };

      setDecodedPackets((prev) => [packet, ...prev]);
      setStatusBannerMsg(
        `Decoded ${packet.byteLength}B acoustic payload (${
          source === 'microphone'
            ? 'Live Mic'
            : source === 'loopback'
            ? 'WASM Loopback'
            : 'WAV File'
        }) · CRC ${packet.crc}`
      );
      if (onPacketDecoded) {
        onPacketDecoded(packet);
      }
    },
    [activeProtocolSpec.shortLabel, onPacketDecoded]
  );

  // Real-time Canvas Visualizer Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!waterfallOffscreenRef.current) {
      const off = document.createElement('canvas');
      off.width = 640;
      off.height = 180;
      waterfallOffscreenRef.current = off;
    }

    const freqBins = new Uint8Array(1024);
    const timeDomain = new Float32Array(1024);
    let syntheticPhase = 0;

    const renderFrame = () => {
      const width = canvas.width;
      const height = canvas.height;
      const analyser = analyserRef.current;
      const activeAudio = isTransmitting || isListening;

      ctx.clearRect(0, 0, width, height);

      if (analyser && activeAudio) {
        analyser.getByteFrequencyData(freqBins);
        analyser.getFloatTimeDomainData(timeDomain);

        let sumSq = 0;
        for (let i = 0; i < timeDomain.length; i++) {
          sumSq += timeDomain[i] * timeDomain[i];
        }
        const rms = Math.sqrt(sumSq / timeDomain.length);
        const db = Math.max(-60, Math.round(20 * Math.log10(Math.max(rms, 1e-4))));
        setLiveRmsDb(db);

        let maxBin = 0;
        let maxVal = 0;
        for (let i = 2; i < freqBins.length; i++) {
          if (freqBins[i] > maxVal) {
            maxVal = freqBins[i];
            maxBin = i;
          }
        }
        const binHz = Math.round((maxBin * 24000) / freqBins.length);
        if (maxVal > 20) {
          setDominantFreqHz(binHz);
        }
      } else {
        syntheticPhase += 0.03;
        for (let i = 0; i < freqBins.length; i++) {
          const idleWave =
            Math.sin(i * 0.07 + syntheticPhase) * 5 +
            Math.cos(i * 0.03 - syntheticPhase * 0.6) * 4 +
            10;
          freqBins[i] = Math.max(3, Math.round(idleWave));
        }
        for (let i = 0; i < timeDomain.length; i++) {
          timeDomain[i] =
            Math.sin(i * 0.035 + syntheticPhase) * 0.04 +
            Math.cos(i * 0.08 - syntheticPhase * 1.3) * 0.02;
        }
      }

      if (visualizerMode === 'spectrum') {
        const nyquist = 24000;
        const startX = (activeProtocolSpec.baseFreqHz / nyquist) * width;
        const bandW = (activeProtocolSpec.bandwidthHz / nyquist) * width;

        // Soft glowing carrier band highlight
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        const glowColor =
          activeProtocolSpec.band === 'ultrasound'
            ? '167, 139, 250'
            : activeProtocolSpec.band === 'dualtone'
            ? '251, 191, 36'
            : '52, 211, 153';
        grad.addColorStop(0, `rgba(${glowColor}, 0.02)`);
        grad.addColorStop(1, `rgba(${glowColor}, 0.18)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(startX, 8, bandW, height - 16, 16);
        ctx.fill();

        // Rounded organic FFT bars
        const barCount = 72;
        const barWidth = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const binIdx = Math.floor((i / barCount) * (freqBins.length * 0.9));
          const val = freqBins[binIdx] / 255;
          const barH = Math.max(6, val * (height - 24));
          const x = i * barWidth;
          const y = height - barH - 4;

          const freqHz = (binIdx / freqBins.length) * nyquist;
          const inCarrier =
            freqHz >= activeProtocolSpec.baseFreqHz &&
            freqHz <= activeProtocolSpec.baseFreqHz + activeProtocolSpec.bandwidthHz;

          ctx.fillStyle = inCarrier
            ? activeProtocolSpec.band === 'ultrasound'
              ? '#A78BFA'
              : activeProtocolSpec.band === 'dualtone'
              ? '#FBBF24'
              : '#34D399'
            : 'rgba(148, 163, 184, 0.35)';

          ctx.beginPath();
          ctx.roundRect(x + 1.5, y, Math.max(3, barWidth - 3), barH, 999);
          ctx.fill();
        }
      } else if (visualizerMode === 'waterfall') {
        const off = waterfallOffscreenRef.current;
        if (off) {
          const offCtx = off.getContext('2d');
          if (offCtx) {
            offCtx.drawImage(off, 0, 2);
            for (let x = 0; x < off.width; x++) {
              const binIdx = Math.floor((x / off.width) * (freqBins.length * 0.9));
              const v = freqBins[binIdx];
              const r = v > 160 ? 255 : v > 90 ? Math.round((v - 90) * 3.2) : 14;
              const g = v > 60 ? Math.min(255, Math.round(v * 1.15)) : Math.round(v * 0.4);
              const b = v > 180 ? 220 : Math.min(255, 45 + v);
              offCtx.fillStyle = `rgb(${r},${g},${b})`;
              offCtx.fillRect(x, 0, 1, 2);
            }
            ctx.drawImage(off, 0, 0, width, height);
          }
        }
      } else {
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle =
          activeProtocolSpec.band === 'ultrasound'
            ? '#A78BFA'
            : activeProtocolSpec.band === 'dualtone'
            ? '#FBBF24'
            : '#34D399';
        ctx.beginPath();
        const sliceWidth = width / timeDomain.length;
        let x = 0;
        for (let i = 0; i < timeDomain.length; i++) {
          const sample = timeDomain[i];
          const y = height / 2 + sample * (height * 0.42);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(renderFrame);
    };

    animFrameRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [visualizerMode, activeProtocolSpec, isTransmitting, isListening]);

  const stopTransmission = useCallback(() => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {
        // Ignore
      }
      activeSourceRef.current = null;
    }
    setIsTransmitting(false);
    setTxProgress(null);
  }, []);

  const handleTransmitSoundWave = async () => {
    if (!payloadText.trim()) return;
    if (isTransmitting) {
      stopTransmission();
      return;
    }

    try {
      setIsTransmitting(true);
      const audioCtx = ensureAudioContext();
      const frames =
        fixedPayloadLength > 0 ? [payloadText] : splitIntoAcousticFrames(payloadText.trim());

      const encodedFrames = [];
      let totalSamples = 0;
      const guardSamples = Math.floor(48000 * 0.18);

      for (let i = 0; i < frames.length; i++) {
        const res = await encodeWaverWaveform(
          frames[i],
          selectedProtocol,
          txVolume,
          useDSS,
          fixedPayloadLength
        );
        encodedFrames.push(res);
        totalSamples += res.samples.length + (i < frames.length - 1 ? guardSamples : 0);
      }

      const combinedSamples = new Float32Array(totalSamples);
      let offset = 0;
      for (let i = 0; i < encodedFrames.length; i++) {
        combinedSamples.set(encodedFrames[i].samples, offset);
        offset +=
          encodedFrames[i].samples.length + (i < encodedFrames.length - 1 ? guardSamples : 0);
      }

      const totalDurationSec = Number((combinedSamples.length / 48000).toFixed(2));
      setLastEncodedInfo({
        durationSeconds: totalDurationSec,
        byteLength: new TextEncoder().encode(payloadText).length,
        frameCount: frames.length,
        peakAmplitude: encodedFrames[0]?.peakAmplitude || 0.45,
        wavBlob: encodedFrames[0]?.wavBlob || null,
      });

      setTxProgress({
        currentFrame: 1,
        totalFrames: frames.length,
        durationSec: totalDurationSec,
      });

      const buffer = audioCtx.createBuffer(1, combinedSamples.length, 48000);
      buffer.copyToChannel(combinedSamples, 0);

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;

      if (analyserRef.current) {
        source.connect(analyserRef.current);
        analyserRef.current.connect(audioCtx.destination);
      } else {
        source.connect(audioCtx.destination);
      }

      activeSourceRef.current = source;
      source.onended = () => {
        setIsTransmitting(false);
        setTxProgress(null);
        activeSourceRef.current = null;
      };
      source.start(0);
      setStatusBannerMsg(
        `Broadcasting ${frames.length} acoustic frame${
          frames.length > 1 ? 's' : ''
        } (${totalDurationSec}s) via ${activeProtocolSpec.label}`
      );
    } catch (err: any) {
      setIsTransmitting(false);
      setTxProgress(null);
      setStatusBannerMsg(`Transmit error: ${err?.message || 'Failed to modulate audio'}`);
    }
  };

  const handleAcousticLoopbackTest = async () => {
    if (!payloadText.trim()) return;
    try {
      setIsTransmitting(true);
      const audioCtx = ensureAudioContext();
      const frames =
        fixedPayloadLength > 0 ? [payloadText] : splitIntoAcousticFrames(payloadText.trim());

      for (let i = 0; i < frames.length; i++) {
        setTxProgress({
          currentFrame: i + 1,
          totalFrames: frames.length,
          durationSec: 1.8,
        });

        const encoded = await encodeWaverWaveform(
          frames[i],
          selectedProtocol,
          txVolume,
          useDSS,
          fixedPayloadLength
        );

        setLastEncodedInfo({
          durationSeconds: encoded.durationSeconds,
          byteLength: encoded.byteLength,
          frameCount: frames.length,
          peakAmplitude: encoded.peakAmplitude,
          wavBlob: encoded.wavBlob,
        });

        const buffer = audioCtx.createBuffer(1, encoded.samples.length, 48000);
        buffer.copyToChannel(encoded.samples, 0);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        if (analyserRef.current) {
          source.connect(analyserRef.current);
          analyserRef.current.connect(audioCtx.destination);
        } else {
          source.connect(audioCtx.destination);
        }
        source.start(0);

        const decodedList = await decodeWaverFullBuffer(
          encoded.samples,
          useDSS,
          fixedPayloadLength
        );
        for (const decodedText of decodedList) {
          handleRawDecodedText(decodedText, 'loopback');
        }
      }

      setTimeout(() => {
        setIsTransmitting(false);
        setTxProgress(null);
      }, 900);
    } catch (err: any) {
      setIsTransmitting(false);
      setTxProgress(null);
      setStatusBannerMsg(`Loopback error: ${err?.message || 'WASM decode failed'}`);
    }
  };

  const handleExportWavFile = async () => {
    if (!payloadText.trim()) return;
    try {
      const encoded = await encodeWaverWaveform(
        payloadText.trim().slice(0, 135),
        selectedProtocol,
        txVolume,
        useDSS,
        fixedPayloadLength
      );
      setLastEncodedInfo({
        durationSeconds: encoded.durationSeconds,
        byteLength: encoded.byteLength,
        frameCount: 1,
        peakAmplitude: encoded.peakAmplitude,
        wavBlob: encoded.wavBlob,
      });

      const fileName = `waver-${selectedProtocol.toLowerCase()}-${Date.now()
        .toString()
        .slice(-5)}.wav`;
      const url = URL.createObjectURL(encoded.wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      try {
        const wavFile = new File([encoded.wavBlob], fileName, { type: 'audio/wav' });
        await cacheStorageManager.saveFile(wavFile);
        if (onCacheUpdated) onCacheUpdated();
      } catch {
        // Ignore quota errors
      }

      setStatusBannerMsg(
        `Exported 48kHz 16-bit PCM WAV (${encoded.durationSeconds}s) & cached offline.`
      );
    } catch (err: any) {
      setStatusBannerMsg(`WAV export failed: ${err?.message}`);
    }
  };

  const toggleMicrophoneListener = async () => {
    if (isListening) {
      if (scriptNodeRef.current) {
        scriptNodeRef.current.disconnect();
        scriptNodeRef.current.onaudioprocess = null;
        scriptNodeRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (rxSessionRef.current) {
        rxSessionRef.current.free();
        rxSessionRef.current = null;
      }
      setIsListening(false);
      setStatusBannerMsg('Acoustic microphone listener paused.');
      return;
    }

    setRxError(null);
    try {
      const audioCtx = ensureAudioContext();
      const rxSession = await createWaverRxSession({
        useDSS,
        fixedPayloadLength,
        enableAudible: rxBandAudible,
        enableUltrasound: rxBandUltrasound,
        enableDualTone: rxBandDualTone,
      });
      rxSessionRef.current = rxSession;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
      micStreamRef.current = stream;

      const micSource = audioCtx.createMediaStreamSource(stream);
      const scriptNode = audioCtx.createScriptProcessor(1024, 1, 1);
      scriptNodeRef.current = scriptNode;

      scriptNode.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        if (rxSessionRef.current) {
          const decoded = rxSessionRef.current.decodeChunk(inputBuffer);
          if (decoded && decoded.trim().length > 0) {
            handleRawDecodedText(
              fixedPayloadLength > 0 ? decoded.trimEnd() : decoded,
              'microphone'
            );
          }
        }
      };

      if (analyserRef.current) {
        micSource.connect(analyserRef.current);
      }
      micSource.connect(scriptNode);
      scriptNode.connect(audioCtx.destination);

      setIsListening(true);
      setStatusBannerMsg('Listening at 48,000 Hz raw PCM (Audible & Ultrasonic FSK active)...');
    } catch (err: any) {
      setRxError(
        err?.message ||
          'Microphone permission denied. Use "Loopback Test" or "Decode .WAV" to test offline!'
      );
      setIsListening(false);
    }
  };

  const handleAttachFileForSound = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const textContent = typeof reader.result === 'string' ? reader.result : '';
      const truncated = textContent.slice(0, 600);
      const compressed = LZString.compressToBase64(truncated);
      const packetString = `WVF::${file.name}::${compressed}`;
      setPayloadText(packetString);
      setAttachedFileName(file.name);
      const frames = splitIntoAcousticFrames(packetString);
      setStatusBannerMsg(
        `Packed "${file.name}" with LZ-String + CRC16 into ${frames.length} acoustic frame${
          frames.length > 1 ? 's' : ''
        }.`
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDecodeUploadedWav = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const arrayBuf = await file.arrayBuffer();
      const audioCtx = ensureAudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
      const channelData = audioBuffer.getChannelData(0);

      let samples48k = channelData;
      if (audioBuffer.sampleRate !== 48000) {
        const ratio = 48000 / audioBuffer.sampleRate;
        const newLen = Math.round(channelData.length * ratio);
        samples48k = new Float32Array(newLen);
        for (let i = 0; i < newLen; i++) {
          const srcIdx = Math.min(channelData.length - 1, Math.floor(i / ratio));
          samples48k[i] = channelData[srcIdx];
        }
      }

      const messages = await decodeWaverFullBuffer(samples48k, useDSS, fixedPayloadLength);
      if (messages.length === 0) {
        setStatusBannerMsg(`No valid ggwave FSK frames detected in "${file.name}".`);
      } else {
        for (const msg of messages) {
          handleRawDecodedText(msg, 'wav-file');
        }
      }
    } catch (err: any) {
      setStatusBannerMsg(`Could not decode audio file "${file.name}": ${err?.message}`);
    }
  };

  const payloadByteCount = new TextEncoder().encode(payloadText).length;
  const estimatedFrameCount =
    fixedPayloadLength > 0 ? 1 : splitIntoAcousticFrames(payloadText || ' ').length;

  return (
    <div className="space-y-6">
      {/* Unified Organic Acoustic Stage (Visualizer + Live Telemetry + Mic Rx Toggle) */}
      <section
        className="rounded-[32px] p-4 sm:p-6 space-y-4 overflow-hidden relative"
        style={{ background: 'var(--md-sys-color-surface-container-low)' }}
      >
        {/* Top Row: Title + Unboxed Metadata + Primary Mic Rx Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              <span className="font-semibold text-[var(--md-sys-color-primary)]">
                {engineStatus.ready
                  ? `WASM Ready (${engineStatus.initTimeMs}ms)`
                  : 'Loading WASM...'}
              </span>
              <span aria-hidden="true">·</span>
              <span>48,000 Hz Float32</span>
              <span aria-hidden="true">·</span>
              <span>{activeProtocolSpec.freqRange}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                {dominantFreqHz > 0 ? `${dominantFreqHz} Hz` : 'Idle'} / {liveRmsDb} dBFS
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--md-sys-color-on-surface)]">
              Waver Acoustic Transceiver
            </h2>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => wavDecodeInputRef.current?.click()}
              className="m3-btn-tonal min-h-[42px] px-4 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <MaterialSymbol name="upload_file" className="text-sm" />
              <span>Decode .WAV</span>
            </button>
            <input
              ref={wavDecodeInputRef}
              type="file"
              accept="audio/wav,audio/*"
              onChange={handleDecodeUploadedWav}
              className="hidden"
            />

            <button
              type="button"
              onClick={toggleMicrophoneListener}
              className={`min-h-[42px] px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                isListening
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                  : 'm3-btn-filled'
              }`}
            >
              <MaterialSymbol name={isListening ? 'mic_off' : 'mic'} filled className="text-sm" />
              <span>{isListening ? 'Stop Listening' : 'Listen (Mic Rx)'}</span>
            </button>
          </div>
        </div>

        {/* Seamless Rounded Visualizer Stage */}
        <div
          className="relative rounded-[24px] overflow-hidden"
          style={{ background: 'var(--md-sys-color-surface-container-lowest)' }}
        >
          {/* Floating Mode Pill Switcher inside Canvas Corner */}
          <div
            className="absolute top-3 right-3 z-10 inline-flex p-1 rounded-full gap-0.5 backdrop-blur-md"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--md-sys-color-surface-container-high) 82%, transparent)',
            }}
          >
            {(
              [
                { id: 'spectrum', label: 'Spectrum' },
                { id: 'waterfall', label: 'Waterfall' },
                { id: 'waveform', label: 'Wave' },
              ] as const
            ).map((mode) => {
              const active = visualizerMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setVisualizerMode(mode.id)}
                  className="px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap"
                  style={{
                    background: active ? 'var(--md-sys-color-primary)' : 'transparent',
                    color: active
                      ? 'var(--md-sys-color-on-primary)'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          <canvas
            ref={canvasRef}
            width={720}
            height={164}
            className="w-full h-36 sm:h-44 block"
          />

          {/* Subtle Unboxed Frequency Legend */}
          <div className="px-4 pb-2.5 pt-1 flex items-center justify-between text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)] opacity-80">
            <span>0 Hz</span>
            <span className="text-emerald-400">1.8–6.3 kHz Audible</span>
            <span className="hidden sm:inline">12 kHz</span>
            <span className="text-violet-400">15–19.5 kHz Ultrasonic</span>
            <span>24 kHz</span>
          </div>
        </div>

        {/* Status / Alert Toast (Soft Pill, No Boxy Border) */}
        {(statusBannerMsg || rxError) && (
          <div
            className="px-4 py-2.5 rounded-full text-xs font-medium flex items-center justify-between gap-3"
            style={{
              background: rxError
                ? 'rgba(245, 158, 11, 0.16)'
                : 'var(--md-sys-color-surface-container-high)',
              color: rxError ? '#FCD34D' : 'var(--md-sys-color-on-surface)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <MaterialSymbol
                name={rxError ? 'info' : 'graphic_eq'}
                className="text-sm text-[var(--md-sys-color-primary)] shrink-0"
              />
              <span className="truncate">{rxError || statusBannerMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setStatusBannerMsg(null);
                setRxError(null);
              }}
              className="opacity-70 hover:opacity-100 shrink-0 cursor-pointer"
            >
              <MaterialSymbol name="close" className="text-xs" />
            </button>
          </div>
        )}
      </section>

      {/* Main Responsive Split: Left = Transmitter Studio, Right = Decoded Acoustic Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Transmitter Studio (7 cols) */}
        <div
          className="lg:col-span-7 rounded-[32px] p-4 sm:p-6 space-y-5"
          style={{ background: 'var(--md-sys-color-surface-container-low)' }}
        >
          {/* Header + File to Sound Trigger */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                Transmit Sound Wave
              </h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {activeProtocolSpec.label} · ~{activeProtocolSpec.speedBytesPerSec} B/s ·{' '}
                {activeProtocolSpec.eccOverhead}
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="m3-btn-tonal min-h-[40px] px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Compress & pack a file into acoustic frames"
            >
              <MaterialSymbol name="upload_file" className="text-sm" />
              <span>File to Sound</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleAttachFileForSound}
              className="hidden"
            />
          </div>

          {/* Step 1: Ergonomic 3-Band Pill Selector (Replaces the boxy 9-button grid) */}
          <div className="space-y-3">
            <div
              className="grid grid-cols-3 p-1.5 rounded-full gap-1"
              style={{ background: 'var(--md-sys-color-surface-container)' }}
            >
              {(
                [
                  {
                    id: 'audible',
                    label: 'Audible',
                    sub: '1.8–6.3 kHz',
                    icon: 'volume_up',
                  },
                  {
                    id: 'ultrasound',
                    label: 'Ultrasound',
                    sub: '15–19.5 kHz',
                    icon: 'waves',
                  },
                  {
                    id: 'dualtone',
                    label: 'Dual-Tone',
                    sub: 'IoT / MCU',
                    icon: 'memory',
                  },
                ] as const
              ).map((band) => {
                const active = activeBand === band.id;
                return (
                  <button
                    key={band.id}
                    type="button"
                    onClick={() => setActiveBand(band.id)}
                    className="min-h-[44px] py-2 px-3 rounded-full text-center transition-all cursor-pointer flex flex-col items-center justify-center"
                    style={{
                      background: active
                        ? 'var(--md-sys-color-primary-container)'
                        : 'transparent',
                      color: active
                        ? 'var(--md-sys-color-on-primary-container)'
                        : 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    <div className="flex items-center gap-1 text-xs font-bold whitespace-nowrap">
                      <MaterialSymbol name={band.icon} filled={active} className="text-xs" />
                      <span>{band.label}</span>
                    </div>
                    <span className="text-[10px] opacity-75 hidden sm:inline">{band.sub}</span>
                  </button>
                );
              })}
            </div>

            {/* Step 2: Speed Tier Pills + Spread Spectrum (DSS) + Gain Slider */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Speed Selector Pills */}
              <div
                className="inline-flex p-1 rounded-full gap-1"
                style={{ background: 'var(--md-sys-color-surface-container)' }}
              >
                {(
                  [
                    { id: 'NORMAL', label: 'Normal' },
                    { id: 'FAST', label: 'Fast' },
                    { id: 'FASTEST', label: 'Fastest' },
                  ] as const
                ).map((sp) => {
                  const active = activeSpeed === sp.id;
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => setActiveSpeed(sp.id)}
                      className="min-h-[36px] px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                      style={{
                        background: active
                          ? 'var(--md-sys-color-secondary-container)'
                          : 'transparent',
                        color: active
                          ? 'var(--md-sys-color-on-secondary-container)'
                          : 'var(--md-sys-color-on-surface-variant)',
                      }}
                    >
                      {sp.label}
                    </button>
                  );
                })}
              </div>

              {/* DSS Spread Spectrum Toggle Pill */}
              <button
                type="button"
                onClick={() => setUseDSS((v) => !v)}
                className="min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                style={{
                  background: useDSS
                    ? 'var(--md-sys-color-tertiary-container)'
                    : 'var(--md-sys-color-surface-container)',
                  color: useDSS
                    ? 'var(--md-sys-color-on-tertiary-container)'
                    : 'var(--md-sys-color-on-surface-variant)',
                }}
              >
                <MaterialSymbol name={useDSS ? 'check_circle' : 'tune'} className="text-xs" />
                <span>{useDSS ? 'DSS Spread Spectrum ON' : 'Standard FSK'}</span>
              </button>

              {/* Frame Length Mode */}
              <select
                value={fixedPayloadLength}
                onChange={(e) => setFixedPayloadLength(Number(e.target.value))}
                className="min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer focus:outline-none"
                style={{
                  background: 'var(--md-sys-color-surface-container)',
                  color: 'var(--md-sys-color-on-surface)',
                }}
              >
                <option value={-1}>Auto Multi-Frame</option>
                <option value={16}>Fixed 16B</option>
                <option value={32}>Fixed 32B</option>
                <option value={64}>Fixed 64B</option>
              </select>
            </div>

            {/* Smooth Gain Slider Row */}
            <div className="flex items-center gap-3 px-1">
              <MaterialSymbol
                name="volume_up"
                className="text-sm text-[var(--md-sys-color-on-surface-variant)]"
              />
              <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                Output Gain
              </span>
              <input
                type="range"
                min={5}
                max={100}
                value={txVolume}
                onChange={(e) => setTxVolume(Number(e.target.value))}
                className="flex-1 accent-[var(--md-sys-color-primary)] h-1.5 rounded-full cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-[var(--md-sys-color-primary)] w-10 text-right">
                {txVolume}%
              </span>
            </div>
          </div>

          {/* Horizontal Scrollable Quick Presets (Never wraps into boxy rows on mobile) */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setPayloadText(preset.text);
                  setAttachedFileName(null);
                }}
                className="min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                style={{
                  background: 'var(--md-sys-color-surface-container)',
                  color: 'var(--md-sys-color-on-surface)',
                }}
              >
                <MaterialSymbol
                  name={preset.icon}
                  className="text-xs text-[var(--md-sys-color-primary)]"
                />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          {/* Soft Borderless Composer Surface */}
          <div
            className="rounded-[24px] p-4 space-y-2"
            style={{ background: 'var(--md-sys-color-surface-container-lowest)' }}
          >
            <div className="flex items-center justify-between text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              <span className="font-semibold">
                {attachedFileName ? `Packed File: ${attachedFileName}` : 'Payload Message'}
              </span>
              <span className="font-mono">
                {payloadByteCount}B · {estimatedFrameCount} frame
                {estimatedFrameCount > 1 ? 's' : ''} · CRC {crc16Hex(payloadText || '')}
              </span>
            </div>
            <textarea
              rows={3}
              value={payloadText}
              onChange={(e) => {
                setPayloadText(e.target.value);
                setAttachedFileName(null);
              }}
              placeholder="Type text, JSON, or key to modulate into sound waves..."
              className="w-full bg-transparent text-xs sm:text-sm font-mono resize-none focus:outline-none leading-relaxed"
              style={{ color: 'var(--md-sys-color-on-surface)' }}
            />
          </div>

          {/* Touch-First Action Bar: Full-width Primary Pill on Mobile + Tonal Pills */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={handleTransmitSoundWave}
              disabled={!engineStatus.ready || !payloadText.trim()}
              className={`flex-1 min-h-[50px] py-3.5 px-6 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98] ${
                isTransmitting
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                  : 'm3-btn-filled shadow-md'
              }`}
            >
              <MaterialSymbol
                name={isTransmitting ? 'stop' : 'surround_sound'}
                filled
                className="text-lg"
              />
              <span>
                {isTransmitting
                  ? txProgress
                    ? `Broadcasting (${txProgress.durationSec}s)... Stop`
                    : 'Stop Broadcast'
                  : 'Broadcast Sound Wave'}
              </span>
            </button>

            <div className="grid grid-cols-2 sm:flex items-center gap-2">
              <button
                type="button"
                onClick={handleAcousticLoopbackTest}
                disabled={!engineStatus.ready || !payloadText.trim() || isTransmitting}
                className="m3-btn-tonal min-h-[48px] py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Modulate and decode immediately via ggwave WASM in memory"
              >
                <MaterialSymbol name="repeat" className="text-sm" />
                <span>Loopback Test</span>
              </button>

              <button
                type="button"
                onClick={handleExportWavFile}
                disabled={!engineStatus.ready || !payloadText.trim()}
                className="m3-btn-tonal min-h-[48px] py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Download 48kHz 16-bit PCM .WAV audio file"
              >
                <MaterialSymbol name="download" className="text-sm" />
                <span>Save .WAV</span>
              </button>
            </div>
          </div>

          {lastEncodedInfo && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
              <span>
                Waveform: {lastEncodedInfo.durationSeconds}s @ 48kHz
              </span>
              <span>·</span>
              <span>
                {lastEncodedInfo.byteLength} Bytes ({lastEncodedInfo.frameCount} frame
                {lastEncodedInfo.frameCount > 1 ? 's' : ''})
              </span>
              <span>·</span>
              <span>Peak {lastEncodedInfo.peakAmplitude} F32</span>
            </div>
          )}
        </div>

        {/* Right Column: Receiver Stream (5 cols) */}
        <div
          className="lg:col-span-5 rounded-[32px] p-4 sm:p-6 space-y-4"
          style={{ background: 'var(--md-sys-color-surface-container-low)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                Decoded Acoustic Stream
              </h3>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {isListening
                  ? 'Live 48kHz microphone capture active'
                  : 'Ready for live mic, loopback, or .WAV file'}
              </p>
            </div>

            {decodedPackets.length > 0 && (
              <button
                type="button"
                onClick={() => setDecodedPackets([])}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] hover:text-rose-400 flex items-center gap-1 cursor-pointer"
              >
                <MaterialSymbol name="delete_sweep" className="text-sm" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Rx Band Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mr-1 shrink-0">
              Listen Bands:
            </span>
            {[
              {
                label: 'Audible',
                active: rxBandAudible,
                toggle: () => setRxBandAudible((v) => !v),
              },
              {
                label: 'Ultrasound',
                active: rxBandUltrasound,
                toggle: () => setRxBandUltrasound((v) => !v),
              },
              {
                label: 'Dual-Tone',
                active: rxBandDualTone,
                toggle: () => setRxBandDualTone((v) => !v),
              },
            ].map((band) => (
              <button
                key={band.label}
                type="button"
                onClick={band.toggle}
                className="min-h-[34px] px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0"
                style={{
                  background: band.active
                    ? 'var(--md-sys-color-secondary-container)'
                    : 'var(--md-sys-color-surface-container)',
                  color: band.active
                    ? 'var(--md-sys-color-on-secondary-container)'
                    : 'var(--md-sys-color-on-surface-variant)',
                }}
              >
                {band.label}
              </button>
            ))}
          </div>

          {/* Multi-Frame Reassembly Progress */}
          {partialFrameStatus && (
            <div
              className="p-4 rounded-3xl text-xs space-y-2"
              style={{
                background: 'var(--md-sys-color-primary-container)',
                color: 'var(--md-sys-color-on-primary-container)',
              }}
            >
              <div className="flex items-center justify-between font-bold">
                <span>Reassembling Stream (CRC {partialFrameStatus.crc})</span>
                <span>
                  {partialFrameStatus.received}/{partialFrameStatus.total}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-black/20 overflow-hidden">
                <div
                  className="h-full bg-[var(--md-sys-color-primary)] transition-all"
                  style={{
                    width: `${Math.round(
                      (partialFrameStatus.received / partialFrameStatus.total) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Decoded Packets Stream */}
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {decodedPackets.length === 0 ? (
              <div
                className="p-8 rounded-[28px] text-center space-y-2.5"
                style={{ background: 'var(--md-sys-color-surface-container)' }}
              >
                <div
                  className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
                  style={{
                    background: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                  }}
                >
                  <MaterialSymbol name="graphic_eq" className="text-xl" />
                </div>
                <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                  Waiting for Acoustic Signal
                </p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-xs mx-auto leading-relaxed">
                  Tap <strong>Loopback Test</strong> to run an instant in-memory WASM encode/decode cycle, or tap <strong>Listen (Mic Rx)</strong>.
                </p>
              </div>
            ) : (
              decodedPackets.map((pkt) => (
                <div
                  key={pkt.id}
                  className="p-4 rounded-[24px] space-y-2.5"
                  style={{ background: 'var(--md-sys-color-surface-container)' }}
                >
                  {/* Unboxed Metadata Line */}
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[var(--md-sys-color-primary)]">
                        {pkt.source === 'microphone'
                          ? 'Live Mic'
                          : pkt.source === 'loopback'
                          ? 'WASM Loopback'
                          : 'WAV File'}
                      </span>
                      <span>·</span>
                      <span className="font-mono">{pkt.byteLength}B</span>
                      <span>·</span>
                      <span className="font-mono">CRC {pkt.crc}</span>
                      {pkt.frameInfo && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-400 font-semibold">{pkt.frameInfo}</span>
                        </>
                      )}
                    </div>
                    <span className="font-mono">
                      {new Date(pkt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Decoded Payload Text */}
                  <p className="font-mono text-xs sm:text-sm break-all leading-relaxed text-[var(--md-sys-color-on-surface)]">
                    {pkt.isFilePayload && pkt.fileContent ? pkt.fileContent : pkt.text}
                  </p>

                  {/* Pill Action Row */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {pkt.isFilePayload && pkt.fileName && pkt.fileContent && (
                      <button
                        type="button"
                        onClick={() => {
                          const blob = new Blob([pkt.fileContent!], {
                            type: 'text/plain;charset=utf-8',
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = pkt.fileName!;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold m3-btn-tonal flex items-center gap-1 cursor-pointer"
                      >
                        <MaterialSymbol name="download" className="text-xs" />
                        <span>Save {pkt.fileName}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setPayloadText(pkt.fileContent || pkt.text);
                        setStatusBannerMsg('Loaded decoded payload into Transmitter.');
                      }}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 cursor-pointer"
                      style={{
                        background: 'var(--md-sys-color-surface-container-high)',
                        color: 'var(--md-sys-color-on-surface)',
                      }}
                    >
                      <MaterialSymbol name="replay" className="text-xs" />
                      <span>Relay</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(pkt.fileContent || pkt.text);
                        setCopiedId(pkt.id);
                        setTimeout(() => setCopiedId(null), 1500);
                      }}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold m3-btn-tonal flex items-center gap-1 cursor-pointer"
                    >
                      <MaterialSymbol
                        name={copiedId === pkt.id ? 'check' : 'content_copy'}
                        className="text-xs"
                      />
                      <span>{copiedId === pkt.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
