import { cn } from '../../../lib/utils';
import {
  type MotionStyle,
  motion,
  type TargetAndTransition,
  type Transition,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { type AIAmplitude, type AIState, getAIStateMotion, useAmplitudeValue } from './ai-core';
import {
  AMPLITUDE_BLUR_FALLOFF,
  AMPLITUDE_SCALE_GAIN,
  BLUR_MIN_LARGE,
  BLUR_MIN_SMALL,
  BLUR_MULTIPLIER_LARGE,
  BLUR_MULTIPLIER_SMALL,
  BREATHE_SCALE,
  BREATHE_SECONDS,
  CONTRAST_MIN_FINAL,
  CONTRAST_MIN_LARGE,
  CONTRAST_MIN_SMALL,
  CONTRAST_MULTIPLIER_FINAL,
  CONTRAST_MULTIPLIER_LARGE,
  CONTRAST_MULTIPLIER_SMALL,
  CONTRAST_TINY,
  DEFAULT_COLORS,
  DOT_SIZE_MIN_LARGE,
  DOT_SIZE_MIN_SMALL,
  DOT_SIZE_MULTIPLIER_LARGE,
  DOT_SIZE_MULTIPLIER_SMALL,
  DRIFT_BASE_SECONDS,
  EASE_IN_OUT,
  ERROR_SHAKE_DURATION,
  ERROR_SHAKE_KEYFRAMES,
  GLOW_BLUR_RATIO,
  GLOW_MAX_OPACITY,
  MASK_RADIUS_LARGE,
  MASK_RADIUS_MEDIUM,
  MASK_RADIUS_SMALL,
  MASK_RADIUS_TINY,
  RIM_MIN,
  RIM_RATIO,
  SHADOW_MIN_LARGE,
  SHADOW_MIN_SMALL,
  SHADOW_MULTIPLIER_LARGE,
  SHADOW_MULTIPLIER_SMALL,
  SIZE_THRESHOLD_MEDIUM,
  SIZE_THRESHOLD_SMALL,
  SIZE_THRESHOLD_TINY,
  SPRING_DEFAULT,
} from './siriOrbConstants';
import { SIRI_ORB_CSS } from './siriOrbStyles';

export interface SiriOrbProps {
  amplitude?: AIAmplitude;
  animationDuration?: number;
  className?: string;
  colors?: {
    bg?: string;
    c1?: string;
    c2?: string;
    c3?: string;
    c4?: string;
  };
  size?: string;
  state?: AIState;
}

export const SiriOrb: React.FC<SiriOrbProps> = ({
  size = '192px',
  className,
  colors,
  animationDuration = 20,
  amplitude,
  state = 'idle',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const amplitudeValue = useAmplitudeValue(amplitude);
  const stateMotion = getAIStateMotion(state);

  const finalColors = { ...DEFAULT_COLORS, ...colors };
  const glowColor = finalColors.c2;

  const sizeValue = Number.parseInt(size.replace('px', ''), 10);

  const blurAmount =
    sizeValue < SIZE_THRESHOLD_SMALL
      ? Math.max(sizeValue * BLUR_MULTIPLIER_SMALL, BLUR_MIN_SMALL)
      : Math.max(sizeValue * BLUR_MULTIPLIER_LARGE, BLUR_MIN_LARGE);

  const contrastAmount =
    sizeValue < SIZE_THRESHOLD_SMALL
      ? Math.max(sizeValue * CONTRAST_MULTIPLIER_SMALL, CONTRAST_MIN_SMALL)
      : Math.max(sizeValue * CONTRAST_MULTIPLIER_LARGE, CONTRAST_MIN_LARGE);

  const dotSize =
    sizeValue < SIZE_THRESHOLD_SMALL
      ? Math.max(sizeValue * DOT_SIZE_MULTIPLIER_SMALL, DOT_SIZE_MIN_SMALL)
      : Math.max(sizeValue * DOT_SIZE_MULTIPLIER_LARGE, DOT_SIZE_MIN_LARGE);

  const shadowSpread =
    sizeValue < SIZE_THRESHOLD_SMALL
      ? Math.max(sizeValue * SHADOW_MULTIPLIER_SMALL, SHADOW_MIN_SMALL)
      : Math.max(sizeValue * SHADOW_MULTIPLIER_LARGE, SHADOW_MIN_LARGE);

  const getMaskRadius = (value: number) => {
    if (value < SIZE_THRESHOLD_TINY) return MASK_RADIUS_TINY;
    if (value < SIZE_THRESHOLD_SMALL) return MASK_RADIUS_SMALL;
    if (value < SIZE_THRESHOLD_MEDIUM) return MASK_RADIUS_MEDIUM;
    return MASK_RADIUS_LARGE;
  };

  const maskRadius = getMaskRadius(sizeValue);

  const getFinalContrast = (value: number) => {
    if (value < SIZE_THRESHOLD_TINY) return CONTRAST_TINY;
    if (value < SIZE_THRESHOLD_SMALL) {
      return Math.max(contrastAmount * CONTRAST_MULTIPLIER_FINAL, CONTRAST_MIN_FINAL);
    }
    return contrastAmount;
  };

  const finalContrast = getFinalContrast(sizeValue);

  const reactivity = shouldReduceMotion ? 0 : stateMotion.reactivity;

  const reactiveBlur = useTransform(amplitudeValue, (level) => {
    const focus = 1 - level * reactivity * AMPLITUDE_BLUR_FALLOFF;
    return `${blurAmount * focus}px`;
  });

  const reactiveScale = useTransform(
    amplitudeValue,
    (level) => stateMotion.scale + level * reactivity * AMPLITUDE_SCALE_GAIN,
  );

  const loopDuration = shouldReduceMotion
    ? animationDuration
    : animationDuration / stateMotion.speed;

  const rim = Math.max(sizeValue * RIM_RATIO, RIM_MIN);
  const driftDuration = (DRIFT_BASE_SECONDS / (1 + stateMotion.speed)) * 2;

  const getRootAnimate = (): TargetAndTransition => {
    if (shouldReduceMotion) return { scale: 1, x: 0 };
    if (state === 'error') return { scale: 1, x: ERROR_SHAKE_KEYFRAMES };
    if (stateMotion.motif === 'breathe') return { scale: BREATHE_SCALE, x: 0 };
    return { scale: 1, x: 0 };
  };

  const getRootTransition = (): Transition => {
    if (shouldReduceMotion) return { duration: 0 };
    if (state === 'error') return { duration: ERROR_SHAKE_DURATION, ease: EASE_IN_OUT };
    if (stateMotion.motif === 'breathe') {
      return {
        duration: BREATHE_SECONDS,
        ease: EASE_IN_OUT,
        repeat: Number.POSITIVE_INFINITY,
      };
    }
    return SPRING_DEFAULT;
  };

  return (
    <motion.div
      animate={getRootAnimate()}
      className={cn('relative', className)}
      style={
        {
          '--orb-size': size,
          height: size,
          width: size,
        } as MotionStyle
      }
      transition={getRootTransition()}
    >
      <motion.div
        animate={{ opacity: stateMotion.glow * GLOW_MAX_OPACITY }}
        className="absolute rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${glowColor} 0%, transparent 64%)`,
          filter: `blur(calc(var(--orb-size) * ${GLOW_BLUR_RATIO}))`,
          inset: '-12%',
        }}
        transition={shouldReduceMotion ? { duration: 0 } : SPRING_DEFAULT}
      />

      <motion.div
        className="siri-orb"
        style={
          {
            '--animation-duration': `${loopDuration}s`,
            '--bg': finalColors.bg,
            '--blur-amount': reactiveBlur,
            '--c1': finalColors.c1,
            '--c2': finalColors.c2,
            '--c3': finalColors.c3,
            '--c4': finalColors.c4,
            '--contrast-amount': finalContrast,
            '--dot-size': `${dotSize}px`,
            '--drift-duration': `${driftDuration}s`,
            '--mask-radius': maskRadius,
            '--rim': `${rim}px`,
            '--shadow-spread': `${shadowSpread}px`,
            filter: `saturate(${stateMotion.saturation}) hue-rotate(${stateMotion.hueRotate}deg)`,
            height: '100%',
            scale: reactiveScale,
            width: '100%',
          } as MotionStyle
        }
      >
        <span aria-hidden="true" className="siri-orb-layer siri-orb-sheen" />
        <span aria-hidden="true" className="siri-orb-layer siri-orb-rim" />
        <style>{SIRI_ORB_CSS}</style>
      </motion.div>
    </motion.div>
  );
};

export default SiriOrb;
