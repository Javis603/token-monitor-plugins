// Settings accordion for the CodingPass quota module: setup instructions plus
// the host's native credential editor (saved values never return to the UI).
const CONSOLE_URL = 'https://codingpass.ai/app';

const MESSAGES = {
  en: {
    management: 'Open AI tool quota settings and expand CodingPass to paste your console cookie.',
    url: 'Console address',
    copy: 'Copy address', copied: 'Copied.', copyFailed: 'Copy failed; select the address and copy it manually.',
    steps: [
      'Log in to the CodingPass console in your browser.',
      'Press F12, open the Network tab, then refresh the page.',
      'Click the request named {usage} (or {state}), and under Request Headers copy the whole {cookie} value.',
      'Paste it below and save. The plugin verifies it against the console.'
    ],
    help: 'The cookie is your console login; anyone with it can use your account. It is stored unencrypted in Token Monitor’s data folder. Signing out of the website invalidates it — paste a new one then.'
  },
  'zh-CN': {
    management: '请在「AI 工具额度」设置中展开 CodingPass，粘贴控制台 Cookie。',
    url: '控制台地址',
    copy: '复制地址', copied: '已复制。', copyFailed: '复制失败，请手动选中地址复制。',
    steps: [
      '在浏览器中登录 CodingPass 控制台。',
      '按 F12 打开「网络 / Network」面板，然后刷新页面。',
      '点击名为 {usage}（或 {state}）的请求，在「请求标头 / Request Headers」中复制完整的 {cookie} 值。',
      '粘贴到下方并保存，插件会向控制台验证是否有效。'
    ],
    help: 'Cookie 就是你的控制台登录凭证，持有它的人可以使用你的账号；它以未加密形式保存在 Token Monitor 数据目录中。在网站上退出登录会使其失效，届时请重新粘贴。'
  },
  'zh-TW': {
    management: '請在「AI 工具額度」設定中展開 CodingPass，貼上控制台 Cookie。',
    url: '控制台網址',
    copy: '複製網址', copied: '已複製。', copyFailed: '複製失敗，請手動選取網址複製。',
    steps: [
      '在瀏覽器中登入 CodingPass 控制台。',
      '按 F12 開啟「網路 / Network」面板，然後重新整理頁面。',
      '點選名為 {usage}（或 {state}）的請求，在「要求標頭 / Request Headers」中複製完整的 {cookie} 值。',
      '貼到下方並儲存，外掛會向控制台驗證是否有效。'
    ],
    help: 'Cookie 就是你的控制台登入憑證，持有它的人可以使用你的帳號；它以未加密形式儲存在 Token Monitor 資料夾中。在網站登出會使其失效，屆時請重新貼上。'
  }
};
const CODE = { '{usage}': 'usage', '{state}': 'state', '{cookie}': 'Cookie' };

function resolveLocale(tag) {
  const value = String(tag || '').toLowerCase();
  if (value.startsWith('zh')) return /(tw|hk|mo|hant)/.test(value) ? 'zh-TW' : 'zh-CN';
  return 'en';
}

export function activate(ctx) {
  return {
    async mount(container, context) {
      let locale = resolveLocale(document.documentElement.lang);
      const words = () => MESSAGES[locale];
      const root = document.createElement('div');
      root.className = 'codingpass-setup';
      container.append(root);

      if (!context.moduleId) {
        const note = document.createElement('p'); note.className = 'settings-note';
        const render = () => { note.textContent = words().management; };
        render(); root.append(note);
        return { update() { const next = resolveLocale(document.documentElement.lang); if (next !== locale) { locale = next; render(); } }, dispose() { root.remove(); } };
      }

      root.classList.add('cursor-settings-details-inner');
      const instructions = document.createElement('div');
      instructions.className = 'cursor-settings-details-inner';

      const field = document.createElement('label'); field.className = 'settings-field';
      const fieldLabel = document.createElement('span'); fieldLabel.className = 'settings-field-label';
      const address = document.createElement('input'); address.className = 'credential-input'; address.type = 'url'; address.readOnly = true; address.value = CONSOLE_URL;
      address.addEventListener('click', () => address.select());
      field.append(fieldLabel, address);

      const actions = document.createElement('div'); actions.className = 'settings-actions';
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'settings-button';
      const copyStatus = document.createElement('p'); copyStatus.className = 'settings-note'; copyStatus.setAttribute('role', 'status'); copyStatus.hidden = true;
      let copyKey = null;
      copy.addEventListener('click', async () => {
        try {
          if (typeof ctx.app?.copyText === 'function') await ctx.app.copyText(CONSOLE_URL);
          else await navigator.clipboard.writeText(CONSOLE_URL);
          copyKey = 'copied';
        } catch (_) { copyKey = 'copyFailed'; }
        copyStatus.textContent = words()[copyKey]; copyStatus.hidden = false;
      });
      actions.append(copy);

      const guide = document.createElement('p'); guide.className = 'settings-note';
      const help = document.createElement('p'); help.className = 'settings-note';

      function render() {
        const w = words();
        fieldLabel.textContent = w.url;
        copy.textContent = w.copy;
        if (copyKey) copyStatus.textContent = w[copyKey];
        help.textContent = w.help;
        guide.replaceChildren();
        w.steps.forEach((step, index) => {
          if (index) guide.append(document.createElement('br'));
          const number = document.createElement('strong'); number.textContent = `${index + 1}.`;
          guide.append(number, ' ');
          for (const part of step.split(/(\{\w+\})/)) {
            if (CODE[part]) { const code = document.createElement('code'); code.textContent = CODE[part]; guide.append(code); }
            else if (part) guide.append(part);
          }
        });
      }
      render();
      instructions.append(field, actions, copyStatus, guide, help);
      root.append(instructions);

      const editor = await ctx.native.credentials.mount(root, {
        moduleId: context.moduleId,
        onStateChange(state) { instructions.hidden = !state.editing; }
      });

      return {
        update(next) {
          const value = resolveLocale(document.documentElement.lang);
          if (value !== locale) { locale = value; render(); }
          return editor.update(next);
        },
        hasUnsavedChanges: () => editor.hasUnsavedChanges() === true,
        dispose() { editor.dispose(); root.remove(); }
      };
    }
  };
}
