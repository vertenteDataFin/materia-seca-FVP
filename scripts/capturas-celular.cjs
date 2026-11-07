// Capturas de tela do app em viewport de celular (Chrome headless via puppeteer-core).
// Uso: npm run dev (em outra janela) e depois `node scripts/capturas-celular.cjs [pasta-saida]`
// Variáveis: CHROME (caminho do chrome.exe), APP_URL (padrão https://localhost:5180/)
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const URL = process.env.APP_URL ?? 'https://localhost:5180/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = path.resolve(process.argv[2] ?? 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const perfil = path.join(OUT, '.perfil-chrome');
fs.rmSync(perfil, { recursive: true, force: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: perfil,
    args: ['--ignore-certificate-errors', '--no-first-run', '--lang=pt-BR'],
  });
  await browser.defaultBrowserContext().overridePermissions(URL, ['geolocation']);
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setGeolocation({ latitude: -20.45, longitude: -54.6, accuracy: 8 });
  page.on('pageerror', (e) => console.log('ERRO NA PÁGINA:', e.message));
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const foto = async (nome, full = true) => {
    await espera(400);
    await page.screenshot({ path: path.join(OUT, `${nome}.png`), fullPage: full });
    console.log('ok', nome);
  };
  const clica = (sel) => page.$eval(sel, (b) => b.click()); // clique direto (a barra fixa pode cobrir o botão)

  await page.goto(URL + '#/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => /Por talhão/.test(document.body.innerText), { timeout: 60000, polling: 500 });
  await espera(1000);
  await foto('painel');
  await page.goto(URL + '#/talhoes', { waitUntil: 'networkidle0' });
  await foto('talhoes', false);

  // cria uma coleta e dois pontos, preenchendo pesos
  await page.goto(URL + '#/coletas/nova', { waitUntil: 'networkidle0' });
  await page.waitForSelector('select');
  const valor = await page.$eval('select', (s) => Array.from(s.options).find((o) => o.value && /23/.test(o.text))?.value ?? s.options[1].value);
  await page.select('select', valor);
  await foto('nova-coleta', false);
  await clica('button[type=submit]');
  await page.waitForFunction(() => /Pontos amostrados/.test(document.body.innerText), { timeout: 15000, polling: 300 });
  for (let i = 0; i < 2; i++) {
    await clica('button.primario');
    await page.waitForFunction((n) => document.querySelectorAll('.ponto').length >= n, { timeout: 15000 }, i + 1);
    await espera(800);
  }
  const digita = async (label, v) => {
    const el = await page.$(`input[aria-label="${label}"]`);
    await el.click({ clickCount: 3 });
    await el.type(v);
    await page.keyboard.press('Enter');
    await espera(150);
  };
  await digita('Peso verde ponto 1', '3,6'); await digita('Peso úmido ponto 1', '100'); await digita('Peso seco ponto 1', '22');
  await digita('Peso verde ponto 2', '4,1'); await digita('Peso úmido ponto 2', '100'); await digita('Peso seco ponto 2', '24');
  await espera(500);
  await foto('coleta');

  await page.goto(URL + '#/coletas', { waitUntil: 'networkidle0' });
  await foto('coletas', false);
  await page.goto(URL + '#/', { waitUntil: 'networkidle0' });
  await foto('painel-com-dados');
  await page.goto(URL + '#/mapa', { waitUntil: 'networkidle0' });
  await espera(2500);
  await foto('mapa', false);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
