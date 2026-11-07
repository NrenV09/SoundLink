import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowDown, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export const Base64ToolNode: React.FC = () => {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
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
      setOutput("");
      return;
    }

    try {
      if (mode === 'encode') {
        const encoded = btoa(encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (match, p1) => {
          return String.fromCharCode(parseInt(p1, 16));
        }));
        setOutput(encoded);
      } else {
        const decoded = decodeURIComponent(Array.prototype.map.call(atob(input), (c) => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        setOutput(decoded);
      }
    } catch (err) {
      setOutput("ERROR: FAILED TO PROCESS STRING. PLEASE MAKE SURE THE INPUT IS VALID BASE64.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col gap-6 w-full max-w-5xl mx-auto overflow-y-auto pb-20 lg:pb-0"
    >
      <div className="m3-card p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--md-sys-color-outline-variant)] pb-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold text-text">
              Text Encoder & Decoder
            </h2>
            <p className="text-xs sm:text-sm text-muted">
              Convert normal text into Base64 code, or decode Base64 code back into readable text.
            </p>
          </div>

          <div className="flex gap-1 m3-surface-low p-1 rounded-full border border-[var(--md-sys-color-outline-variant)] self-start sm:self-auto">
            <button 
              type="button"
              onClick={() => { setMode('encode'); setOutput(""); }}
              className={cn(
                "px-4 py-2 text-xs font-semibold rounded-full transition-all cursor-pointer",
                mode === 'encode' 
                  ? "m3-tonal-active shadow-2xs" 
                  : "text-muted hover:text-text"
              )}
            >
              Encode Text
            </button>
            <button 
              type="button"
              onClick={() => { setMode('decode'); setOutput(""); }}
              className={cn(
                "px-4 py-2 text-xs font-semibold rounded-full transition-all cursor-pointer",
                mode === 'decode' 
                  ? "m3-btn-tertiary shadow-2xs" 
                  : "text-muted hover:text-text"
              )}
            >
              Decode Base64
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row h-auto lg:h-96 relative gap-5">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-xs font-bold text-text">
              {mode === 'encode' ? "1. Enter Normal Text" : "1. Paste Base64 Code"}
            </label>
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === 'encode' ? "Type or paste normal text here..." : "Paste Base64 code here to decode..."}
              className="flex-1 m3-surface-low border border-[var(--md-sys-color-outline-variant)] rounded-2xl resize-none p-4 text-sm text-text font-mono focus:border-[var(--md-sys-color-primary)] focus:outline-none transition-colors min-h-[200px] placeholder:text-muted/60"
            />
          </div>

          <div className="hidden lg:flex items-center justify-center">
            <button 
              type="button"
              onClick={processData}
              className={cn(
                "px-5 py-3 rounded-full flex items-center justify-center gap-1.5 shadow-2xs transition-all flex-shrink-0 mt-6 cursor-pointer text-xs font-semibold active:scale-95",
                mode === 'encode' ? "m3-btn-filled" : "m3-btn-tertiary"
              )}
              title="Convert Text"
            >
              <span>Convert</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex lg:hidden items-center justify-center my-1">
            <button 
              type="button"
              onClick={processData}
              className={cn(
                "px-6 py-3 rounded-full flex items-center justify-center gap-1.5 shadow-2xs transition-all flex-shrink-0 cursor-pointer text-xs font-semibold active:scale-95",
                mode === 'encode' ? "m3-btn-filled" : "m3-btn-tertiary"
              )}
            >
              <span>Convert</span>
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2 flex-1 relative">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text">
                {mode === 'encode' ? "2. Encoded Base64 Result" : "2. Decoded Text Result"}
              </label>
              <button 
                type="button"
                onClick={handleCopy}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95",
                  copied ? "bg-success/15 text-success border border-success/30" : "m3-btn-tonal"
                )}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy Result"}
              </button>
            </div>
            <textarea 
              readOnly
              value={output}
              placeholder="Converted result will appear here..."
              className="flex-1 m3-surface-low border border-[var(--md-sys-color-outline-variant)] rounded-2xl resize-none p-4 text-sm text-text font-mono focus:outline-none min-h-[200px] placeholder:text-muted/60"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};
