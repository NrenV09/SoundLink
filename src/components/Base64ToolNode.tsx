import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Copy, Check, ArrowLeftRight, Code2, Sparkles } from 'lucide-react';
import type { StudioToastType } from './layout/ToastContainer';

interface Base64ToolNodeProps {
  onNotify?: (title: string, description?: string, type?: StudioToastType) => void;
}

export const Base64ToolNode: React.FC<Base64ToolNodeProps> = ({ onNotify }) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [stacked, setStacked] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      setCopied(true);
      onNotify?.('Copied Base64 Result', `${output.length} characters copied`, 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSwap = () => {
    if (!output) return;
    setInput(output);
    setOutput('');
    setMode((m) => (m === 'encode' ? 'decode' : 'encode'));
    onNotify?.('Swapped input & output', undefined, 'info');
  };

  const processData = () => {
    if (!input) {
      setOutput('');
      return;
    }

    try {
      if (mode === 'encode') {
        const encoded = btoa(
          encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_match, p1) => {
            return String.fromCharCode(parseInt(p1, 16));
          })
        );
        setOutput(encoded);
        onNotify?.('Encoded UTF-8 to Base64', `${encoded.length} chars output`, 'success');
      } else {
        const decoded = decodeURIComponent(
          Array.prototype.map
            .call(atob(input), (c: string) => {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join('')
        );
        setOutput(decoded);
        onNotify?.('Decoded Base64 to UTF-8', `${decoded.length} chars output`, 'success');
      }
    } catch {
      setOutput('Invalid Base64 string. Please verify your input.');
      onNotify?.('Invalid Base64 String', 'Please verify padding and characters.', 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="studio-card p-5 sm:p-6 space-y-5"
    >
      {/* Header + Animated Mode Pill Switcher + Flexible Orientation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center border shrink-0"
            style={{
              background: 'var(--md-sys-color-primary-container)',
              borderColor: 'color-mix(in srgb, var(--studio-accent) 30%, transparent)',
              color: 'var(--studio-accent)',
            }}
          >
            <Code2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
              Base64 Studio
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Convert UTF-8 text into Base64 or decode Base64 strings offline
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStacked((v) => !v)}
            className="hidden lg:inline-flex min-h-[38px] px-3.5 py-1.5 m3-btn-tonal text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            {stacked ? 'Split View' : 'Stack View'}
          </button>

          <div
            className="inline-flex p-1 rounded-full gap-1 self-start sm:self-auto border"
            style={{
              background: 'var(--md-sys-color-surface-container-lowest)',
              borderColor: 'var(--studio-border)',
            }}
          >
            {(['encode', 'decode'] as const).map((tabMode) => {
              const active = mode === tabMode;
              return (
                <button
                  key={tabMode}
                  type="button"
                  onClick={() => {
                    setMode(tabMode);
                    setOutput('');
                  }}
                  className="relative min-h-[36px] px-4 py-1 text-xs font-semibold rounded-full cursor-pointer whitespace-nowrap z-0 capitalize"
                  style={{
                    color: active
                      ? '#FFFFFF'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                >
                  {active && (
                    <motion.span
                      layoutId="base64-mode-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-full -z-10"
                      style={{ background: 'var(--studio-accent)' }}
                    />
                  )}
                  {tabMode}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Input & Output Flexible Studio Surfaces */}
      <div className={`grid grid-cols-1 ${stacked ? '' : 'lg:grid-cols-2'} gap-4`}>
        <div className="studio-inset p-4 flex flex-col gap-2 focus-within:border-[var(--studio-accent)] transition-colors">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--studio-border)]">
            <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              {mode === 'encode' ? 'Source Text' : 'Base64 Input'}
            </span>
            <div className="flex items-center gap-2">
              {!input && (
                <button
                  type="button"
                  onClick={() =>
                    setInput(
                      mode === 'encode'
                        ? '{"node":"SoundLink","offline":true}'
                        : 'eyJub2RlIjoiU291bmRMaW5rIiwib2ZmbGluZSI6dHJ1ZX0='
                    )
                  }
                  className="text-[11px] font-semibold text-[var(--studio-accent)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Sample</span>
                </button>
              )}
              <span className="text-[11px] font-mono tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                {input.length} chars
              </span>
            </div>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === 'encode'
                ? 'Type or paste text to encode...'
                : 'Paste Base64 string to decode...'
            }
            rows={7}
            className="w-full bg-transparent text-xs sm:text-sm font-mono resize-y min-h-[150px] focus:outline-none leading-relaxed"
            style={{ color: 'var(--md-sys-color-on-surface)' }}
          />
        </div>

        <div
          className="rounded-[18px] p-4 flex flex-col gap-2 border"
          style={{
            background: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--studio-border)',
            boxShadow: 'var(--studio-top-highlight)',
          }}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--studio-border)]">
            <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              Result
            </span>
            <div className="flex items-center gap-1.5">
              {output && (
                <>
                  <button
                    type="button"
                    onClick={handleSwap}
                    className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 cursor-pointer hover:bg-white/10 text-[var(--md-sys-color-on-surface-variant)] border border-[var(--studio-border)]"
                    title="Move Result to Input & Flip Mode"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>Swap</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-1 rounded-full text-xs font-semibold m3-btn-tonal flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            readOnly
            value={output}
            placeholder="Converted output will appear here..."
            rows={7}
            className="w-full bg-transparent text-xs sm:text-sm font-mono resize-y min-h-[150px] focus:outline-none leading-relaxed"
            style={{ color: 'var(--md-sys-color-on-surface)' }}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={processData}
          disabled={!input.trim()}
          className="w-full sm:w-auto min-h-[46px] px-7 py-2.5 rounded-full m3-btn-filled text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          <span>{mode === 'encode' ? 'Encode to Base64' : 'Decode Base64'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};
