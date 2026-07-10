/**
 * DashFull - Worker automatizado de itens do Mercado Livre Full
 *
 * O que faz:
 * 1) Lê os envios operacionais do Firebase.
 * 2) Abre a página /shipping/inbounds/{id}/units com Puppeteer.
 * 3) Lê window._n.ctx.r.appProps.pageProps.data.units.
 * 4) Grava os itens em /historico_envios/{id}/itens no Firebase.
 *
 * Rodar uma vez:
 *   npm run once
 *
 * Rodar contínuo:
 *   npm start
 */

require("dotenv").config();
const fs = require("fs");
const puppeteer = require("puppeteer");

const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || "").replace(/\/$/, "");
const MAX_ENVIOS_POR_RODADA = Number(process.env.MAX_ENVIOS_POR_RODADA || 5);
const INTERVALO_MINUTOS = Number(process.env.INTERVALO_MINUTOS || 15);
const STALE_HOURS = Number(process.env.STALE_HOURS || 12);
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() !== "false";

if (!FIREBASE_DB_URL) {
  console.error("FIREBASE_DB_URL não configurado no .env");
  process.exit(1);
}

const CONTAS = [
  { nome: "EHF Distribuidora", cookie: process.env.COOKIE_EHF_DISTRIBUIDORA || "" },
  { nome: "EHF Comercio", cookie: process.env.COOKIE_EHF_COMERCIO || "" },
  { nome: "EHF Suprimentos", cookie: process.env.COOKIE_EHF_SUPRIMENTOS || "" },
  { nome: "EKN", cookie: process.env.COOKIE_EKN || "" },
];

function log(msg, extra = {}) {
  const linha = {
    at: new Date().toISOString(),
    msg,
    ...extra,
  };
  console.log(`[${linha.at}] ${msg}`, Object.keys(extra).length ? extra : "");
  fs.appendFileSync("worker-log.jsonl", JSON.stringify(linha) + "\n", "utf8");
}

