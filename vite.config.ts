import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Large map/DOM suites compete for memory and make unrelated async reads
    // miss their existing deadlines. Bound concurrency; do not relax timeouts.
    maxWorkers: 1,
  },
});
