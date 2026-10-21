import { test, expect } from '@playwright/test';

test("Fazer login com credenciais válidas e ver a mensagem de suce", async ({ page }) => {
  await page.goto("http://localhost:64551/");
  await page.locator("#email").fill("qa@teste.com");
  await page.locator("#password").fill("123456");
  await page.locator("[data-testid=\"submit-login\"]").click();
  await expect(page.locator("body")).toContainText("Login realizado com sucesso");
});
