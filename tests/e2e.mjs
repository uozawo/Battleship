// Реальний браузерний E2E: дві незалежні «вкладки» грають мережевий матч.
// Запуск: спершу `npm start` (сервер на :3000), потім `node tests/e2e.mjs`.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log('·', ...a);
let failed = false;
const check = (cond, label) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failed = true;
};

async function guestLogin(page) {
  await page.goto(BASE);
  await page.getByRole('button', { name: /гість/i }).click();
  await page.locator('.mode-btn', { hasText: 'Мережевий бій' }).waitFor({ timeout: 10000 });
}

async function markerCount(page) {
  const sel = '.board-frame--radar .cell--miss, .board-frame--radar .cell--hit, .board-frame--radar .cell--sunk';
  return page.locator(sel).count();
}

const browser = await chromium.launch({ headless: true });
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  // Скрин екрана авторизації
  await A.goto(BASE);
  await A.getByRole('button', { name: /гість/i }).waitFor({ timeout: 10000 });
  await A.screenshot({ path: SHOTS + '01-auth.png' });
  log('auth screen ok');

  // Обидва входять гостями
  await guestLogin(A);
  await guestLogin(B);
  await A.screenshot({ path: SHOTS + '02-menu.png' });
  check(true, 'обидва гості увійшли, меню показано');

  // A створює кімнату
  await A.locator('.mode-btn', { hasText: 'Мережевий бій' }).click();
  await A.screenshot({ path: SHOTS + '03-lobby.png' });
  await A.getByRole('button', { name: /створити кімнату/i }).click();
  await A.locator('.code-display span').first().waitFor({ timeout: 10000 });
  const code = (await A.locator('.code-display span').first().innerText()).trim();
  check(/^[A-Z0-9]{4}$/.test(code), `кімнату створено, код = ${code}`);
  await A.waitForTimeout(900); // дочекатись завершення анімації появи
  await A.screenshot({ path: SHOTS + '04-waiting.png' });

  // B заходить за кодом
  await B.locator('.mode-btn', { hasText: 'Мережевий бій' }).click();
  await B.getByPlaceholder(/напр/i).fill(code);
  await B.getByRole('button', { name: /увійти в бій/i }).click();

  // Обидва — у фазі розстановки
  await A.getByRole('button', { name: /випадково/i }).waitFor({ timeout: 10000 });
  await B.getByRole('button', { name: /випадково/i }).waitFor({ timeout: 10000 });
  check(true, 'обидва у фазі розстановки');
  await A.waitForTimeout(900); // дочекатись завершення анімації появи
  await A.screenshot({ path: SHOTS + '05-placement.png' });

  // Авто-розстановка + готовність
  for (const P of [A, B]) {
    await P.getByRole('button', { name: /випадково/i }).click();
    await P.getByRole('button', { name: /до бою/i }).click();
  }

  // Бій: на обох сторінках зʼявляється радар ворога
  await A.locator('.board-frame--radar').waitFor({ timeout: 10000 });
  await B.locator('.board-frame--radar').waitFor({ timeout: 10000 });
  check(true, 'бій розпочато — радар ворога видно на обох вкладках');
  await A.screenshot({ path: SHOTS + '06-battle.png' });

  // Хто ходить першим — у того є клікабельні клітини радара
  const aPlay = await A.locator('.cell--play').count();
  const shooter = aPlay > 0 ? A : B;
  const who = aPlay > 0 ? 'A' : 'B';
  check((await shooter.locator('.cell--play').count()) > 0, `активний гравець (${who}) має ціль для пострілу`);

  // Постріл
  const before = await markerCount(shooter);
  await shooter.locator('.cell--play').first().click();
  let after = before;
  for (let i = 0; i < 40 && after <= before; i++) {
    await shooter.waitForTimeout(150);
    after = await markerCount(shooter);
  }
  check(after > before, 'постріл відобразився маркером на радарі');
  await shooter.screenshot({ path: SHOTS + '07-after-shot.png' });

  await ctxA.close();
  await ctxB.close();
} catch (e) {
  console.error('E2E ВИНЯТОК:', e.message);
  failed = true;
} finally {
  await browser.close();
}

console.log(failed ? '\n❌ E2E FAILED' : '\n✅ E2E PASSED');
process.exit(failed ? 1 : 0);
