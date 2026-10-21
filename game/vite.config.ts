import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'assets',
  plugins: [{
    name: 'game-module-entry',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{ tag: 'script', attrs: { type: 'module', src: '/src/main.ts' }, injectTo: 'body' }],
    },
  }],
});
