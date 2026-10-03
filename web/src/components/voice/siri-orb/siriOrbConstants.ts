import type { Transition } from 'framer-motion';

export const SIZE_THRESHOLD_SMALL = 50;
export const SIZE_THRESHOLD_TINY = 30;
export const SIZE_THRESHOLD_MEDIUM = 100;
export const BLUR_MULTIPLIER_SMALL = 0.008;
export const BLUR_MIN_SMALL = 1;
export const BLUR_MULTIPLIER_LARGE = 0.015;
export const BLUR_MIN_LARGE = 4;
export const CONTRAST_MULTIPLIER_SMALL = 0.004;
export const CONTRAST_MIN_SMALL = 1.2;
export const CONTRAST_MULTIPLIER_LARGE = 0.008;
export const CONTRAST_MIN_LARGE = 1.5;
export const DOT_SIZE_MULTIPLIER_SMALL = 0.004;
export const DOT_SIZE_MIN_SMALL = 0.05;
export const DOT_SIZE_MULTIPLIER_LARGE = 0.008;
export const DOT_SIZE_MIN_LARGE = 0.1;
export const SHADOW_MULTIPLIER_SMALL = 0.004;
export const SHADOW_MIN_SMALL = 0.5;
export const SHADOW_MULTIPLIER_LARGE = 0.008;
export const SHADOW_MIN_LARGE = 2;
export const MASK_RADIUS_TINY = '0%';
export const MASK_RADIUS_SMALL = '5%';
export const MASK_RADIUS_MEDIUM = '15%';
export const MASK_RADIUS_LARGE = '25%';
export const CONTRAST_TINY = 1.1;
export const CONTRAST_MULTIPLIER_FINAL = 1.2;
export const CONTRAST_MIN_FINAL = 1.3;

export const AMPLITUDE_BLUR_FALLOFF = 0.45;
export const AMPLITUDE_SCALE_GAIN = 0.12;
export const ERROR_SHAKE_KEYFRAMES = [0, -3, 3, 0];
export const ERROR_SHAKE_DURATION = 0.18;
export const EASE_IN_OUT = [0.645, 0.045, 0.355, 1] as const;
export const GLOW_BLUR_RATIO = 0.28;
export const GLOW_MAX_OPACITY = 0.7;
export const RIM_RATIO = 0.06;
export const RIM_MIN = 1.5;
export const DRIFT_BASE_SECONDS = 12;
export const BREATHE_SCALE = [1, 1.035, 1];
export const BREATHE_SECONDS = 5.5;
export const SPRING_DEFAULT: Transition = {
  bounce: 0.1,
  duration: 0.25,
  type: 'spring',
};

export const DEFAULT_COLORS = {
  bg: 'oklch(92% 0.03 300)',
  c1: 'oklch(68% 0.21 350)',
  c2: 'oklch(70% 0.18 210)',
  c3: 'oklch(66% 0.2 285)',
  c4: 'oklch(72% 0.19 325)',
};
