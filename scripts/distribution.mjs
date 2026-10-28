import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { option } from './common.mjs';

// Stage locally; only the workflow's final git push publishes these files.
export function stageDistribution(source, target) {
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const index = read(path.join(source, 'catalog.json'));
  const built = read(path.join(source, 'packages.json'));
  if (built.localOnly) throw Error('Local-only packages cannot be published');
  const previousFile = path.join(target, 'catalog.json');
  const previous = fs.existsSync(previousFile) ? read(previousFile) : { plugins: [] };
  const copies = [];
  for (const plugin of index.plugins) {
    const old = previous.plugins.find(p => p.id === plugin.id);
    for (const version of plugin.versions) {
      const entry = built.packages.find(p => p.id === plugin.id && p.version === version.version);
      if (!entry || path.basename(entry.filename) !== entry.filename || !entry.filename.endsWith('.tmplugin')) throw Error('Missing or invalid built package');
      const bytes = fs.readFileSync(path.join(source, entry.filename));
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== entry.sha256 || hash !== version.sha256) throw Error(`${entry.filename}: package hash mismatch`);
      const published = old?.versions.find(v => v.version === version.version);
      if (published && published.sha256 !== hash) throw Error(`${entry.filename}: published versions are immutable; bump the plugin version`);
      const file = path.join(target, entry.filename);
      if (fs.existsSync(file)) {
        if (!fs.readFileSync(file).equals(bytes)) throw Error(`${entry.filename}: refusing to overwrite a published package`);
      } else copies.push({ file, bytes });
    }
    // Retain older versions and their packages for selection and recovery.
    plugin.versions.push(...(old?.versions || []).filter(v => !plugin.versions.some(current => current.version === v.version)));
  }
  fs.mkdirSync(target, { recursive: true });
  for (const { file, bytes } of copies) fs.writeFileSync(file, bytes, { flag: 'wx' });
  fs.writeFileSync(previousFile, JSON.stringify(index, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const source = option('--source'), target = option('--target');
  if (!source || !target) throw Error('Supply --source <built release directory> --target <distribution checkout>');
  stageDistribution(path.resolve(source), path.resolve(target));
}
