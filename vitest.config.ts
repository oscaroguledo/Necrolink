import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Mock canvas for pdfjs-dist
      'canvas': path.resolve(__dirname, './tests/mocks/canvas.ts'),
    },
  },
});
