import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/Backtest/',
  test: { include: ['tests/**/*.test.ts'] },
});
