import { _electron as electron, test, expect } from '@playwright/test';
import { resolve, join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('top and left menus persist, only menu scrollbar is hidden, effects respect reduced motion', async () => {
  test.setTimeout(90000);
  const profile = await mkdtemp(join(tmpdir(), 'memory-navigation-'));
  const env = { ...process.env, THING_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const binary = process.env.THING_PACKAGED_BINARY;
  const launch = () =>
    electron.launch({
      executablePath: binary,
      args: binary ? [`--user-data-dir=${profile}`] : [resolve('.')],
      env,
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-menu-position', 'top');
    await expect(page.getByRole('status')).toHaveText('Health OK', { timeout: 45000 });
    await expect(page.locator('.aurora-background i').first()).toHaveCSS(
      'animation-name',
      'aurora-flow',
    );
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.locator('.button-ripple')).toHaveCount(1);
    await expect(page.locator('.sidebar')).toHaveCSS('position', 'relative');
    await page.evaluate(() => scrollTo(0, 400));
    expect(
      await page.locator('.sidebar').evaluate((node) => node.getBoundingClientRect().top),
    ).toBeLessThan(0);
    await page.evaluate(() => scrollTo(0, 0));
    await page.getByRole('button', { name: 'Collapse Menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
    await page.getByRole('button', { name: 'Expand Menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Open preferences', exact: true }).click();
    await page.getByLabel('Menu position').selectOption('left');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-menu-position', 'left');
    await page.keyboard.press('Escape');
    await expect(page.locator('.sidebar')).toHaveCSS('scrollbar-width', 'none');
    expect(
      await page.locator('html').evaluate((node) => getComputedStyle(node).scrollbarWidth),
    ).not.toBe('none');
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'memory-lane-glass-left.png'),
        fullPage: true,
        animations: 'disabled',
      });
    await page.getByRole('button', { name: 'Collapse Menu' }).click();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole('status')).toHaveText('Health OK', { timeout: 45000 });
    await expect(page.locator('.app-shell')).toHaveAttribute('data-menu-collapsed', 'true');
    await page.getByRole('button', { name: 'Expand Menu' }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-menu-position', 'left');
    await page.getByRole('button', { name: 'Open preferences', exact: true }).click();
    await page.getByLabel('Menu position').selectOption('top');
    await page.keyboard.press('Escape');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-menu-position', 'top');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.aurora-background i').first()).toHaveCSS('animation-name', 'none');
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(page.locator('.button-ripple')).toHaveCount(0);
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'memory-lane-glass-top.png'),
        fullPage: true,
        animations: 'disabled',
      });
    await page.getByRole('button', { name: 'Open preferences', exact: true }).click();
    await page.getByLabel('Appearance').selectOption('light');
    await page.keyboard.press('Escape');
    if (process.env.THING_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(process.env.THING_SCREENSHOT_DIR, 'memory-lane-glass-light.png'),
        fullPage: true,
        animations: 'disabled',
      });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(820, 640));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await app.close();
  }
});
