export const SIRI_ORB_CSS = `
@property --angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

.siri-orb {
  display: grid;
  grid-template-areas: "stack";
  overflow: hidden;
  border-radius: 50%;
  position: relative;
  isolation: isolate;
}

.siri-orb::before,
.siri-orb::after,
.siri-orb > .siri-orb-layer {
  content: "";
  display: block;
  grid-area: stack;
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.siri-orb-sheen {
  background:
    radial-gradient(circle at 30% 24%, hsl(0 0% 100% / 0.32), transparent 34%),
    radial-gradient(circle at 72% 80%, hsl(0 0% 100% / 0.07), transparent 48%);
  mix-blend-mode: screen;
  animation: siri-drift var(--drift-duration) ease-in-out infinite alternate;
}

.siri-orb-rim {
  box-shadow:
    inset 0 0 0 1px hsl(0 0% 100% / 0.16),
    inset 0 calc(var(--rim) * 1) calc(var(--rim) * 2) hsl(0 0% 100% / 0.22),
    inset 0 calc(var(--rim) * -1.2) calc(var(--rim) * 2.4) hsl(0 0% 0% / 0.4);
  pointer-events: none;
}

@keyframes siri-drift {
  0% { transform: translate(-6%, -4%) scale(1.05); }
  100% { transform: translate(7%, 6%) scale(1.12); }
}

.siri-orb::before {
  background:
    conic-gradient(
      from calc(var(--angle) * 2) at 25% 70%,
      var(--c3),
      transparent 20% 80%,
      var(--c3)
    ),
    conic-gradient(
      from calc(var(--angle) * 2) at 45% 75%,
      var(--c2),
      transparent 30% 60%,
      var(--c2)
    ),
    conic-gradient(
      from calc(var(--angle) * -3) at 80% 20%,
      var(--c1),
      transparent 40% 60%,
      var(--c1)
    ),
    conic-gradient(
      from calc(var(--angle) * 1.5) at 60% 35%,
      var(--c4),
      transparent 25% 75%,
      var(--c4)
    ),
    conic-gradient(
      from calc(var(--angle) * 2) at 15% 5%,
      var(--c2),
      transparent 10% 90%,
      var(--c2)
    ),
    conic-gradient(
      from calc(var(--angle) * 1) at 20% 80%,
      var(--c1),
      transparent 10% 90%,
      var(--c1)
    ),
    conic-gradient(
      from calc(var(--angle) * -2) at 85% 10%,
      var(--c3),
      transparent 20% 80%,
      var(--c3)
    );
  box-shadow: inset var(--bg) 0 0 var(--shadow-spread)
    calc(var(--shadow-spread) * 0.2);
  filter: blur(var(--blur-amount)) contrast(var(--contrast-amount))
    saturate(1.4);
  animation: rotate var(--animation-duration) linear infinite;
}

.siri-orb::after {
  background-image: radial-gradient(
    circle at center,
    var(--bg) var(--dot-size),
    transparent var(--dot-size)
  );
  background-size: calc(var(--dot-size) * 2) calc(var(--dot-size) * 2);
  backdrop-filter: blur(calc(var(--blur-amount) * 2))
    contrast(calc(var(--contrast-amount) * 2));
  mix-blend-mode: overlay;
}

.siri-orb[style*="--mask-radius: 0%"]::after {
  mask-image: none;
}

.siri-orb:not([style*="--mask-radius: 0%"])::after {
  mask-image: radial-gradient(
    black var(--mask-radius),
    transparent 75%
  );
}

@keyframes rotate {
  to {
    --angle: 360deg;
  }
}

@media (prefers-reduced-motion: reduce) {
  .siri-orb::before,
  .siri-orb-sheen {
    animation: none;
  }
}
`;
