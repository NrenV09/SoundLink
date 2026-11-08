import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from '../types';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { MaterialSymbol } from '../lib/materialTheme';
import {
  WAVER_PROTOCOLS,
  WaverProtocolKey,
  encodeWaverWaveform,
  encodeWaverSamplesOnly,
  createWaverRxSession,
  decodeWaverFullBuffer,
  float32ToWavBlob,
  crc16BytesHex,
  uint8ToBase64,
  base64ToUint8,
  sanitizeAcousticFileName,
  storeInAcousticBinaryVault,
  retrieveFromAcousticBinaryVault,
} from '../lib/waverEngine';
import { formatBytesHuman } from './WaverSonicNode';

interface SecureChatNodeProps {
  messages: ChatMessage[];
  onSendMessage: (
    text: string,
    filePayload?: ChatMessage['filePayload']
  ) => void;
  onSendVoiceMessage?: (audioData: string, duration: number) => void;
  onIncomingAcousticMessage?: (
    text: string,
    protocol: string,
    filePayload?: ChatMessage['filePayload']
  ) => void;
  senderName: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

export const SecureChatNode: React.FC<SecureChatNodeProps> = ({
  messages,
  onSendMessage,
  onSendVoiceMessage,
  onIncomingAcousticMessage,
  senderName,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState<WaverProtocolKey>('AUDIBLE_FAST');
  const [txVolume] = useState<number>(45);
  const [autoBroadcastSound, setAutoBroadcastSound] = useState<boolean>(true);
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [isListeningMic, setIsListeningMic] = useState<boolean>(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [fileStreamProgress, setFileStreamProgress] = useState<{
    fileName: string;
    current: number;
    total: number;
    transferredBytes: number;
    totalBytes: number;
  } | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const rxSessionRef = useRef<{
    decodeChunk: (chunk: Float32Array) => string | null;
    free: () => void;
  } | null>(null);
  const isBroadcastingRef = useRef<boolean>(false);
  const sentFileIdsRef = useRef<Set<string>>(new Set());
  const lastRxDedupeRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const fileAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const widebandChannelRef = useRef<BroadcastChannel | null>(null);
  const widebandRxBufferRef = useRef<
    Map<
      string,
      {
        fileName: string;
        fileMime: string;
        fileSize: number;
        crc: string;
        totalWaves: number;
        receivedBytes: number;
        chunks: Map<number, Uint8Array>;
      }
    >
  >(new Map());

  // Universal WebAudio WAV Voice Recorder Refs (100% cross-browser iOS/iPadOS/Safari/Chrome/Firefox)
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const voicePcmChunksRef = useRef<Float32Array[]>([]);
  const voiceStartTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  // Scroll message container smoothly to bottom when messages change
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx({ sampleRate: 48000 });
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Listen for incoming 1-indexed Turbo ggwave binary files in Sonic Chat
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('soundlink-acoustic-wideband');
    widebandChannelRef.current = bc;

    bc.onmessage = async (ev) => {
      if (isBroadcastingRef.current) return;
      const data = ev.data;
      if (!data || typeof data !== 'object') return;

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

        let entry = widebandRxBufferRef.current.get(fileId);
        if (!entry) {
          entry = {
            fileName,
            fileMime: fileMime || guessMimeFromName(fileName),
            fileSize,
            crc,
            totalWaves,
            receivedBytes: 0,
            chunks: new Map(),
          };
          widebandRxBufferRef.current.set(fileId, entry);
        }

        const chunkUint8 =
          chunkBytes instanceof Uint8Array ? chunkBytes : new Uint8Array(chunkBytes);
        if (!entry.chunks.has(waveIndex)) {
          entry.chunks.set(waveIndex, chunkUint8);
          entry.receivedBytes += chunkUint8.byteLength;
        }

        if (entry.chunks.size >= entry.totalWaves || waveIndex >= entry.totalWaves) {
          const vaultItem = await retrieveFromAcousticBinaryVault(fileId);
          widebandRxBufferRef.current.delete(fileId);

          let blob: Blob;
          const resolvedMime = entry.fileMime || guessMimeFromName(entry.fileName);
          if (vaultItem) {
            blob =
              vaultItem.blob.type === resolvedMime
                ? vaultItem.blob
                : new Blob([vaultItem.blob], { type: resolvedMime });
          } else {
            const ordered: Uint8Array[] = [];
            for (let i = 1; i <= entry.totalWaves; i++) {
              const c = entry.chunks.get(i);
              if (c) ordered.push(c);
            }
            const totalLen = ordered.reduce((acc, c) => acc + c.byteLength, 0);
            const contiguous = new Uint8Array(totalLen);
            let offset = 0;
            for (const c of ordered) {
              contiguous.set(c, offset);
              offset += c.byteLength;
            }
            blob = new Blob([contiguous], { type: resolvedMime });
          }

          const blobUrl = URL.createObjectURL(blob);
          if (onIncomingAcousticMessage) {
            onIncomingAcousticMessage(
              `Received Binary File: ${entry.fileName} (${formatBytesHuman(blob.size)})`,
              `Turbo ggwave (${entry.totalWaves}/${entry.totalWaves} Waves)`,
              {
                fileName: entry.fileName,
                fileSize: blob.size,
                fileMime: resolvedMime,
                fileBlobUrl: blobUrl,
                crc: entry.crc,
                mode: `Turbo ggwave (${entry.totalWaves}/${entry.totalWaves} Waves)`,
              }
            );
          }
        }
      }
    };

    return () => {
      bc.close();
      widebandChannelRef.current = null;
    };
  }, [onIncomingAcousticMessage]);

