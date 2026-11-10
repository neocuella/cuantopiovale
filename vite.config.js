import { defineConfig } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dataDir = resolve(import.meta.dirname, 'data');

// Publica los archivos de data/ tal cual en el sitio (dist/data/*.csv), para que se puedan
// descargar. En desarrollo Vite ya sirve /data/* desde la raíz del proyecto.
function publishData() {
  return {
    name: 'publish-data',
    generateBundle() {
      for (const file of readdirSync(dataDir)) {
        if (!/\.(csv|md)$/.test(file)) continue;
        this.emitFile({ type: 'asset', fileName: `data/${file}`, source: readFileSync(resolve(dataDir, file)) });
      }
    },
    // Recarga la página cuando cambia un CSV.
    handleHotUpdate({ file, server }) {
      if (file.startsWith(dataDir)) server.ws.send({ type: 'full-reload' });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [publishData()],
  server: { port: 5173, strictPort: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
