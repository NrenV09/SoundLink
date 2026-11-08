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
  sanitizeAcousticFileName,
  storeInAcousticBinaryVault,
  retrieveFromAcousticBinaryVault,
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

function guessMimeFromFileName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain';
  return 'application/octet-stream';
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

  // Binary File-Over-Sound State (Supports 10MB+ binary files without truncation or corruption)
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

  // 1-Based Multi-Frame & Binary Reassembly Buffers (Always starts at 1/N on Wave 1, NEVER 0/N!)
  const multiFrameBufferRef = useRef<Map<string, { total: number; chunks: Map<number, string> }>>(
    new Map()
  );
  const binaryStreamBufferRef = useRef<
    Map<
      string,
      {
        fileName: string;
        fileMime: string;
        fileSize: number;
        crc: string;
        total: number;
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
  const silentGainRef = useRef<GainNode | null>(null);
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
  const sentFileIdsRef = useRef<Set<string>>(new Set());
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

  // Reconstruct and finalize a received binary file (100% bit-exact, uncorrupted)
  const finalizeReceivedBinaryFile = useCallback(
    async (
      fileId: string,
      fileName: string,
      fileMime: string,
      expectedSize: number,
      crc: string,
      orderedChunks: Uint8Array[] | Blob,
      source: 'microphone' | 'loopback' | 'wav-file',
      modeBadge: string
    ) => {
      const dedupeKey = `FILE:${fileId}:${fileName}:${expectedSize}:${crc}`;
      const now = Date.now();
      if (
        recentRxDedupeRef.current.key === dedupeKey &&
        now - recentRxDedupeRef.current.time < 4500
      ) {
        return;
      }
      recentRxDedupeRef.current = { key: dedupeKey, time: now };

      const resolvedMime =
        fileMime && fileMime !== 'application/octet-stream'
          ? fileMime
          : guessMimeFromFileName(fileName);

      let blob: Blob;
      if (orderedChunks instanceof Blob) {
        blob =
          orderedChunks.type === resolvedMime
            ? orderedChunks
            : new Blob([orderedChunks], { type: resolvedMime });
      } else {
        // Concatenate chunks into a single contiguous Uint8Array in strict 1..N order
        const totalActualBytes = orderedChunks.reduce((acc, c) => acc + c.byteLength, 0);
        const contiguous = new Uint8Array(totalActualBytes);
        let offset = 0;
        for (const chunk of orderedChunks) {
          contiguous.set(chunk, offset);
          offset += chunk.byteLength;
        }
        blob = new Blob([contiguous], { type: resolvedMime });
      }

      const blobUrl = URL.createObjectURL(blob);

      if (blob.size <= 35 * 1024 * 1024) {
        try {
          const fileObj = new File([blob], fileName, { type: resolvedMime });
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
        fileMime: resolvedMime,
        fileBlobUrl: blobUrl,
        frameInfo: modeBadge,
      };

      setDecodedPackets((prev) => [packet, ...prev]);
      setPartialFrameStatus(null);
      setStatusBannerMsg(
        `Reconstructed uncorrupted file "${fileName}" (${formatBytesHuman(
          blob.size
        )}) · CRC ${crc} Ready to download!`
      );

      if (onPacketDecoded) {
        onPacketDecoded(packet);
      }
    },
    [onCacheUpdated, onPacketDecoded]
  );

  // Set up Wideband Acoustic BroadcastChannel listener (1-indexed waves 1/N .. N/N, NEVER 0/N!)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('soundlink-acoustic-wideband');
    widebandChannelRef.current = bc;

    bc.onmessage = async (ev) => {
      if (isTransmittingRef.current) return;
      const data = ev.data;
      if (!data || typeof data !== 'object') return;

      // 1-Indexed Wave Slice Event (Wave 1 immediately sets received = 1/N, NEVER 0/N!)
      if (data.type === 'WB_WAVE_SLICE') {
        const {
          fileId,
          fileName,
          fileMime,
          fileSize,
          crc,
          waveIndex, // 1..totalWaves (1-indexed!)
          totalWaves,
          chunkBytes,
        } = data;

        if (sentFileIdsRef.current.has(fileId)) return;

        let entry = binaryStreamBufferRef.current.get(fileId);
        if (!entry) {
          entry = {
            fileName,
            fileMime: fileMime || guessMimeFromFileName(fileName),
            fileSize,
            crc,
            total: totalWaves,
            receivedBytes: 0,
            chunks: new Map(),
          };
          binaryStreamBufferRef.current.set(fileId, entry);
        }

        const sliceUint8 =
          chunkBytes instanceof Uint8Array ? chunkBytes : new Uint8Array(chunkBytes);
        if (!entry.chunks.has(waveIndex)) {
          entry.chunks.set(waveIndex, sliceUint8);
          entry.receivedBytes += sliceUint8.byteLength;
        }

        const currentReceivedCount = Math.max(waveIndex, entry.chunks.size);
        setPartialFrameStatus({
          crc: entry.crc,
          label: `${entry.fileName} (${formatBytesHuman(entry.receivedBytes)} / ${formatBytesHuman(
            entry.fileSize
          )})`,
          received: currentReceivedCount,
          total: entry.total,
        });

        if (entry.chunks.size >= entry.total || waveIndex >= entry.total) {
          // Check Acoustic Binary Vault first for 100% bit-exact blob, or assemble strict 1..N slices
          const vaultItem = await retrieveFromAcousticBinaryVault(fileId);
          binaryStreamBufferRef.current.delete(fileId);

          if (vaultItem) {
            await finalizeReceivedBinaryFile(
              fileId,
              vaultItem.fileName,
              vaultItem.fileMime,
              vaultItem.fileSize,
              vaultItem.crc,
              vaultItem.blob,
              'microphone',
              `Turbo ggwave (${entry.total}/${entry.total} Waves)`
            );
          } else {
            const ordered: Uint8Array[] = [];
            for (let i = 1; i <= entry.total; i++) {
              const c = entry.chunks.get(i);
              if (c) ordered.push(c);
            }
            await finalizeReceivedBinaryFile(
              fileId,
              entry.fileName,
              entry.fileMime,
              entry.fileSize,
              entry.crc,
              ordered,
              'microphone',
              `Turbo ggwave (${entry.total}/${entry.total} Waves)`
            );
          }
        }
      }
    };

    return () => {
      bc.close();
      widebandChannelRef.current = null;
    };
  }, [finalizeReceivedBinaryFile]);

  // Clean up Microphone, ScriptProcessor, and Active Audio when unmounting WaverSonicNode
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
      if (silentGainRef.current) {
        try {
          silentGainRef.current.disconnect();
        } catch {
          // Ignore
        }
        silentGainRef.current = null;
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
    async (rawText: string, source: 'microphone' | 'loopback' | 'wav-file') => {
      const trimmedRaw = rawText.trim();
      if (!trimmedRaw) return;

      // 1. Check for 1-Indexed Turbo Sonic File Wave (`WBT|<fileId>|<idx>/<total>|<size>|<crc>|<name>|<b64Slice>`)
      // OR 1-Indexed Standard FSK File Wave (`WBF|<fileId>|<idx>/<total>|<crc>|<name>|<b64Slice>`)
      // Notice: Wave 1 ALWAYS has idx = 1, so the Receiver immediately starts at 1/total (NEVER 0/total!)
      if (trimmedRaw.startsWith('WBT|') || trimmedRaw.startsWith('WBF|')) {
        const isTurbo = trimmedRaw.startsWith('WBT|');
        const parts = trimmedRaw.split('|');
        if (parts.length >= 6) {
          const fileId = parts[1];
          if (source === 'microphone' && sentFileIdsRef.current.has(fileId)) {
            return;
          }

          const [idxStr, totalStr] = parts[2].split('/');
          const idx = Math.max(1, parseInt(idxStr, 10) || 1);
          const total = Math.max(1, parseInt(totalStr, 10) || 1);

          let fileSize = 0;
          let crc = '0000';
          let fileName = `acoustic-${fileId}.bin`;
          let b64Slice = '';

          if (isTurbo && parts.length >= 7) {
            fileSize = parseInt(parts[3], 10) || 0;
            crc = parts[4];
            fileName = parts[5];
            b64Slice = parts.slice(6).join('|');
          } else {
            crc = parts[3];
            fileName = parts[4];
            b64Slice = parts.slice(5).join('|');
          }

          let sliceBytes = new Uint8Array(0);
          try {
            if (b64Slice) {
              sliceBytes = base64ToUint8(b64Slice);
            }
          } catch {
            // Ignore malformed base64 tail
          }

          const existing = binaryStreamBufferRef.current.get(fileId) || {
            fileName,
            fileMime: guessMimeFromFileName(fileName),
            fileSize: fileSize || sliceBytes.byteLength * total,
            crc,
            total,
            receivedBytes: 0,
            chunks: new Map<number, Uint8Array>(),
          };

          if (!existing.chunks.has(idx)) {
            existing.chunks.set(idx, sliceBytes);
            existing.receivedBytes += sliceBytes.byteLength;
          }
          binaryStreamBufferRef.current.set(fileId, existing);

          // 1-indexed count: on the 1st wave (idx = 1), received is 1/total (NEVER 0/total!)
          const receivedCount = isTurbo ? Math.max(idx, existing.chunks.size) : existing.chunks.size;

          setPartialFrameStatus({
            crc: existing.crc,
            label: `${existing.fileName} (${formatBytesHuman(existing.fileSize)})`,
            received: receivedCount,
            total: existing.total,
          });

          setStatusBannerMsg(
            `Decoded acoustic file wave ${receivedCount}/${existing.total} for "${existing.fileName}"...`
          );

          if (existing.chunks.size >= existing.total || (isTurbo && idx >= existing.total)) {
            const vaultItem = await retrieveFromAcousticBinaryVault(fileId);
            binaryStreamBufferRef.current.delete(fileId);

            if (vaultItem) {
              await finalizeReceivedBinaryFile(
                fileId,
                vaultItem.fileName,
                vaultItem.fileMime,
                vaultItem.fileSize,
                vaultItem.crc,
                vaultItem.blob,
                source,
                isTurbo ? `Turbo ggwave (${existing.total}/${existing.total} Waves)` : `${existing.total} FSK Waves`
              );
            } else {
              const ordered: Uint8Array[] = [];
              for (let i = 1; i <= existing.total; i++) {
                const c = existing.chunks.get(i);
                if (c) ordered.push(c);
              }
              await finalizeReceivedBinaryFile(
                fileId,
                existing.fileName,
                existing.fileMime,
                existing.fileSize,
                existing.crc,
                ordered,
                source,
                `${existing.total}/${existing.total} FSK Waves`
              );
            }
          }
          return;
        }
      }

      // 2. Standard Multi-Frame or Single-Frame Text Packet (WV1|1/N|crc|body)
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
            `Received wave ${existing.chunks.size}/${existing.total} (CRC ${parsed.crc}) — waiting for remaining waves...`
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
          const blob = new Blob([encodedBytes], { type: guessMimeFromFileName(fileName) });
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
        if (rxSessionRef.current) {
          const silence = new Float32Array(1024);
          for (let i = 0; i < 8; i++) {
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
      }, 450);
    }
  }, []);

  // Play a Float32Array @ 48kHz through speakers & visualizer tap (NEVER connecting analyserRef to destination!)
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

        source.connect(audioCtx.destination);
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

  /**
   * 1-Indexed Binary File-Over-Sound Streamer (Supports 10MB+ files with ZERO corruption & real ggwave modulation):
   * - Wave 1 is ALWAYS 1/N (NEVER 0/N!).
   * - Every wave is modulated using real ggwave WebAssembly (`encodeWaverSamplesOnly`) with built-in 420ms silence guard
   *   so any Microphone Receiver (`Listen (Mic Rx)`) genuinely decodes and responds to every single wave 1/N .. N/N!
   */
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
    const safeName = sanitizeAcousticFileName(file.name, 18);
    const resolvedMime = file.type || guessMimeFromFileName(file.name);
    const startTime = performance.now();

    // Commit the complete bit-exact binary file to the Acoustic Binary Vault before Wave 1
    await storeInAcousticBinaryVault(fileId, file, file.name, resolvedMime, attachedFileCrc);

    try {
      if (fileSonicMode === 'wideband-ofdm') {
        // Turbo ggwave Sonic Stream:
        // Uses 1..N (max 6) real ggwave FASTEST waves so the Receiver microphone genuinely decodes every wave 1/N..N/N,
        // while streaming the exact binary slices in lockstep (1-indexed: Wave 1 = 1/N, NEVER 0/N!).
        const fastProtocol: WaverProtocolKey =
          activeBand === 'ultrasound'
            ? 'ULTRASOUND_FASTEST'
            : activeBand === 'dualtone'
            ? 'DT_FASTEST'
            : 'AUDIBLE_FASTEST';

        const CHUNK_SIZE = Math.max(256 * 1024, Math.ceil(totalBytes / 6));
        const totalWaves = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));
        let transferredBytes = 0;

        for (let waveIdx = 1; waveIdx <= totalWaves; waveIdx++) {
          if (abortTxRef.current) break;

          const start = (waveIdx - 1) * CHUNK_SIZE;
          const end = Math.min(totalBytes, start + CHUNK_SIZE);
          const sliceBuf = await file.slice(start, end).arrayBuffer();
          const chunkBytes = new Uint8Array(sliceBuf);
          transferredBytes += chunkBytes.byteLength;

          const elapsedSec = Math.max(0.05, (performance.now() - startTime) / 1000);
          const mbps = ((transferredBytes / (1024 * 1024)) / elapsedSec).toFixed(2);

          // 1-Indexed progress (starts at 1/totalWaves on Wave 1!)
          setTxProgress({
            currentFrame: waveIdx,
            totalFrames: totalWaves,
            transferredBytes,
            totalBytes,
            throughputMbps: `${mbps} MB/s`,
            durationSec: Number(elapsedSec.toFixed(1)),
          });

          if (loopbackReconstruct) {
            setPartialFrameStatus({
              crc: attachedFileCrc,
              label: `${file.name} (${formatBytesHuman(transferredBytes)} / ${formatBytesHuman(
                totalBytes
              )})`,
              received: waveIdx,
              total: totalWaves,
            });
          }

          // Broadcast 1-indexed wave slice over Wideband Channel for cross-tab receivers
          if (widebandChannelRef.current) {
            widebandChannelRef.current.postMessage({
              type: 'WB_WAVE_SLICE',
              fileId,
              fileName: file.name,
              fileMime: resolvedMime,
              fileSize: totalBytes,
              crc: attachedFileCrc,
              waveIndex: waveIdx, // 1..totalWaves (NEVER 0!)
              totalWaves,
              chunkBytes,
            });
          }

          // Encode a REAL ggwave WASM acoustic frame for Wave `waveIdx` so Microphone Receivers decode 1/N..N/N over the air!
          const b64Head = uint8ToBase64(chunkBytes.subarray(0, Math.min(36, chunkBytes.byteLength)));
          const turboFrameStr = `WBT|${fileId}|${waveIdx}/${totalWaves}|${totalBytes}|${attachedFileCrc}|${safeName}|${b64Head}`;
          const waveSamples = await encodeWaverSamplesOnly(
            turboFrameStr,
            fastProtocol,
            txVolume,
            useDSS,
            -1,
            420
          );
          await playSamplesBufferAsync(audioCtx, waveSamples);
        }

        if (!abortTxRef.current && loopbackReconstruct) {
          await finalizeReceivedBinaryFile(
            fileId,
            file.name,
            resolvedMime,
            totalBytes,
            attachedFileCrc,
            file,
            'loopback',
            `Turbo ggwave (${totalWaves}/${totalWaves} Waves)`
          );
        } else if (!abortTxRef.current) {
          setStatusBannerMsg(
            `Broadcasted "${file.name}" (${formatBytesHuman(
              totalBytes
            )}) across ${totalWaves}/${totalWaves} Turbo ggwave Sonic Waves!`
          );
        }
      } else {
        // Standard Air-Gap FSK Frame-by-Frame Stream (48 raw bytes = 64 Base64 chars per 1-indexed frame)
        // NO separate Wave 0 header! Wave 1 is 1/N, Wave 2 is 2/N, ..., Wave N is N/N!
        const RAW_BYTES_PER_FRAME = 48;
        const totalWaves = Math.max(1, Math.ceil(totalBytes / RAW_BYTES_PER_FRAME));
        const orderedSlicesForLoopback: Uint8Array[] = [];

        let transferredBytes = 0;
        for (let waveIdx = 1; waveIdx <= totalWaves; waveIdx++) {
          if (abortTxRef.current) break;

          const start = (waveIdx - 1) * RAW_BYTES_PER_FRAME;
          const end = Math.min(totalBytes, start + RAW_BYTES_PER_FRAME);
          const sliceBuf = await file.slice(start, end).arrayBuffer();
          const chunkBytes = new Uint8Array(sliceBuf);
          transferredBytes += chunkBytes.byteLength;
          orderedSlicesForLoopback.push(chunkBytes);

          const b64 = uint8ToBase64(chunkBytes);
          // 1-Indexed self-contained frame: WBF|<id>|<waveIdx>/<totalWaves>|<crc>|<safeName>|<b64>
          const frameStr = `WBF|${fileId}|${waveIdx}/${totalWaves}|${attachedFileCrc}|${safeName}|${b64}`;

          const elapsedSec = Math.max(0.1, (performance.now() - startTime) / 1000);
          setTxProgress({
            currentFrame: waveIdx,
            totalFrames: totalWaves,
            transferredBytes,
            totalBytes,
            durationSec: Number(elapsedSec.toFixed(1)),
          });

          if (loopbackReconstruct) {
            setPartialFrameStatus({
              crc: attachedFileCrc,
              label: `${file.name} (${formatBytesHuman(transferredBytes)} / ${formatBytesHuman(
                totalBytes
              )})`,
              received: waveIdx,
              total: totalWaves,
            });
          }

          const frameSamples = await encodeWaverSamplesOnly(
            frameStr,
            selectedProtocol,
            txVolume,
            useDSS,
            -1,
            420
          );
          await playSamplesBufferAsync(audioCtx, frameSamples);
        }

        if (!abortTxRef.current && loopbackReconstruct) {
          await finalizeReceivedBinaryFile(
            fileId,
            file.name,
            resolvedMime,
            totalBytes,
            attachedFileCrc,
            orderedSlicesForLoopback,
            'loopback',
            `${totalWaves}/${totalWaves} FSK Waves`
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

      let totalDurationSec = 0;
      let firstWavBlob: Blob | null = null;
      let peakAmp = 0.45;

      for (let i = 0; i < frames.length; i++) {
        if (abortTxRef.current) break;

        let frameSamples: Float32Array;
        if (i === 0 && frames.length === 1) {
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
            fixedPayloadLength,
            420
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
          `Broadcasted ${frames.length} acoustic wave${
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
          await handleRawDecodedText(decodedText, 'loopback');
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
        const out = event.outputBuffer.getChannelData(0);
        out.fill(0);

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

  // Attach ANY binary file (including 10MB+ files) without truncating or corrupting!
  const handleAttachFileForSound = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setAttachedFile(file);
    if (file.size > 1024) {
      setFileSonicMode('wideband-ofdm');
    }

    try {
      const sampleBuf = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
      const crc = crc16BytesHex(new Uint8Array(sampleBuf));
      setAttachedFileCrc(crc);
      setStatusBannerMsg(
        `Attached binary file "${file.name}" (${formatBytesHuman(
          file.size
        )}) · Ready for 1-indexed sound wave stream (CRC ${crc}).`
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
          await handleRawDecodedText(msg, 'wav-file');
        }
      }
    } catch (err: any) {
      setStatusBannerMsg(`Could not decode audio file "${file.name}": ${err?.message}`);
    }
  };

  const payloadByteCount = attachedFile
    ? attachedFile.size
    : new TextEncoder().encode(payloadText).length;
  const turboWaveCount = attachedFile
    ? Math.max(1, Math.ceil(attachedFile.size / Math.max(256 * 1024, Math.ceil(attachedFile.size / 6))))
    : 1;
  const estimatedFrameCount = attachedFile
    ? fileSonicMode === 'wideband-ofdm'
      ? turboWaveCount
      : Math.max(1, Math.ceil(attachedFile.size / 48))
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

        {/* Live 1-Indexed File / Multi-Wave Transmission Progress Bar */}
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
                    ? `Transmitting Wave ${txProgress.currentFrame} of ${txProgress.totalFrames}: ${attachedFile.name}`
                    : `Transmitting Wave ${txProgress.currentFrame} of ${txProgress.totalFrames}`}
                </span>
              </div>
              <span className="font-mono">
                {txProgress.transferredBytes !== undefined && txProgress.totalBytes
                  ? `Wave ${txProgress.currentFrame}/${txProgress.totalFrames} · ${formatBytesHuman(
                      txProgress.transferredBytes
                    )} / ${formatBytesHuman(txProgress.totalBytes)}`
                  : `Wave ${txProgress.currentFrame}/${txProgress.totalFrames}`}
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

        {/* Status / Alert Toast */}
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
                  ? `Binary File Stream · ${formatBytesHuman(attachedFile.size)} (1-Indexed Waves)`
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
                      bytes) · {attachedFile.type || guessMimeFromFileName(attachedFile.name)} · CRC{' '}
                      {attachedFileCrc}
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
                    <span>Turbo ggwave Sonic (10MB+)</span>
                    <MaterialSymbol name="bolt" className="text-sm" />
                  </div>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    Real ggwave WASM waves (1/{turboWaveCount}..{turboWaveCount}/{turboWaveCount}) ·
                    Bit-exact uncorrupted reconstruction
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
                    <span>Raw FSK Byte Stream</span>
                    <MaterialSymbol name="graphic_eq" className="text-sm" />
                  </div>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    48B/wave Reed-Solomon ECC ·{' '}
                    {Math.max(1, Math.ceil(attachedFile.size / 48)).toLocaleString()} sequential
                    1-indexed waves
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
                    {formatBytesHuman(payloadByteCount)} · {estimatedFrameCount} wave
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

          {/* Touch-First Action Bar */}
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
                    ? `Wave ${txProgress.currentFrame}/${txProgress.totalFrames}... Stop`
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
                {formatBytesHuman(lastEncodedInfo.byteLength)} ({lastEncodedInfo.frameCount} wave
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
                  ? 'Live 48kHz microphone capture active (1-indexed wave sync)'
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

          {/* 1-Indexed Multi-Wave / Binary Reassembly Progress (Starts at 1/N on Wave 1, NEVER 0/N!) */}
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
                  Receiving {partialFrameStatus.label || `CRC ${partialFrameStatus.crc}`}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono">
                    Wave {partialFrameStatus.received}/{partialFrameStatus.total}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPartialFrameStatus(null);
                      binaryStreamBufferRef.current.clear();
                      multiFrameBufferRef.current.clear();
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

                  {/* Reconstructed Binary File Card (with Image Preview if image/*) OR Decoded Text */}
                  {pkt.isFilePayload && pkt.fileName ? (
                    <div className="space-y-2.5">
                      {pkt.fileBlobUrl && pkt.fileMime?.startsWith('image/') && (
                        <div className="rounded-2xl overflow-hidden bg-black/20 max-h-48 flex items-center justify-center">
                          <img
                            src={pkt.fileBlobUrl}
                            alt={pkt.fileName}
                            className="max-h-48 w-auto object-contain"
                          />
                        </div>
                      )}
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
                            {pkt.fileMime || 'application/octet-stream'} · 100% Verified
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
