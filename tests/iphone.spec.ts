import { test, expect, webkit } from '@playwright/test';
test.use({ channel: undefined });
test('iPhone Safari layouts, draw arrow, 20-second glow and expiry popup', async () => {
  test.setTimeout(150000);
  const browser = await webkit.launch({ channel: undefined });
  try {
    const sizes = [
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 844, height: 390 },
    ];
    const contexts = await Promise.all(
      sizes.map((viewport) =>
        browser.newContext({
          viewport,
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
          reducedMotion: 'reduce',
        }),
      ),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const host = pages[0]!;
    await host.goto('http://127.0.0.1:5174/');
    await host.getByLabel('YOUR DISPLAY NAME').fill('iPhone Host');
    await host.getByRole('button', { name: 'Open your court' }).click();
    const code = await host.getByTestId('room-code').innerText();
    for (let i = 1; i < 4; i++) {
      await pages[i]!.goto(`http://127.0.0.1:5174/?room=${code}`);
      await pages[i]!.getByLabel('YOUR DISPLAY NAME').fill(`Safari ${i}`);
      await pages[i]!.getByRole('button', { name: 'Enter the court' }).click();
      await expect(pages[i]!.getByTestId('room-code')).toBeVisible();
    }
    await host.getByRole('button', { name: 'Begin the game' }).click();
    for (let i = 0; i < 4; i++) {
      const page = pages[i]!;
      await expect(page.getByTestId('game-table')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `test-results/iphone-${sizes[i]!.width}.png`,
        fullPage: true,
      });
    }
    await expect(host.locator('.draw-prompt')).toContainText('Draw your card');
    await expect(host.locator('.turn-clock')).toHaveCount(0);
    await host
      .getByRole('button', { name: 'Draw a card', exact: true })
      .click();
    await expect(host.locator('.turn-clock')).toContainText(/1[89]s|20s/);
    await expect(host.getByTestId('game-table')).toHaveClass(/timed-turn/);
    await expect(host.locator('.draw-prompt')).toHaveCount(0);
    const cards = host.locator('.hand-zone .card-button:not(:disabled)');
    await cards.first().click();
    const play = host.getByRole('button', { name: /^Play / });
    await play.scrollIntoViewIfNeeded();
    await expect(play).toBeInViewport();
    await host.screenshot({
      path: 'test-results/iphone-action.png',
      fullPage: true,
    });
    await expect(host.getByRole('heading', { name: 'Time’s up' })).toBeVisible({
      timeout: 26000,
    });
    await host.getByRole('button', { name: 'Back to the table' }).click();
    await expect(host.getByRole('heading', { name: 'Time’s up' })).toHaveCount(
      0,
    );
    await Promise.all(contexts.map((c) => c.close()));
  } finally {
    await browser.close();
  }
});
