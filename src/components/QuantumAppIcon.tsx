import React from 'react';
import { AppIconPresetId, AppIconShape, getIconShapeRadiusClass } from '../lib/materialTheme';
import { cn } from '../lib/utils';

interface QuantumAppIconProps {
  preset: AppIconPresetId;
  shape: AppIconShape;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const QuantumAppIcon: React.FC<QuantumAppIconProps> = ({
  preset,
  shape,
  size = 'md',
  className,
}) => {
  const sizeClasses = {
    sm: 'w-9 h-9',
    md: 'w-11 h-11',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  }[size];

  const svgSizes = {
    sm: 20,
    md: 24,
    lg: 30,
    xl: 42,
  }[size];

  const shapeClass = getIconShapeRadiusClass(shape);

  // Determine container background & foreground style based on preset
  const getPresetStyles = () => {
    switch (preset) {
      case 'monochrome':
        return {
          containerStyle: {
            backgroundColor: 'var(--md-sys-color-primary-container)',
            color: 'var(--md-sys-color-on-primary-container)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          },
          accentRing: 'var(--md-sys-color-on-primary-container)',
          secondaryFill: 'transparent',
        };
      case 'dynamic-adaptive':
        return {
          containerStyle: {
            background: 'linear-gradient(135deg, var(--md-sys-color-primary) 0%, var(--md-sys-color-tertiary) 100%)',
            color: 'var(--md-sys-color-on-primary)',
            borderColor: 'var(--md-sys-color-outline-variant)',
          },
          accentRing: 'var(--md-sys-color-primary-container)',
          secondaryFill: 'var(--md-sys-color-secondary-container)',
        };
      case 'quantum-core':
        return {
          containerStyle: {
            background: 'radial-gradient(circle at 30% 25%, #6366f1 0%, #312e81 65%, #0f172a 100%)',
            color: '#ffffff',
            borderColor: 'rgba(129, 140, 248, 0.4)',
          },
          accentRing: '#38bdf8',
          secondaryFill: 'rgba(99, 102, 241, 0.35)',
        };
      case 'obsidian-pulse':
        return {
          containerStyle: {
            background: 'linear-gradient(145deg, #111827 0%, #090d16 100%)',
            color: '#34d399',
            borderColor: 'rgba(52, 211, 153, 0.35)',
          },
          accentRing: '#10b981',
          secondaryFill: 'rgba(16, 185, 129, 0.2)',
        };
      case 'solar-flare':
        return {
          containerStyle: {
            background: 'linear-gradient(135deg, #f59e0b 0%, #e11d48 100%)',
            color: '#ffffff',
            borderColor: 'rgba(253, 224, 71, 0.4)',
          },
          accentRing: '#fef08a',
          secondaryFill: 'rgba(255, 255, 255, 0.2)',
        };
      case 'cyber-blueprint':
      default:
        return {
          containerStyle: {
            background: 'linear-gradient(145deg, #0284c7 0%, #0369a1 100%)',
            color: '#ffffff',
            borderColor: 'rgba(125, 211, 252, 0.45)',
          },
          accentRing: '#bae6fd',
          secondaryFill: 'rgba(255, 255, 255, 0.18)',
        };
    }
  };

  const { containerStyle, accentRing } = getPresetStyles();

  return (
    <div
      style={containerStyle}
      className={cn(
        'relative flex items-center justify-center shrink-0 overflow-hidden border shadow-xs transition-all duration-200 select-none',
        sizeClasses,
        shapeClass,
        className
      )}
    >
      {/* Subtle Adaptive Background Grid for Blueprint / Adaptive */}
      {preset === 'cyber-blueprint' && (
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '8px 8px',
          }}
        />
      )}

      {/* Quantum Link Interlocking Vector Emblem */}
      <svg
        width={svgSizes}
        height={svgSizes}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10"
      >
        {/* Outer Quantum Orbit */}
        <circle
          cx="16"
          cy="16"
          r="11.5"
          stroke={accentRing}
          strokeWidth="2.2"
          strokeDasharray={preset === 'monochrome' ? undefined : '5 3'}
          opacity={preset === 'monochrome' ? 0.45 : 0.85}
        />
        {/* Interlocking Peer Nodes */}
        <path
          d="M11.5 16C11.5 13.5147 13.5147 11.5 16 11.5H19.5C21.9853 11.5 24 13.5147 24 16C24 18.4853 21.9853 20.5 19.5 20.5H17.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M20.5 16C20.5 18.4853 18.4853 20.5 16 20.5H12.5C10.0147 20.5 8 18.4853 8 16C8 13.5147 10.0147 11.5 12.5 11.5H14.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        {/* Center Quantum Singularity Node */}
        <circle cx="16" cy="16" r="2.6" fill="currentColor" />
      </svg>
    </div>
  );
};
