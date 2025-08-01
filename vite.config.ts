import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MonacoAutoTypings',
      formats: ['iife'],
      fileName: () => 'index.iife.js'
    },
    rollupOptions: {
      output: {
        name: 'MonacoAutoTypings'
      }
    }
  }
});
