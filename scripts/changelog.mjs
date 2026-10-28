export const CHANGELOG_FILES = Object.freeze({
  en: 'CHANGELOG.md', 'zh-CN': 'CHANGELOG.zh-CN.md', 'zh-TW': 'CHANGELOG.zh-TW.md',
  ko: 'CHANGELOG.ko.md', ja: 'CHANGELOG.ja.md', 'pt-BR': 'CHANGELOG.pt-BR.md'
});

export function versionNotes(text, version) {
  const sections = [...text.matchAll(/^## (.+)\r?$/gm)];
  const matching = sections.filter(section => section[1].trim() === version);
  if (matching.length !== 1) throw Error(`CHANGELOG needs exactly one section for ${version}`);
  const section = matching[0], next = sections[sections.indexOf(section) + 1];
  const notes = text.slice(section.index + section[0].length, next?.index ?? text.length).trim();
  if (!notes || notes.length > 2000) throw Error(`${version}: changelog must contain 1–2000 characters`);
  return notes;
}

export function packageChangelog(files, version) {
  return Object.fromEntries(Object.entries(CHANGELOG_FILES).map(([locale, name]) => {
    if (!files[name]) throw Error(`Missing packaged ${name}`);
    return [locale, versionNotes(new TextDecoder('utf-8', { fatal: true }).decode(files[name]), version)];
  }));
}
