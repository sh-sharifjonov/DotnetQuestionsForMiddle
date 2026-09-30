// Сборка статического учебного сайта из content/**/*.md
// Запуск: npm run build
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { marked } from 'marked';
import hljs from 'highlight.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const OUT_TOPICS = path.join(ROOT, 'topics');
const CACHE = path.join(ROOT, '.cache', 'mermaid');
const SITE_NAME = '.NET Middle · Учебник';

// ---------- утилиты ----------
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const slugify = (s) => stripTags(s).toLowerCase().trim()
  .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };

function parseFrontMatter(src, file) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error(`Нет front matter: ${file}`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
    else if (/^".*"$/.test(v)) v = v.slice(1, -1);
    meta[kv[1]] = v;
  }
  return { meta, body: src.slice(m[0].length) };
}

// ---------- иконки категорий ----------
const ICONS = {
  csharp: '<path d="M16 8a5 5 0 1 0 0 8"/><path d="M12 5v14"/><path d="M7 12h10"/>',
  server: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><line x1="7" y1="7" x2="7" y2="7.01"/><line x1="7" y1="17" x2="7" y2="17.01"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>',
  table: '<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="10" y1="4" x2="10" y2="20"/>',
  arch: '<path d="M3 21h18"/><path d="M5 21V10a7 7 0 1 1 14 0v11"/><path d="M9 21v-4a3 3 0 0 1 6 0v4"/>',
  test: '<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/><path d="M7.5 15h9"/>',
  queue: '<path d="M4 18h16"/><path d="M4 12h16"/><path d="M4 6h16"/><path d="M16 15l3-3-3-3"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  docker: '<path d="M22 12.5a1.5 1.5 0 0 1-1.5 1.5H3.5A1.5 1.5 0 0 1 2 12.5V9a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v3.5z"/><path d="M8 8V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3"/><path d="M13 8V6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};
const icon = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.csharp}</svg>`;
const UI = {
  search: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  sun: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  cards: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3H19.5A1.5 1.5 0 0 1 21 4.5v11a1.5 1.5 0 0 1-1.5 1.5H17"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  menu: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  left: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',
  right: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>',
  clock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  logo: '<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor"/><text x="16" y="21" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#fff">.NET</text></svg>',
};

const LEVELS = {
  base: { label: 'Основы', cls: 'lv-base' },
  middle: { label: 'Middle', cls: 'lv-middle' },
  advanced: { label: 'Middle+', cls: 'lv-adv' },
};

// ---------- markdown ----------
let ctx = null; // состояние текущей страницы

const CALLOUTS = {
  tldr: { title: 'Коротко — ответ на собеседовании', cls: 'callout tldr' },
  tip: { title: 'Совет', cls: 'callout tip' },
  note: { title: 'Важно понимать', cls: 'callout note' },
  warning: { title: 'Подводный камень', cls: 'callout warning' },
  example: { title: 'Пример из практики', cls: 'callout example' },
};

marked.use({
  gfm: true,
  renderer: {
    code(code, infostring) {
      const info = (infostring || '').trim();
      const lang = info.split(/\s+/)[0] || '';
      const caption = info.slice(lang.length).trim();
      if (lang === 'mermaid') {
        code = code.replace(/(&[a-zA-Z]+|&#\d+|#\d+)?;/g, (m, ent) => (ent ? m : '#59;'));            // ';' в mermaid разделяет операторы — экранируем
        const key = sha(code);
        ctx.diagrams.push({ key, code, file: ctx.file });
        return `<!--MERMAID:${key}:${Buffer.from(caption).toString('base64')}-->`;
      }
      const hl = lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        : esc(code);
      const label = { csharp: 'C#', cs: 'C#', sql: 'SQL', bash: 'Shell', yaml: 'YAML', json: 'JSON', dockerfile: 'Dockerfile', protobuf: 'Protobuf', xml: 'XML', http: 'HTTP', text: 'Текст', javascript: 'JavaScript', ini: 'INI', promql: 'PromQL' }[lang] || lang;
      const head = `<div class="code-head"><span>${esc(caption || label || 'Код')}</span><button class="copy" type="button" aria-label="Скопировать код">Копировать</button></div>`;
      return `<div class="code">${head}<pre><code class="hljs lang-${esc(lang)}">${hl}</code></pre></div>`;
    },
    heading(text, level, raw) {
      let id = slugify(raw) || `h-${ctx.headings.length}`;
      while (ctx.ids.has(id)) id += '-1';
      ctx.ids.add(id);
      if (level === 2) ctx.headings.push({ id, text: stripTags(text) });
      if (level === 1) level = 2;
      return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${level}>`;
    },
    table(header, body) {
      return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
    },
  },
});

