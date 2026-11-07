import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from '../types';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { MaterialSymbol } from '../lib/materialTheme';
import {
  WAVER_PROTOCOLS,
  WaverProtocolKey,
  encodeWaverWaveform,
  createWaverRxSession,
  decodeWaverFullBuffer,
} from '../lib/waverEngine';

interface SecureChatNodeProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onSendVoiceMessage?: (audioData: string, duration: number) => void;
  onIncomingAcousticMessage?: (text: string, protocol: string) => void;
  senderName: string;
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const rxSessionRef = useRef<{
    decodeChunk: (chunk: Float32Array) => string | null;
    free: () => void;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const durationRef = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const playAcousticMessage = async (text: string) => {
    if (!text.trim()) return;
    try {
      setIsBroadcasting(true);
      const audioCtx = ensureAudioContext();
      const packet = `${senderName.slice(0, 12)}: ${text.trim().slice(0, 110)}`;
      const encoded = await encodeWaverWaveform(packet, selectedProtocol, txVolume, false, -1);

      const buffer = audioCtx.createBuffer(1, encoded.samples.length, 48000);
      buffer.copyToChannel(encoded.samples, 0);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.onended = () => {
        setIsBroadcasting(false);
      };
      source.start(0);
      setStatusNote(
        `Broadcasted (${encoded.durationSeconds}s · ${encoded.protocol.shortLabel})`
      );
    } catch (err: any) {
      setIsBroadcasting(false);
      setStatusNote(`Modulation error: ${err?.message}`);
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
      const encoded = await encodeWaverWaveform(sampleReply, selectedProtocol, txVolume, false, -1);
      const audioCtx = ensureAudioContext();
      const buffer = audioCtx.createBuffer(1, encoded.samples.length, 48000);
      buffer.copyToChannel(encoded.samples, 0);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.onended = () => setIsBroadcasting(false);
      source.start(0);

      const decoded = await decodeWaverFullBuffer(encoded.samples, false, -1);
      if (decoded.length > 0 && onIncomingAcousticMessage) {
        onIncomingAcousticMessage(decoded[0], encoded.protocol.shortLabel);
      }
      setStatusNote(`Loopback decoded ${encoded.byteLength}B via ggwave WASM.`);
    } catch (err: any) {
      setIsBroadcasting(false);
      setStatusNote(`Loopback failed: ${err?.message}`);
    }
  };

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

      scriptNode.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        if (rxSessionRef.current) {
          const decoded = rxSessionRef.current.decodeChunk(input);
          if (decoded && decoded.trim().length > 0 && onIncomingAcousticMessage) {
            onIncomingAcousticMessage(decoded.trim(), 'Live Acoustic Rx');
          }
        }
      };

      micSource.connect(scriptNode);
      scriptNode.connect(audioCtx.destination);
      setIsListeningMic(true);
      setStatusNote('Listening for incoming 48kHz acoustic chat waves...');
    } catch (err: any) {
      setStatusNote(
        err?.message || 'Microphone unavailable. Use Loopback Ping to test decoding.'
      );
      setIsListeningMic(false);
    }
  };

  const startVoiceNoteRecording = async () => {
    if (!onSendVoiceMessage) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          if (onSendVoiceMessage && durationRef.current > 0) {
            onSendVoiceMessage(base64data, durationRef.current);
          }
        };
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingVoice(true);
      setRecordingDuration(0);
      durationRef.current = 0;
      timerRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => {
          durationRef.current = prev + 1;
          return prev + 1;
        });
      }, 1000);
    } catch {
      setStatusNote('Microphone permission denied for voice note.');
    }
  };

  const stopVoiceNoteRecording = (cancel = false) => {
    if (mediaRecorderRef.current && isRecordingVoice) {
      if (cancel) {
        durationRef.current = 0;
      }
      mediaRecorderRef.current.stop();
      setIsRecordingVoice(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (scriptNodeRef.current) scriptNodeRef.current.disconnect();
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
      if (rxSessionRef.current) rxSessionRef.current.free();
    };
  }, []);

  const formatTime = (ts: Date | number) => {
    const d = ts instanceof Date ? ts : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="rounded-[32px] p-4 sm:p-6 flex flex-col min-h-[540px] sm:min-h-[620px] justify-between gap-4"
      style={{ background: 'var(--md-sys-color-surface-container-low)' }}
    >
      {/* Clean Unboxed Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
            Sonic Chat
          </h3>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {statusNote || 'Air-gapped messages modulated over 48,000 Hz sound waves'}
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
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

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto space-y-3 py-2 max-h-[420px]">
        {messages.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-2.5">
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
              Zero-Network Sonic Chat
            </h4>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-xs leading-relaxed">
              Send a message below to broadcast it as an FSK audio wave, or tap{' '}
              <strong>Loopback Ping</strong> to test live WASM decoding.
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
                <div className="flex items-center gap-1.5 mb-1 px-2 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  <span className="font-bold">
                    {isSelf ? senderName : msg.senderName || 'Acoustic Peer'}
                  </span>
                  <span>·</span>
                  <span className="font-mono opacity-75">{formatTime(msg.timestamp)}</span>
                </div>

                <div
                  className={`max-w-[85%] sm:max-w-[72%] px-4 py-3 text-xs sm:text-sm space-y-2 ${
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
                  ) : (
                    <p className="whitespace-pre-wrap break-words font-mono text-xs sm:text-sm leading-relaxed">
                      {msg.text}
                    </p>
                  )}

                  {!msg.audioData && msg.text && (
                    <div className="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => playAcousticMessage(msg.text)}
                        className="text-[10px] font-bold flex items-center gap-1 opacity-75 hover:opacity-100 cursor-pointer"
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
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Pill Message Bar */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 p-1.5 rounded-full"
        style={{ background: 'var(--md-sys-color-surface-container-lowest)' }}
      >
        {isRecordingVoice ? (
          <div className="flex-1 flex items-center justify-between px-4 py-2 rounded-full bg-rose-500/15 text-rose-300 text-xs font-bold">
            <span>Recording Voice Note ({recordingDuration}s)...</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stopVoiceNoteRecording(true)}
                className="px-3 py-1 rounded-full bg-black/20 hover:bg-black/40 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => stopVoiceNoteRecording(false)}
                className="px-3.5 py-1 rounded-full bg-rose-500 text-white text-xs cursor-pointer"
              >
                Send
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
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Message over sound waves..."
              maxLength={120}
              className="flex-1 px-3 py-2.5 bg-transparent text-xs sm:text-sm font-mono focus:outline-none min-w-0"
              style={{ color: 'var(--md-sys-color-on-surface)' }}
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="m3-btn-filled min-h-[44px] px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-40"
            >
              <MaterialSymbol name="surround_sound" filled className="text-sm" />
              <span className="hidden sm:inline">Send Wave</span>
            </button>
          </>
        )}
      </form>
    </div>
  );
};
