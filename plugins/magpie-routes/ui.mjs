import {l, locale} from './i18n.mjs';
import { createPage, createNotch, createDock, createRail } from './views.mjs';

export async function activate(ctx) {
  let data = await ctx.backend.call('snapshot');
  const listeners = new Set();
  const off = ctx.backend.subscribe(next => { if (next) { data = next; for (const listener of listeners) listener(); } });
  return {
    mount(container, initialContext) {
      const rail = initialContext.surface === 'edgeDock' && (initialContext.variant === 'compact' || initialContext.surfaceVariant === 'rail');
      if (!rail && typeof initialContext.headerActions?.append !== 'function') {
        throw new Error(locale() === 'zh-TW' ? 'Magpie 路由需要支援標題列操作區的 Token Monitor 版本。' : locale() === 'zh-CN' ? 'Magpie 路由需要支持标题栏操作区的 Token Monitor 版本。' : 'Magpie Routes requires a Token Monitor build with header actions support.');
      }
      let context = initialContext, filter = '', selected = null, follow = true;
      let visible = context.visible !== false;
      let error = '', view, kind, language, headerActions;
      const languageObserver = new MutationObserver(() => render());
      languageObserver.observe(document.documentElement, {attributes:true,attributeFilter:['lang']});
      const read = () => {
        const filtered = data.routes.filter(row => !filter || row.agent === filter);
        const pinned = !follow && filtered.find(row => row.id === selected);
        const expired = !follow && selected !== null && !pinned;
        if (expired) { follow = true; selected = null; }
        const route = pinned || filtered[0];
        return { data, route, filtered, filter, masked: data.maskAccounts, follow, error, visible, nativeData: context.nativeData,
          expired,
          reduced: context.nativeData?.appearance?.reduceMotion === 'on' || document.documentElement.dataset.reduceMotion === 'on' };
      };
      const actions = {
        selectAgent(value) { filter = value; selected = null; follow = true; render(); },
        pick(id) { selected = id; follow = false; render(); },
        latest() { follow = true; selected = null; render(); },
        async mask() {
          try { await ctx.backend.call('toggleMask'); error = ''; }
          catch { error = l('無法儲存打碼設定，請重試。'); }
          render();
        },
        async reconnect() { try { data = await ctx.backend.call('reconnect'); error = ''; } catch { error = l("重新連線失敗，請在插件設定重啟。"); } render(); }
      };
      function render() {
        const nextKind = context.surface === 'notch' ? 'notch' : context.surface === 'edgeDock'
          ? context.variant === 'compact' || context.surfaceVariant === 'rail' ? 'rail' : 'dock' : 'page';
        if (kind !== nextKind || language !== locale() || headerActions !== context.headerActions) {
          headerActions = context.headerActions;
          language = locale();
          view?.dispose(); kind = nextKind;
          view = ({ page: createPage, notch: createNotch, dock: createDock, rail: createRail })[kind](container, { ...ctx, headerActions: context.headerActions }, actions);
        }
        view.update(read());
      }
      listeners.add(render); render();
      return { update(next) { context = next; visible = next.visible !== false; render(); }, dispose() { languageObserver.disconnect(); listeners.delete(render); view.dispose(); } };
    },
    dispose() { off(); listeners.clear(); }
  };
}
