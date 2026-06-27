import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'backend', 'package.json'));
const src = require.resolve('docx-to-pdf-wasm/wasm');
const destDir = join(root, 'backend', 'wasm');
const dest = join(destDir, 'docx-to-pdf.wasm');

mkdirSync(destDir, { recursive: true });
if (!existsSync(src)) {
  console.warn('docx-to-pdf.wasm introuvable — installez les dépendances backend');
  process.exit(0);
}
copyFileSync(src, dest);
console.log(`Copied docx-to-pdf.wasm → backend/wasm/`);
