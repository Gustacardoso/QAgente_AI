import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { snapshot } from './snapshot.mjs';
import { execute } from './executor.mjs';
import { createLLM } from './llm.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);

const MAX_ATTEMPTS = 3;
const goal = opt('goal') || 'Fazer login com credenciais válidas e ver a mensagem de sucesso';

let server;
let url = opt('url');
if (flag('demo')) {
  server = http.createServer((_, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.join(root, 'demo/app.html')));
  }).listen(0);
  url = `http://localhost:${server.address().port}`;
}
if (!url) {
  console.error('Uso: node src/agent.mjs --url <url> --goal "<objetivo>" [--mock] [--headed]  |  --demo');
  process.exit(1);
}

async function main() {
  const llm = createLLM({ mock: flag('mock') });
  console.log(`QAgent | modelo: ${llm.name}\nObjetivo: ${goal}\nURL: ${url}\n`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' }); // SPAs só renderizam após o carregamento
  await page.waitForSelector('input, button, a[href]', { timeout: 10000 }).catch(() => {});
  const snap = await snapshot(page);
  await browser.close();

  const history = [];
  let plan, failure, result;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    plan = await llm.plan({ goal, snapshot: snap, previous: failure && plan, failure });
    result = await execute(plan, {
      baseUrl: url,
      headed: flag('headed'),
      shotPath: path.join(root, 'reports', `falha-${attempt}.png`),
    });
    history.push({ attempt, plan, result });
    console.log(`Tentativa ${attempt}: ${result.passed
      ? 'PASSOU'
      : `FALHOU no passo ${result.failedStep} (${result.step.action} ${result.step.selector ?? ''}) -> ${result.error}`}`);
    if (result.passed) break;
    failure = result;
    if (attempt < MAX_ATTEMPTS) console.log('  pedindo correção ao agente...');
  }

  fs.writeFileSync(
    path.join(root, 'reports', 'ultimo-relatorio.json'),
    JSON.stringify({ goal, url, passed: result.passed, history }, null, 2),
  );
  if (result.passed) {
    const file = path.join(root, 'generated', 'agent.spec.ts');
    fs.writeFileSync(file, toPlaywrightSpec(plan));
    console.log(`\nTeste gerado: ${path.relative(root, file)}`);
  }
  console.log('Relatório: reports/ultimo-relatorio.json');
  server?.close();
  process.exitCode = result.passed ? 0 : 1;
}

function toPlaywrightSpec(plan) {
  const q = JSON.stringify;
  const line = ({ action, selector, value }) => ({
    goto: `await page.goto(${q(value)});`,
    fill: `await page.locator(${q(selector)}).fill(${q(value)});`,
    click: `await page.locator(${q(selector)}).click();`,
    expect_visible: `await expect(page.locator(${q(selector)})).toBeVisible();`,
    expect_text: `await expect(page.locator(${q(selector || 'body')})).toContainText(${q(value)});`,
    expect_url: `await expect(page).toHaveURL(new RegExp(${q(value)}));`,
  })[action];
  const body = plan.steps.map((s) => '  ' + line(s)).join('\n');
  return `import { test, expect } from '@playwright/test';\n\ntest(${q(plan.name)}, async ({ page }) => {\n${body}\n});\n`;
}

main().catch((e) => { console.error(e); server?.close(); process.exit(1); });
