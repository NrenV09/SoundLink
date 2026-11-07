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
  const [txVolume, setTxVolume] = useState<number>(45);
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
  const rxSessionRef = useRef<{ decodeChunk: (chunk: Float32Array) => string | null; free: () => void } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const durationRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
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
        `Modulated "${text.slice(0, 28)}${text.length > 28 ? '...' : ''}" (${encoded.durationSeconds}s · ${encoded.protocol.shortLabel})`
      );
    } catch (err: any) {
      setIsBroadcasting(false);
      setStatusNote(`Audio modulation error: ${err?.message}`);
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
      setStatusNote('Microphone acoustic chat listener paused.');
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
      setStatusNote('Listening for incoming ggwave FSK chat messages at 48,000 Hz...');
    } catch (err: any) {
      setStatusNote(
        err?.message || 'Microphone unavailable. Use Loopback Ping to test acoustic chat decoding.'
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
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="m3-card-xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden flex flex-col h-[620px]">
      {/* Acoustic Chat Header */}
      <div
        className="p-4 border-b border-[var(--md-sys-color-outline-variant)] flex flex-wrap items-center justify-between gap-3"
        style={{ background: 'var(--md-sys-color-surface-container)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: 'var(--md-sys-color-primary-container)',
              color: 'var(--md-sys-color-on-primary-container)',
            }}
          >
            <MaterialSymbol name="forum" filled className="text-xl" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                Acoustic Sound-Wave Chat
              </h3>
              <span
                className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                style={{
                  background: 'var(--md-sys-color-secondary-container)',
                  color: 'var(--md-sys-color-on-secondary-container)',
                }}
              >
                Air-Gapped FSK
              </span>
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              Messages modulate directly into 48kHz ggwave sound waves · No internet or WebRTC required
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedProtocol}
            onChange={(e) => setSelectedProtocol(e.target.value as WaverProtocolKey)}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
          >
            {WAVER_PROTOCOLS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.shortLabel} ({p.freqRange})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleLoopbackSimulateReply}
            disabled={isBroadcasting}
            className="m3-btn-tonal px-3 py-1.5 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            title="Transmit & decode an acoustic test reply via WASM loopback"
          >
            <MaterialSymbol name="repeat" className="text-xs" />
            <span>Loopback Ping</span>
          </button>

          <button
            type="button"
            onClick={toggleMicListener}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              isListeningMic ? 'bg-rose-500 text-white' : 'm3-btn-filled'
            }`}
          >
            <MaterialSymbol name={isListeningMic ? 'mic_off' : 'hearing'} filled className="text-xs" />
            <span>{isListeningMic ? 'Mic Rx Active' : 'Enable Mic Rx'}</span>
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div
        className="px-4 py-2 border-b border-[var(--md-sys-color-outline-variant)]/60 flex flex-wrap items-center justify-between gap-2 text-[11px]"
        style={{ background: 'var(--md-sys-color-surface-container-low)' }}
      >
        <div className="flex items-center gap-2 text-[var(--md-sys-color-on-surface-variant)]">
          <MaterialSymbol
            name={isBroadcasting ? 'surround_sound' : 'graphic_eq'}
            className="text-xs text-[var(--md-sys-color-primary)]"
          />
          <span>
            {statusNote ||
              'Ready — Every sent chat message is encoded into FSK sound waves via ggwave WASM.'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-[var(--md-sys-color-on-surface-variant)]">
            <input
              type="checkbox"
              checked={autoBroadcastSound}
              onChange={(e) => setAutoBroadcastSound(e.target.checked)}
              className="accent-[var(--md-sys-color-primary)]"
            />
            <span>Auto-Broadcast Audio</span>
          </label>
          <div className="flex items-center gap-1">
            <span className="text-[var(--md-sys-color-on-surface-variant)]">Vol:</span>
            <input
              type="range"
              min={5}
              max={100}
              value={txVolume}
              onChange={(e) => setTxVolume(Number(e.target.value))}
              className="w-16 accent-[var(--md-sys-color-primary)]"
            />
          </div>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: 'var(--md-sys-color-primary-container)',
                color: 'var(--md-sys-color-on-primary-container)',
              }}
            >
              <MaterialSymbol name="waves" className="text-2xl" />
            </div>
            <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              Zero-Network Acoustic Chat Terminal
            </h4>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] max-w-sm">
              Type a message below to broadcast it over audible or ultrasonic sound waves, or click{' '}
              <strong>Loopback Ping</strong> to test live WASM acoustic decoding.
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
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
                    {isSelf ? senderName : msg.senderName || 'Acoustic Peer'}
                  </span>
                  <span className="text-[10px] font-mono opacity-60 text-[var(--md-sys-color-on-surface-variant)]">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>

                <div
                  className="max-w-[82%] sm:max-w-[72%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm space-y-2 border"
                  style={{
                    background: isSelf
                      ? 'var(--md-sys-color-primary-container)'
                      : 'var(--md-sys-color-surface-container-high)',
                    color: isSelf
                      ? 'var(--md-sys-color-on-primary-container)'
                      : 'var(--md-sys-color-on-surface)',
                    borderColor: isSelf
                      ? 'var(--md-sys-color-primary)'
                      : 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  {msg.audioData ? (
                    <VoiceMessagePlayer
                      id={msg.id}
                      audioData={msg.audioData}
                      isMe={isSelf}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words font-mono text-xs sm:text-sm">
                      {msg.text}
                    </p>
                  )}

                  {!msg.audioData && msg.text && (
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-current/10">
                      <button
                        type="button"
                        onClick={() => playAcousticMessage(msg.text)}
                        className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer"
                        title="Re-broadcast this message as a sound wave"
                      >
                        <MaterialSymbol name="volume_up" className="text-xs" />
                        <span>Replay Sound Wave</span>
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

      {/* Composer Footer */}
      <form
        onSubmit={handleSend}
        className="p-3 sm:p-4 border-t border-[var(--md-sys-color-outline-variant)] flex items-center gap-2"
        style={{ background: 'var(--md-sys-color-surface-container)' }}
      >
        {isRecordingVoice ? (
          <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Recording Voice Note ({recordingDuration}s)...</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stopVoiceNoteRecording(true)}
                className="px-2 py-1 rounded-lg bg-black/20 hover:bg-black/40 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => stopVoiceNoteRecording(false)}
                className="px-2.5 py-1 rounded-lg bg-rose-500 text-white text-xs cursor-pointer"
              >
                Send Audio
              </button>
            </div>
          </div>
        ) : (
          <>
            {onSendVoiceMessage && (
              <button
                type="button"
                onClick={startVoiceNoteRecording}
                className="m3-btn-tonal p-2.5 rounded-2xl shrink-0 cursor-pointer"
                title="Record voice note"
              >
                <MaterialSymbol name="mic" className="text-base" />
              </button>
            )}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type message to modulate into sound waves..."
              maxLength={120}
              className="flex-1 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-mono border border-[var(--md-sys-color-outline-variant)] focus:outline-none focus:border-[var(--md-sys-color-primary)]"
              style={{
                background: 'var(--md-sys-color-surface-container-lowest)',
                color: 'var(--md-sys-color-on-surface)',
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="m3-btn-filled px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-40"
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
