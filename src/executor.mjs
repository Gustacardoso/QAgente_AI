import { chromium } from 'playwright';

const TIMEOUT = 3000;

// Executa um plano (lista de passos JSON). Retorna { passed, failedStep, step, error }
export async function execute(plan, { baseUrl, headed = false, shotPath }) {
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);
  try {
    for (const [i, step] of plan.steps.entries()) {
      try {
        await runStep(page, step, baseUrl);
      } catch (err) {
        if (shotPath) await page.screenshot({ path: shotPath }).catch(() => {});
        return { passed: false, failedStep: i, step, error: String(err.message).split('\n')[0] };
      }
    }
    return { passed: true };
  } finally {
    await browser.close();
  }
}

async function runStep(page, { action, selector, value }, baseUrl) {
  switch (action) {
    case 'goto': return void (await page.goto(value || baseUrl, { waitUntil: 'networkidle' }));
    case 'fill': return void (await page.fill(selector, value));
    case 'click': return void (await page.click(selector));
    case 'expect_visible': return void (await page.waitForSelector(selector, { state: 'visible' }));
    case 'expect_text': {
      const loc = selector ? page.locator(selector) : page.locator('body');
      await loc.filter({ hasText: value }).first().waitFor({ state: 'visible' });
      return;
    }
    case 'expect_url':
      return void (await page.waitForURL((u) => u.href.includes(value)));
    default: throw new Error(`Ação desconhecida: ${action}`);
  }
}
