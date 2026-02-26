import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    include: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'ios', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'test/',
        'e2e/',
        '**/*.config.ts',
        '**/*.d.ts',
        'dist/',
        'ios/',
        'coverage/',
        // Orchestration component — tested via sub-component tests
        'components/BibleViewer.tsx',
        // Integration-heavy hooks requiring real APIs/IndexedDB — not unit-testable
        'hooks/useBibleDownload.ts',
        'hooks/useBibleContextMenu.ts',
        // Large UI component with 40+ props — covered by sub-component tests
        'components/BibleHeader.tsx',
      ],
      thresholds: {
        global: {
          statements: 65,
          branches: 60,
          functions: 65,
          lines: 65
        }
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  }
});
