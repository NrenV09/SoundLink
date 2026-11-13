import React from 'react';
import { Radio, MessageSquare, QrCode, Code2, Palette } from 'lucide-react';
import { MaterialThemeState, triggerHaptic } from '../../lib/materialTheme';
import { ActiveModuleTab } from './Header';

interface MobileDockProps {
  activeTab: ActiveModuleTab;
  onSelectTab: (tab: ActiveModuleTab) => void;
  unreadChatCount: number;
  isM3SettingsOpen: boolean;
  onOpenThemeStudio: () => void;
  themeState: MaterialThemeState;
}

const MOBILE_ITEMS = [
  { id: 'waver' as const, label: 'Acoustic', icon: Radio },
  { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
  { id: 'qr' as const, label: 'QR', icon: QrCode },
  { id: 'base64' as const, label: 'Base64', icon: Code2 },
  { id: 'theme' as const, label: 'Theme', icon: Palette },
];

export const MobileDock: React.FC<MobileDockProps> = ({
  activeTab,
  onSelectTab,
  unreadChatCount,
  isM3SettingsOpen,
  onOpenThemeStudio,
  themeState,
}) => {
  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-3 left-3 right-3 z-40 m3-nav-bar rounded-full px-2 py-1.5"
    >
      <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
        {MOBILE_ITEMS.map((item) => {
          const isActive =
            item.id === 'theme' ? isM3SettingsOpen : activeTab === item.id;
          const IconComponent = item.icon;
          const badge = item.id === 'chat' ? unreadChatCount : 0;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                triggerHaptic('light', themeState.hapticsEnabled);
                if (item.id === 'theme') {
                  onOpenThemeStudio();
                } else {
                  onSelectTab(item.id);
                }
              }}
              className="flex flex-col items-center justify-center min-h-[46px] rounded-full transition-all relative cursor-pointer active:scale-95"
            >
              <div
                className="w-11 h-7 rounded-full flex items-center justify-center transition-all duration-200"
                style={{
                  background: isActive ? 'var(--studio-accent)' : 'transparent',
                  color: isActive
                    ? '#FFFFFF'
                    : 'var(--md-sys-color-on-surface-variant)',
                }}
              >
                <IconComponent className="w-4 h-4" />
              </div>
              <span
                className={`text-[10px] mt-0.5 tracking-tight whitespace-nowrap ${
                  isActive
                    ? 'font-bold text-[var(--md-sys-color-on-surface)]'
                    : 'font-medium text-[var(--md-sys-color-on-surface-variant)]'
                }`}
              >
                {item.label}
              </span>
              {badge > 0 && (
                <span
                  className="absolute top-0.5 right-2.5 w-4 h-4 rounded-full text-[9px] font-mono font-bold flex items-center justify-center text-white"
                  style={{ background: 'var(--studio-accent)' }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
