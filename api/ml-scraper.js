const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

module.exports = async function (req, res) {
  // Configuração de CORS para permitir que o Google Apps Script chame essa API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responde imediatamente a requisições de preflight (segurança do navegador)
  if (req.method === 'OPTIONS') { 
    return res.status(200).end(); 
  }
  
  if (req.method !== 'POST') { 
    return res.status(405).json({ error: 'Use o método POST' }); 
  }

  const { idEnvio, cookie } = req.body;

  if (!idEnvio || !cookie) {
    return res.status(400).json({ error: 'Faltam parâmetros: idEnvio ou cookie.' });
  }

  let browser = null;

  try {
    // Inicia o Chrome invisível otimizado
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    // Formata e injeta os cookies
    const cookieObjects = cookie.split(';').map(c => {
      const parts = c.trim().split('=');
      const name = parts.shift();
      const value = parts.join('=');
      return { name, value, domain: '.mercadolivre.com.br', path: '/' };
    }).filter(c => c.name !== ""); 

    await page.setCookie(...cookieObjects);

    const url = `https://myaccount.mercadolivre.com.br/shipping/inbounds/${idEnvio}/units`;
    
    // timeout reduzido para não estourar o limite de 10s da Vercel Hobby
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });

    const data = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const match = html.match(/_n\.ctx\.r\s*=\s*({.+?});/s);
      
      if (match && match[1]) {
         const ssrData = JSON.parse(match[1]);
         const units = ssrData && ssrData.appProps && ssrData.appProps.pageProps && ssrData.appProps.pageProps.data ? ssrData.appProps.pageProps.data.units : [];
         return units;
      }
      return [];
    });

    await browser.close();
    return res.status(200).json({ sucesso: true, unidades: data });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Erro interno no Puppeteer: " + error.message });
  }
};
