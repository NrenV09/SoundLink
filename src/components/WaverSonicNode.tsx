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
    label: 'Offline Mesh Sync',
    icon: 'offline_bolt',
    text: '{"cmd":"SYNC","chan":1875,"ecc":"RS-25","ts":1735689600}',
  },
  {
    label: 'Ultrasonic Trigger',
    icon: 'waves',
    text: 'USONIC::WAKE_NODE::CH_15KHZ::ACK',
  },
];

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

  // Transmitter (Tx) controls
  const [selectedProtocol, setSelectedProtocol] = useState<WaverProtocolKey>('AUDIBLE_FAST');
  const [txVolume, setTxVolume] = useState<number>(45);
  const [useDSS, setUseDSS] = useState<boolean>(false);
  const [fixedPayloadLength, setFixedPayloadLength] = useState<number>(-1);
  const [payloadText, setPayloadText] = useState<string>(
    `Hello from ${senderName || 'Sound Link'} via Waver Acoustic FSK!`
  );
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);

  // Tx / Loopback state
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [txProgress, setTxProgress] = useState<{ currentFrame: number; totalFrames: number; durationSec: number } | null>(null);
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

  // Multi-frame reassembly buffer: key = crc, value = Map<frameIndex, chunkText>
  const multiFrameBufferRef = useRef<Map<string, { total: number; chunks: Map<number, string> }>>(new Map());
  const [partialFrameStatus, setPartialFrameStatus] = useState<{ crc: string; received: number; total: number } | null>(null);

  // Visualizer state
  const [visualizerMode, setVisualizerMode] = useState<'spectrum' | 'waterfall' | 'waveform'>('spectrum');
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
  const rxSessionRef = useRef<{ decodeChunk: (chunk: Float32Array) => string | null; free: () => void } | null>(null);
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
      analyser.smoothingTimeConstant = 0.72;
      analyserRef.current = analyser;
    }
    return audioCtxRef.current;
  }, []);

  // Handle incoming decoded string (single-frame or multi-frame WV1 packet)
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
          total: existing.total,
        });

        if (existing.chunks.size >= existing.total) {
          const ordered: string[] = [];
          for (let i = 1; i <= existing.total; i++) {
            ordered.push(existing.chunks.get(i) || '');
          }
          completedText = ordered.join('');
          frameBadge = `${existing.total}/${existing.total} Frames Reassembled`;
          multiFrameBufferRef.current.delete(parsed.crc);
          setPartialFrameStatus(null);
        } else {
          setStatusBannerMsg(
            `Received acoustic frame ${parsed.index}/${parsed.total} (CRC ${parsed.crc}) — listening for remaining frames...`
          );
          return;
        }
      } else {
        completedText = parsed.body;
      }

      if (!completedText) return;

      // Check if it's a compressed file payload: WVF::<filename>::<lzBase64>
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
          displayBody = `[Acoustic File: ${fileName}] (${new TextEncoder().encode(fileContent).length} bytes)`;
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
          source === 'microphone' ? 'Live Mic' : source === 'loopback' ? 'WASM Loopback' : 'WAV File'
        }) · CRC16 ${packet.crc}`
      );
      if (onPacketDecoded) {
        onPacketDecoded(packet);
      }
    },
    [activeProtocolSpec.shortLabel, onPacketDecoded]
  );

  // Real-time Canvas Visualizer Loop (Spectrum / Waterfall / Waveform)
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

      // Subtle background grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += width / 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += height / 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (analyser && activeAudio) {
        analyser.getByteFrequencyData(freqBins);
        analyser.getFloatTimeDomainData(timeDomain);

        // Compute RMS dBFS and peak frequency bin
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
        syntheticPhase += 0.035;
        for (let i = 0; i < freqBins.length; i++) {
          const idleWave = Math.sin(i * 0.08 + syntheticPhase) * 6 + 8;
          freqBins[i] = Math.max(2, Math.round(idleWave));
        }
        for (let i = 0; i < timeDomain.length; i++) {
          timeDomain[i] = Math.sin(i * 0.04 + syntheticPhase) * 0.03;
        }
      }

      if (visualizerMode === 'spectrum') {
        // Highlight active carrier frequency band (out of 0..24000 Hz Nyquist)
        const nyquist = 24000;
        const startX = (activeProtocolSpec.baseFreqHz / nyquist) * width;
        const bandW = (activeProtocolSpec.bandwidthHz / nyquist) * width;

        ctx.fillStyle =
          activeProtocolSpec.band === 'ultrasound'
            ? 'rgba(139, 92, 246, 0.14)'
            : activeProtocolSpec.band === 'dualtone'
            ? 'rgba(245, 158, 11, 0.14)'
            : 'rgba(16, 185, 129, 0.14)';
        ctx.fillRect(startX, 0, bandW, height);

        ctx.strokeStyle =
          activeProtocolSpec.band === 'ultrasound'
            ? 'rgba(167, 139, 250, 0.45)'
            : activeProtocolSpec.band === 'dualtone'
            ? 'rgba(251, 191, 36, 0.45)'
            : 'rgba(52, 211, 153, 0.45)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.moveTo(startX + bandW, 0);
        ctx.lineTo(startX + bandW, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw FFT bars
        const barCount = 96;
        const barWidth = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const binIdx = Math.floor((i / barCount) * (freqBins.length * 0.9));
          const val = freqBins[binIdx] / 255;
          const barH = Math.max(3, val * (height - 18));
          const x = i * barWidth;
          const y = height - barH;

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
            : 'rgba(96, 165, 250, 0.55)';

          ctx.beginPath();
          ctx.roundRect(x + 1, y, Math.max(2, barWidth - 2), barH, 3);
          ctx.fill();
        }
      } else if (visualizerMode === 'waterfall') {
        const off = waterfallOffscreenRef.current;
        if (off) {
          const offCtx = off.getContext('2d');
          if (offCtx) {
            // Shift existing waterfall down by 2px
            offCtx.drawImage(off, 0, 2);
            // Draw newest frequency row at y = 0..2
            for (let x = 0; x < off.width; x++) {
              const binIdx = Math.floor((x / off.width) * (freqBins.length * 0.9));
              const v = freqBins[binIdx];
              const r = v > 160 ? 255 : v > 90 ? Math.round((v - 90) * 3.2) : 12;
              const g = v > 60 ? Math.min(255, Math.round(v * 1.15)) : Math.round(v * 0.4);
              const b = v > 180 ? 220 : Math.min(255, 40 + v);
              offCtx.fillStyle = `rgb(${r},${g},${b})`;
              offCtx.fillRect(x, 0, 1, 2);
            }
            ctx.drawImage(off, 0, 0, width, height);
          }
        }
      } else {
        // Time-domain Oscilloscope Waveform
        ctx.lineWidth = 2.2;
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

  // Stop any active audio playback
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

  // Broadcast Sound Wave through Speakers (supports single or multi-frame packets)
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

      // Encode all frames into a single contiguous Float32Array with a 180ms inter-frame guard interval
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
        offset += encodedFrames[i].samples.length + (i < encodedFrames.length - 1 ? guardSamples : 0);
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
        `Broadcasting ${frames.length} acoustic frame${frames.length > 1 ? 's' : ''} (${totalDurationSec}s) via ${activeProtocolSpec.label}`
      );
    } catch (err: any) {
      setIsTransmitting(false);
      setTxProgress(null);
      setStatusBannerMsg(`Transmit error: ${err?.message || 'Failed to modulate audio'}`);
    }
  };

  // Instant Acoustic Loopback Verification (Encodes with ggwave WASM -> Plays -> Decodes via ggwave WASM)
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

        // Play short preview through analyser so user sees & hears the real FSK burst
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

        // Decode the generated Float32Array waveform directly through the ggwave WASM Rx engine
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

  // Export modulated .wav audio file
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

      const fileName = `waver-${selectedProtocol.toLowerCase()}-${Date.now().toString().slice(-5)}.wav`;
      const url = URL.createObjectURL(encoded.wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Also persist to Offline Sandbox CacheStorage
      try {
        const wavFile = new File([encoded.wavBlob], fileName, { type: 'audio/wav' });
        await cacheStorageManager.saveFile(wavFile);
        if (onCacheUpdated) onCacheUpdated();
      } catch {
        // Ignore storage quota errors
      }

      setStatusBannerMsg(`Exported 48kHz 16-bit PCM WAV (${encoded.durationSeconds}s) & cached offline.`);
    } catch (err: any) {
      setStatusBannerMsg(`WAV export failed: ${err?.message}`);
    }
  };

  // Start / Stop Live Microphone Acoustic Receiver
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
      setStatusBannerMsg('Acoustic microphone listener stopped.');
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

      // Critical Waver requirement: disable browser echoCancellation, noiseSuppression, and autoGainControl
      // so WebRTC voice filters do not attenuate FSK multi-tones or 15-19.5 kHz ultrasonic frequencies!
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
      setStatusBannerMsg(
        'Listening at 48,000 Hz raw PCM (DSP filters bypassed for Audible + Ultrasonic FSK)...'
      );
    } catch (err: any) {
      setRxError(
        err?.message ||
          'Microphone permission denied. Use "Acoustic Loopback" or "Decode .WAV File" to test offline!'
      );
      setIsListening(false);
    }
  };

  // Attach small file to encode into sound waves
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

  // Decode an uploaded .wav or audio file 100% offline via ggwave WASM
  const handleDecodeUploadedWav = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const arrayBuf = await file.arrayBuffer();
      const audioCtx = ensureAudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
      const channelData = audioBuffer.getChannelData(0);

      // Resample to 48000 Hz if needed
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
    <div className="space-y-4">
      {/* Instant WebAssembly Engine & 100% Offline Memory Status Bar */}
      <div className="m3-card p-3.5 sm:p-4 border border-[var(--md-sys-color-outline-variant)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: 'var(--md-sys-color-primary-container)',
                color: 'var(--md-sys-color-on-primary-container)',
              }}
            >
              <MaterialSymbol name="memory" filled className="text-xl" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">
                  Waver Acoustic FSK Transceiver
                </h2>
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: engineStatus.ready
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'var(--md-sys-color-surface-container-highest)',
                    color: engineStatus.ready
                      ? 'var(--md-sys-color-on-secondary-container)'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  {engineStatus.ready
                    ? `WASM Cached in RAM (${engineStatus.initTimeMs}ms)`
                    : 'Initializing WASM...'}
                </span>
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: 'var(--md-sys-color-tertiary-container)',
                    color: 'var(--md-sys-color-on-tertiary-container)',
                  }}
                >
                  100% Offline Air-Gapped
                </span>
              </div>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                {engineStatus.engineVersion} · {engineStatus.sampleRate.toLocaleString()} Hz Float32 DSP ·{' '}
                {engineStatus.cachedInStorage ? 'Persisted in CacheStorage' : 'In-Memory Standalone'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => wavDecodeInputRef.current?.click()}
              className="m3-btn-tonal px-3 py-2 text-xs font-semibold flex items-center gap-1.5"
              title="Decode a recorded .wav audio file offline"
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
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                  : 'm3-btn-filled'
              }`}
            >
              <MaterialSymbol name={isListening ? 'mic_off' : 'mic'} filled className="text-sm" />
              <span>{isListening ? 'Stop Listening' : 'Listen (Mic Rx)'}</span>
            </button>
          </div>
        </div>

        {statusBannerMsg && (
          <div
            className="mt-3 px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2"
            style={{
              background: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <MaterialSymbol
                name="graphic_eq"
                className="text-sm text-[var(--md-sys-color-primary)] shrink-0"
              />
              <span className="truncate">{statusBannerMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBannerMsg(null)}
              className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] shrink-0 cursor-pointer"
            >
              <MaterialSymbol name="close" className="text-xs" />
            </button>
          </div>
        )}

        {rxError && (
          <div className="mt-3 px-3 py-2 rounded-xl text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-between gap-2">
            <span>{rxError}</span>
            <button
              type="button"
              onClick={() => setRxError(null)}
              className="text-amber-200 hover:text-white cursor-pointer"
            >
              <MaterialSymbol name="close" className="text-xs" />
            </button>
          </div>
        )}
      </div>

      {/* Real-Time Acoustic Visualizer (Spectrum / Waterfall / Waveform) */}
      <div className="m3-card-xl p-4 border border-[var(--md-sys-color-outline-variant)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <MaterialSymbol
              name="waves"
              className="text-lg text-[var(--md-sys-color-primary)]"
            />
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                Real-Time Acoustic Spectrum & FSK Carrier Monitor
              </h3>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                Active Band: <strong className="text-[var(--md-sys-color-primary)]">{activeProtocolSpec.freqRange}</strong> ({activeProtocolSpec.shortLabel}) · Peak: {dominantFreqHz > 0 ? `${dominantFreqHz} Hz` : 'Idle'} · Level: {liveRmsDb} dBFS
              </p>
            </div>
          </div>

          <div
            className="inline-flex p-1 rounded-xl gap-1"
            style={{ background: 'var(--md-sys-color-surface-container-highest)' }}
          >
            {(
              [
                { id: 'spectrum', label: 'FFT Spectrum', icon: 'equalizer' },
                { id: 'waterfall', label: 'Waterfall', icon: 'waves' },
                { id: 'waveform', label: 'Oscilloscope', icon: 'activity' },
              ] as const
            ).map((mode) => {
              const active = visualizerMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setVisualizerMode(mode.id)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                  style={{
                    background: active ? 'var(--md-sys-color-primary)' : 'transparent',
                    color: active
                      ? 'var(--md-sys-color-on-primary)'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  <MaterialSymbol name={mode.icon} className="text-xs" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="relative rounded-2xl overflow-hidden border border-[var(--md-sys-color-outline-variant)]"
          style={{ background: 'var(--md-sys-color-surface-container-lowest)' }}
        >
          <canvas
            ref={canvasRef}
            width={720}
            height={176}
            className="w-full h-40 sm:h-44 block"
          />

          {/* Frequency Axis Markers */}
          <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)] border-t border-[var(--md-sys-color-outline-variant)]/50">
            <span>0 Hz</span>
            <span className="text-emerald-400">1.8–6.3 kHz (Audible FSK)</span>
            <span>12.0 kHz</span>
            <span className="text-violet-400">15.0–19.5 kHz (Ultrasonic)</span>
            <span>24.0 kHz</span>
          </div>
        </div>
      </div>

      {/* Main Split Grid: Left = Waver Transmitter (Tx), Right = Waver Receiver (Rx) & Protocol Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Transmitter Studio (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="m3-card-xl p-4 sm:p-5 border border-[var(--md-sys-color-outline-variant)] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                  }}
                >
                  <MaterialSymbol name="volume_up" filled className="text-lg" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                    Acoustic Wave Transmitter (Tx)
                  </h3>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    Modulate text, JSON, or compressed files into multi-tone FSK sound waves
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="m3-btn-tonal px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1"
                  title="Compress & pack a small file into acoustic frames"
                >
                  <MaterialSymbol name="upload_file" className="text-xs" />
                  <span>File to Sound</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleAttachFileForSound}
                  className="hidden"
                />
              </div>
            </div>

            {/* Protocol Band Grid */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mb-2">
                Modulation Protocol ({activeProtocolSpec.eccOverhead} · ~{activeProtocolSpec.speedBytesPerSec} B/s)
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {WAVER_PROTOCOLS.map((proto) => {
                  const selected = proto.key === selectedProtocol;
                  return (
                    <button
                      key={proto.key}
                      type="button"
                      onClick={() => setSelectedProtocol(proto.key)}
                      className="p-2.5 rounded-xl text-left border transition-all cursor-pointer"
                      style={{
                        background: selected
                          ? 'var(--md-sys-color-primary-container)'
                          : 'var(--md-sys-color-surface-container)',
                        color: selected
                          ? 'var(--md-sys-color-on-primary-container)'
                          : 'var(--md-sys-color-on-surface)',
                        borderColor: selected
                          ? 'var(--md-sys-color-primary)'
                          : 'var(--md-sys-color-outline-variant)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate">{proto.label}</span>
                        <span className="text-[10px] font-mono opacity-80 shrink-0">
                          {proto.speedBytesPerSec}B/s
                        </span>
                      </div>
                      <div className="text-[10px] opacity-75 truncate mt-0.5">
                        {proto.freqRange}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1.5">
                {activeProtocolSpec.description}
              </p>
            </div>

            {/* DSP Parameter Controls: Volume, Spread Spectrum (DSS), Payload Length */}
            <div
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-2xl border border-[var(--md-sys-color-outline-variant)]"
              style={{ background: 'var(--md-sys-color-surface-container)' }}
            >
              {/* Transmit Gain */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">Tx Gain</span>
                  <span className="font-mono text-[var(--md-sys-color-primary)]">{txVolume}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={txVolume}
                  onChange={(e) => setTxVolume(Number(e.target.value))}
                  className="w-full accent-[var(--md-sys-color-primary)] cursor-pointer"
                />
              </div>

              {/* Direct Sequence Spread Spectrum (DSS) */}
              <div className="flex flex-col justify-between">
                <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  Spread Spectrum (DSS)
                </span>
                <button
                  type="button"
                  onClick={() => setUseDSS((v) => !v)}
                  className="mt-1 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between border transition-all cursor-pointer"
                  style={{
                    background: useDSS
                      ? 'var(--md-sys-color-tertiary-container)'
                      : 'var(--md-sys-color-surface-container-high)',
                    color: useDSS
                      ? 'var(--md-sys-color-on-tertiary-container)'
                      : 'var(--md-sys-color-on-surface-variant)',
                    borderColor: useDSS
                      ? 'var(--md-sys-color-tertiary)'
                      : 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <span>{useDSS ? 'DSS Enabled' : 'Standard FSK'}</span>
                  <MaterialSymbol name={useDSS ? 'check_circle' : 'tune'} className="text-xs" />
                </button>
              </div>

              {/* Fixed vs Variable Payload Length */}
              <div className="flex flex-col justify-between">
                <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                  Frame Mode
                </span>
                <select
                  value={fixedPayloadLength}
                  onChange={(e) => setFixedPayloadLength(Number(e.target.value))}
                  className="mt-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
                >
                  <option value={-1}>Variable (Auto Multi-Frame)</option>
                  <option value={16}>Fixed 16 Bytes (No Markers)</option>
                  <option value={32}>Fixed 32 Bytes (No Markers)</option>
                  <option value={64}>Fixed 64 Bytes (No Markers)</option>
                </select>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] mr-1">
                Presets:
              </span>
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setPayloadText(preset.text);
                    setAttachedFileName(null);
                  }}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 border border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-primary)] transition-colors cursor-pointer"
                  style={{
                    background: 'var(--md-sys-color-surface-container)',
                    color: 'var(--md-sys-color-on-surface)',
                  }}
                >
                  <MaterialSymbol name={preset.icon} className="text-xs text-[var(--md-sys-color-primary)]" />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>

            {/* Payload Textarea */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-[var(--md-sys-color-on-surface)]">
                  Acoustic Payload {attachedFileName ? `(File: ${attachedFileName})` : ''}
                </span>
                <span className="font-mono text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  {payloadByteCount} bytes · {estimatedFrameCount} frame{estimatedFrameCount > 1 ? 's' : ''} · CRC16{' '}
                  {crc16Hex(payloadText || '')}
                </span>
              </div>
              <textarea
                rows={3}
                value={payloadText}
                onChange={(e) => {
                  setPayloadText(e.target.value);
                  setAttachedFileName(null);
                }}
                placeholder="Enter text, JSON, coordinates, or cryptographic key to modulate into sound waves..."
                className="w-full rounded-2xl p-3 text-xs sm:text-sm font-mono border border-[var(--md-sys-color-outline-variant)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
                style={{
                  background: 'var(--md-sys-color-surface-container-lowest)',
                  color: 'var(--md-sys-color-on-surface)',
                }}
              />
            </div>

            {/* Action Buttons: Broadcast Sound Wave, Loopback Test, Export WAV */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleTransmitSoundWave}
                disabled={!engineStatus.ready || !payloadText.trim()}
                className={`flex-1 min-w-[180px] py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isTransmitting
                    ? 'bg-rose-500 text-white'
                    : 'm3-btn-filled'
                }`}
              >
                <MaterialSymbol
                  name={isTransmitting ? 'stop' : 'surround_sound'}
                  filled
                  className="text-base"
                />
                <span>
                  {isTransmitting
                    ? txProgress
                      ? `Broadcasting (${txProgress.durationSec}s)... Stop`
                      : 'Stop Broadcast'
                    : 'Broadcast Sound Wave'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleAcousticLoopbackTest}
                disabled={!engineStatus.ready || !payloadText.trim() || isTransmitting}
                className="m3-btn-tonal py-3 px-3.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Modulate and immediately decode through the ggwave WASM engine in memory"
              >
                <MaterialSymbol name="repeat" className="text-sm" />
                <span>WASM Loopback Test</span>
              </button>

              <button
                type="button"
                onClick={handleExportWavFile}
                disabled={!engineStatus.ready || !payloadText.trim()}
                className="m3-btn-tonal py-3 px-3.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Export 48kHz 16-bit PCM .WAV audio file"
              >
                <MaterialSymbol name="download" className="text-sm" />
                <span>Export .WAV</span>
              </button>
            </div>

            {lastEncodedInfo && (
              <div
                className="px-3.5 py-2.5 rounded-xl text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 border border-[var(--md-sys-color-outline-variant)]"
                style={{
                  background: 'var(--md-sys-color-surface-container)',
                  color: 'var(--md-sys-color-on-surface-variant)',
                }}
              >
                <span>
                  Last Waveform: <strong>{lastEncodedInfo.durationSeconds}s</strong> @ 48,000 Hz
                </span>
                <span>
                  Payload: <strong>{lastEncodedInfo.byteLength}B</strong> ({lastEncodedInfo.frameCount} frame
                  {lastEncodedInfo.frameCount > 1 ? 's' : ''})
                </span>
                <span>
                  Peak: <strong>{lastEncodedInfo.peakAmplitude}</strong> F32
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Receiver (Rx) Console & Decoded Payloads (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="m3-card-xl p-4 sm:p-5 border border-[var(--md-sys-color-outline-variant)] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    background: isListening
                      ? 'rgba(244, 63, 94, 0.2)'
                      : 'var(--md-sys-color-secondary-container)',
                    color: isListening
                      ? '#FB7185'
                      : 'var(--md-sys-color-on-secondary-container)',
                  }}
                >
                  <MaterialSymbol name="hearing" filled className="text-lg" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                    Acoustic Receiver (Rx) Log
                  </h3>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    {isListening
                      ? 'Live 48kHz microphone capture active'
                      : 'Ready for live mic, WASM loopback, or .WAV file'}
                  </p>
                </div>
              </div>

              {decodedPackets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDecodedPackets([])}
                  className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                >
                  <MaterialSymbol name="delete_sweep" className="text-sm" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Rx Band Filter Toggles */}
            <div
              className="p-2.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] flex items-center justify-between gap-2"
              style={{ background: 'var(--md-sys-color-surface-container)' }}
            >
              <span className="text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] pl-1">
                Rx Bands:
              </span>
              <div className="flex items-center gap-1.5">
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
                    className="px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer"
                    style={{
                      background: band.active
                        ? 'var(--md-sys-color-secondary-container)'
                        : 'transparent',
                      color: band.active
                        ? 'var(--md-sys-color-on-secondary-container)'
                        : 'var(--md-sys-color-on-surface-variant)',
                      borderColor: band.active
                        ? 'var(--md-sys-color-secondary)'
                        : 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    {band.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-Frame Reassembly Progress Indicator */}
            {partialFrameStatus && (
              <div
                className="p-3 rounded-2xl border border-[var(--md-sys-color-primary)] text-xs space-y-1.5"
                style={{ background: 'var(--md-sys-color-primary-container)' }}
              >
                <div className="flex items-center justify-between font-bold text-[var(--md-sys-color-on-primary-container)]">
                  <span>Reassembling Multi-Frame Stream (CRC {partialFrameStatus.crc})</span>
                  <span>
                    {partialFrameStatus.received}/{partialFrameStatus.total} Frames
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-black/20 overflow-hidden">
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

            {/* Decoded Packets List */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {decodedPackets.length === 0 ? (
                <div
                  className="p-6 rounded-2xl border border-dashed border-[var(--md-sys-color-outline-variant)] text-center space-y-2"
                  style={{ background: 'var(--md-sys-color-surface-container-low)' }}
                >
                  <div className="w-10 h-10 rounded-2xl mx-auto flex items-center justify-center bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-primary)]">
                    <MaterialSymbol name="graphic_eq" className="text-xl" />
                  </div>
                  <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                    No Acoustic Frames Decoded Yet
                  </p>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] max-w-xs mx-auto">
                    Click <strong>WASM Loopback Test</strong> to verify end-to-end FSK modulation & Reed-Solomon decoding right now, or enable <strong>Listen (Mic Rx)</strong>.
                  </p>
                </div>
              ) : (
                decodedPackets.map((pkt) => (
                  <div
                    key={pkt.id}
                    className="p-3.5 rounded-2xl border border-[var(--md-sys-color-outline-variant)] space-y-2"
                    style={{ background: 'var(--md-sys-color-surface-container)' }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                          style={{
                            background: 'var(--md-sys-color-primary-container)',
                            color: 'var(--md-sys-color-on-primary-container)',
                          }}
                        >
                          {pkt.source === 'microphone'
                            ? 'Live Mic'
                            : pkt.source === 'loopback'
                            ? 'WASM Loopback'
                            : 'WAV File'}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                          {pkt.byteLength}B · CRC {pkt.crc}
                        </span>
                        {pkt.frameInfo && (
                          <span className="text-[10px] font-semibold text-emerald-400">
                            · {pkt.frameInfo}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                        {new Date(pkt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div
                      className="p-2.5 rounded-xl font-mono text-xs break-all border border-[var(--md-sys-color-outline-variant)]/60"
                      style={{
                        background: 'var(--md-sys-color-surface-container-lowest)',
                        color: 'var(--md-sys-color-on-surface)',
                      }}
                    >
                      {pkt.isFilePayload && pkt.fileContent ? pkt.fileContent : pkt.text}
                    </div>

                    <div className="flex items-center justify-end gap-2">
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
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold m3-btn-tonal flex items-center gap-1 cursor-pointer"
                        >
                          <MaterialSymbol name="download" className="text-xs" />
                          <span>Save {pkt.fileName}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setPayloadText(pkt.fileContent || pkt.text);
                          setStatusBannerMsg('Loaded decoded payload into Transmitter composer.');
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-primary)] flex items-center gap-1 cursor-pointer"
                        style={{ color: 'var(--md-sys-color-on-surface)' }}
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
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold m3-btn-tonal flex items-center gap-1 cursor-pointer"
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
    </div>
  );
};
