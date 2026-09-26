import React, { useMemo } from 'react';
import SiriOrb from './siri-orb';
import type { AIState } from './siri-orb/ai-core';

export interface VoiceOrbProps {
  status?: 'idle' | 'connecting' | 'connected' | 'error';
  duplexPhase?: 'idle' | 'listening' | 'thinking' | 'speaking';
  audioLevel?: number;
  fsmState?: string;
  onClick?: () => void;
  className?: string;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  status = 'idle',
  duplexPhase = 'idle',
  audioLevel = 0,
  fsmState = 'Active_Listening',
  onClick,
  className = '',
}) => {
  const orbColors = useMemo(() => {
    switch (fsmState) {
      case 'Active_Listening':
        return {
          bg: 'oklch(94% 0.03 160)',
          c1: 'oklch(75% 0.18 160)',
          c2: 'oklch(78% 0.15 190)',
          c3: 'oklch(70% 0.17 145)',
          c4: 'oklch(80% 0.16 175)',
        };
      case 'CBT_Stripping':
        return {
          bg: 'oklch(93% 0.03 240)',
          c1: 'oklch(70% 0.19 230)',
          c2: 'oklch(74% 0.17 210)',
          c3: 'oklch(68% 0.18 260)',
          c4: 'oklch(76% 0.16 220)',
        };
      case 'Socratic_Questioning':
        return {
          bg: 'oklch(93% 0.03 290)',
          c1: 'oklch(72% 0.19 280)',
          c2: 'oklch(68% 0.18 310)',
          c3: 'oklch(70% 0.20 270)',
          c4: 'oklch(75% 0.17 295)',
        };
      case 'Crisis_Escalation':
        return {
          bg: 'oklch(92% 0.04 25)',
          c1: 'oklch(68% 0.22 25)',
          c2: 'oklch(72% 0.20 40)',
          c3: 'oklch(64% 0.23 15)',
          c4: 'oklch(74% 0.19 30)',
        };
      default:
        return {
          bg: 'oklch(93% 0.03 300)',
          c1: 'oklch(68% 0.21 350)',
          c2: 'oklch(70% 0.18 210)',
          c3: 'oklch(66% 0.2 285)',
          c4: 'oklch(72% 0.19 325)',
        };
    }
  }, [fsmState]);

  const isError = status === 'error';
  const isListening = !isError && status === 'connected' && duplexPhase === 'listening';
  const isThinking = !isError && (status === 'connecting' || (status === 'connected' && duplexPhase === 'thinking'));
  const isSpeaking = !isError && status === 'connected' && duplexPhase === 'speaking';

  const aiState: AIState = isError
    ? 'error'
    : isListening
    ? 'listening'
    : isThinking
    ? 'thinking'
    : isSpeaking
    ? 'streaming'
    : 'idle';

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label="Voice Orb"
      className={`relative w-72 h-72 flex items-center justify-center overflow-visible select-none transition-transform ${
        onClick ? 'cursor-pointer hover:scale-[1.03] active:scale-[0.98]' : ''
      } ${className}`}
    >
      <div className="relative z-10 flex items-center justify-center pointer-events-none">
        <SiriOrb
          size="192px"
          state={aiState}
          amplitude={audioLevel}
          colors={orbColors}
          animationDuration={18}
        />
      </div>
    </div>
  );
};

export default VoiceOrb;
