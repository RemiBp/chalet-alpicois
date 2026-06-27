/**
 * Conversion docx → PDF via WebAssembly (compatible Vercel serverless).
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { convert } from 'docx-to-pdf-wasm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let wasmModulePromise;

async function resolveWasmPath() {
  const bundled = join(__dirname, 'wasm', 'docx-to-pdf.wasm');
  if (existsSync(bundled)) return bundled;
  return require.resolve('docx-to-pdf-wasm/wasm');
}

async function getWasmModule() {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      const wasmPath = await resolveWasmPath();
      const wasmBytes = await readFile(wasmPath);
      return WebAssembly.compile(wasmBytes);
    })();
  }
  return wasmModulePromise;
}

export async function convertDocxToPdf(docxBuffer) {
  const wasmModule = await getWasmModule();
  const input = docxBuffer instanceof Uint8Array ? docxBuffer : new Uint8Array(docxBuffer);
  const pdf = await convert(wasmModule, input);
  return Buffer.from(pdf);
}
