export default {
  'web/**/*.{ts,tsx}': [() => 'npm run typecheck --workspace=web', 'prettier --write'],
  'worker/**/*.ts': [() => 'npm run build:worker', 'prettier --write'],
};
