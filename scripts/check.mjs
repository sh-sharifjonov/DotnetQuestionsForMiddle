// Проверка собранного сайта: ошибки в консоли и горизонтальная прокрутка (390px и 1280px).
import { chromium } from 'playwright';
import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
const root = resolve(process.argv[2]);
const files = [];
(function walk(d){ for (const f of readdirSync(d)) { const p = join(d,f); if (statSync(p).isDirectory()) { if (!['node_modules','content','scripts','.cache','.git','assets'].includes(f)) walk(p); } else if (f.endsWith('.html')) files.push(p); } })(root);
const browser = await chromium.launch();
const problems = [];
for (const [w, theme] of [[390,'light'],[1280,'dark']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: theme });
  const page = await ctx.newPage();
  let errs = [];
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  for (const f of files) {
    errs = [];
    await page.goto('file://' + f);
    const o = await page.evaluate(() => {
      const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
      const offenders = sw > cw ? [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > cw + 1 && !e.closest('pre, .table-wrap, figure.diagram, .diagram, table')).slice(0,3).map(e => e.tagName + '.' + e.className) : [];
      return { sw, cw, offenders };
    });
    if (o.sw > o.cw) problems.push(`${w} overflow ${o.sw}>${o.cw} ${f.replace(root,'')} ${o.offenders.join(' ')}`);
    if (errs.length) problems.push(`${w} errors ${f.replace(root,'')}: ${errs.join(' | ').slice(0,200)}`);
  }
  await ctx.close();
}
await browser.close();
console.log(files.length, 'pages'); console.log(problems.join('\n') || 'no problems');
