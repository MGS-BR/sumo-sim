/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Arquivo único não tem pasta ao lado: os ícones SVG/PNG viram data URI e os links que
 * dependem de arquivo externo (.ico, manifest) saem, para não gerar requisições quebradas.
 */
function inlineIcons(): Plugin {
  const dataUri = (file: string, type: string) =>
    `data:${type};base64,${readFileSync(new URL(`./public/${file}`, import.meta.url)).toString('base64')}`;
  return {
    name: 'inline-icons',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<link rel="icon" href="\.\/favicon\.ico"[^>]*>/, '')
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace('href="./favicon.svg"', `href="${dataUri('favicon.svg', 'image/svg+xml')}"`)
        .replace('href="./favicon-32.png"', `href="${dataUri('favicon-32.png', 'image/png')}"`)
        .replace('href="./apple-touch-icon.png"', `href="${dataUri('apple-touch-icon.png', 'image/png')}"`);
    },
  };
}

// `npm run build`        -> dist/ com assets separados (deploy normal)
// `npm run build:single` -> dist-single/index.html autocontido (abrir direto ou compartilhar)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [inlineIcons(), viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    // o build único não copia public/: tudo que ele precisa já foi embutido
    copyPublicDir: mode !== 'single',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'analysis/**/*.test.ts'],
    testTimeout: 60000,
  },
}));
