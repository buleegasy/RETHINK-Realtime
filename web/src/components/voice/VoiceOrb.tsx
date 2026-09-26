import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const colorMap = useMemo(() => {
    switch (fsmState) {
      case 'Onboarding':
        return { primary: '#e0e7ff', secondary: '#818cf8', rgb: '129, 140, 248' };
      case 'Active_Listening':
        return { primary: '#d1fae5', secondary: '#34d399', rgb: '52, 211, 153' };
      case 'CBT_Stripping':
        return { primary: '#dbeafe', secondary: '#60a5fa', rgb: '96, 165, 250' };
      case 'Socratic_Questioning':
        return { primary: '#ede9fe', secondary: '#a78bfa', rgb: '167, 139, 250' };
      case 'Crisis_Escalation':
        return { primary: '#fee2e2', secondary: '#f87171', rgb: '248, 113, 113' };
      default:
        return { primary: '#fef3c7', secondary: '#f59e0b', rgb: '245, 158, 11' };
    }
  }, [fsmState]);

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
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <filter id="voice-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <AnimatePresence>
        {isListening && (
          <>
            <motion.div
              key="halo-1"
              className="absolute w-48 h-48 rounded-full border border-secondary/50 pointer-events-none"
              initial={{ scale: 0.85, opacity: 0.8 }}
              animate={{ scale: [0.85, 2.3], opacity: [0.8, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.div
              key="halo-2"
              className="absolute w-48 h-48 rounded-full border border-secondary/40 pointer-events-none"
              initial={{ scale: 0.85, opacity: 0.6 }}
              animate={{ scale: [0.85, 2.8], opacity: [0.6, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, repeat: Infinity, delay: 0.6, ease: 'easeOut' }}
            />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            key="speaking-wave"
            className="absolute w-52 h-52 rounded-full border border-primary/30 pointer-events-none"
            animate={{
              scale: [1, 1.25 + Math.min(audioLevel * 1.5, 0.6), 1],
              opacity: [0.4, 0.8, 0.4],
            }}
            transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              boxShadow: `0 0 35px rgba(${colorMap.rgb}, 0.35)`,
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isThinking && !isError && (
          <motion.div
            key="gemini-shimmer"
            className="absolute w-48 h-48 rounded-full pointer-events-none mix-blend-screen opacity-70"
            animate={{
              rotate: [0, 360],
              scale: [0.95, 1.15, 0.95],
            }}
            transition={{
              rotate: { duration: 4.5, repeat: Infinity, ease: 'linear' },
              scale: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            }}
            style={{
              background:
                'conic-gradient(from 0deg, #818cf8, #38bdf8, #c084fc, #f472b6, #818cf8)',
              filter: 'blur(20px)',
            }}
          />
        )}
      </AnimatePresence>

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
