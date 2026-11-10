import { defineConfig } from 'vite';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseCsv } from './src/lib/csv.js';
import { buildModel } from './src/lib/model.js';
import { unitsLabel } from './src/lib/format.js';
import { SITE_URL, SITE_NAME, itemPath, ogImagePath, itemTitle, itemDescription } from './src/lib/share.js';

const dataDir = resolve(import.meta.dirname, 'data');
const ogDir = resolve(import.meta.dirname, 'public/og');

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

function loadModel() {
  const tables = {};
  for (const name of ['caso', 'caso_fuentes', 'tipo_de_cambio', 'items', 'precios', 'referencias', 'hitos']) {
    tables[name] = parseCsv(readFileSync(join(dataDir, `${name}.csv`), 'utf8'));
  }
  return buildModel(tables);
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function setMeta(html, key, value) {
  const re = new RegExp(`(<meta (?:name|property)="${key}" content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`index.html no tiene la etiqueta ${key}`);
  return html.replace(re, (_, a, b) => a + escAttr(value) + b);
}

// Una página por cosa en c/<id>/index.html: la misma página, con su propia vista previa al
// compartir (WhatsApp, X, Facebook no ejecutan JavaScript: solo leen estas etiquetas).
// <base href="../../"> hace que todas las rutas relativas sigan apuntando a la raíz.
function sharePages() {
  return {
    name: 'share-pages',
    apply: 'build',
    enforce: 'post',
    writeBundle({ dir }) {
      const base = readFileSync(join(dir, 'index.html'), 'utf8');
      const model = loadModel();
      const missing = [];
      for (const item of model.items.filter((i) => i.enabled && i.usedCount > 0)) {
        const url = SITE_URL + itemPath(item.id);
        const title = itemTitle(model, item);
        const desc = itemDescription(item);
        let img = ogImagePath(item.id);
        if (!existsSync(join(dir, img))) {
          missing.push(item.id);
          img = ogImagePath();
        }
        let html = base.replace(/<head>/, '<head>\n    <base href="../../" />');
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${escAttr(`${unitsLabel(item.units, item)} · ${SITE_NAME}`)}</title>`);
        html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escAttr(url)}$2`);
        html = setMeta(html, 'description', desc);
        html = setMeta(html, 'og:title', title);
        html = setMeta(html, 'og:description', desc);
        html = setMeta(html, 'og:url', url);
        html = setMeta(html, 'og:image', SITE_URL + img);
        html = setMeta(html, 'og:image:alt', title);
        const out = join(dir, itemPath(item.id));
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, 'index.html'), html);
      }
      if (missing.length) {
        this.warn(`Sin imagen de vista previa (se usa og/inicio.png): ${missing.join(', ')}. Generalas con npm run dev → /lab/og.html`);
      }
    },
  };
}

// Solo en desarrollo: lab/og.html manda acá cada imagen de vista previa y se guarda en public/og/.
function ogSaver() {
  return {
    name: 'og-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__og', (req, res) => {
        const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
        if (req.method !== 'POST' || !/^[a-z0-9_-]+$/.test(id)) {
          res.statusCode = 400;
          return res.end('POST /__og?id=<id>');
        }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const png = Buffer.concat(chunks);
          if (png.readUInt32BE(0) !== 0x89504e47) {
            res.statusCode = 400;
            return res.end('no es un PNG');
          }
          mkdirSync(ogDir, { recursive: true });
          writeFileSync(join(ogDir, `${id}.png`), png);
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [publishData(), sharePages(), ogSaver()],
  server: { port: 5173, strictPort: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
