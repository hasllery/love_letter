import { test, expect, type Page } from '@playwright/test';
import type { RoomView, Move } from '../packages/shared/src/index';
import { CARDS } from '../packages/shared/src/index';
import { chooseMove } from './game-policy';
test('four browsers complete a round with a peek, elimination, and Chancellor choice', async ({
  browser,
}) => {
  test.setTimeout(300000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({ reducedMotion: 'no-preference' }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const browserErrors: string[] = [];
  for (const page of pages)
    page.on('pageerror', (error) => browserErrors.push(error.message));
  const views = new Map<Page, RoomView>();
  for (const page of pages)
    page.on('websocket', (ws) =>
      ws.on('framereceived', ({ payload }) => {
        const data = payload.toString();
        if (data.startsWith('42[')) {
          const [event, body] = JSON.parse(data.slice(2)) as [string, RoomView];
          if (event === 'room:view') views.set(page, body);
        }
      }),
    );
  const host = pages[0]!;
  await host.goto('/');
  await host.getByLabel('YOUR DISPLAY NAME').fill('Ada');
  await host.getByRole('button', { name: 'Open your court' }).click();
  await expect(host.getByTestId('room-code')).toBeVisible();
  const code = await host.getByTestId('room-code').innerText();
  for (let i = 1; i < pages.length; i++) {
    const page = pages[i]!;
    await page.goto(`/?room=${code}`);
    await page
      .getByLabel('YOUR DISPLAY NAME')
      .fill(['Ada', 'Basil', 'Cleo', 'Dara'][i]!);
    await page.getByRole('button', { name: 'Enter the court' }).click();
    await expect(page.getByTestId('room-code')).toHaveText(code);
  }
  await host.evaluate(() => {
    new MutationObserver(() => {
      if (
        document.querySelector(
          '.hand-zone .card[data-face="back"][data-arriving="false"]',
        )
      )
        document.body.dataset.sawLandedBack = 'true';
      if (document.querySelector('.hand-zone .card[data-face="front"]'))
        document.body.dataset.sawRevealedHand = 'true';
      if (
        document.querySelector(
          '.flight-draw .card-front, .flight-deal .card-front',
        )
      )
        document.body.dataset.drawFaceLeak = 'true';
      if (document.querySelector('.flying-card')) {
        document.body.dataset.sawFlight = 'true';
        const kinds = new Set(
          (document.body.dataset.flightKinds ?? '').split(','),
        );
        document
          .querySelectorAll<HTMLElement>('.flying-card')
          .forEach((card) => kinds.add(card.dataset.flightKind ?? ''));
        document.body.dataset.flightKinds = [...kinds].join(',');
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-face', 'data-arriving'],
    });
  });
  await expect(host.locator('.section-label')).toContainText('4 / 4');
  const extra = await browser.newPage();
  await extra.goto(`/?room=${code}`);
  await extra.getByLabel('YOUR DISPLAY NAME').fill('Fifth player');
  await extra.getByRole('button', { name: 'Enter the court' }).click();
  await expect(extra.getByRole('alert')).toContainText('Room full');
  await extra.close();
  await host.getByRole('button', { name: 'Begin the game' }).click();
  await expect.poll(() => views.get(host)?.game?.phase).toBe('draw');
  await expect(host.locator('body')).toHaveAttribute('data-saw-flight', 'true');
  await expect(host.getByTestId('flight-layer')).toHaveAttribute(
    'data-active',
    'false',
  );
  expect(views.get(host)!.game!.hand).toHaveLength(1);
  expect(views.get(host)!.game!.deckCount).toBe(16);
  await expect(
    pages[1]!.getByRole('button', { name: 'Draw a card', exact: true }),
  ).toBeDisabled();
  await host.screenshot({
    path: 'test-results/table-desktop.png',
    fullPage: true,
  });
  await expect(host.locator('body')).toHaveAttribute(
    'data-saw-landed-back',
    'true',
  );
  await expect(host.locator('body')).toHaveAttribute(
    'data-saw-revealed-hand',
    'true',
  );
  await expect(
    host.locator('.hand-zone .card-front img').first(),
  ).toHaveAttribute('src', /cards\/(spy|handmaid)\.jpeg$/);
  await expect(host.locator('.opponent-hand img')).toHaveCount(0);
  await host.getByRole('button', { name: 'Enlarge reference card' }).click();
  await expect(
    host.getByRole('heading', { name: 'Your card reference' }),
  ).toBeVisible();
  await expect(host.locator('.reference-full img')).toHaveAttribute(
    'src',
    /cards\/reference\.png$/,
  );
  await host.getByRole('button', { name: 'Close dialog' }).click();
  const seen = new Set<string>();
  let actions = 0;
  while (!['roundEnd', 'gameOver'].includes(views.get(host)!.game!.phase)) {
    if (++actions > 100) throw new Error('Round did not terminate');
    const revision = views.get(host)!.game!.revision;
    await expect
      .poll(() => pages.every((p) => views.get(p)?.game?.revision === revision))
      .toBe(true);
    await Promise.all(
      pages.map(async (p) => {
        await expect(p.getByTestId('flight-layer')).toHaveAttribute(
          'data-active',
          'false',
        );
        const secret = p.getByRole('button', { name: 'Keep the secret' });
        while (await secret.isVisible()) await secret.click();
        const expired = p.getByRole('button', { name: 'Back to the table' });
        if (await expired.isVisible()) await expired.click();
      }),
    );
    const actor = pages.find((p) => views.get(p)!.game!.legalMoves.length)!;
    const room = views.get(actor)!;
    const game = room.game!;
    let move: Move = chooseMove(
      pages.map((p) => views.get(p)!.game!),
      seen,
    );
    if (move.kind === 'draw') {
      const beforeCount = game.hand.length;
      await actor
        .getByRole('button', { name: 'Draw a card', exact: true })
        .click();
      await expect
        .poll(() => views.get(actor)?.game?.hand.length)
        .toBe(beforeCount + 1);
    } else if (move.kind === 'play') {
      const cardId = move.cardId;
      const rank = game.hand.find((c) => c.id === cardId)!.rank;
      if (rank === 1 && seen.has('priest') && seen.has('chancellor'))
        move =
          game.legalMoves.find(
            (m) =>
              m.kind === 'play' &&
              m.cardId === cardId &&
              pages.some(
                (p) =>
                  views.get(p)!.you === m.targetId &&
                  views.get(p)!.game!.hand[0]?.rank === m.guess,
              ),
          ) ?? move;
      if (move.kind !== 'play') throw new Error('Expected play');
      await actor
        .getByRole('button', {
          name: `${CARDS[rank].name}, value ${rank}`,
          exact: true,
        })
        .first()
        .click();
      if (move.targetId)
        await actor
          .getByLabel('Target', { exact: true })
          .selectOption(move.targetId);
      if (move.guess !== undefined)
        await actor
          .getByLabel('Your guess', { exact: true })
          .selectOption(String(move.guess));
      if (rank === 2 && move.targetId) seen.add('priest');
      if (rank === 6) seen.add('chancellor');
      if (
        rank === 1 &&
        pages.some(
          (p) =>
            views.get(p)!.you ===
              (move as Extract<Move, { kind: 'play' }>).targetId &&
            views.get(p)!.game!.hand[0]?.rank ===
              (move as Extract<Move, { kind: 'play' }>).guess,
        )
      )
        seen.add('guard');
      await actor
        .getByRole('button', { name: `Play ${CARDS[rank].name}`, exact: false })
        .click();
    } else {
      const keepId = move.keepId;
      const keep = game.hand.find((c) => c.id === keepId)!;
      await actor
        .getByRole('button', {
          name: `${CARDS[keep.rank].name}, value ${keep.rank}`,
          exact: true,
        })
        .first()
        .click();
      const natural = game.hand
        .filter((c) => c.id !== keep.id)
        .map((c) => c.id);
      if (natural.length === 2 && natural[0] !== move.bottomIds[0])
        await actor.getByRole('button', { name: /Move .* later/ }).click();
      await actor
        .getByRole('button', {
          name: `Keep ${CARDS[keep.rank].name}`,
          exact: false,
        })
        .click();
    }
    await expect
      .poll(() => views.get(host)!.game!.revision)
      .toBeGreaterThan(revision);
  }
  expect([...seen].sort()).toEqual(['chancellor', 'guard', 'priest']);
  expect(browserErrors).toEqual([]);
  expect(
    await host.locator('body').getAttribute('data-draw-face-leak'),
  ).toBeNull();
  await expect(host.locator('body')).toHaveAttribute(
    'data-flight-kinds',
    /play/,
  );
  await expect(host.locator('body')).toHaveAttribute(
    'data-flight-kinds',
    /draw/,
  );
  await expect(host.locator('body')).toHaveAttribute(
    'data-flight-kinds',
    /return/,
  );
  for (const p of pages) {
    await expect(p.getByTestId('flight-layer')).toHaveAttribute(
      'data-active',
      'false',
    );
    const secret = p.getByRole('button', { name: 'Keep the secret' });
    if (await secret.isVisible()) await secret.click();
    await expect(
      p.getByRole('heading', { name: 'A secret well kept' }),
    ).toBeVisible();
  }
  await host.screenshot({
    path: 'test-results/round-complete.png',
    fullPage: true,
  });
  await Promise.all(contexts.map((c) => c.close()));
});
test('mobile home and rules fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your seat awaits' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(
    page.getByRole('heading', { name: 'The rules of court' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.screenshot({
    path: 'test-results/mobile-home.png',
    fullPage: true,
  });
});

test('four-seat mobile table supports reduced motion and a live public tracker', async ({
  browser,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const host = pages[0]!;
  await host.goto('/');
  await host.getByLabel('YOUR DISPLAY NAME').fill('Avery');
  await host.getByRole('button', { name: 'Open your court' }).click();
  const code = await host.getByTestId('room-code').innerText();
  for (let i = 1; i < 4; i++) {
    await pages[i]!.goto(`/?room=${code}`);
    await pages[i]!.getByLabel('YOUR DISPLAY NAME').fill(`Guest ${i}`);
    await pages[i]!.getByRole('button', { name: 'Enter the court' }).click();
    await expect(pages[i]!.getByTestId('room-code')).toBeVisible();
  }
  await host.getByRole('button', { name: 'Begin the game' }).click();
  await expect(host.getByTestId('game-table')).toBeVisible();
  await expect(host.locator('.opponent-seat')).toHaveCount(3);
  await expect(host.getByTestId('flight-layer')).toHaveAttribute(
    'data-active',
    'false',
  );
  await expect
    .poll(() =>
      host.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await host.getByRole('button', { name: /CARD TRACKER/ }).click();
  await expect(host.locator('.tracker-row')).toHaveCount(10);
  await expect(host.locator('.tracker-content')).toContainText(
    'Unseen includes',
  );
  await host.getByRole('button', { name: /CARD TRACKER/ }).click();
  await host.screenshot({
    path: 'test-results/table-mobile-four.png',
    fullPage: true,
  });
  await host.setViewportSize({ width: 1280, height: 720 });
  await host.screenshot({
    path: 'test-results/table-desktop-four.png',
    fullPage: true,
  });
  await Promise.all(contexts.map((c) => c.close()));
});