// Контейнеры вида :::tldr / :::tip Заголовок / :::qa Вопрос? ... :::
function renderMarkdown(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  const blocks = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (!fence) fence = f[1];
      else if (line.trim().startsWith(fence)) fence = null;
      out.push(line);
      continue;
    }
    const c = !fence && line.match(/^:::(\w+)\s*(.*)$/);
    if (!c) { out.push(line); continue; }
    const [, type, title] = c;
    const inner = [];
    let innerFence = null;
    i++;
    for (; i < lines.length; i++) {
      const l = lines[i];
      const ff = l.match(/^\s*(```+|~~~+)/);
      if (ff) { if (!innerFence) innerFence = ff[1]; else if (l.trim().startsWith(innerFence)) innerFence = null; }
      if (!innerFence && /^:::\s*$/.test(l)) break;
      inner.push(l);
    }
    if (i >= lines.length) throw new Error(`Незакрытый контейнер :::${type} в ${ctx.file}`);
    const html = marked.parse(inner.join('\n'));
    let block;
    if (type === 'qa') {
      block = `<details class="qa"><summary>${marked.parseInline(title)}</summary><div class="qa-body">${html}</div></details>`;
    } else if (type === 'compare') {
      block = `<div class="compare">${html}</div>`;
    } else {
      const def = CALLOUTS[type];
      if (!def) throw new Error(`Неизвестный контейнер :::${type} в ${ctx.file}`);
      if (type === 'tldr') ctx.tldr = html;
      block = `<aside class="${def.cls}"><div class="callout-title">${esc(title || def.title)}</div>${html}</aside>`;
    }
    blocks.push(block);
    out.push('', `<!--BLOCK:${blocks.length - 1}-->`, '');
  }
  let html = marked.parse(out.join('\n'));
  html = html.replace(/<!--BLOCK:(\d+)-->/g, (_, n) => blocks[+n]);
  return html;
}

// ---------- загрузка контента ----------
function loadContent() {
  const cats = [];
  for (const dir of fs.readdirSync(CONTENT).sort()) {
    const full = path.join(CONTENT, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    const catSlug = dir.replace(/^\d+-/, '');
    const { meta: cmeta, body: cbody } = parseFrontMatter(fs.readFileSync(path.join(full, '_category.md'), 'utf8'), dir);
    const cat = { slug: catSlug, ...cmeta, intro: cbody.trim(), questions: [] };
    for (const f of fs.readdirSync(full).filter((x) => x.endsWith('.md') && x !== '_category.md').sort()) {
      const file = path.join(dir, f);
      const src = fs.readFileSync(path.join(full, f), 'utf8');
      const { meta, body } = parseFrontMatter(src, file);
      const slug = f.replace(/^\d+-/, '').replace(/\.md$/, '');
      ctx = { file, diagrams: [], headings: [], ids: new Set(), tldr: '' };
      const html = renderMarkdown(body);
      if (!ctx.tldr) throw new Error(`Нет блока :::tldr в ${file}`);
      const words = stripTags(body).split(/\s+/).length;
      cat.questions.push({
        slug, file, title: meta.title, level: meta.level || 'middle', tags: meta.tags || [],
        html, tldr: ctx.tldr, headings: ctx.headings, diagrams: ctx.diagrams,
        minutes: Math.max(2, Math.round(words / 170)),
      });
    }
    cats.push(cat);
  }
  return cats;
}

// ---------- рендер диаграмм mermaid (заранее, в headless Chromium) ----------
const FONT = 'Arial, "Liberation Sans", Helvetica, sans-serif';
const THEMES = {
  light: {
    theme: 'base',
    themeVariables: {
      fontFamily: FONT, fontSize: '15px', background: '#ffffff',
      primaryColor: '#e8effd', primaryBorderColor: '#4f7fe0', primaryTextColor: '#0f172a',
      secondaryColor: '#eefaf3', secondaryBorderColor: '#3f9b6b', secondaryTextColor: '#0f172a',
      tertiaryColor: '#fdf4e7', tertiaryBorderColor: '#d08a2c', tertiaryTextColor: '#0f172a',
      lineColor: '#64748b', textColor: '#1e293b', mainBkg: '#e8effd', nodeBorder: '#4f7fe0',
      clusterBkg: '#f6f8fb', clusterBorder: '#cbd5e1', titleColor: '#0f172a', edgeLabelBackground: '#ffffff',
      noteBkgColor: '#fff8db', noteBorderColor: '#e0b400', noteTextColor: '#1e293b',
      actorBkg: '#e8effd', actorBorder: '#4f7fe0', actorTextColor: '#0f172a', signalColor: '#334155', signalTextColor: '#1e293b',
      labelBoxBkgColor: '#e8effd', labelBoxBorderColor: '#4f7fe0', activationBkgColor: '#dbe7ff', activationBorderColor: '#4f7fe0',
    },
    classes: {
      good: 'fill:#dcfce7,stroke:#16a34a,color:#052e16',
      bad: 'fill:#fee2e2,stroke:#dc2626,color:#450a0a',
      warn: 'fill:#fef3c7,stroke:#d97706,color:#451a03',
      accent: 'fill:#4f7fe0,stroke:#2f5fc0,color:#ffffff',
      muted: 'fill:#f1f5f9,stroke:#94a3b8,color:#334155',
    },
  },
  dark: {
    theme: 'base',
    themeVariables: {
      darkMode: true, fontFamily: FONT, fontSize: '15px', background: '#161b26',
      primaryColor: '#1d2c4a', primaryBorderColor: '#6b98f0', primaryTextColor: '#e6ebf5',
      secondaryColor: '#173327', secondaryBorderColor: '#4fb883', secondaryTextColor: '#e6ebf5',
      tertiaryColor: '#3a2a14', tertiaryBorderColor: '#e0a24a', tertiaryTextColor: '#e6ebf5',
      lineColor: '#94a3b8', textColor: '#dbe2ee', mainBkg: '#1d2c4a', nodeBorder: '#6b98f0',
      clusterBkg: '#1a202c', clusterBorder: '#3a4558', titleColor: '#e6ebf5', edgeLabelBackground: '#161b26',
      noteBkgColor: '#3a3314', noteBorderColor: '#c9a227', noteTextColor: '#f1ead0',
      actorBkg: '#1d2c4a', actorBorder: '#6b98f0', actorTextColor: '#e6ebf5', signalColor: '#b6c2d6', signalTextColor: '#dbe2ee',
      labelBoxBkgColor: '#1d2c4a', labelBoxBorderColor: '#6b98f0', activationBkgColor: '#26395f', activationBorderColor: '#6b98f0',
      sequenceNumberColor: '#161b26',
    },
    classes: {
      good: 'fill:#123524,stroke:#34d399,color:#d1fae5',
      bad: 'fill:#3f1515,stroke:#f87171,color:#fee2e2',
      warn: 'fill:#3a2a0c,stroke:#fbbf24,color:#fef3c7',
      accent: 'fill:#4f7fe0,stroke:#93b4f5,color:#ffffff',
      muted: 'fill:#1f2633,stroke:#64748b,color:#cbd5e1',
    },
  },
};

function withClassDefs(code, themeName) {
  const first = code.trimStart().split('\n')[0];
  if (!/^(flowchart|graph)\b/.test(first)) return code;
  const defs = Object.entries(THEMES[themeName].classes).map(([k, v]) => `    classDef ${k} ${v}`).join('\n');
  return `${code.trimEnd()}\n${defs}\n`;
}

async function renderDiagrams(all) {
  const mermaidPath = require.resolve('mermaid/dist/mermaid.min.js');
  const version = JSON.parse(fs.readFileSync(path.join(path.dirname(mermaidPath), '..', 'package.json'), 'utf8')).version;
  fs.mkdirSync(CACHE, { recursive: true });
  const configHash = sha(JSON.stringify(THEMES) + version + renderDiagrams.toString() + withClassDefs.toString()).slice(0, 8);
  const result = new Map();
  const todo = [];
  for (const d of all) {
    for (const t of Object.keys(THEMES)) {
      const id = `mm-${d.key.slice(0, 10)}-${t[0]}`;
      const cacheFile = path.join(CACHE, `${d.key}-${t}-${configHash}.svg`);
      if (fs.existsSync(cacheFile)) result.set(`${d.key}:${t}`, fs.readFileSync(cacheFile, 'utf8'));
      else todo.push({ ...d, theme: t, id, cacheFile });
    }
  }
  if (!todo.length) return result;
  console.log(`Рендер диаграмм: ${todo.length} (кэш: ${all.length * 2 - todo.length})`);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  await page.addScriptTag({ path: mermaidPath });
  const errors = [];
  for (const t of todo) {
    const cfg = THEMES[t.theme];
    const res = await page.evaluate(async ({ code, id, cfg }) => {
      try {
        window.mermaid.initialize({
          startOnLoad: false, securityLevel: 'loose', theme: cfg.theme, themeVariables: cfg.themeVariables,
          flowchart: { curve: 'basis', padding: 12, htmlLabels: true, useMaxWidth: true },
          sequence: {
            useMaxWidth: true, mirrorActors: false, actorMargin: 30, boxMargin: 8, noteMargin: 10, messageMargin: 34,
            actorFontFamily: cfg.themeVariables.fontFamily, noteFontFamily: cfg.themeVariables.fontFamily, messageFontFamily: cfg.themeVariables.fontFamily,
            actorFontSize: 15, noteFontSize: 14, messageFontSize: 14, wrap: true, width: 150,
          },
          class: { useMaxWidth: true }, state: { useMaxWidth: true }, er: { useMaxWidth: true },
        });
        const { svg } = await window.mermaid.render(id, code);
        return { svg };
      } catch (e) {
        document.querySelectorAll('[id^="d' + id + '"], #' + id).forEach((n) => n.remove());
        return { error: String(e && e.message || e) };
      }
    }, { code: withClassDefs(t.code, t.theme), id: t.id, cfg });
    if (res.error) { errors.push(`${t.file}: ${res.error.split('\n').slice(0, 3).join(' ')}\n---\n${t.code}`); continue; }
    fs.writeFileSync(t.cacheFile, res.svg);
    result.set(`${t.key}:${t.theme}`, res.svg);
  }
  await browser.close();
  if (errors.length) {
    console.error(`Ошибки в диаграммах (${errors.length}):\n\n${errors.join('\n\n')}`);
    process.exit(1);
  }
  return result;
}

const wideDiagrams = [];
function injectDiagrams(html, svgs) {
  return html.replace(/<!--MERMAID:([0-9a-f]+):([A-Za-z0-9+/=]*)-->/g, (_, key, cap64) => {
    const caption = Buffer.from(cap64, 'base64').toString('utf8');
    const light = svgs.get(`${key}:light`);
    const dark = svgs.get(`${key}:dark`);
    // не даём широким схемам ужиматься сильнее чем до 72% — дальше горизонтальная прокрутка
    const w = +(light.match(/style="max-width: ([\d.]+)px;"/) || [0, 0])[1];
    if (w > 1100) wideDiagrams.push(`${Math.round(w)}px: ${caption || key}`);
    const size = (svg) => svg.replace(/style="max-width: ([\d.]+)px;"/, (m, w) => `style="max-width:${w}px;min-width:${Math.round(+w * 0.72)}px"`);
    return `<figure class="diagram"><div class="dg dg-light">${size(light)}</div><div class="dg dg-dark">${size(dark)}</div>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
  });
}

