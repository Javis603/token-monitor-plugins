import dictionaries from './locales.mjs';
export function resolveLocale(language) {
  const value=String(language||'en').replaceAll('_','-').toLowerCase();
  return /^(zh-(tw|hk|mo|hant))/.test(value)?'zh-TW':/^zh/.test(value)?'zh-CN':'en';
}
export const locale=()=>resolveLocale(globalThis.document?.documentElement?.lang||globalThis.navigator?.language||'en');
export function t(key,values={}) {
  return (dictionaries[locale()][key]??key).replace(/\{(\w+)\}/g,(all,name)=>values[name]??all);
}
export const l=t;
export function errorText(message) {
  const match=/^Magpie 接口回傳 HTTP (\d+)。$/.exec(message||'');
  return match?t('Magpie 接口回傳 HTTP {status}。',{status:match[1]}):t(message||'');
}
