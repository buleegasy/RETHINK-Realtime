import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface VoiceOrbProps {
  duplexPhase?: 'idle' | 'listening' | 'thinking' | 'speaking';
  audioLevel?: number;
  onClick?: () => void;
  className?: string;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  duplexPhase = 'idle',
  audioLevel = 0,
  onClick,
  className = '',
}) => {
  const isIdle = duplexPhase === 'idle';
  const isListening = duplexPhase === 'listening';
  const isThinking = duplexPhase === 'thinking';
  const isSpeaking = duplexPhase === 'speaking';

  const baseScale = isIdle
    ? 1
    : isListening
    ? 1 + Math.min(audioLevel * 1.8, 0.6)
    : isSpeaking
    ? 1 + Math.min(audioLevel * 2.2, 0.75)
    : 1.05;

  return (
    <div
      onClick={onClick}
      className={`relative w-72 h-72 flex items-center justify-center select-none ${
        onClick ? 'cursor-pointer' : ''
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
              key="listen-wave-1"
              className="absolute w-44 h-44 rounded-full border border-black/20 pointer-events-none"
              initial={{ scale: 0.9, opacity: 0.6 }}
              animate={{ scale: [0.9, 2.2], opacity: [0.6, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.div
              key="listen-wave-2"
              className="absolute w-44 h-44 rounded-full border border-black/15 pointer-events-none"
              initial={{ scale: 0.9, opacity: 0.5 }}
              animate={{ scale: [0.9, 2.7], opacity: [0.5, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, delay: 0.5, ease: 'easeOut' }}
            />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            key="speaking-wave"
            className="absolute w-48 h-48 rounded-full border border-black/25 pointer-events-none"
            animate={{
              scale: [1, 1.25 + Math.min(audioLevel * 1.5, 0.5), 1],
              opacity: [0.3, 0.7, 0.3],
            }}
            transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isThinking && (
          <motion.div
            key="thinking-spin"
            className="absolute w-48 h-48 rounded-full border border-dashed border-black/30 pointer-events-none"
            animate={{
              rotate: 360,
              scale: [1, 1.08, 1],
            }}
            transition={{
              rotate: { duration: 6, repeat: Infinity, ease: 'linear' },
              scale: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="absolute w-44 h-44 rounded-full pointer-events-none bg-black/[0.04]"
        animate={{
          scale: isThinking
            ? [1, 1.2, 1]
            : isListening
            ? [1.05, 1.35, 1.05]
            : isSpeaking
            ? [1.1, 1.45, 1.1]
            : [1, 1.06, 1],
        }}
        transition={{
          duration: isIdle ? 3.6 : isThinking ? 2 : isListening ? 1.4 : 0.7,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className="relative w-36 h-36 flex items-center justify-center pointer-events-none"
        style={{ filter: 'url(#voice-goo)' }}
        animate={{ scale: baseScale }}
        transition={{ type: 'spring', damping: 20, stiffness: 220 }}
      >
        <motion.div
          className="absolute w-24 h-24 rounded-full bg-neutral-900"
          animate={{
            rotate: 360,
            scale: isThinking
              ? [1, 0.92, 1]
              : isIdle
              ? [1, 1.04, 1]
              : 1,
          }}
          transition={{
            rotate: { duration: isThinking ? 4 : 16, repeat: Infinity, ease: 'linear' },
            scale: { duration: isIdle ? 3.2 : 0.8, repeat: Infinity, ease: 'easeInOut' },
          }}
        />

        <motion.div
          className="absolute w-14 h-14 rounded-full bg-neutral-700"
          animate={{
            rotate: -360,
            x: [16, -16, 16],
            y: [-16, 16, -16],
          }}
          transition={{
            rotate: { duration: 9, repeat: Infinity, ease: 'linear' },
            x: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
            y: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' },
          }}
        />

        <motion.div
          className="absolute w-16 h-16 rounded-full bg-neutral-800"
          animate={{
            rotate: 360,
            x: [-20, 20, -20],
            y: [12, -20, 12],
          }}
          transition={{
            rotate: { duration: 11, repeat: Infinity, ease: 'linear' },
            x: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
            y: { duration: 3.8, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      </motion.div>
    </div>
  );
};