function normalizarTexto(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function contaPorNome(nome) {
  const alvo = normalizarTexto(nome);
  return CONTAS.find(c => normalizarTexto(c.nome) === alvo);
}

function parseCookieHeader(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map(p => p.trim())
    .filter(Boolean)
    .map(part => {
      const idx = part.indexOf("=");
      if (idx <= 0) return null;
      return {
        name: part.slice(0, idx).trim(),
        value: part.slice(idx + 1).trim(),
        domain: ".mercadolivre.com.br",
        path: "/",
        secure: true,
      };
    })
    .filter(Boolean);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(`Resposta não JSON em ${url}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} em ${url}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function patchFirebase(path, payload) {
  const url = `${FIREBASE_DB_URL}${path}.json`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Erro Firebase PATCH ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function lerEnviosFirebase() {
  const data = await fetchJson(`${FIREBASE_DB_URL}/historico_envios.json`);
  return Object.keys(data || {})
    .map(id => data[id])
    .filter(Boolean);
}

function envioOperacional(e) {
  const status = normalizarTexto([e.status, e.status_detail, e.categoria_operacional].join(" "));
  if (status.includes("cancel") || status.includes("vencido") || status.includes("expired")) return false;
  if (e.ativo_operacao === false) return false;

  const qtd = Number(e.unidades_declaradas || 0);
  if (!Number.isFinite(qtd) || qtd <= 0) return false;

  if (!e.id_envio || !e.conta) return false;

  return e.categoria_operacional === "agendado" ||
         e.categoria_operacional === "reservar_data" ||
         e.tem_data_reservada === true ||
         e.tem_data_reservada === false;
}

function precisaAtualizarItens(e) {
  const itens = e.itens || {};
  const qtdItens = Object.keys(itens).length;

  if (qtdItens === 0) return true;

  const atualizado = e.itens_atualizados_em ? new Date(e.itens_atualizados_em).getTime() : 0;
  if (!atualizado || Number.isNaN(atualizado)) return true;

  const idadeHoras = (Date.now() - atualizado) / 1000 / 60 / 60;
  return idadeHoras >= STALE_HOURS;
}

function normalizarItem(u, antigo = {}) {
  const variacao = Array.isArray(u.variation_attributes)
    ? u.variation_attributes.map(a => a.value_name || a.name || "").filter(Boolean).join(" - ")
    : "";

  const sku = String(
    u.sku ||
    u.inventory_id ||
    u.item_id ||
    u.variation_id ||
    u.id ||
    "SEM_SKU"
  ).trim();

  const titulo = [u.item_title || "Produto sem título", variacao].filter(Boolean).join(" | ");
  const declarado = Number(u.quantity || 0);

  const qtdFeita = antigo.qtd_feita != null
    ? Number(antigo.qtd_feita || 0)
    : 0;

  const statusControle = antigo.status_controle ||
    (qtdFeita >= declarado && declarado > 0 ? "Feito" : "Pendente");

  return {
    sku,
    titulo,
    declarado,
    qtd_feita: qtdFeita,
    qtd_faltante: Math.max(0, declarado - qtdFeita),
    status_controle: statusControle,
    observacao_item: antigo.observacao_item || "",
    atualizado_por: antigo.atualizado_por || "",
    atualizado_em: antigo.atualizado_em || "",
    item_id: u.item_id || "",
    variation_id: u.variation_id || "",
    inventory_id: u.inventory_id || "",
    vendas_full_30d: u.inventory_detail?.sales_quantity_full ?? "",
    vendas_30d: u.inventory_detail?.sales_thirty_days ?? "",
    aptas_caminho: u.inventory_detail?.stock_waiting_for_arrival ?? "",
    estoque_vendavel: u.inventory_detail?.stock_saleable ?? "",
    conferido: antigo.conferido === true || antigo.status_controle === "Feito" || false,
    divergencia: antigo.divergencia || "",
  };
}

async function prepararPaginaComCookie(browser, conta) {
  if (!conta.cookie) {
    throw new Error(`Cookie vazio para a conta ${conta.nome}`);
  }

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
  });

  const cookies = parseCookieHeader(conta.cookie);
  await page.setCookie(...cookies);

  return page;
}

async function puxarItensEnvio(browser, envio) {
  const conta = contaPorNome(envio.conta);
  if (!conta) throw new Error(`Conta não encontrada para envio ${envio.id_envio}: ${envio.conta}`);
  if (!conta.cookie) throw new Error(`Cookie não configurado no .env para ${conta.nome}`);

  const page = await prepararPaginaComCookie(browser, conta);
  const url = `https://myaccount.mercadolivre.com.br/shipping/inbounds/${envio.id_envio}/units`;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const atualUrl = page.url();
    if (normalizarTexto(atualUrl).includes("login") || normalizarTexto(atualUrl).includes("registration")) {
      throw new Error(`Redirecionado para login/validação. URL atual: ${atualUrl}`);
    }

    await page.waitForFunction(() => {
      return window._n &&
        window._n.ctx &&
        window._n.ctx.r &&
        window._n.ctx.r.appProps &&
        window._n.ctx.r.appProps.pageProps &&
        window._n.ctx.r.appProps.pageProps.data &&
        Array.isArray(window._n.ctx.r.appProps.pageProps.data.units);
    }, { timeout: 20000 });

    const units = await page.evaluate(() => {
      return window._n.ctx.r.appProps.pageProps.data.units || [];
    });

    if (!Array.isArray(units) || units.length === 0) {
      throw new Error("A página abriu, mas data.units veio vazio.");
    }

    const antigos = envio.itens || {};
    const itens = {};

    for (const u of units) {
      const baseSku = String(u.sku || u.inventory_id || u.item_id || u.id || "SEM_SKU").trim();
      const item = normalizarItem(u, antigos[baseSku] || {});
      itens[item.sku] = item;
    }

    return itens;
  } finally {
    await page.close().catch(() => {});
  }
}

async function rodarUmaRodada() {
  log("Iniciando rodada de itens");

  const envios = (await lerEnviosFirebase())
    .filter(envioOperacional)
    .filter(precisaAtualizarItens);

  log(`Envios precisando de itens: ${envios.length}`);

  if (envios.length === 0) return;

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1366,768",
    ],
  });

  let processados = 0;
  let atualizados = 0;
  let erros = 0;

  try {
    for (const envio of envios.slice(0, MAX_ENVIOS_POR_RODADA)) {
      processados++;
      try {
        log(`Puxando itens do envio ${envio.id_envio}`, { conta: envio.conta });

        const itens = await puxarItensEnvio(browser, envio);
        const payload = {
          itens,
          itens_qtd: Object.keys(itens).length,
          itens_atualizados_em: new Date().toISOString(),
        };

        await patchFirebase(`/historico_envios/${envio.id_envio}`, payload);

        atualizados++;
        log(`Itens gravados do envio ${envio.id_envio}: ${Object.keys(itens).length}`);

        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        erros++;
        log(`Erro no envio ${envio.id_envio}: ${e.message}`, { conta: envio.conta });
        await patchFirebase(`/historico_envios/${envio.id_envio}/itens_ultimo_erro`, {
          mensagem: e.message,
          em: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  log(`Rodada finalizada. Processados=${processados} Atualizados=${atualizados} Erros=${erros}`);
}

async function main() {
  const once = process.argv.includes("once");

  if (once) {
    await rodarUmaRodada();
    return;
  }

  while (true) {
    try {
      await rodarUmaRodada();
    } catch (e) {
      log(`Erro geral da rodada: ${e.message}`);
    }

    const esperaMs = INTERVALO_MINUTOS * 60 * 1000;
    log(`Aguardando ${INTERVALO_MINUTOS} minutos para próxima rodada`);
    await new Promise(r => setTimeout(r, esperaMs));
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
