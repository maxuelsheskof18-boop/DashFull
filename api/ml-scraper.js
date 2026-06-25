import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export default async function handler(req, res) {
  // Configuração de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { return res.status(200).end(); }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Use o método POST' }); }

  const { idEnvio, cookie } = req.body;

  if (!idEnvio || !cookie) {
    return res.status(400).json({ error: 'Faltam parâmetros: idEnvio ou cookie.' });
  }

  let browser = null;

  try {
    // Inicia o Chrome invisível otimizado para Vercel
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    // Injeta os seus cookies para o Mercado Livre reconhecer a sessão
    const cookieObjects = cookie.split(';').map(c => {
      const parts = c.trim().split('=');
      const name = parts.shift();
      const value = parts.join('=');
      return { name, value, domain: '.mercadolivre.com.br', path: '/' };
    }).filter(c => c.name !== ""); // Remove itens vazios

    await page.setCookie(...cookieObjects);

    // Navega até a página e aguarda a rede se acalmar
    const url = `https://myaccount.mercadolivre.com.br/shipping/inbounds/${idEnvio}/units`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });

    // Roda um script dentro do navegador para pescar os produtos
    const data = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const match = html.match(/_n\.ctx\.r\s*=\s*({.+?});/s);
      
      if (match && match[1]) {
         const ssrData = JSON.parse(match[1]);
         return ssrData?.appProps?.pageProps?.data?.units || [];
      }
      return [];
    });

    await browser.close();
    return res.status(200).json({ sucesso: true, unidades: data });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: error.message });
  }
}