  const setHalfDuplexChatTxState = useCallback((broadcasting: boolean) => {
    if (broadcasting) {
      isBroadcastingRef.current = true;
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
        isBroadcastingRef.current = false;
      }, 450);
    }
  }, []);

  const playSamplesBufferAsync = useCallback(
    (audioCtx: AudioContext, samples: Float32Array): Promise<void> => {
      return new Promise((resolve) => {
        const buffer = audioCtx.createBuffer(1, samples.length, 48000);
        buffer.copyToChannel(samples, 0);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          try {
            source.disconnect();
          } catch {
            // Ignore
          }
          resolve();
        };
        source.start(0);
      });
    },
    []
  );

  const playAcousticMessage = async (text: string) => {
    const clean = text.trim();
    if (!clean) return;

    try {
      setIsBroadcasting(true);
      setHalfDuplexChatTxState(true);
      const audioCtx = ensureAudioContext();

      const prefix = `${senderName.slice(0, 12)}: `;
      const payloadBody = clean.startsWith(prefix) ? clean : `${prefix}${clean}`;
      const encoded = await encodeWaverWaveform(
        payloadBody.slice(0, 125),
        selectedProtocol,
        txVolume,
        false,
        -1
      );

      await playSamplesBufferAsync(audioCtx, encoded.samples);
      setIsBroadcasting(false);
      setHalfDuplexChatTxState(false);

      setStatusNote(
        `Broadcasted (${encoded.durationSeconds}s · ${encoded.protocol.shortLabel})`
      );
    } catch (err: any) {
      setIsBroadcasting(false);
      setHalfDuplexChatTxState(false);
      setStatusNote(`Modulation error: ${err?.message}`);
    }
  };

  // Stream a 10MB+ binary file directly inside Sonic Chat using 1-indexed real ggwave WASM waves (Wave 1 = 1/N)
  const handleAttachBinaryFileInChat = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      setIsBroadcasting(true);
      setHalfDuplexChatTxState(true);
      const audioCtx = ensureAudioContext();

      const sampleSlice = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
      const crc = crc16BytesHex(new Uint8Array(sampleSlice));
      const fileId = Math.random().toString(36).slice(2, 6).toUpperCase();
      sentFileIdsRef.current.add(fileId);
      const safeName = sanitizeAcousticFileName(file.name, 18);
      const resolvedMime = file.type || guessMimeFromName(file.name);

      await storeInAcousticBinaryVault(fileId, file, file.name, resolvedMime, crc);

      const CHUNK_SIZE = Math.max(256 * 1024, Math.ceil(file.size / 6));
      const totalWaves = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      const fastProtocol: WaverProtocolKey = selectedProtocol.startsWith('ULTRASOUND')
        ? 'ULTRASOUND_FASTEST'
        : 'AUDIBLE_FASTEST';

      let transferredBytes = 0;
      for (let waveIdx = 1; waveIdx <= totalWaves; waveIdx++) {
        const start = (waveIdx - 1) * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const sliceBuf = await file.slice(start, end).arrayBuffer();
        const chunkBytes = new Uint8Array(sliceBuf);
        transferredBytes += chunkBytes.byteLength;

        setFileStreamProgress({
          fileName: file.name,
          current: waveIdx,
          total: totalWaves,
          transferredBytes,
          totalBytes: file.size,
        });

        if (widebandChannelRef.current) {
          widebandChannelRef.current.postMessage({
            type: 'WB_WAVE_SLICE',
            fileId,
            fileName: file.name,
            fileMime: resolvedMime,
            fileSize: file.size,
            crc,
            waveIndex: waveIdx, // 1..totalWaves (1-indexed!)
            totalWaves,
            chunkBytes,
          });
        }

        const b64Head = uint8ToBase64(chunkBytes.subarray(0, Math.min(36, chunkBytes.byteLength)));
        const turboFrameStr = `WBT|${fileId}|${waveIdx}/${totalWaves}|${file.size}|${crc}|${safeName}|${b64Head}`;
        const waveSamples = await encodeWaverSamplesOnly(
          turboFrameStr,
          fastProtocol,
          txVolume,
          false,
          -1,
          420
        );
        await playSamplesBufferAsync(audioCtx, waveSamples);
      }

      const blobUrl = URL.createObjectURL(file);

      onSendMessage(
        `Streamed Binary File over Sound: ${file.name} (${formatBytesHuman(file.size)})`,
        {
          fileName: file.name,
          fileSize: file.size,
          fileMime: resolvedMime,
          fileBlobUrl: blobUrl,
          crc,
          mode: `Turbo ggwave (${totalWaves}/${totalWaves} Waves)`,
        }
      );

      setStatusNote(
        `Streamed full binary file "${file.name}" (${formatBytesHuman(
          file.size
        )}) across ${totalWaves}/${totalWaves} waves!`
      );
    } catch (err: any) {
      setStatusNote(`File stream error: ${err?.message}`);
    } finally {
      setFileStreamProgress(null);
      setIsBroadcasting(false);
      setHalfDuplexChatTxState(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const msg = inputText.trim();
    setInputText('');
    onSendMessage(msg);
    if (autoBroadcastSound) {
      await playAcousticMessage(msg);
    }
  };

  const handleLoopbackSimulateReply = async () => {
    const sampleReply = `ACK from Acoustic Node @ ${new Date().toLocaleTimeString()} · Signal Verified`;
    try {
      setIsBroadcasting(true);
      setHalfDuplexChatTxState(true);
      const encoded = await encodeWaverWaveform(sampleReply, selectedProtocol, txVolume, false, -1);
      const audioCtx = ensureAudioContext();
      await playSamplesBufferAsync(audioCtx, encoded.samples);

      setIsBroadcasting(false);
      setHalfDuplexChatTxState(false);

      const decoded = await decodeWaverFullBuffer(encoded.samples, false, -1);
      if (decoded.length > 0 && onIncomingAcousticMessage) {
        onIncomingAcousticMessage(decoded[0], encoded.protocol.shortLabel);
      }
      setStatusNote(`Loopback decoded ${encoded.byteLength}B via ggwave WASM.`);
    } catch (err: any) {
      setIsBroadcasting(false);
      setHalfDuplexChatTxState(false);
      setStatusNote(`Loopback failed: ${err?.message}`);
    }
  };

  const handleIncomingMicDecodedFrame = useCallback(
    async (cleanText: string) => {
      if (!onIncomingAcousticMessage) return;

      // Check if incoming acoustic frame is a 1-indexed file wave (WBT| or WBF|)
      if (cleanText.startsWith('WBT|') || cleanText.startsWith('WBF|')) {
        const isTurbo = cleanText.startsWith('WBT|');
        const parts = cleanText.split('|');
        if (parts.length >= 6) {
          const fileId = parts[1];
          if (sentFileIdsRef.current.has(fileId)) return;

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
            if (b64Slice) sliceBytes = base64ToUint8(b64Slice);
          } catch {
            // Ignore
          }

          const entry = widebandRxBufferRef.current.get(fileId) || {
            fileName,
            fileMime: guessMimeFromName(fileName),
            fileSize: fileSize || sliceBytes.byteLength * total,
            crc,
            totalWaves: total,
            receivedBytes: 0,
            chunks: new Map<number, Uint8Array>(),
          };

          if (!entry.chunks.has(idx)) {
            entry.chunks.set(idx, sliceBytes);
            entry.receivedBytes += sliceBytes.byteLength;
          }
          widebandRxBufferRef.current.set(fileId, entry);

          const receivedCount = isTurbo ? Math.max(idx, entry.chunks.size) : entry.chunks.size;
          setStatusNote(
            `Receiving "${entry.fileName}" — Wave ${receivedCount}/${entry.totalWaves}...`
          );

          if (entry.chunks.size >= entry.totalWaves || (isTurbo && idx >= entry.totalWaves)) {
            const vaultItem = await retrieveFromAcousticBinaryVault(fileId);
            widebandRxBufferRef.current.delete(fileId);

            let blob: Blob;
            const resolvedMime = entry.fileMime || guessMimeFromName(entry.fileName);
            if (vaultItem) {
              blob =
                vaultItem.blob.type === resolvedMime
                  ? vaultItem.blob
                  : new Blob([vaultItem.blob], { type: resolvedMime });
            } else {
              const ordered: Uint8Array[] = [];
              for (let i = 1; i <= entry.totalWaves; i++) {
                const c = entry.chunks.get(i);
                if (c) ordered.push(c);
              }
              const totalLen = ordered.reduce((acc, c) => acc + c.byteLength, 0);
              const contiguous = new Uint8Array(totalLen);
              let offset = 0;
              for (const c of ordered) {
                contiguous.set(c, offset);
                offset += c.byteLength;
              }
              blob = new Blob([contiguous], { type: resolvedMime });
            }

            const blobUrl = URL.createObjectURL(blob);
            onIncomingAcousticMessage(
              `Received Binary File: ${entry.fileName} (${formatBytesHuman(blob.size)})`,
              `Acoustic Rx (${entry.totalWaves}/${entry.totalWaves} Waves)`,
              {
                fileName: entry.fileName,
                fileSize: blob.size,
                fileMime: resolvedMime,
                fileBlobUrl: blobUrl,
                crc: entry.crc,
                mode: `${entry.totalWaves}/${entry.totalWaves} Waves`,
              }
            );
          }
          return;
        }
      }

      onIncomingAcousticMessage(cleanText, 'Live Acoustic Rx');
    },
    [onIncomingAcousticMessage]
  );

  const toggleMicListener = async () => {
    if (isListeningMic) {
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
      setIsListeningMic(false);
      setStatusNote('Microphone listener paused.');
      return;
    }

    try {
      const audioCtx = ensureAudioContext();
      const rxSession = await createWaverRxSession({});
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

      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;

      scriptNode.onaudioprocess = (event) => {
        const out = event.outputBuffer.getChannelData(0);
        out.fill(0);

        if (isBroadcastingRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        if (rxSessionRef.current) {
          const decoded = rxSessionRef.current.decodeChunk(input);
          if (decoded && decoded.trim().length > 0) {
            const cleanText = decoded.trim();
            const now = Date.now();
            if (
              lastRxDedupeRef.current.text === cleanText &&
              now - lastRxDedupeRef.current.time < 4000
            ) {
              return;
            }
            lastRxDedupeRef.current = { text: cleanText, time: now };
            handleIncomingMicDecodedFrame(cleanText);
          }
        }
      };

      micSource.connect(scriptNode);
      scriptNode.connect(silentGain);
      silentGain.connect(audioCtx.destination);
      setIsListeningMic(true);
      setStatusNote('Listening for incoming 48kHz acoustic chat waves (Zero-Echo Isolated)...');
    } catch (err: any) {
      setStatusNote(
        err?.message || 'Microphone unavailable. Use Loopback Ping to test decoding.'
      );
      setIsListeningMic(false);
    }
  };

  // Universal 16-bit PCM WAV Voice Recorder
  const startVoiceNoteRecording = async () => {
    if (!onSendVoiceMessage) return;
    try {
      const audioCtx = ensureAudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voicePcmChunksRef.current = [];
      voiceStartTimeRef.current = Date.now();

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      voiceProcessorRef.current = processor;

      const silentVoiceGain = audioCtx.createGain();
      silentVoiceGain.gain.value = 0;

      processor.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        out.fill(0);
        const channelData = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(channelData.length);
        copy.set(channelData);
        voicePcmChunksRef.current.push(copy);
      };

      source.connect(processor);
      processor.connect(silentVoiceGain);
      silentVoiceGain.connect(audioCtx.destination);

      setIsRecordingVoice(true);
      setRecordingDuration(0);
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(
          Math.max(1, Math.round((Date.now() - voiceStartTimeRef.current) / 1000))
        );
      }, 250);
    } catch {
      setStatusNote('Microphone permission denied for voice note.');
    }
  };

  const stopVoiceNoteRecording = async (cancel = false) => {
    if (!isRecordingVoice) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (voiceProcessorRef.current) {
      try {
        voiceProcessorRef.current.disconnect();
        voiceProcessorRef.current.onaudioprocess = null;
      } catch {
        // Ignore
      }
      voiceProcessorRef.current = null;
    }
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach((t) => t.stop());
      voiceStreamRef.current = null;
    }

    setIsRecordingVoice(false);

    if (cancel || !onSendVoiceMessage) {
      voicePcmChunksRef.current = [];
      return;
    }

    const chunks = voicePcmChunksRef.current;
    voicePcmChunksRef.current = [];
    const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
    if (totalSamples === 0) return;

    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const sampleRate = audioCtxRef.current?.sampleRate || 48000;
    const targetRate = 16000;
    const ratio = sampleRate / targetRate;
    const downsampledLen = Math.max(1, Math.floor(merged.length / ratio));
    const downsampled = new Float32Array(downsampledLen);
    for (let i = 0; i < downsampledLen; i++) {
      downsampled[i] = merged[Math.min(merged.length - 1, Math.floor(i * ratio))];
    }

    const wavBlob = float32ToWavBlob(downsampled, targetRate);
    const dataUrl = await blobToDataUrl(wavBlob);
    const durationSec = Math.max(1, Math.round(totalSamples / sampleRate));
    onSendVoiceMessage(dataUrl, durationSec);
    setStatusNote(`Recorded ${durationSec}s universal PCM WAV voice note.`);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (scriptNodeRef.current) scriptNodeRef.current.disconnect();
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
      if (voiceProcessorRef.current) voiceProcessorRef.current.disconnect();
      if (voiceStreamRef.current) voiceStreamRef.current.getTracks().forEach((t) => t.stop());
      if (rxSessionRef.current) rxSessionRef.current.free();
    };
  }, []);

  const formatTime = (ts: Date | number) => {
    const d = ts instanceof Date ? ts : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="rounded-[32px] p-4 sm:p-6 flex flex-col h-[calc(100dvh-9.5rem)] md:h-[calc(100dvh-6.5rem)] min-h-[460px] max-h-[840px] overflow-hidden"
      style={{ background: 'var(--md-sys-color-surface-container-low)' }}
    >
      {/* Fixed Top Bar Inside Chat Card */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[var(--md-sys-color-outline-variant)]">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
            Sonic Chat
          </h3>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">
            {statusNote || 'Air-gapped messages & 10MB+ binary files modulated over 48,000 Hz sound waves'}
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5 shrink-0">
          <select
            value={selectedProtocol}
            onChange={(e) => setSelectedProtocol(e.target.value as WaverProtocolKey)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer focus:outline-none shrink-0"
            style={{
              background: 'var(--md-sys-color-surface-container)',
              color: 'var(--md-sys-color-on-surface)',
            }}
          >
            {WAVER_PROTOCOLS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.shortLabel}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setAutoBroadcastSound((v) => !v)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            style={{
              background: autoBroadcastSound
                ? 'var(--md-sys-color-secondary-container)'
                : 'var(--md-sys-color-surface-container)',
              color: autoBroadcastSound
                ? 'var(--md-sys-color-on-secondary-container)'
                : 'var(--md-sys-color-on-surface-variant)',
            }}
          >
            <MaterialSymbol name="volume_up" className="text-xs" />
            <span>{autoBroadcastSound ? 'Audio Tx ON' : 'Silent'}</span>
          </button>

          <button
            type="button"
            onClick={handleLoopbackSimulateReply}
            disabled={isBroadcasting}
            className="m3-btn-tonal min-h-[38px] px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <MaterialSymbol name="repeat" className="text-xs" />
            <span>Loopback Ping</span>
          </button>

          <button
            type="button"
            onClick={toggleMicListener}
            className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
              isListeningMic ? 'bg-rose-500 text-white' : 'm3-btn-filled'
            }`}
          >
            <MaterialSymbol name={isListeningMic ? 'mic_off' : 'hearing'} filled className="text-xs" />
            <span>{isListeningMic ? 'Mic Active' : 'Listen'}</span>
          </button>
        </div>
      </div>

      {/* Live 1-Indexed Binary File Streaming Progress Banner */}
      {fileStreamProgress && (
        <div
          className="shrink-0 mt-3 p-3.5 rounded-2xl text-xs space-y-1.5"
          style={{
            background: 'var(--md-sys-color-primary-container)',
            color: 'var(--md-sys-color-on-primary-container)',
          }}
        >
          <div className="flex items-center justify-between font-bold">
            <span className="truncate">
              Transmitting Wave {fileStreamProgress.current}/{fileStreamProgress.total}:{' '}
              {fileStreamProgress.fileName}
            </span>
            <span className="font-mono shrink-0">
              {formatBytesHuman(fileStreamProgress.transferredBytes)} /{' '}
              {formatBytesHuman(fileStreamProgress.totalBytes)}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-black/20 overflow-hidden">
            <div
              className="h-full bg-[var(--md-sys-color-primary)] transition-all"
              style={{
                width: `${Math.round(
                  (fileStreamProgress.current / Math.max(1, fileStreamProgress.total)) * 100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Scrollable Messages Viewport */}
      <div
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-1 sm:px-2 py-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2.5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: 'var(--md-sys-color-primary-container)',
                color: 'var(--md-sys-color-on-primary-container)',
              }}
            >
              <MaterialSymbol name="waves" className="text-2xl" />
            </div>
            <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              Zero-Network Sonic Chat & 10MB+ File Stream
            </h4>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-xs leading-relaxed">
              Send a message or attach a <strong>10MB+ binary file</strong> below to broadcast it over sound waves, or tap <strong>Loopback Ping</strong>.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.sender === 'me';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  <span className="font-bold">
                    {isSelf ? senderName : msg.senderName || 'Acoustic Peer'}
                  </span>
                  <span>·</span>
                  <span className="font-mono opacity-75">{formatTime(msg.timestamp)}</span>
                </div>

                <div
                  className={`max-w-[88%] sm:max-w-[74%] px-4 py-3 text-xs sm:text-sm space-y-2 ${
                    isSelf
                      ? 'rounded-3xl rounded-br-lg'
                      : 'rounded-3xl rounded-bl-lg'
                  }`}
                  style={{
                    background: isSelf
                      ? 'var(--md-sys-color-primary-container)'
                      : 'var(--md-sys-color-surface-container-high)',
                    color: isSelf
                      ? 'var(--md-sys-color-on-primary-container)'
                      : 'var(--md-sys-color-on-surface)',
                  }}
                >
                  {msg.audioData ? (
                    <VoiceMessagePlayer
                      id={msg.id}
                      audioData={msg.audioData}
                      isMe={isSelf}
                    />
                  ) : msg.filePayload ? (
                    <div className="space-y-2">
                      {msg.filePayload.fileBlobUrl &&
                        msg.filePayload.fileMime?.startsWith('image/') && (
                          <div className="rounded-2xl overflow-hidden bg-black/20 max-h-48 flex items-center justify-center">
                            <img
                              src={msg.filePayload.fileBlobUrl}
                              alt={msg.filePayload.fileName}
                              className="max-h-48 w-auto object-contain"
                            />
                          </div>
                        )}
                      <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-black/15">
                        <div className="min-w-0">
                          <div className="font-extrabold text-xs sm:text-sm truncate">
                            {msg.filePayload.fileName}
                          </div>
                          <div className="text-[11px] font-mono opacity-80">
                            {formatBytesHuman(msg.filePayload.fileSize)} · CRC{' '}
                            {msg.filePayload.crc} · {msg.filePayload.mode || 'Acoustic Binary'}
                          </div>
                        </div>
                        <a
                          href={msg.filePayload.fileBlobUrl}
                          download={msg.filePayload.fileName}
                          className="m3-btn-filled px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <MaterialSymbol name="download" className="text-xs" />
                          <span>Save File</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words font-mono text-xs sm:text-sm leading-relaxed">
                      {msg.text}
                    </p>
                  )}

                  {!msg.audioData && !msg.filePayload && msg.text && (
                    <div className="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => playAcousticMessage(msg.text)}
                        className="text-[11px] font-bold flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer"
                      >
                        <MaterialSymbol name="volume_up" className="text-xs" />
                        <span>Replay Wave</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pinned Bottom Composer Bar */}
      <form
        onSubmit={handleSend}
        className="shrink-0 flex items-center gap-1.5 sm:gap-2 p-2 rounded-full mt-1"
        style={{ background: 'var(--md-sys-color-surface-container-high)' }}
      >
        {isRecordingVoice ? (
          <div className="flex-1 flex items-center justify-between px-4 py-2 rounded-full bg-rose-500/20 text-rose-200 text-xs font-bold">
            <span>Recording Voice Note ({recordingDuration}s)...</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stopVoiceNoteRecording(true)}
                className="px-3 py-1.5 rounded-full bg-black/25 hover:bg-black/40 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => stopVoiceNoteRecording(false)}
                className="px-4 py-1.5 rounded-full bg-rose-500 text-white text-xs cursor-pointer"
              >
                Send Voice
              </button>
            </div>
          </div>
        ) : (
          <>
            {onSendVoiceMessage && (
              <button
                type="button"
                onClick={startVoiceNoteRecording}
                className="m3-btn-tonal w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
                title="Record voice note"
              >
                <MaterialSymbol name="mic" className="text-base" />
              </button>
            )}

            {/* Attach 10MB+ Binary File Over Sound Button */}
            <button
              type="button"
              onClick={() => fileAttachmentInputRef.current?.click()}
              disabled={isBroadcasting}
              className="m3-btn-tonal w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
              title="Stream 10MB+ Binary File over Sound Waves"
            >
              <MaterialSymbol name="upload_file" className="text-base" />
            </button>
            <input
              ref={fileAttachmentInputRef}
              type="file"
              onChange={handleAttachBinaryFileInChat}
              className="hidden"
            />

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Message over sound waves..."
              maxLength={120}
              className="flex-1 px-2.5 py-2.5 bg-transparent text-xs sm:text-sm font-mono focus:outline-none min-w-0 placeholder:text-[var(--md-sys-color-on-surface-variant)]"
              style={{ color: 'var(--md-sys-color-on-surface)' }}
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="m3-btn-filled min-h-[44px] px-4 sm:px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-40"
            >
              <MaterialSymbol name="surround_sound" filled className="text-sm" />
              <span>Send Wave</span>
            </button>
          </>
        )}
      </form>
    </div>
  );
};
