import { defineConfig } from 'vite';

// Builds the pure simulation into a single ESM file so node --test can run
// gameplay/determinism/balance tests without a browser.
export default defineConfig({
  build: {
    outDir: 'tests/.build',
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
    lib: {
      entry: 'tests/entry.ts',
      formats: ['es'],
      fileName: () => 'sim.mjs',
    },
  },
});
