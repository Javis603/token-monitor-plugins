import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { root, ids, manifest, option } from './common.mjs';
import { CHANGELOG_FILES, packageChangelog } from './changelog.mjs';
const host = option('--host');
const require = createRequire(import.meta.url);
let syntaxFiles = 0;
for (const id of ids) {
  const m = manifest(id), dir = path.join(root, 'plugins', id);
  if (m.id !== id || m.tmApi !== 1 || new Set(m.files).size !== m.files.length) throw Error(`${id}: invalid manifest identity/files`);
  if (m.author !== 'Javis603' || /Local test|Local integration/.test(JSON.stringify(m))) throw Error(`${id}: unfinished public metadata`);
  for (const name of m.files) {
    if (path.isAbsolute(name) || name.split('/').includes('..')) throw Error(`${id}: invalid file path`);
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      throw Error(`${id}: missing ${name}`);
    }
    if (!fs.lstatSync(file).isFile()) throw Error(`${id}: not a regular file: ${name}`);
    if (/\.(?:mjs|cjs)$/.test(name)) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) throw Error(result.stderr);
      syntaxFiles++;
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from\s*|require\()\s*['"](\.\/[^'"]+)['"]/g)) {
        const relative = path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1]));
        if (!m.files.includes(relative)) throw Error(`${id}: imported file is not packaged: ${relative}`);
      }
    }
  }
  const notes = Object.fromEntries(Object.values(CHANGELOG_FILES).map(name => {
    if (!m.files.includes(name)) throw Error(`${id}: ${name} must be packaged`);
    return [name, fs.readFileSync(path.join(dir, name))];
  }));
  packageChangelog(notes, m.version);
  if (!m.identityIcon?.startsWith('data:image/png;base64,') ||
      !Buffer.from(m.identityIcon.split(',')[1], 'base64').subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    throw Error(`${id}: identity icon must be a PNG`);
  }
  if (host) {
    const { normalizeManifest } = require(path.resolve(host, 'src/shared/plugins/manifest.js'));
    const normalized = normalizeManifest(m);
    if (!normalized.ok) throw Error(`${id}: ${normalized.errors.join('; ')}`);
  }
}
console.log(`Source check passed: ${ids.length} plugins, ${syntaxFiles} JS modules.`);
console.log('This checks source structure, not public-release permission or packaged platform acceptance.');

for (const file of fs.readdirSync(path.join(root, 'scripts')).filter(name => name.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'scripts', file)], { encoding: 'utf8' });
  if (result.status !== 0) throw Error(result.stderr);
}
