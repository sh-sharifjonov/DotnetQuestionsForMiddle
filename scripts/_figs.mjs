import { chromium } from 'playwright';
const [,, url, out, theme='light', w='1400'] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: 900 }, colorScheme: theme });
await p.goto(url); await p.waitForTimeout(200);
const figs = await p.$$('figure.diagram');
for (let i=0;i<figs.length;i++) await figs[i].screenshot({ path: `${out}-${i}.png` });
console.log(figs.length);
await b.close();
