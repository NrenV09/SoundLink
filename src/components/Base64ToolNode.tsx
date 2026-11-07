import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Copy, Check } from 'lucide-react';

export const Base64ToolNode: React.FC = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
      } else {
        const decoded = decodeURIComponent(
          Array.prototype.map
            .call(atob(input), (c: string) => {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join('')
        );
        setOutput(decoded);
      }
    } catch {
      setOutput('Invalid Base64 string. Please verify your input.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[32px] p-5 sm:p-6 space-y-5"
      style={{ background: 'var(--md-sys-color-surface-container-low)' }}
    >
      {/* Header + Mode Pill Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[var(--md-sys-color-on-surface)]">
            Base64 Studio
          </h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            Convert UTF-8 text into Base64 or decode Base64 strings offline
          </p>
        </div>

        <div
          className="inline-flex p-1 rounded-full gap-1 self-start sm:self-auto"
          style={{ background: 'var(--md-sys-color-surface-container)' }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('encode');
              setOutput('');
            }}
            className="min-h-[38px] px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer whitespace-nowrap"
            style={{
              background:
                mode === 'encode'
                  ? 'var(--md-sys-color-primary-container)'
                  : 'transparent',
              color:
                mode === 'encode'
                  ? 'var(--md-sys-color-on-primary-container)'
                  : 'var(--md-sys-color-on-surface-variant)',
            }}
          >
            Encode
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('decode');
              setOutput('');
            }}
            className="min-h-[38px] px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer whitespace-nowrap"
            style={{
              background:
                mode === 'decode'
                  ? 'var(--md-sys-color-tertiary-container)'
                  : 'transparent',
              color:
                mode === 'decode'
                  ? 'var(--md-sys-color-on-tertiary-container)'
                  : 'var(--md-sys-color-on-surface-variant)',
            }}
          >
            Decode
          </button>
        </div>
      </div>

      {/* Input & Output Organic Surfaces */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className="rounded-[24px] p-4 flex flex-col gap-2"
          style={{ background: 'var(--md-sys-color-surface-container-lowest)' }}
        >
          <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            {mode === 'encode' ? 'Source Text' : 'Base64 Input'}
          </span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === 'encode'
                ? 'Type or paste text to encode...'
                : 'Paste Base64 string to decode...'
            }
            rows={6}
            className="w-full bg-transparent text-xs sm:text-sm font-mono resize-none focus:outline-none leading-relaxed"
            style={{ color: 'var(--md-sys-color-on-surface)' }}
          />
        </div>

        <div
          className="rounded-[24px] p-4 flex flex-col gap-2"
          style={{ background: 'var(--md-sys-color-surface-container)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
              Result
            </span>
            {output && (
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1 rounded-full text-xs font-bold m3-btn-tonal flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
          <textarea
            readOnly
            value={output}
            placeholder="Converted output will appear here..."
            rows={6}
            className="w-full bg-transparent text-xs sm:text-sm font-mono resize-none focus:outline-none leading-relaxed"
            style={{ color: 'var(--md-sys-color-on-surface)' }}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={processData}
          className="w-full sm:w-auto min-h-[48px] px-7 py-3 rounded-full m3-btn-filled text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <span>{mode === 'encode' ? 'Encode to Base64' : 'Decode Base64'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};
