import React, { useState } from 'react';
import { POLICY_SECTIONS, LEGAL_AUDIT_CHECKLIST } from '../data/legalPolicies';
import { cn } from '../lib/utils';
import { MaterialSymbol } from '../lib/materialTheme';

export const LegalComplianceView: React.FC = () => {
  const [selectedSectionId, setSelectedSectionId] = useState<string>('privacy_policy');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [showConsentManager, setShowConsentManager] = useState(false);

  // Storage Consent state
  const [cacheStorageEnabled, setCacheStorageEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nexus_consent_cache_storage');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [opfsEnabled, setOpfsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nexus_consent_opfs');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [consentSavedMsg, setConsentSavedMsg] = useState(false);

  const handleSaveConsent = () => {
    try {
      localStorage.setItem('nexus_cookie_consent', 'acknowledged');
      localStorage.setItem('nexus_consent_cache_storage', String(cacheStorageEnabled));
      localStorage.setItem('nexus_consent_opfs', String(opfsEnabled));
      setConsentSavedMsg(true);
      setTimeout(() => setConsentSavedMsg(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const getSectionSymbolName = (iconName: string): string => {
    switch (iconName) {
      case 'ShieldCheck': return 'verified_user';
      case 'FileText': return 'description';
      case 'Cookie': return 'cookie';
      case 'DollarSign': return 'volunteer_activism';
      case 'CheckSquare': return 'fact_check';
      case 'EyeOff': return 'visibility_off';
      case 'Layers': return 'layers';
      case 'Accessibility': return 'accessibility_new';
      case 'BadgeCheck': return 'verified';
      case 'Building': return 'domain';
      case 'Award': return 'workspace_premium';
      case 'AlertTriangle': return 'gpp_maybe';
      default: return 'policy';
    }
  };

  const filteredSections = POLICY_SECTIONS.filter(sec => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const matchTitle = sec.title.toLowerCase().includes(q) || sec.shortDescription.toLowerCase().includes(q);
    const matchContent = sec.content.some(c => 
      c.heading.toLowerCase().includes(q) || 
      c.paragraphs.some(p => p.toLowerCase().includes(q))
    );
    return matchTitle || matchContent;
  });

  const activeSection = POLICY_SECTIONS.find(s => s.id === selectedSectionId) || POLICY_SECTIONS[0];
  const activeSymbol = getSectionSymbolName(activeSection.iconName);

  const handleCopyLegalSummary = () => {
    const text = POLICY_SECTIONS.map(s => {
      const body = s.content.map(c => `${c.heading}\n${c.paragraphs.join('\n')}`).join('\n\n');
      return `=== ${s.title.toUpperCase()} ===\n${body}\n`;
    }).join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-5">
      {/* Top Expressive Banner: 14-Point Legal & Regulatory Audit */}
      <div
        className="m3-card-xl rounded-[28px] p-5 sm:p-6 border relative overflow-hidden"
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
      >
        <div
          className="absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl pointer-events-none opacity-25"
          style={{ backgroundColor: 'var(--md-sys-color-tertiary-container)' }}
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 relative z-10">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-[18px] flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: 'var(--md-sys-color-tertiary-container)',
                color: 'var(--md-sys-color-on-tertiary-container)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <MaterialSymbol name="verified" size={24} filled />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <h3 className="text-sm sm:text-base font-bold text-text tracking-tight">
                  Quantum Link Legal & Regulatory Compliance
                </h3>
                <span
                  className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                  }}
                >
                  14/14 PASSED
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Audited zero-knowledge WebRTC architecture: GDPR/CCPA disclosures, zero tracking cookies, MIT open-source terms, WCAG 2.1 AA, and ECCN cryptographic compliance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setShowConsentManager(!showConsentManager)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer",
                showConsentManager ? "m3-btn-filled shadow-xs" : "m3-btn-tonal"
              )}
            >
              <MaterialSymbol name="tune" size={16} />
              <span>{showConsentManager ? 'Hide Storage Controls' : 'Storage Consent'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLegalSummary}
              className="px-4 py-2 rounded-full m3-surface-interactive border text-xs font-semibold text-text flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
              title="Copy complete legal & regulatory bundle"
            >
              <MaterialSymbol name={copied ? 'check' : 'content_copy'} size={15} />
              <span>{copied ? 'Copied Bundle' : 'Copy Legal Bundle'}</span>
            </button>
          </div>
        </div>

        {/* 14-Point Compliance Checklist Chips */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 pt-4 border-t relative z-10"
          style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
        >
          {LEGAL_AUDIT_CHECKLIST.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 text-[11px] text-text px-3 py-2 rounded-2xl border transition-colors"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-low)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
              title={item.desc}
            >
              <MaterialSymbol
                name="check_circle"
                size={15}
                filled
                className="text-emerald-500 shrink-0"
              />
              <span className="truncate font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* On-Device Storage & Consent Preferences Sheet */}
      {showConsentManager && (
        <div
          className="m3-card-xl rounded-[28px] p-5 sm:p-6 border space-y-4 animate-in fade-in duration-200"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container-low)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary-container)',
                  color: 'var(--md-sys-color-on-primary-container)',
                }}
              >
                <MaterialSymbol name="database" size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text">On-Device Storage & Cookie Consent</h4>
                <p className="text-[11px] text-muted">
                  Granular browser sandbox controls • Zero external telemetry
                </p>
              </div>
            </div>
            {consentSavedMsg && (
              <span
                className="text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5"
                style={{
                  backgroundColor: 'var(--md-sys-color-tertiary-container)',
                  color: 'var(--md-sys-color-on-tertiary-container)',
                }}
              >
                <MaterialSymbol name="check_circle" size={15} filled />
                <span>Preferences Saved</span>
              </span>
            )}
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Quantum Link uses zero tracking or advertising cookies. All storage toggles below control strictly local, client-side browser mechanisms for your profile identity, Material You theme, and sandboxed file transfers.
          </p>

          <div className="space-y-2.5 text-xs">
            {/* Essential */}
            <div
              className="m3-card p-3.5 rounded-2xl border flex items-center justify-between gap-3"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="space-y-0.5 pr-2">
                <div className="font-bold text-text flex items-center gap-2 flex-wrap">
                  <span>Essential P2P & Session Storage</span>
                  <span
                    className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--md-sys-color-secondary-container)',
                      color: 'var(--md-sys-color-on-secondary-container)',
                    }}
                  >
                    Always Active
                  </span>
                </div>
                <div className="text-muted text-[11px] leading-relaxed">
                  Required for WebRTC cryptographic handshakes, Material You theme tokens, and local peer identity.
                </div>
              </div>
              <div
                className="px-3 py-1 rounded-full text-[11px] font-semibold shrink-0"
                style={{
                  backgroundColor: 'var(--md-sys-color-primary-container)',
                  color: 'var(--md-sys-color-on-primary-container)',
                }}
              >
                Required
              </div>
            </div>

            {/* CacheStorage */}
            <label
              className="m3-card p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="space-y-0.5 pr-2">
                <div className="font-bold text-text flex items-center gap-2 flex-wrap">
                  <span>Drop Zone CacheStorage Sandbox (app-cache-v1)</span>
                  <span
                    className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--md-sys-color-primary-container)',
                      color: 'var(--md-sys-color-on-primary-container)',
                    }}
                  >
                    Functional
                  </span>
                </div>
                <div className="text-muted text-[11px] leading-relaxed">
                  Persists files in your device's browser cache disk bucket so large transfers do not consume system RAM.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={cacheStorageEnabled}
                onClick={() => setCacheStorageEnabled(!cacheStorageEnabled)}
                className={cn(
                  "w-12 h-7 rounded-full p-1 transition-colors flex items-center shrink-0 cursor-pointer border",
                  cacheStorageEnabled ? "justify-end" : "justify-start"
                )}
                style={{
                  backgroundColor: cacheStorageEnabled
                    ? 'var(--md-sys-color-primary)'
                    : 'var(--md-sys-color-surface-container-highest)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                <span
                  className="w-5 h-5 rounded-full shadow-xs transition-transform"
                  style={{
                    backgroundColor: cacheStorageEnabled
                      ? 'var(--md-sys-color-on-primary)'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                />
              </button>
            </label>

            {/* OPFS */}
            <label
              className="m3-card p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            >
              <div className="space-y-0.5 pr-2">
                <div className="font-bold text-text flex items-center gap-2 flex-wrap">
                  <span>Origin Private File System (OPFS) Direct Streamer</span>
                  <span
                    className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--md-sys-color-tertiary-container)',
                      color: 'var(--md-sys-color-on-tertiary-container)',
                    }}
                  >
                    High-Speed Disk IO
                  </span>
                </div>
                <div className="text-muted text-[11px] leading-relaxed">
                  Enables multi-gigabyte zero-copy disk streaming when saving massive payloads directly to storage.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={opfsEnabled}
                onClick={() => setOpfsEnabled(!opfsEnabled)}
                className={cn(
                  "w-12 h-7 rounded-full p-1 transition-colors flex items-center shrink-0 cursor-pointer border",
                  opfsEnabled ? "justify-end" : "justify-start"
                )}
                style={{
                  backgroundColor: opfsEnabled
                    ? 'var(--md-sys-color-primary)'
                    : 'var(--md-sys-color-surface-container-highest)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                <span
                  className="w-5 h-5 rounded-full shadow-xs transition-transform"
                  style={{
                    backgroundColor: opfsEnabled
                      ? 'var(--md-sys-color-on-primary)'
                      : 'var(--md-sys-color-on-surface-variant)',
                  }}
                />
              </button>
            </label>
          </div>

          <div
            className="flex justify-end gap-2 pt-3 border-t"
            style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
          >
            <button
              type="button"
              onClick={handleSaveConsent}
              className="px-5 py-2 rounded-full m3-btn-filled text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <MaterialSymbol name="save" size={16} />
              <span>Save Storage Preferences</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Legal & Regulatory Explorer: Navigation Rail & Policy Sheet */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Pill Search & Section List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <MaterialSymbol
              name="search"
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search legal & regulatory policies..."
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-full border text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)] transition-all"
              style={{
                backgroundColor: 'var(--md-sys-color-surface-container-low)',
                borderColor: 'var(--md-sys-color-outline-variant)',
              }}
            />
          </div>

          <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1 scrollbar-hide">
            {filteredSections.map((sec) => {
              const symbolName = getSectionSymbolName(sec.iconName);
              const isSelected = sec.id === selectedSectionId;
              return (
                <button
                  key={sec.id}
                  onClick={() => setSelectedSectionId(sec.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between gap-2.5 cursor-pointer",
                    isSelected ? "shadow-xs" : "m3-surface-interactive"
                  )}
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'var(--md-sys-color-surface-container-low)',
                    color: isSelected
                      ? 'var(--md-sys-color-on-secondary-container)'
                      : 'var(--md-sys-color-on-surface)',
                    borderColor: isSelected
                      ? 'var(--md-sys-color-primary)'
                      : 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: isSelected
                          ? 'var(--md-sys-color-primary)'
                          : 'var(--md-sys-color-surface-container-high)',
                        color: isSelected
                          ? 'var(--md-sys-color-on-primary)'
                          : 'var(--md-sys-color-on-surface-variant)',
                      }}
                    >
                      <MaterialSymbol name={symbolName} size={18} filled={isSelected} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{sec.title}</div>
                      <div className="text-[11px] opacity-75 truncate">{sec.shortDescription}</div>
                    </div>
                  </div>
                  <MaterialSymbol
                    name="chevron_right"
                    size={18}
                    className={cn(
                      "shrink-0 transition-transform",
                      isSelected ? "translate-x-0.5 opacity-100" : "opacity-45"
                    )}
                  />
                </button>
              );
            })}

            {filteredSections.length === 0 && (
              <div
                className="p-6 rounded-2xl border text-center text-xs text-muted"
                style={{
                  backgroundColor: 'var(--md-sys-color-surface-container-low)',
                  borderColor: 'var(--md-sys-color-outline-variant)',
                }}
              >
                No legal or regulatory policies match "{searchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Policy Document Card */}
        <div
          className="lg:col-span-8 m3-card-xl rounded-[28px] p-5 sm:p-6 border space-y-5"
          style={{
            backgroundColor: 'var(--md-sys-color-surface-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          }}
        >
          <div
            className="border-b pb-4"
            style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
          >
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border"
                  style={{
                    backgroundColor: 'var(--md-sys-color-primary-container)',
                    color: 'var(--md-sys-color-on-primary-container)',
                    borderColor: 'var(--md-sys-color-outline-variant)',
                  }}
                >
                  <MaterialSymbol name={activeSymbol} size={22} filled />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-text tracking-tight">
                    {activeSection.title}
                  </h3>
                  <div className="text-xs text-muted">{activeSection.shortDescription}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[10px] font-semibold px-3 py-1 rounded-full"
                  style={{
                    backgroundColor: 'var(--md-sys-color-tertiary-container)',
                    color: 'var(--md-sys-color-on-tertiary-container)',
                  }}
                >
                  {activeSection.badge}
                </span>
                <span
                  className="text-[10px] font-mono px-2.5 py-1 rounded-full border text-muted"
                  style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
                >
                  {activeSection.lastUpdated}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-5 text-xs leading-relaxed text-text">
            {activeSection.content.map((block, idx) => (
              <div key={idx} className="space-y-2.5">
                <h4 className="text-sm font-bold text-text flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: 'var(--md-sys-color-primary)' }}
                  />
                  <span>{block.heading}</span>
                </h4>
                {block.paragraphs.map((p, pIdx) => (
                  <p key={pIdx} className="text-muted leading-relaxed pl-4">
                    {p}
                  </p>
                ))}

                {block.subsections && block.subsections.map((sub, sIdx) => (
                  <div
                    key={sIdx}
                    className="m3-card p-4 rounded-2xl border space-y-2.5 mt-2.5"
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container-low)',
                      borderColor: 'var(--md-sys-color-outline-variant)',
                    }}
                  >
                    <div className="font-bold text-text text-xs flex items-center gap-1.5">
                      <MaterialSymbol
                        name="subheader"
                        size={15}
                        className="text-[color:var(--md-sys-color-primary)]"
                      />
                      <span>{sub.title}</span>
                    </div>
                    <ul className="space-y-2 pl-2 text-muted">
                      {sub.items.map((item, iIdx) => (
                        <li key={iIdx} className="leading-relaxed flex items-start gap-2">
                          <span
                            className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                            style={{ backgroundColor: 'var(--md-sys-color-primary)' }}
                          />
                          <span>
                            <strong className="text-text font-semibold">{item.split(':')[0]}:</strong>
                            {item.split(':').slice(1).join(':')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Maintainer & Verification Footer */}
          <div
            className="pt-4 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted"
            style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}
          >
            <div className="flex items-center gap-2">
              <MaterialSymbol name="gavel" size={16} className="text-[color:var(--md-sys-color-primary)]" />
              <span>
                Maintainer: <strong className="text-text">Quantum Link Open Source Collective</strong> • legal@quantumlink.dev
              </span>
            </div>
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold"
              style={{
                backgroundColor: 'var(--md-sys-color-secondary-container)',
                color: 'var(--md-sys-color-on-secondary-container)',
              }}
            >
              <MaterialSymbol name="verified_user" size={15} filled />
              <span>Client-Side P2P Verified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