// ---------- шаблоны ----------
function layout({ title, description, base, body, bodyClass = '', extraHead = '' }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#512bd4"/><text x="16" y="21" text-anchor="middle" font-family="Arial" font-size="12" font-weight="700" fill="#fff">.NET</text></svg>')}">
<script>(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();</script>
<link rel="stylesheet" href="${base}assets/style.css">
${extraHead}</head>
<body class="${bodyClass}" data-base="${base}">
<a class="skip" href="#main">Перейти к содержимому</a>
<header class="topbar">
  <div class="topbar-in">
    <a class="brand" href="${base}index.html">${UI.logo}<span>${esc(SITE_NAME)}</span></a>
    <div class="search" role="search">
      ${UI.search}
      <input id="search" type="search" placeholder="Поиск по вопросам…  ( / )" autocomplete="off" aria-label="Поиск по вопросам">
      <div class="search-results" id="search-results" hidden></div>
    </div>
    <nav class="top-actions">
      <a class="btn-ghost" href="${base}trainer.html" title="Тренажёр: карточки для повторения">${UI.cards}<span class="hide-sm">Тренажёр</span></a>
      <button class="btn-ghost icon-only" id="theme-toggle" type="button" aria-label="Переключить тему">${UI.sun}${UI.moon}</button>
    </nav>
  </div>
</header>
${body}
<footer class="site-footer">
  <div class="footer-in">
    <span>${esc(SITE_NAME)} — подготовка к собеседованию .NET Middle разработчика</span>
    <a href="https://github.com/sh-sharifjonov/DotnetQuestionsForMiddle">Исходники на GitHub</a>
  </div>
</footer>
<script src="${base}assets/search-index.js" defer></script>
<script src="${base}assets/app.js" defer></script>
</body>
</html>
`;
}

const qUrl = (cat, q) => `topics/${cat.slug}/${q.slug}.html`;
const cUrl = (cat) => `topics/${cat.slug}/index.html`;
const levelChip = (lv) => { const l = LEVELS[lv] || LEVELS.middle; return `<span class="chip ${l.cls}">${l.label}</span>`; };

function questionPage(cats, cat, q, idx, flat, flatIdx) {
  const base = '../../';
  const prev = flat[flatIdx - 1];
  const next = flat[flatIdx + 1];
  const side = cat.questions.map((x, i) => `<li><a href="${x.slug}.html" data-qid="${cat.slug}/${x.slug}"${x === q ? ' aria-current="page" class="active"' : ''}><span class="num">${i + 1}</span><span class="t">${esc(x.title)}</span><span class="done-mark">${UI.check}</span></a></li>`).join('');
  const otherCats = cats.map((c) => `<li><a href="${base}${cUrl(c)}"${c === cat ? ' class="active"' : ''} style="--cat:${c.color}">${icon(c.icon, 'icon sm')}<span>${esc(c.title)}</span></a></li>`).join('');
  const toc = q.headings.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('');
  const navCard = (item, dir) => item
    ? `<a class="pn ${dir}" href="${base}${qUrl(item.cat, item.q)}"><span class="pn-dir">${dir === 'prev' ? UI.left + 'Предыдущий' : 'Следующий' + UI.right}</span><span class="pn-cat">${esc(item.cat.title)}</span><span class="pn-t">${esc(item.q.title)}</span></a>`
    : '<span></span>';
  const body = `
<div class="doc-layout" style="--cat:${cat.color}">
  <aside class="sidebar" id="sidebar" aria-label="Вопросы раздела">
    <div class="sidebar-in">
      <a class="side-cat" href="index.html">${icon(cat.icon)}<span>${esc(cat.title)}</span></a>
      <div class="side-progress"><div class="bar"><i data-progress="${cat.slug}"></i></div><span data-progress-text="${cat.slug}" data-total="${cat.questions.length}"></span></div>
      <ol class="side-list">${side}</ol>
      <details class="side-other"><summary>Другие разделы</summary><ul>${otherCats}</ul></details>
    </div>
  </aside>
  <main id="main" class="article-wrap">
    <nav class="crumbs" aria-label="Навигация"><a href="${base}index.html">Главная</a><span>/</span><a href="index.html">${esc(cat.title)}</a><span>/</span><span>Вопрос ${idx + 1}</span></nav>
    <button class="side-toggle" type="button" aria-controls="sidebar" aria-expanded="false">${UI.menu}Все вопросы раздела</button>
    <article class="article" data-qid="${cat.slug}/${q.slug}">
      <header class="article-head">
        <div class="meta">${levelChip(q.level)}<span class="chip">${UI.clock}${q.minutes} мин чтения</span><span class="chip">Вопрос ${idx + 1} из ${cat.questions.length}</span></div>
        <h1>${esc(q.title)}</h1>
        <button class="learn-btn" type="button" data-learn="${cat.slug}/${q.slug}">${UI.check}<span>Отметить как изученное</span></button>
      </header>
      <div class="prose">${q.html}</div>
      <div class="article-end">
        <button class="learn-btn big" type="button" data-learn="${cat.slug}/${q.slug}">${UI.check}<span>Отметить как изученное</span></button>
      </div>
      <nav class="prev-next" aria-label="Соседние вопросы">${navCard(prev, 'prev')}${navCard(next, 'next')}</nav>
    </article>
  </main>
  <aside class="toc" aria-label="Содержание страницы">
    <div class="toc-in"><div class="toc-title">На этой странице</div><ol>${toc}</ol></div>
  </aside>
</div>`;
  return layout({ title: `${q.title} — ${SITE_NAME}`, description: stripTags(q.tldr).slice(0, 180), base, body, bodyClass: 'page-question' });
}

function categoryPage(cats, cat, ci) {
  const base = '../../';
  const items = cat.questions.map((q, i) => `
      <li><a class="q-row" href="${q.slug}.html" data-qid="${cat.slug}/${q.slug}">
        <span class="q-num">${i + 1}</span>
        <span class="q-main"><span class="q-title">${esc(q.title)}</span><span class="q-sub">${esc(stripTags(q.tldr).replace(/\s+/g, ' ').slice(0, 170))}…</span></span>
        <span class="q-side">${levelChip(q.level)}<span class="q-min">${q.minutes} мин</span><span class="done-mark">${UI.check}</span></span>
      </a></li>`).join('');
  const prev = cats[ci - 1];
  const next = cats[ci + 1];
  const body = `
<main id="main" class="page" style="--cat:${cat.color}">
  <nav class="crumbs" aria-label="Навигация"><a href="${base}index.html">Главная</a><span>/</span><span>${esc(cat.title)}</span></nav>
  <header class="cat-hero">
    <div class="cat-icon">${icon(cat.icon)}</div>
    <div>
      <h1>${esc(cat.title)}</h1>
      <p class="lead">${esc(cat.description)}</p>
      <div class="cat-progress"><div class="bar"><i data-progress="${cat.slug}"></i></div><span data-progress-text="${cat.slug}" data-total="${cat.questions.length}"></span></div>
    </div>
  </header>
  ${cat.intro ? `<section class="prose cat-intro">${marked.parse(cat.intro)}</section>` : ''}
  <ol class="q-list">${items}</ol>
  <nav class="prev-next" aria-label="Соседние разделы">
    ${prev ? `<a class="pn prev" href="${base}${cUrl(prev)}"><span class="pn-dir">${UI.left}Предыдущий раздел</span><span class="pn-t">${esc(prev.title)}</span></a>` : '<span></span>'}
    ${next ? `<a class="pn next" href="${base}${cUrl(next)}"><span class="pn-dir">Следующий раздел${UI.right}</span><span class="pn-t">${esc(next.title)}</span></a>` : '<span></span>'}
  </nav>
</main>`;
  return layout({ title: `${cat.title} — ${SITE_NAME}`, description: cat.description, base, body, bodyClass: 'page-category' });
}

function indexPage(cats, stats) {
  const base = '';
  const cards = cats.map((c, i) => `
    <a class="cat-card" href="${cUrl(c)}" style="--cat:${c.color}">
      <div class="cat-card-top"><span class="cat-icon">${icon(c.icon)}</span><span class="cat-n">${String(i + 1).padStart(2, '0')}</span></div>
      <h3>${esc(c.title)}</h3>
      <p>${esc(c.description)}</p>
      <div class="cat-card-foot"><span>${c.questions.length} ${plural(c.questions.length, 'вопрос', 'вопроса', 'вопросов')}</span><div class="bar"><i data-progress="${c.slug}"></i></div><span data-progress-text="${c.slug}" data-total="${c.questions.length}" data-short="1"></span></div>
    </a>`).join('');
  const body = `
<main id="main" class="page home">
  <section class="hero">
    <div class="hero-text">
      <span class="eyebrow">Учебник для подготовки к собеседованию</span>
      <h1>Вопросы для <span class="grad">.NET Middle</span> разработчика</h1>
      <p class="lead">${stats.questions} вопросов с подробными разборами: как это работает под капотом, схемы и диаграммы, примеры кода на C#, типичные ошибки и вопросы «на засыпку», которые задают интервьюеры.</p>
      <div class="hero-actions">
        <a class="btn-primary" href="${cUrl(cats[0])}">Начать с первого раздела</a>
        <a class="btn-secondary" href="trainer.html">${UI.cards}Тренажёр-карточки</a>
        <a class="btn-link" id="continue-link" href="#" hidden>Продолжить изучение →</a>
      </div>
    </div>
    <div class="hero-stats">
      <div class="stat"><b>${stats.questions}</b><span>вопросов</span></div>
      <div class="stat"><b>${cats.length}</b><span>разделов</span></div>
      <div class="stat"><b>${stats.diagrams}</b><span>диаграмм</span></div>
      <div class="stat progress-stat"><b data-total-progress>0%</b><span>изучено</span><div class="bar"><i data-progress="*"></i></div></div>
    </div>
  </section>

  <section class="how">
    <h2>Как устроена каждая страница</h2>
    <div class="how-grid">
      <div class="how-item"><span class="how-n">1</span><b>Коротко</b><p>Ответ в 3–5 пунктах — то, что стоит сказать на собеседовании в первые 30 секунд.</p></div>
      <div class="how-item"><span class="how-n">2</span><b>Подробно</b><p>Разбор механизма «под капотом» с диаграммами, таблицами сравнения и кодом.</p></div>
      <div class="how-item"><span class="how-n">3</span><b>Подводные камни</b><p>Типичные ошибки из реальных проектов и как их избежать.</p></div>
      <div class="how-item"><span class="how-n">4</span><b>Вопросы на засыпку</b><p>Уточняющие вопросы интервьюера со скрытыми ответами — проверьте себя.</p></div>
    </div>
  </section>

  <section>
    <div class="section-head"><h2>Разделы</h2><button class="btn-link" id="reset-progress" type="button">Сбросить прогресс</button></div>
    <div class="cat-grid">${cards}</div>
  </section>
</main>`;
  return layout({ title: `Вопросы для .NET Middle разработчика — ${SITE_NAME}`, description: `${stats.questions} вопросов для собеседования .NET Middle с подробными ответами, диаграммами и примерами кода.`, base, body, bodyClass: 'page-home' });
}

function trainerPage(cats) {
  const base = '';
  const opts = cats.map((c) => `<label class="tr-cat" style="--cat:${c.color}"><input type="checkbox" value="${c.slug}" checked><span>${esc(c.title)}</span></label>`).join('');
  const body = `
<main id="main" class="page trainer">
  <nav class="crumbs" aria-label="Навигация"><a href="index.html">Главная</a><span>/</span><span>Тренажёр</span></nav>
  <header class="page-head">
    <h1>Тренажёр-карточки</h1>
    <p class="lead">Сначала попробуйте ответить вслух, затем откройте краткий ответ. «Знаю» — карточка уходит из колоды, «Повторить» — вернётся позже.</p>
  </header>
  <details class="tr-filter"><summary>Разделы для тренировки</summary><div class="tr-cats">${opts}</div>
    <label class="tr-cat only-new"><input type="checkbox" id="tr-only-new"><span>Только неизученные</span></label></details>
  <div class="tr-stats"><span>В колоде: <b id="tr-left">0</b></span><span>Знаю: <b id="tr-known">0</b></span><span>Повторить: <b id="tr-again">0</b></span></div>
  <section class="card-box" id="card" aria-live="polite">
    <div class="card-cat" id="card-cat"></div>
    <h2 class="card-q" id="card-q">Загрузка…</h2>
    <div class="card-a prose" id="card-a" hidden></div>
    <div class="card-actions">
      <button class="btn-primary" id="btn-show" type="button">Показать ответ <kbd>Пробел</kbd></button>
      <button class="btn-secondary good" id="btn-know" type="button" hidden>Знаю <kbd>1</kbd></button>
      <button class="btn-secondary bad" id="btn-again" type="button" hidden>Повторить <kbd>2</kbd></button>
      <a class="btn-link" id="card-link" href="#">Открыть полный разбор →</a>
    </div>
  </section>
  <button class="btn-link" id="tr-restart" type="button">Перемешать колоду заново</button>
</main>`;
  return layout({ title: `Тренажёр — ${SITE_NAME}`, description: 'Карточки для повторения вопросов .NET Middle.', base, body, bodyClass: 'page-trainer' });
}

const plural = (n, one, few, many) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// ---------- проверка внутренних ссылок ----------
function checkLinks(pages) {
  const existing = new Set(pages.map((p) => path.normalize(p.file)));
  const errors = [];
  for (const p of pages) {
    for (const m of p.html.matchAll(/href="([^"#]+)(#[^"]*)?"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|data:)/.test(href)) continue;
      const target = path.normalize(path.join(path.dirname(p.file), href));
      if (!existing.has(target) && !fs.existsSync(path.join(ROOT, target))) errors.push(`${p.file} → ${href}`);
    }
  }
  if (errors.length) { console.error(`Битые ссылки:\n${errors.join('\n')}`); process.exit(1); }
}

// ---------- main ----------
const cats = loadContent();
const allDiagrams = cats.flatMap((c) => c.questions.flatMap((q) => q.diagrams));
const uniq = [...new Map(allDiagrams.map((d) => [d.key, d])).values()];
const svgs = await renderDiagrams(uniq);

const flat = cats.flatMap((cat) => cat.questions.map((q) => ({ cat, q })));
const pages = [];
fs.rmSync(OUT_TOPICS, { recursive: true, force: true });
cats.forEach((cat, ci) => {
  pages.push({ file: cUrl(cat), html: categoryPage(cats, cat, ci) });
  cat.questions.forEach((q, i) => {
    q.html = injectDiagrams(q.html, svgs);
    pages.push({ file: qUrl(cat, q), html: questionPage(cats, cat, q, i, flat, flat.findIndex((x) => x.q === q)) });
  });
});
const stats = { questions: flat.length, diagrams: allDiagrams.length };
pages.push({ file: 'index.html', html: indexPage(cats, stats) });
pages.push({ file: 'trainer.html', html: trainerPage(cats) });

const index = flat.map(({ cat, q }) => ({
  id: `${cat.slug}/${q.slug}`, u: qUrl(cat, q), t: q.title, c: cat.title, cs: cat.slug, col: cat.color,
  lv: q.level, k: q.tags.join(' '), h: q.headings.map((h) => h.text).join(' · '), a: q.tldr,
}));
const cstats = cats.map((c) => ({ slug: c.slug, total: c.questions.length }));
pages.push({ file: 'assets/search-index.js', html: `window.SITE_INDEX=${JSON.stringify(index)};\nwindow.SITE_CATS=${JSON.stringify(cstats)};\n` });

if (wideDiagrams.length) console.warn(`Широкие диаграммы (>1100px):\n  ${wideDiagrams.join('\n  ')}`);
checkLinks(pages.filter((p) => p.file.endsWith('.html')));
for (const p of pages) write(path.join(ROOT, p.file), p.html);
console.log(`Готово: ${cats.length} разделов, ${flat.length} вопросов, ${allDiagrams.length} диаграмм, ${pages.length} файлов.`);
