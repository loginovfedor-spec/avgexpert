import { defineConfig, type Plugin } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(__dirname, 'webui_src');
const distDir = resolve(__dirname, 'webui_dist');
const staticAssetsDir = resolve(rootDir, 'assets');
const distAssetsDir = resolve(distDir, 'assets');

/** Strip CDN <script> and <link> fallback tags from the built HTML.
 *  They are preserved in webui_src/index.html for direct-serve dev mode.
 *  The Vite build bundles everything from npm, so CDN is not needed in production. */
function stripCdnPlugin(): Plugin {
  return {
    name: 'strip-cdn-fallback',
    transformIndexHtml(html) {
      return html
        // Remove CDN preconnect/stylesheet/script tags
        .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/g, '')
        .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>\s*/g, '')
        .replace(/<link[^>]*cdnjs\.cloudflare\.com[^>]*>\s*/g, '')
        .replace(/<script[^>]*cdnjs\.cloudflare\.com[^>]*><\/script>\s*/g, '')
        // Remove the dev-mode comment block
        .replace(/<!--\s*CDN fallback[\s\S]*?instead\. -->\s*/g, '');
    }
  };
}

function copyRuntimeAssetsPlugin(): Plugin {
  return {
    name: 'copy-runtime-assets',
    closeBundle() {
      if (existsSync(staticAssetsDir)) {
        cpSync(staticAssetsDir, distAssetsDir, { recursive: true, force: true });
      }
    }
  };
}

export default defineConfig({
  root: rootDir,
  publicDir: false,
  plugins: [stripCdnPlugin(), copyRuntimeAssetsPlugin()],
  build: {
    outDir: distDir,
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(rootDir, 'index.html'),
      output: {
        manualChunks(id) {
          if (id.includes('marked') || id.includes('dompurify') || id.includes('highlight.js')) {
            return 'vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 800
  },
  optimizeDeps: {
    include: ['marked', 'dompurify', 'highlight.js']
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8200',
        changeOrigin: true,
      },
      '/health': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8200',
        changeOrigin: true,
      },
      '/ready': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8200',
        changeOrigin: true,
      },
    },
  },
});
