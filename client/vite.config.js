import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  // Expose only Firebase's public web-app fields. Admin credentials and the
  // service-account path must never be included in the browser bundle.
  const publicFields = ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID', 'MEASUREMENT_ID'];
  const define = Object.fromEntries(publicFields.map(key => [
    `import.meta.env.VITE_FIREBASE_${key}`, JSON.stringify(env[`VITE_FIREBASE_${key}`] || env[`FIREBASE_${key}`] || ''),
  ]));
  return {
    envDir: projectRoot,
    cacheDir: env.VITE_USE_FIREBASE_EMULATORS === 'true' ? 'node_modules/.vite-emulators' : 'node_modules/.vite',
    plugins: [react()],
    // Prepare the large optional PDF dependencies before a first export can trigger a reload.
    optimizeDeps: { include: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts'] },
    define,
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: false } },
    },
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.js'], css: true },
    build: { rollupOptions: { output: { manualChunks: { charts: ['recharts'] } } } },
  };
});
