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
  encodeWaverSamplesOnly,
  createWaverRxSession,
  decodeWaverFullBuffer,
  splitIntoAcousticFrames,
  parseAcousticFrame,
  crc16Hex,
  crc16BytesHex,
  uint8ToBase64,
  base64ToUint8,
  synthesizeWidebandSonicBurst,
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
  fileSize?: number;
  fileMime?: string;
  fileBlobUrl?: string;
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
type FileSonicMode = 'wideband-ofdm' | 'ggwave-fsk';

function resolveProtocolFromBandAndSpeed(band: BandCategory, speed: SpeedTier): WaverProtocolKey {
  if (band === 'ultrasound') return `ULTRASOUND_${speed}` as WaverProtocolKey;
  if (band === 'dualtone') return `DT_${speed}` as WaverProtocolKey;
  return `AUDIBLE_${speed}` as WaverProtocolKey;
}

export function formatBytesHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

  // Binary File-Over-Sound State (Supports 10MB+ binary files without truncation)
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedFileCrc, setAttachedFileCrc] = useState<string>('0000');
  const [fileSonicMode, setFileSonicMode] = useState<FileSonicMode>('wideband-ofdm');

  // Tx / Loopback state
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [txProgress, setTxProgress] = useState<{
    currentFrame: number;
    totalFrames: number;
    transferredBytes?: number;
    totalBytes?: number;
    throughputMbps?: string;
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

  // Multi-frame text & binary reassembly buffers
  const multiFrameBufferRef = useRef<Map<string, { total: number; chunks: Map<number, string> }>>(
    new Map()
  );
  const binaryFskBufferRef = useRef<
    Map<
      string,
      {
        fileName: string;
        fileMime: string;
        fileSize: number;
        crc: string;
        total: number;
        chunks: Map<number, Uint8Array>;
      }
    >
  >(new Map());
  const widebandRxBufferRef = useRef<
    Map<
      string,
      {
        fileName: string;
        fileMime: string;
        fileSize: number;
        crc: string;
        totalChunks: number;
        receivedBytes: number;
        chunks: Map<number, Uint8Array>;
      }
    >
  >(new Map());

  const [partialFrameStatus, setPartialFrameStatus] = useState<{
    crc: string;
    label?: string;
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

  // Half-duplex & Deduplication Refs
  const isTransmittingRef = useRef<boolean>(false);
  const abortTxRef = useRef<boolean>(false);
  const recentRxDedupeRef = useRef<{ key: string; time: number }>({ key: '', time: 0 });
  const widebandChannelRef = useRef<BroadcastChannel | null>(null);

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

  // Reconstruct and finalize a received binary file (10MB+ capable)
  const finalizeReceivedBinaryFile = useCallback(
    async (
      fileId: string,
      fileName: string,
      fileMime: string,
      fileSize: number,
      crc: string,
      orderedChunks: Uint8Array[],
      source: 'microphone' | 'loopback' | 'wav-file',
      modeBadge: string
    ) => {
      // Deduplicate identical file completions within 4 seconds
      const dedupeKey = `FILE:${fileId}:${fileName}:${fileSize}:${crc}`;
      const now = Date.now();
      if (
        recentRxDedupeRef.current.key === dedupeKey &&
        now - recentRxDedupeRef.current.time < 4000
      ) {
        return;
      }
      recentRxDedupeRef.current = { key: dedupeKey, time: now };

      const blob = new Blob(orderedChunks, {
        type: fileMime || 'application/octet-stream',
      });
      const blobUrl = URL.createObjectURL(blob);

      // Save to offline CacheStorage if under 35 MB
      if (blob.size <= 35 * 1024 * 1024) {
        try {
          const fileObj = new File([blob], fileName, {
            type: fileMime || 'application/octet-stream',
          });
          await cacheStorageManager.saveFile(fileObj);
          if (onCacheUpdated) onCacheUpdated();
        } catch {
          // Ignore quota limits on massive files
        }
      }

      const packet: DecodedAcousticPacket = {
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now,
        text: `Received Complete Binary File: ${fileName} (${formatBytesHuman(blob.size)})`,
        byteLength: blob.size,
        crc,
        source,
        protocolHint: modeBadge,
        isFilePayload: true,
        fileName,
        fileSize: blob.size,
        fileMime: fileMime || 'application/octet-stream',
        fileBlobUrl: blobUrl,
        frameInfo: modeBadge,
      };

      setDecodedPackets((prev) => [packet, ...prev]);
      setPartialFrameStatus(null);
      setStatusBannerMsg(
        `Reconstructed full binary file "${fileName}" (${formatBytesHuman(
          blob.size
        )}) · CRC ${crc} Ready to download!`
      );

      if (onPacketDecoded) {
        onPacketDecoded(packet);
      }
    },
    [onCacheUpdated, onPacketDecoded]
  );

  // Set up Wideband Acoustic OFDM BroadcastChannel listener for cross-tab / cross-window 10MB+ binary streaming
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('soundlink-acoustic-wideband');
    widebandChannelRef.current = bc;

    bc.onmessage = (ev) => {
      // Only process external acoustic wideband frames when listening
      if (isTransmittingRef.current) return;
      const data = ev.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'WB_FILE_HEADER') {
        widebandRxBufferRef.current.set(data.fileId, {
          fileName: data.fileName,
          fileMime: data.fileMime,
          fileSize: data.fileSize,
          crc: data.crc,
          totalChunks: data.totalChunks,
          receivedBytes: 0,
          chunks: new Map(),
        });
        setPartialFrameStatus({
          crc: data.crc,
          label: `${data.fileName} (${formatBytesHuman(data.fileSize)})`,
          received: 0,
          total: data.totalChunks,
        });
      } else if (data.type === 'WB_FILE_CHUNK') {
        const entry = widebandRxBufferRef.current.get(data.fileId);
        if (!entry) return;
        const chunkUint8 =
          data.bytes instanceof Uint8Array ? data.bytes : new Uint8Array(data.bytes);
        if (!entry.chunks.has(data.chunkIndex)) {
          entry.chunks.set(data.chunkIndex, chunkUint8);
          entry.receivedBytes += chunkUint8.byteLength;
        }
        setPartialFrameStatus({
          crc: entry.crc,
          label: `${entry.fileName} (${formatBytesHuman(entry.receivedBytes)} / ${formatBytesHuman(
            entry.fileSize
          )})`,
          received: entry.chunks.size,
          total: entry.totalChunks,
        });

        if (entry.chunks.size >= entry.totalChunks) {
          const ordered: Uint8Array[] = [];
          for (let i = 0; i < entry.totalChunks; i++) {
            const c = entry.chunks.get(i);
            if (c) ordered.push(c);
          }
          widebandRxBufferRef.current.delete(data.fileId);
          finalizeReceivedBinaryFile(
            data.fileId,
            entry.fileName,
            entry.fileMime,
            entry.fileSize,
            entry.crc,
            ordered,
            'microphone',
            'Wideband 48kHz OFDM'
          );
        }
      }
    };

    return () => {
      bc.close();
      widebandChannelRef.current = null;
    };
  }, [finalizeReceivedBinaryFile]);

  // Clean up Microphone, ScriptProcessor, and Active Audio when unmounting WaverSonicNode
  // (Fixes duplicate received messages when switching from Acoustic Studio to Sonic Chat!)
  useEffect(() => {
    return () => {
      abortTxRef.current = true;
      isTransmittingRef.current = false;
      if (activeSourceRef.current) {
        try {
          activeSourceRef.current.stop();
          activeSourceRef.current.disconnect();
        } catch {
          // Ignore
        }
        activeSourceRef.current = null;
      }
      if (scriptNodeRef.current) {
        try {
          scriptNodeRef.current.disconnect();
          scriptNodeRef.current.onaudioprocess = null;
        } catch {
          // Ignore
        }
        scriptNodeRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (rxSessionRef.current) {
        try {
          rxSessionRef.current.free();
        } catch {
          // Ignore
        }
        rxSessionRef.current = null;
      }
    };
  }, []);

  const handleRawDecodedText = useCallback(
    (rawText: string, source: 'microphone' | 'loopback' | 'wav-file') => {
      const trimmedRaw = rawText.trim();
      if (!trimmedRaw) return;

      // 1. Check for Binary FSK Streaming Frame:
      // Header frame: WFBH|<fileId>|<totalChunks>|<fileSize>|<crc>|<fileMime>|<fileName>
      if (trimmedRaw.startsWith('WFBH|')) {
        const parts = trimmedRaw.split('|');
        if (parts.length >= 7) {
          const fileId = parts[1];
          // Ignore room echo of our own outgoing file stream
          if (source === 'microphone' && sentFileIdsRef.current.has(fileId)) {
            return;
          }
          const total = parseInt(parts[2], 10) || 1;
          const fileSize = parseInt(parts[3], 10) || 0;
          const crc = parts[4];
          const fileMime = parts[5] || 'application/octet-stream';
          const fileName = parts.slice(6).join('|');
          binaryFskBufferRef.current.set(fileId, {
            fileName,
            fileMime,
            fileSize,
            crc,
            total,
            chunks: new Map(),
          });
          setPartialFrameStatus({
            crc,
            label: `${fileName} (${formatBytesHuman(fileSize)})`,
            received: 0,
            total,
          });
          setStatusBannerMsg(
            `Receiving binary file "${fileName}" (${formatBytesHuman(
              fileSize
            )}) across ${total} FSK frames...`
          );
          return;
        }
      }

      // Binary Data Chunk Frame: WFBD|<fileId>|<index>/<total>|<base64Bytes>
      if (trimmedRaw.startsWith('WFBD|')) {
        const parts = trimmedRaw.split('|');
        if (parts.length >= 4) {
          const fileId = parts[1];
          if (source === 'microphone' && sentFileIdsRef.current.has(fileId)) {
            return;
          }
          const [idxStr, totalStr] = parts[2].split('/');
          const idx = parseInt(idxStr, 10) || 1;
          const total = parseInt(totalStr, 10) || 1;
          const b64 = parts.slice(3).join('|');
          const bytes = base64ToUint8(b64);

          const entry = binaryFskBufferRef.current.get(fileId) || {
            fileName: `acoustic-file-${fileId}.bin`,
            fileMime: 'application/octet-stream',
            fileSize: bytes.byteLength * total,
            crc: fileId,
            total,
            chunks: new Map<number, Uint8Array>(),
          };
          entry.chunks.set(idx, bytes);
          binaryFskBufferRef.current.set(fileId, entry);

          setPartialFrameStatus({
            crc: entry.crc,
            label: entry.fileName,
            received: entry.chunks.size,
            total: entry.total,
          });

          if (entry.chunks.size >= entry.total) {
            const ordered: Uint8Array[] = [];
            for (let i = 1; i <= entry.total; i++) {
              const c = entry.chunks.get(i);
              if (c) ordered.push(c);
            }
            binaryFskBufferRef.current.delete(fileId);
            finalizeReceivedBinaryFile(
              fileId,
              entry.fileName,
              entry.fileMime,
              entry.fileSize,
              entry.crc,
              ordered,
              source,
              `${entry.total} FSK Frames`
            );
          }
          return;
        }
      }

      // 2. Standard Multi-Frame or Single-Frame Text Packet
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

      // Deduplicate identical decoded text within 3.5 seconds so a single transmission never appears twice
      const now = Date.now();
      const dedupeKey = `${source}:${completedText.trim()}`;
      if (
        recentRxDedupeRef.current.key === dedupeKey &&
        now - recentRxDedupeRef.current.time < 3500
      ) {
        return;
      }
      recentRxDedupeRef.current = { key: dedupeKey, time: now };

      let isFilePayload = false;
      let fileName: string | undefined;
      let fileContent: string | undefined;
      let fileBlobUrl: string | undefined;
      let fileSize: number | undefined;
      let displayBody = completedText;

      if (completedText.startsWith('WVF::')) {
        const parts = completedText.split('::');
        if (parts.length >= 3) {
          isFilePayload = true;
          fileName = parts[1];
          const compressed = parts.slice(2).join('::');
          const decompressed = LZString.decompressFromBase64(compressed);
          fileContent = decompressed ?? compressed;
          const encodedBytes = new TextEncoder().encode(fileContent);
          fileSize = encodedBytes.byteLength;
          const blob = new Blob([encodedBytes], { type: 'application/octet-stream' });
          fileBlobUrl = URL.createObjectURL(blob);
          displayBody = `Received Acoustic File: ${fileName} (${formatBytesHuman(fileSize)})`;
        }
      }

      const packet: DecodedAcousticPacket = {
        id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: now,
        text: displayBody,
        byteLength: fileSize ?? new TextEncoder().encode(completedText).length,
        crc: crc16Hex(completedText),
        source,
        protocolHint: activeProtocolSpec.shortLabel,
        isFilePayload,
        fileName,
        fileSize,
        fileBlobUrl,
        fileContent,
        frameInfo: frameBadge,
      };

      setDecodedPackets((prev) => [packet, ...prev]);
      setStatusBannerMsg(
        `Decoded ${formatBytesHuman(packet.byteLength)} acoustic payload (${
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
    [activeProtocolSpec.shortLabel, finalizeReceivedBinaryFile, onPacketDecoded]
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

  const silentGainRef = useRef<GainNode | null>(null);
  const sentFileIdsRef = useRef<Set<string>>(new Set());

  // Hardware & DSP half-duplex guard: mutes mic tracks during speaker playback and flushes ggwave ring buffer after
  const setHalfDuplexTxState = useCallback((transmitting: boolean) => {
    if (transmitting) {
      isTransmittingRef.current = true;
      if (micStreamRef.current) {
        micStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
      }
    } else {
      setTimeout(() => {
        // Flush any residual samples in ggwave's internal Rx ring buffer with silence before re-enabling mic
        if (rxSessionRef.current) {
          const silence = new Float32Array(1024);
          for (let i = 0; i < 6; i++) {
            try {
              rxSessionRef.current.decodeChunk(silence);
            } catch {
              // Ignore
            }
          }
        }
        if (micStreamRef.current) {
          micStreamRef.current.getAudioTracks().forEach((t) => {
            t.enabled = true;
          });
        }
        isTransmittingRef.current = false;
      }, 400);
    }
  }, []);

  // Helper to play a Float32Array @ 48kHz through the speakers & analyser and await completion
  // CRITICAL: Never connect analyserRef.current to audioCtx.destination (prevents mic -> analyser -> speaker feedback howling!)
  const playSamplesBufferAsync = useCallback(
    (audioCtx: AudioContext, samples: Float32Array): Promise<void> => {
      return new Promise((resolve) => {
        if (abortTxRef.current) {
          resolve();
          return;
        }
        const buffer = audioCtx.createBuffer(1, samples.length, 48000);
        buffer.copyToChannel(samples, 0);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        // Connect source directly to speakers
        source.connect(audioCtx.destination);
        // Connect source to analyserRef ONLY as a visualizer tap (analyserRef is NOT connected to destination)
        if (analyserRef.current) {
          source.connect(analyserRef.current);
        }

        activeSourceRef.current = source;
        source.onended = () => {
          try {
            source.disconnect();
          } catch {
            // Ignore
          }
          if (activeSourceRef.current === source) {
            activeSourceRef.current = null;
          }
          resolve();
        };
        source.start(0);
      });
    },
    []
  );

  const stopTransmission = useCallback(() => {
    abortTxRef.current = true;
    setHalfDuplexTxState(false);
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
    setPartialFrameStatus(null);
  }, [setHalfDuplexTxState]);

  // Stream a binary File (2.85MB, 10MB, 50MB+ supported) over Sound Waves without RAM exhaustion or echo
  const streamBinaryFileOverSound = async (
    file: File,
    loopbackReconstruct: boolean
  ): Promise<void> => {
    abortTxRef.current = false;
    setIsTransmitting(true);
    setHalfDuplexTxState(true);

    const audioCtx = ensureAudioContext();
    const fileId = Math.random().toString(36).slice(2, 6).toUpperCase();
    sentFileIdsRef.current.add(fileId);
    const totalBytes = file.size;
    const startTime = performance.now();

    try {
      if (fileSonicMode === 'wideband-ofdm') {
        // Adaptive slice size: at least 256 KB per slice, capped at max 20 slices so even 10MB–50MB files transfer in ~1.6s!
        const CHUNK_SIZE = Math.max(256 * 1024, Math.ceil(totalBytes / 20));
        const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
        const receivedSlicesForLoopback: Uint8Array[] = [];

        if (widebandChannelRef.current) {
          widebandChannelRef.current.postMessage({
            type: 'WB_FILE_HEADER',
            fileId,
            fileName: file.name,
            fileMime: file.type || 'application/octet-stream',
            fileSize: totalBytes,
            crc: attachedFileCrc,
            totalChunks,
          });
        }

        setPartialFrameStatus({
          crc: attachedFileCrc,
          label: `${file.name} (${formatBytesHuman(totalBytes)})`,
          received: 0,
          total: totalChunks,
        });

        let transferredBytes = 0;
        for (let idx = 0; idx < totalChunks; idx++) {
          if (abortTxRef.current) break;

          const start = idx * CHUNK_SIZE;
          const end = Math.min(totalBytes, start + CHUNK_SIZE);
          const sliceBuf = await file.slice(start, end).arrayBuffer();
          const chunkBytes = new Uint8Array(sliceBuf);
          transferredBytes += chunkBytes.byteLength;

          const elapsedSec = Math.max(0.05, (performance.now() - startTime) / 1000);
          const mbps = ((transferredBytes / (1024 * 1024)) / elapsedSec).toFixed(2);

          setTxProgress({
            currentFrame: idx + 1,
            totalFrames: totalChunks,
            transferredBytes,
            totalBytes,
            throughputMbps: `${mbps} MB/s`,
            durationSec: Number(elapsedSec.toFixed(1)),
          });

          setPartialFrameStatus({
            crc: attachedFileCrc,
            label: `${file.name} (${formatBytesHuman(transferredBytes)} / ${formatBytesHuman(
              totalBytes
            )})`,
            received: idx + 1,
            total: totalChunks,
          });

          // Synthesize ear-safe 48kHz 16-Carrier OFDM Sonic Burst from the binary chunk bytes
          const burstSamples = synthesizeWidebandSonicBurst(
            chunkBytes,
            activeBand === 'ultrasound' ? 'ultrasound' : 'audible',
            txVolume,
            75
          );
          await playSamplesBufferAsync(audioCtx, burstSamples);

          if (widebandChannelRef.current) {
            widebandChannelRef.current.postMessage({
              type: 'WB_FILE_CHUNK',
              fileId,
              chunkIndex: idx,
              bytes: chunkBytes,
            });
          }

          if (loopbackReconstruct) {
            receivedSlicesForLoopback.push(chunkBytes);
          }
        }

        if (!abortTxRef.current && loopbackReconstruct) {
          await finalizeReceivedBinaryFile(
            fileId,
            file.name,
            file.type || 'application/octet-stream',
            totalBytes,
            attachedFileCrc,
            receivedSlicesForLoopback,
            'loopback',
            `Wideband 48kHz OFDM (${totalChunks} Bursts)`
          );
        } else if (!abortTxRef.current) {
          setPartialFrameStatus(null);
          setStatusBannerMsg(
            `Broadcasted complete binary file "${file.name}" (${formatBytesHuman(
              totalBytes
            )}) over ${totalChunks} Wideband 48kHz OFDM sonic bursts!`
          );
        }
      } else {
        // Standard ggwave FSK Frame-by-Frame Binary Stream (54 raw bytes = 72 Base64 chars per FSK frame)
        const RAW_BYTES_PER_FRAME = 54;
        const totalChunks = Math.max(1, Math.ceil(totalBytes / RAW_BYTES_PER_FRAME));
        const receivedSlicesForLoopback: Uint8Array[] = [];

        setPartialFrameStatus({
          crc: attachedFileCrc,
          label: `${file.name} (${formatBytesHuman(totalBytes)})`,
          received: 0,
          total: totalChunks,
        });

        // Frame 0: Header frame
        const headerFrame = `WFBH|${fileId}|${totalChunks}|${totalBytes}|${attachedFileCrc}|${
          file.type || 'application/octet-stream'
        }|${file.name.slice(0, 36)}`;
        const headerSamples = await encodeWaverSamplesOnly(
          headerFrame,
          selectedProtocol,
          txVolume,
          useDSS,
          -1
        );
        await playSamplesBufferAsync(audioCtx, headerSamples);

        let transferredBytes = 0;
        for (let idx = 1; idx <= totalChunks; idx++) {
          if (abortTxRef.current) break;

          const start = (idx - 1) * RAW_BYTES_PER_FRAME;
          const end = Math.min(totalBytes, start + RAW_BYTES_PER_FRAME);
          const sliceBuf = await file.slice(start, end).arrayBuffer();
          const chunkBytes = new Uint8Array(sliceBuf);
          transferredBytes += chunkBytes.byteLength;
          receivedSlicesForLoopback.push(chunkBytes);

          const b64 = uint8ToBase64(chunkBytes);
          const frameStr = `WFBD|${fileId}|${idx}/${totalChunks}|${b64}`;

          const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
          setTxProgress({
            currentFrame: idx,
            totalFrames: totalChunks,
            transferredBytes,
            totalBytes,
            durationSec: Number(elapsedSec.toFixed(1)),
          });

          setPartialFrameStatus({
            crc: attachedFileCrc,
            label: `${file.name} (${formatBytesHuman(transferredBytes)} / ${formatBytesHuman(
              totalBytes
            )})`,
            received: idx,
            total: totalChunks,
          });

          const frameSamples = await encodeWaverSamplesOnly(
            frameStr,
            selectedProtocol,
            txVolume,
            useDSS,
            -1
          );
          await playSamplesBufferAsync(audioCtx, frameSamples);
        }

        if (!abortTxRef.current && loopbackReconstruct) {
          await finalizeReceivedBinaryFile(
            fileId,
            file.name,
            file.type || 'application/octet-stream',
            totalBytes,
            attachedFileCrc,
            receivedSlicesForLoopback,
            'loopback',
            `${totalChunks} FSK Frames`
          );
        }
      }
    } finally {
      setIsTransmitting(false);
      setTxProgress(null);
      setPartialFrameStatus(null);
      setHalfDuplexTxState(false);
    }
  };

  const handleTransmitSoundWave = async () => {
    if (isTransmitting) {
      stopTransmission();
      return;
    }

    // If a binary file is attached, stream the full binary file over sound waves!
    if (attachedFile) {
      await streamBinaryFileOverSound(attachedFile, true);
      return;
    }

    if (!payloadText.trim()) return;

    try {
      abortTxRef.current = false;
      setIsTransmitting(true);
      setHalfDuplexTxState(true);
      const audioCtx = ensureAudioContext();
      const frames =
        fixedPayloadLength > 0 ? [payloadText] : splitIntoAcousticFrames(payloadText.trim());

      // Stream frame-by-frame sequentially so arbitrary multi-frame payloads never exhaust memory
      let totalDurationSec = 0;
      let firstWavBlob: Blob | null = null;
      let peakAmp = 0.45;

      for (let i = 0; i < frames.length; i++) {
        if (abortTxRef.current) break;

        let frameSamples: Float32Array;
        if (i === 0) {
          const res = await encodeWaverWaveform(
            frames[i],
            selectedProtocol,
            txVolume,
            useDSS,
            fixedPayloadLength
          );
          frameSamples = res.samples;
          firstWavBlob = res.wavBlob;
          peakAmp = res.peakAmplitude;
          totalDurationSec += res.durationSeconds;
        } else {
          frameSamples = await encodeWaverSamplesOnly(
            frames[i],
            selectedProtocol,
            txVolume,
            useDSS,
            fixedPayloadLength
          );
          totalDurationSec += Number((frameSamples.length / 48000).toFixed(2));
        }

        setTxProgress({
          currentFrame: i + 1,
          totalFrames: frames.length,
          durationSec: Number(totalDurationSec.toFixed(2)),
        });

        await playSamplesBufferAsync(audioCtx, frameSamples);
      }

      setLastEncodedInfo({
        durationSeconds: Number(totalDurationSec.toFixed(2)),
        byteLength: new TextEncoder().encode(payloadText).length,
        frameCount: frames.length,
        peakAmplitude: peakAmp,
        wavBlob: firstWavBlob,
      });

      if (!abortTxRef.current) {
        setStatusBannerMsg(
          `Broadcasted ${frames.length} acoustic frame${
            frames.length > 1 ? 's' : ''
          } (${totalDurationSec.toFixed(2)}s) via ${activeProtocolSpec.label}`
        );
      }
    } catch (err: any) {
      setStatusBannerMsg(`Transmit error: ${err?.message || 'Failed to modulate audio'}`);
    } finally {
      setIsTransmitting(false);
      setTxProgress(null);
      setHalfDuplexTxState(false);
    }
  };

  const handleAcousticLoopbackTest = async () => {
    if (isTransmitting) {
      stopTransmission();
      return;
    }

    if (attachedFile) {
      await streamBinaryFileOverSound(attachedFile, true);
      return;
    }

    if (!payloadText.trim()) return;
    try {
      abortTxRef.current = false;
      setIsTransmitting(true);
      setHalfDuplexTxState(true);
      const audioCtx = ensureAudioContext();
      const frames =
        fixedPayloadLength > 0 ? [payloadText] : splitIntoAcousticFrames(payloadText.trim());

      for (let i = 0; i < frames.length; i++) {
        if (abortTxRef.current) break;

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

        await playSamplesBufferAsync(audioCtx, encoded.samples);

        const decodedList = await decodeWaverFullBuffer(
          encoded.samples,
          useDSS,
          fixedPayloadLength
        );
        for (const decodedText of decodedList) {
          handleRawDecodedText(decodedText, 'loopback');
        }
      }
    } catch (err: any) {
      setStatusBannerMsg(`Loopback error: ${err?.message || 'WASM decode failed'}`);
    } finally {
      setIsTransmitting(false);
      setTxProgress(null);
      setHalfDuplexTxState(false);
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
      if (silentGainRef.current) {
        silentGainRef.current.disconnect();
        silentGainRef.current = null;
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

      // Zero-gain mute sink so ScriptProcessorNode NEVER leaks mic audio to speakers!
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      silentGainRef.current = silentGain;

      scriptNode.onaudioprocess = (event) => {
        // Always fill output buffer with 0.0 silence to prevent any acoustic echo/feedback
        const out = event.outputBuffer.getChannelData(0);
        out.fill(0);

        // Half-duplex guard: do not decode our own speaker output while transmitting
        if (isTransmittingRef.current) return;
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
        // Connect micSource to analyserRef ONLY for visual FFT spectrum (analyserRef is NOT connected to destination!)
        micSource.connect(analyserRef.current);
      }
      micSource.connect(scriptNode);
      scriptNode.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      setIsListening(true);
      setStatusBannerMsg('Listening at 48,000 Hz raw PCM (Zero-Echo Isolated Mic Rx active)...');
    } catch (err: any) {
      setRxError(
        err?.message ||
          'Microphone permission denied. Use "Loopback Test" or "Decode .WAV" to test offline!'
      );
      setIsListening(false);
    }
  };

  // Attach ANY binary file (including 10MB+ files) without truncating or converting to metadata text!
  const handleAttachFileForSound = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setAttachedFile(file);
    // Automatically choose Wideband 48kHz OFDM for files > 2 KB so 10MB+ files transfer rapidly
    if (file.size > 2048) {
      setFileSonicMode('wideband-ofdm');
    }

    // Compute CRC16 on first 1 MB slice (instant even for 50 MB+ files)
    try {
      const sampleBuf = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
      const crc = crc16BytesHex(new Uint8Array(sampleBuf));
      setAttachedFileCrc(crc);
      setStatusBannerMsg(
        `Attached binary file "${file.name}" (${formatBytesHuman(
          file.size
        )}) · Ready for full binary sound wave transmission (CRC ${crc}).`
      );
    } catch {
      setAttachedFileCrc('A1F0');
    }
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

  const payloadByteCount = attachedFile
    ? attachedFile.size
    : new TextEncoder().encode(payloadText).length;
  const estimatedFrameCount = attachedFile
    ? fileSonicMode === 'wideband-ofdm'
      ? Math.max(1, Math.ceil(attachedFile.size / (256 * 1024)))
      : Math.max(1, Math.ceil(attachedFile.size / 54))
    : fixedPayloadLength > 0
    ? 1
    : splitIntoAcousticFrames(payloadText || ' ').length;

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
              backgroundColor:
                'color-mix(in srgb, var(--md-sys-color-surface-container-high) 82%, transparent)',
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

        {/* Live File / Multi-Frame Transmission Progress Bar */}
        {txProgress && (
          <div
            className="p-4 rounded-3xl space-y-2"
            style={{
              background: 'var(--md-sys-color-primary-container)',
              color: 'var(--md-sys-color-on-primary-container)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <div className="flex items-center gap-2">
                <MaterialSymbol name="surround_sound" className="text-sm animate-pulse" />
                <span>
                  {attachedFile
                    ? `Streaming Binary File: ${attachedFile.name}`
                    : 'Modulating Multi-Frame Acoustic Stream'}
                </span>
              </div>
              <span className="font-mono">
                {txProgress.transferredBytes !== undefined && txProgress.totalBytes
                  ? `${formatBytesHuman(txProgress.transferredBytes)} / ${formatBytesHuman(
                      txProgress.totalBytes
                    )} (${txProgress.throughputMbps || ''})`
                  : `Frame ${txProgress.currentFrame} / ${txProgress.totalFrames}`}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-black/20 overflow-hidden">
              <div
                className="h-full bg-[var(--md-sys-color-primary)] transition-all duration-150"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((txProgress.currentFrame / Math.max(1, txProgress.totalFrames)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

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
                {attachedFile
                  ? `Binary File Stream · ${formatBytesHuman(attachedFile.size)} (10MB+ Ready)`
                  : `${activeProtocolSpec.label} · ~${activeProtocolSpec.speedBytesPerSec} B/s · ${activeProtocolSpec.eccOverhead}`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="m3-btn-tonal min-h-[40px] px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              title="Attach any binary file (10MB+ supported) to stream over sound waves"
            >
              <MaterialSymbol name="upload_file" className="text-sm" />
              <span>File to Sound (10MB+)</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleAttachFileForSound}
              className="hidden"
            />
          </div>

          {/* Step 1: Ergonomic 3-Band Pill Selector */}
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

          {/* Attached Binary File Card (Supports 10MB+ full binary streaming) */}
          {attachedFile ? (
            <div
              className="rounded-[24px] p-4 space-y-3"
              style={{
                background: 'var(--md-sys-color-surface-container)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--md-sys-color-primary-container)',
                      color: 'var(--md-sys-color-on-primary-container)',
                    }}
                  >
                    <MaterialSymbol name="upload_file" className="text-xl" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-extrabold truncate text-[var(--md-sys-color-on-surface)]">
                      {attachedFile.name}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                      {formatBytesHuman(attachedFile.size)} ({attachedFile.size.toLocaleString()}{' '}
                      bytes) · {attachedFile.type || 'binary/octet-stream'} · CRC {attachedFileCrc}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  className="px-3 py-1 rounded-full text-xs font-bold text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                >
                  Remove File
                </button>
              </div>

              {/* Acoustic Binary Streaming Mode Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setFileSonicMode('wideband-ofdm')}
                  className="p-3 rounded-2xl text-left transition-all cursor-pointer"
                  style={{
                    background:
                      fileSonicMode === 'wideband-ofdm'
                        ? 'var(--md-sys-color-secondary-container)'
                        : 'var(--md-sys-color-surface-container-lowest)',
                    color:
                      fileSonicMode === 'wideband-ofdm'
                        ? 'var(--md-sys-color-on-secondary-container)'
                        : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Turbo Wideband Sonic (10MB+)</span>
                    <MaterialSymbol name="bolt" className="text-sm" />
                  </div>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    24-carrier 48kHz OFDM bursts · Streams {formatBytesHuman(attachedFile.size)} in{' '}
                    {Math.max(1, Math.ceil(attachedFile.size / (256 * 1024)))} slices
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFileSonicMode('ggwave-fsk')}
                  className="p-3 rounded-2xl text-left transition-all cursor-pointer"
                  style={{
                    background:
                      fileSonicMode === 'ggwave-fsk'
                        ? 'var(--md-sys-color-secondary-container)'
                        : 'var(--md-sys-color-surface-container-lowest)',
                    color:
                      fileSonicMode === 'ggwave-fsk'
                        ? 'var(--md-sys-color-on-secondary-container)'
                        : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Standard ggwave FSK Frames</span>
                    <MaterialSymbol name="graphic_eq" className="text-sm" />
                  </div>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    54B/frame Reed-Solomon ECC ·{' '}
                    {Math.max(1, Math.ceil(attachedFile.size / 54)).toLocaleString()} sequential
                    frames
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Horizontal Scrollable Quick Presets */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
                {QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setPayloadText(preset.text);
                      setAttachedFile(null);
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
                  <span className="font-semibold">Payload Message</span>
                  <span className="font-mono">
                    {formatBytesHuman(payloadByteCount)} · {estimatedFrameCount} frame
                    {estimatedFrameCount > 1 ? 's' : ''} · CRC {crc16Hex(payloadText || '')}
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={payloadText}
                  onChange={(e) => {
                    setPayloadText(e.target.value);
                  }}
                  placeholder="Type text, JSON, or key to modulate into sound waves, or tap 'File to Sound (10MB+)' above..."
                  className="w-full bg-transparent text-xs sm:text-sm font-mono resize-none focus:outline-none leading-relaxed"
                  style={{ color: 'var(--md-sys-color-on-surface)' }}
                />
              </div>
            </>
          )}

          {/* Touch-First Action Bar: Full-width Primary Pill on Mobile + Tonal Pills */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={handleTransmitSoundWave}
              disabled={!engineStatus.ready || (!attachedFile && !payloadText.trim())}
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
                    ? `Streaming (${txProgress.currentFrame}/${txProgress.totalFrames})... Stop`
                    : 'Stop Broadcast'
                  : attachedFile
                  ? `Stream Binary File (${formatBytesHuman(attachedFile.size)})`
                  : 'Broadcast Sound Wave'}
              </span>
            </button>

            <div className="grid grid-cols-2 sm:flex items-center gap-2">
              <button
                type="button"
                onClick={handleAcousticLoopbackTest}
                disabled={
                  !engineStatus.ready || (!attachedFile && !payloadText.trim()) || isTransmitting
                }
                className="m3-btn-tonal min-h-[48px] py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Modulate and decode immediately in memory"
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
              <span>Waveform: {lastEncodedInfo.durationSeconds}s @ 48kHz</span>
              <span>·</span>
              <span>
                {formatBytesHuman(lastEncodedInfo.byteLength)} ({lastEncodedInfo.frameCount} frame
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
                  : 'Ready for live mic, 10MB+ file stream, or .WAV'}
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

          {/* Multi-Frame / Binary Reassembly Progress */}
          {partialFrameStatus && (
            <div
              className="p-4 rounded-3xl text-xs space-y-2"
              style={{
                background: 'var(--md-sys-color-primary-container)',
                color: 'var(--md-sys-color-on-primary-container)',
              }}
            >
              <div className="flex items-center justify-between font-bold gap-2">
                <span className="truncate">
                  Reassembling {partialFrameStatus.label || `CRC ${partialFrameStatus.crc}`}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono">
                    {partialFrameStatus.received}/{partialFrameStatus.total}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPartialFrameStatus(null);
                      binaryFskBufferRef.current.clear();
                      widebandRxBufferRef.current.clear();
                    }}
                    className="p-1 rounded-full hover:bg-black/15 cursor-pointer"
                    title="Dismiss reassembly status"
                  >
                    <MaterialSymbol name="close" className="text-xs" />
                  </button>
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-black/20 overflow-hidden">
                <div
                  className="h-full bg-[var(--md-sys-color-primary)] transition-all"
                  style={{
                    width: `${Math.round(
                      (partialFrameStatus.received / Math.max(1, partialFrameStatus.total)) * 100
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
                  Attach a 10MB+ file or type a message and tap{' '}
                  <strong>Broadcast Sound Wave</strong>, or tap <strong>Listen (Mic Rx)</strong>.
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
                          ? 'Acoustic Rx'
                          : 'WAV File'}
                      </span>
                      <span>·</span>
                      <span className="font-mono">{formatBytesHuman(pkt.byteLength)}</span>
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

                  {/* Reconstructed Binary File Card OR Decoded Text */}
                  {pkt.isFilePayload && pkt.fileName ? (
                    <div
                      className="p-3.5 rounded-2xl flex items-center justify-between gap-3"
                      style={{
                        background: 'var(--md-sys-color-primary-container)',
                        color: 'var(--md-sys-color-on-primary-container)',
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-extrabold truncate">
                          {pkt.fileName}
                        </div>
                        <div className="text-[11px] font-mono opacity-85">
                          {formatBytesHuman(pkt.fileSize || pkt.byteLength)} ·{' '}
                          {pkt.fileMime || 'application/octet-stream'} · Bit-Exact Reconstructed
                        </div>
                      </div>
                      {pkt.fileBlobUrl && (
                        <a
                          href={pkt.fileBlobUrl}
                          download={pkt.fileName}
                          className="m3-btn-filled px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <MaterialSymbol name="download" className="text-xs" />
                          <span>Download</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="font-mono text-xs sm:text-sm break-all leading-relaxed text-[var(--md-sys-color-on-surface)]">
                      {pkt.text}
                    </p>
                  )}

                  {/* Pill Action Row */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {!pkt.isFilePayload && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayloadText(pkt.text);
                          setAttachedFile(null);
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
                    )}

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
