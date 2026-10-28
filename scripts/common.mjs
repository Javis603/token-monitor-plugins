import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ids = ['magpie-routes'];
export const manifest = id => JSON.parse(fs.readFileSync(path.join(root, 'plugins', id, 'manifest.json'), 'utf8'));
export function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? '' : process.argv[index + 1] || '';
}
