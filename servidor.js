/**
 * DASHFULL WEBAPP BRIDGE v2.0.0
 *
 * Sem Firebase.
 * Sem Service Account JSON.
 *
 * Fluxo:
 * Mercado Livre -> EasyPanel Worker -> Apps Script Web App -> Google Sheets
 *
 * O Apps Script faz só a escrita/leitura da planilha usando SpreadsheetApp.
 * O EasyPanel continua fazendo a parte pesada: Mercado Livre + Puppeteer.
 */

require("dotenv").config();

const fs = require("fs");
const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer-core");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = Number(process.env.PORT || 3000);
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

const SHEETS_WEBAPP_URL = String(process.env.SHEETS_WEBAPP_URL || process.env.GOOGLE_SHEETS_WEBAPP_URL || "").trim();
const SHEETS_WEBAPP_SECRET = String(process.env.SHEETS_WEBAPP_SECRET || "").trim();

const WORKER_MODE = String(process.env.WORKER_MODE || "continuous").toLowerCase();
const RUN_ON_START = String(process.env.RUN_ON_START || "true").toLowerCase() === "true";
const SYNC_SECRET = String(process.env.SYNC_SECRET || "");

const LIMITE_POR_PAGINA = Number(process.env.LIMITE_POR_PAGINA || 30);
const MAX_PAGINAS_POR_CONTA = Number(process.env.MAX_PAGINAS_POR_CONTA || 25);

const INTERVALO_ENVIOS_MINUTOS = Number(process.env.INTERVALO_ENVIOS_MINUTOS || 15);
const INTERVALO_ITENS_MINUTOS = Number(process.env.INTERVALO_ITENS_MINUTOS || 5);

const MAX_ENVIOS_POR_RODADA = Number(process.env.MAX_ENVIOS_POR_RODADA || 80);
const MAX_POR_CONTA_POR_RODADA = Number(process.env.MAX_POR_CONTA_POR_RODADA || 20);
const CONCORRENCIA_PAGINAS = Math.max(1, Number(process.env.CONCORRENCIA_PAGINAS || 4));

const STALE_HOURS = Number(process.env.STALE_HOURS || 12);
const ERROR_COOLDOWN_MINUTES = Number(process.env.ERROR_COOLDOWN_MINUTES || 60);
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() !== "false";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 30000);
const WEBAPP_CHUNK_SIZE = Math.max(20, Number(process.env.WEBAPP_CHUNK_SIZE || 80));

const MAPA_GALPOES = {
  BRSP06: "Araçariguama",
  BRRC01: "Perus",
  BRSP10: "BRSP10",
};

function csv(value) {
  return String(value || "").split(",").map(v => v.trim()).filter(Boolean);
}

const ENABLED_ACCOUNTS = csv(process.env.ENABLED_ACCOUNTS || "");
const ACCOUNT_PRIORITY = csv(process.env.ACCOUNT_PRIORITY || "EKN,EHF Suprimentos,EHF Comercio,EHF Distribuidora");

const CONTAS = [
  { nome: "EHF Distribuidora", cookie: process.env.COOKIE_EHF_DISTRIBUIDORA || "" },
  { nome: "EHF Comercio", cookie: process.env.COOKIE_EHF_COMERCIO || "" },
  { nome: "EHF Suprimentos", cookie: process.env.COOKIE_EHF_SUPRIMENTOS || "" },
  { nome: "EKN", cookie: process.env.COOKIE_EKN || "" },
];

let cacheDados = null;
let cacheDadosEm = 0;
let runningEnvios = false;
let runningItems = false;
let lastEnviosResult = null;
let lastItemsResult = null;
let lastAllResult = null;
let nextEnviosAt = null;
let nextItemsAt = null;

if (!SHEETS_WEBAPP_URL) {
  console.error("SHEETS_WEBAPP_URL não configurado. Cole a URL /exec do Apps Script.");
  process.exit(1);
}

// ============================================================
// UTIL
// ============================================================

function nowIso() {
  return new Date().toISOString();
}

function log(msg, extra = {}) {
  const line = { at: nowIso(), msg, ...extra };
  console.log(`[${line.at}] ${msg}`, Object.keys(extra).length ? extra : "");
  try {
    fs.appendFileSync("worker-log.jsonl", JSON.stringify(line) + "\n", "utf8");
  } catch (_) {}
}

function normalizarTexto(v) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function primeiroDefinido(...args) {
  for (const a of args) {
    if (a !== null && a !== undefined && a !== "") return a;
  }
  return null;
}

function numeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === "" || valor === "-") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function pegarPorCaminho(obj, path) {
  const partes = String(path).split(".");
  let atual = obj;
  for (const p of partes) {
    if (atual === null || atual === undefined) return null;
    atual = atual[p];
  }
  return atual === undefined || atual === "" ? null : atual;
}

function pegarValorPorCaminhos(obj, caminhos) {
  for (const c of caminhos) {
    const v = pegarPorCaminho(obj, c);
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function procurarNumeroPorChaves(obj, chaves, profundidade = 0) {
  if (!obj || profundidade > 5) return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = procurarNumeroPorChaves(item, chaves, profundidade + 1);
      if (r !== null) return r;
    }
    return null;
  }

  if (typeof obj !== "object") return null;

  for (const chave of chaves) {
    if (obj[chave] !== null && obj[chave] !== undefined && obj[chave] !== "") {
      const n = numeroOuNull(obj[chave]);
      if (n !== null) return n;
    }
  }

  for (const k of Object.keys(obj)) {
    const r = procurarNumeroPorChaves(obj[k], chaves, profundidade + 1);
    if (r !== null) return r;
  }
  return null;
}

function procurarDataPorChaves(obj, chaves, profundidade = 0) {
  if (!obj || profundidade > 5) return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = procurarDataPorChaves(item, chaves, profundidade + 1);
      if (r) return r;
    }
    return null;
  }

  if (typeof obj !== "object") return null;

  for (const chave of chaves) {
    if (obj[chave]) {
      const d = new Date(obj[chave]);
      if (!Number.isNaN(d.getTime())) return obj[chave];
    }
  }

  for (const k of Object.keys(obj)) {
    const r = procurarDataPorChaves(obj[k], chaves, profundidade + 1);
    if (r) return r;
  }
  return null;
}

function contaPorNome(nome) {
  const alvo = normalizarTexto(nome);
  return CONTAS.find(c => normalizarTexto(c.nome) === alvo);
}

function prioridadeConta(nomeConta) {
  const alvo = normalizarTexto(nomeConta);
  const idx = ACCOUNT_PRIORITY.findIndex(c => normalizarTexto(c) === alvo);
  return idx >= 0 ? idx : 999;
}

function cookieValido(cookie) {
  cookie = String(cookie || "");
  if (!cookie) return false;
  if (cookie.includes("COLE_COOKIE")) return false;
  if (cookie.length < 30) return false;
  return true;
}

function contaHabilitada(nomeConta) {
  const conta = contaPorNome(nomeConta);
  if (!conta || !cookieValido(conta.cookie)) return false;
  if (!ENABLED_ACCOUNTS.length) return true;
  const alvo = normalizarTexto(nomeConta);
  return ENABLED_ACCOUNTS.some(c => normalizarTexto(c) === alvo);
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

function csrfFromCookie(cookie) {
  const m = String(cookie || "").match(/(?:^|;\s*)_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function verificarChave(req, res) {
  if (!SYNC_SECRET) return true;
  const key = req.query.key || req.headers["x-sync-key"] || req.body?.key;
  if (String(key || "") !== SYNC_SECRET) {
    res.status(401).json({ ok: false, error: "SYNC_SECRET inválido." });
    return false;
  }
  return true;
}

function invalidarCache() {
  cacheDados = null;
  cacheDadosEm = 0;
}

// ============================================================
// APPS SCRIPT WEBAPP DB
// ============================================================

function webappUrlComParams(params = {}) {
  const url = new URL(SHEETS_WEBAPP_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  if (SHEETS_WEBAPP_SECRET) url.searchParams.set("key", SHEETS_WEBAPP_SECRET);
  return url.toString();
}

async function webappGet(action, params = {}) {
  const url = webappUrlComParams({ action, ...params });
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    throw new Error(`Apps Script não retornou JSON. HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  if (!res.ok || json.ok === false) {
    throw new Error(`Apps Script erro ${res.status}: ${JSON.stringify(json).slice(0, 600)}`);
  }

  return json;
}

async function webappPost(action, payload = {}) {
  const body = { action, ...payload };
  if (SHEETS_WEBAPP_SECRET) body.key = SHEETS_WEBAPP_SECRET;

  const res = await fetch(SHEETS_WEBAPP_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    throw new Error(`Apps Script POST não retornou JSON. HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  if (!res.ok || json.ok === false) {
    throw new Error(`Apps Script POST erro ${res.status}: ${JSON.stringify(json).slice(0, 600)}`);
  }

  return json;
}

async function lerBanco(force = false) {
  if (!force && cacheDados && Date.now() - cacheDadosEm < CACHE_TTL_MS) return cacheDados;

  const json = await webappGet("historico");
  const base = json.base || json.data || {};
  cacheDados = base || {};
  cacheDadosEm = Date.now();
  return cacheDados;
}

function envioSemItens(e) {
  const copia = { ...(e || {}) };
  delete copia.itens;
  return copia;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function salvarEnviosWebapp(base, onlyIds = null) {
  const idsSet = onlyIds ? new Set(onlyIds.map(String)) : null;
  const envios = Object.values(base || {})
    .filter(e => e && e.id_envio)
    .filter(e => !idsSet || idsSet.has(String(e.id_envio)))
    .map(envioSemItens);

  for (const chunk of chunkArray(envios, WEBAPP_CHUNK_SIZE)) {
    await webappPost("upsertEnvios", { envios: chunk });
  }

  invalidarCache();
  return { ok: true, envios: envios.length };
}

async function salvarItensWebapp(base, onlyIds = null) {
  const ids = onlyIds ? onlyIds.map(String) : Object.keys(base || {}).map(String);
  const idsSet = new Set(ids);
  const itens = [];

  for (const id of ids) {
    const envio = base[id];
    if (!envio || !envio.itens) continue;

    for (const sku of Object.keys(envio.itens || {})) {
      itens.push({
        conta: envio.conta || "",
        id_envio: envio.id_envio || id,
        sku,
        ...(envio.itens[sku] || {})
      });
    }
  }

  const chunks = chunkArray(itens, WEBAPP_CHUNK_SIZE);

  if (!chunks.length) {
    await webappPost("upsertItens", { replaceEnvioIds: ids, itens: [] });
    invalidarCache();
    return { ok: true, itens: 0 };
  }

  for (let i = 0; i < chunks.length; i++) {
    await webappPost("upsertItens", {
      replaceEnvioIds: i === 0 ? ids : [],
      itens: chunks[i]
    });
  }

  invalidarCache();
  return { ok: true, itens: itens.length };
}

async function salvarBanco(base) {
  await salvarEnviosWebapp(base);
  await salvarItensWebapp(base);
  invalidarCache();
}

async function patchEnvio(id, patch) {
  const resp = await webappPost("patchEnvio", { id_envio: id, patch });
  invalidarCache();
  return resp.envio || resp.data || resp;
}

async function patchItem(id, sku, patch) {
  const resp = await webappPost("patchItem", { id_envio: id, sku, patch });
  invalidarCache();
  return resp.item || resp.data || resp;
}

async function gravarLogPlanilha(msg, extra = {}) {
  try {
    await webappPost("log", { msg, extra });
  } catch (e) {
    log(`Falha ao gravar log no Apps Script: ${e.message}`);
  }
}

async function atualizarStatusSync(key, value) {
  try {
    await webappPost("status", { key, value });
  } catch (e) {
    log(`Falha ao gravar StatusSync: ${e.message}`);
  }
}

async function rebuildViewsWebapp(origem = "manual") {
  try {
    return await webappPost("rebuildViews", { origem });
  } catch (e) {
    log(`Falha ao organizar abas da planilha: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// ============================================================
// MERCADO LIVRE ENVIOS
// ============================================================

function opcoesML(conta) {
  const csrf = csrfFromCookie(conta.cookie);
  const headers = {
    cookie: conta.cookie,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    referer: "https://myaccount.mercadolivre.com.br/shipping/inbounds",
    accept: "application/json, text/plain, */*",
  };
  if (csrf) {
    headers["x-csrf-token"] = csrf;
    headers["x-csrf"] = csrf;
  }
  return { method: "GET", headers, redirect: "follow" };
}

function extrairArrayEnviosML(dados) {
  if (!dados) return [];
  if (Array.isArray(dados)) return dados;
  if (Array.isArray(dados.results)) return dados.results;
  if (Array.isArray(dados.data)) return dados.data;
  if (Array.isArray(dados.inbounds)) return dados.inbounds;
  if (Array.isArray(dados.shipments)) return dados.shipments;
  if (Array.isArray(dados.content)) return dados.content;
  if (Array.isArray(dados.items)) return dados.items;

  let melhor = [];
  function visitar(obj, profundidade = 0) {
    if (!obj || profundidade > 6) return;
    if (Array.isArray(obj)) {
      let score = 0;
      for (const item of obj) {
        if (!item || typeof item !== "object") continue;
        if (item.id || item.inbound_id || item.inboundId) score++;
        if (item.status || item.status_detail || item.appointment) score++;
      }
      if (score > 0 && obj.length > melhor.length) melhor = obj;
      for (const v of obj) if (v && typeof v === "object") visitar(v, profundidade + 1);
      return;
    }
    if (typeof obj === "object") for (const k of Object.keys(obj)) visitar(obj[k], profundidade + 1);
  }
  visitar(dados, 0);
  return melhor || [];
}

function pegarDataReservada(envio) {
  const direto = pegarValorPorCaminhos(envio, [
    "appointment.date", "appointment.from", "appointment.to",
    "appointment.start_date", "appointment.startDate",
    "appointment.scheduled_date", "appointment.scheduledDate",
    "appointment_date", "appointmentDate",
    "date_reserved", "reserved_date", "reservedDate",
    "scheduled_date", "scheduledDate",
    "reservation_date", "reservationDate",
    "inbound_date", "inboundDate",
    "date",
  ]);
  if (direto) {
    const d = new Date(direto);
    if (!Number.isNaN(d.getTime())) return direto;
  }
  return procurarDataPorChaves(envio, ["appointmentDate", "appointment_date", "scheduledDate", "scheduled_date", "reservedDate", "reserved_date", "reservationDate", "reservation_date", "date"]);
}

function pegarDataReferencia(envio) {
  return pegarDataReservada(envio) ||
    pegarValorPorCaminhos(envio, ["date_created", "created_at", "createdAt", "last_updated", "lastUpdated", "updated_at", "updatedAt"]) ||
    procurarDataPorChaves(envio, ["date_created", "created_at", "createdAt", "last_updated", "lastUpdated", "updated_at", "updatedAt"]);
}

function statusML(envio) {
  return normalizarTexto([envio?.status, envio?.status_detail, envio?.statusDetail, envio?.substatus, envio?.situation, envio?.title].join(" "));
}

function ehVencidoOuCancelado(envio) {
  const s = statusML(envio);
  return s.includes("expired") || s.includes("vencido") || s.includes("cancelled") || s.includes("canceled") || s.includes("cancelado");
}

function pegarQuantidadeDeclarada(envio) {
  const direto = pegarValorPorCaminhos(envio, [
    "products_count", "productsCount", "units_count", "unitsCount",
    "declared_units", "declaredUnits", "declared_quantity", "declaredQuantity",
    "declared", "quantity", "total_quantity", "totalQuantity", "total_units", "totalUnits",
    "summary.declaredQuantity", "summary.declared_quantity", "summary.units", "summary.quantity",
  ]);
  const n = numeroOuNull(direto);
  if (n !== null) return n;
  return procurarNumeroPorChaves(envio, ["products_count", "productsCount", "units_count", "unitsCount", "declared_units", "declaredUnits", "declared_quantity", "declaredQuantity", "declared", "quantity", "total_quantity", "totalQuantity", "total_units", "totalUnits"]);
}

function pegarQuantidadeRecebida(envio) {
  const direto = pegarValorPorCaminhos(envio, [
    "on_sale_units", "onSaleUnits", "available_units", "availableUnits",
    "received_units", "receivedUnits", "received_quantity", "receivedQuantity",
    "accepted_units", "acceptedUnits", "units_on_sale", "unitsOnSale",
    "processed_units", "processedUnits", "processed_quantity", "processedQuantity",
    "ready_to_full_quantity", "readyToFullQuantity",
    "summary.receivedQuantity", "summary.processedQuantity", "summary.readyToFullQuantity",
  ]);
  const n = numeroOuNull(direto);
  if (n !== null) return n;
  return procurarNumeroPorChaves(envio, ["on_sale_units", "onSaleUnits", "available_units", "availableUnits", "received_units", "receivedUnits", "received_quantity", "receivedQuantity", "accepted_units", "acceptedUnits", "units_on_sale", "unitsOnSale", "processed_units", "processedUnits", "processed_quantity", "processedQuantity", "ready_to_full_quantity", "readyToFullQuantity"]);
}

function classificarEnvio(envio) {
  if (ehVencidoOuCancelado(envio)) return "ignorado";
  return pegarDataReservada(envio) ? "agendado" : "reservar_data";
}

function gerarAssinaturaEnvio(e) {
  return JSON.stringify({
    status: e.status || "",
    status_detail: e.status_detail || "",
    unidades_declaradas: e.unidades_declaradas == null ? "" : e.unidades_declaradas,
    unidades_recebidas: e.unidades_recebidas == null ? "" : e.unidades_recebidas,
    data_reservada: e.data_reservada || "",
    galpao: e.galpao || "",
    categoria_operacional: e.categoria_operacional || "",
  });
}

function decidirAtualizacaoItens(assinaturaNova, envioAntigo) {
  envioAntigo = envioAntigo || {};
  const itensAntigos = envioAntigo.itens || {};
  const temItens = Object.keys(itensAntigos).length > 0;
  const assinaturaAntiga = envioAntigo.assinatura_envio_para_itens || "";
  if (!temItens) return { precisa: true, motivo: "Envio sem itens carregados" };
  if (!assinaturaAntiga) return { precisa: true, motivo: "Primeira assinatura do envio criada" };
  if (assinaturaAntiga !== assinaturaNova) return { precisa: true, motivo: "Envio alterado no Mercado Livre" };
  if (envioAntigo.itens_precisa_atualizar === true) return { precisa: true, motivo: envioAntigo.motivo_atualizacao_itens || "Atualização pendente preservada" };
  return { precisa: false, motivo: "" };
}

function montarEnvio(envio, conta, antigo = {}) {
  const idEnvio = String(envio.id || envio.inbound_id || envio.inboundId || "").trim();
  const codigoGalpao = primeiroDefinido(envio.logistic_center_id, envio.warehouse_id, envio.logisticCenterId, envio.warehouseId, "");
  const dataReservada = pegarDataReservada(envio);
  const dataReferencia = dataReservada || pegarDataReferencia(envio);
  const categoria = classificarEnvio(envio);
  const statusAtual = primeiroDefinido(envio.status, "unknown");
  const statusDetailAtual = primeiroDefinido(envio.status_detail, envio.statusDetail, envio.substatus, envio.situation, "");
  const unidadesDeclaradas = pegarQuantidadeDeclarada(envio);
  const unidadesRecebidas = pegarQuantidadeRecebida(envio);
  const galpaoAtual = MAPA_GALPOES[codigoGalpao] || codigoGalpao || "---";

  const assinaturaNova = gerarAssinaturaEnvio({
    status: statusAtual,
    status_detail: statusDetailAtual,
    unidades_declaradas: unidadesDeclaradas,
    unidades_recebidas: unidadesRecebidas,
    data_reservada: dataReservada,
    galpao: galpaoAtual,
    categoria_operacional: categoria,
  });

  const decisao = decidirAtualizacaoItens(assinaturaNova, antigo);
  const itensAntigos = antigo.itens || {};
  let qtdItens = antigo.itens_qtd;
  if (qtdItens === null || qtdItens === undefined || qtdItens === "") qtdItens = Object.keys(itensAntigos).length;

  return {
    conta: conta.nome,
    id_envio: idEnvio,
    status: statusAtual,
    status_detail: statusDetailAtual,
    categoria_operacional: categoria,
    unidades_declaradas: unidadesDeclaradas,
    unidades_recebidas: unidadesRecebidas,
    galpao: galpaoAtual,
    data: dataReferencia,
    data_reservada: dataReservada,
    data_referencia: dataReferencia,
    tem_data_reservada: Boolean(dataReservada),
    data_criacao_ml: primeiroDefinido(envio.date_created, envio.created_at, envio.createdAt, ""),
    link_envio: `https://myaccount.mercadolivre.com.br/shipping/inbounds/${idEnvio}/units`,
    link_details: `https://myaccount.mercadolivre.com.br/shipping/inbounds/${idEnvio}/details`,
    meu_status: antigo.meu_status || "Pendente",
    operador: antigo.operador || "",
    hora_operacao: antigo.hora_operacao || "",
    data_limite_pronto: antigo.data_limite_pronto || "",
    hora_limite_pronto: antigo.hora_limite_pronto || "",
    pessoas_alocadas: antigo.pessoas_alocadas || 1,
    motorista: antigo.motorista || "",
    caminhao_placa: antigo.caminhao_placa || "",
    dificuldade: antigo.dificuldade || "",
    observacao: antigo.observacao || "",
    progresso: antigo.progresso || {},
    pendencias: antigo.pendencias || {},
    itens: itensAntigos,
    itens_qtd: qtdItens,
    itens_atualizados_em: antigo.itens_atualizados_em || "",
    itens_ultimo_erro: antigo.itens_ultimo_erro || null,
    assinatura_envio_para_itens: assinaturaNova,
    assinatura_itens_processada: antigo.assinatura_itens_processada || "",
    itens_precisa_atualizar: decisao.precisa,
    motivo_atualizacao_itens: decisao.motivo,
    ativo_operacao: categoria !== "ignorado",
    ultima_sincronizacao: nowIso(),
  };
}

// ============================================================
// ITENS - PUPPETEER
// ============================================================

function erroRecente(e, force = false) {
  if (force) return false;
  const erro = e.itens_ultimo_erro;
  if (!erro || !erro.em) return false;
  const ms = new Date(erro.em).getTime();
  if (!ms || Number.isNaN(ms)) return false;
  const minutos = (Date.now() - ms) / 1000 / 60;
  return minutos < ERROR_COOLDOWN_MINUTES;
}

function envioOperacionalParaItens(e) {
  if (!e || !e.id_envio || !e.conta) return false;
  if (e.ativo_operacao === false) return false;
  const s = normalizarTexto([e.status, e.status_detail, e.categoria_operacional].join(" "));
  if (s.includes("cancel") || s.includes("cancelado") || s.includes("vencido") || s.includes("expired")) return false;
  return contaHabilitada(e.conta);
}

function precisaAtualizarItens(e, force = false) {
  if (force) return true;
  if (e.itens_precisa_atualizar === true) return true;
  const itens = e.itens || {};
  const qtdItens = Object.keys(itens).length;
  if (qtdItens === 0) return true;
  const atualizado = e.itens_atualizados_em ? new Date(e.itens_atualizados_em).getTime() : 0;
  if (!atualizado || Number.isNaN(atualizado)) return true;
  const idadeHoras = (Date.now() - atualizado) / 1000 / 60 / 60;
  return idadeHoras >= STALE_HOURS;
}

function ordenarEnviosInterno(a, b) {
  const flagA = a.itens_precisa_atualizar === true ? 0 : 1;
  const flagB = b.itens_precisa_atualizar === true ? 0 : 1;
  if (flagA !== flagB) return flagA - flagB;
  const semItensA = (!a.itens || Object.keys(a.itens || {}).length === 0) ? 0 : 1;
  const semItensB = (!b.itens || Object.keys(b.itens || {}).length === 0) ? 0 : 1;
  if (semItensA !== semItensB) return semItensA - semItensB;
  const da = a.data_reservada || a.data ? new Date(a.data_reservada || a.data).getTime() : 9999999999999;
  const db = b.data_reservada || b.data ? new Date(b.data_reservada || b.data).getTime() : 9999999999999;
  if (da !== db) return da - db;
  return String(a.id_envio).localeCompare(String(b.id_envio));
}

function selecionarEnviosBalanceado(envios, limite) {
  const grupos = new Map();
  for (const envio of envios) {
    const nome = envio.conta || "SEM_CONTA";
    if (!grupos.has(nome)) grupos.set(nome, []);
    grupos.get(nome).push(envio);
  }
  for (const lista of grupos.values()) lista.sort(ordenarEnviosInterno);
  const contasOrdenadas = Array.from(grupos.keys()).sort((a, b) => {
    const pa = prioridadeConta(a);
    const pb = prioridadeConta(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
  const selecionados = [];
  const indices = {};
  const porConta = {};
  for (const c of contasOrdenadas) {
    indices[c] = 0;
    porConta[c] = 0;
  }
  let houveAvanco = true;
  while (selecionados.length < limite && houveAvanco) {
    houveAvanco = false;
    for (const conta of contasOrdenadas) {
      if (selecionados.length >= limite) break;
      if (porConta[conta] >= MAX_POR_CONTA_POR_RODADA) continue;
      const lista = grupos.get(conta) || [];
      const idx = indices[conta] || 0;
      if (idx >= lista.length) continue;
      selecionados.push(lista[idx]);
      indices[conta] = idx + 1;
      porConta[conta]++;
      houveAvanco = true;
    }
    if (!houveAvanco && selecionados.length < limite) {
      const aindaTem = contasOrdenadas.some(conta => (indices[conta] || 0) < (grupos.get(conta) || []).length);
      if (aindaTem) {
        for (const c of contasOrdenadas) porConta[c] = 0;
        houveAvanco = true;
      }
    }
  }
  return selecionados;
}

function normalizarItem(u, antigo = {}) {
  const variacao = Array.isArray(u.variation_attributes || u.variationAttributes)
    ? (u.variation_attributes || u.variationAttributes).map(a => a.value_name || a.valueName || a.name || "").filter(Boolean).join(" - ")
    : "";

  const sku = String(u.sku || u.inventory_id || u.inventoryId || u.item_id || u.itemId || u.variation_id || u.variationId || u.unitId || u.id || "SEM_SKU").trim();
  const titulo = [u.item_title || u.itemTitle || u.title || u.productName || "Produto sem título", variacao].filter(Boolean).join(" | ");
  const declarado = Number(u.quantity ?? u.declaredQuantity ?? u.declared_quantity ?? u.declared_units ?? u.units ?? 0);
  const processadaML = Number(u.processedQuantity ?? u.processed_quantity ?? u.readyToFullQuantity ?? 0);
  const aptaFullML = Number(u.readyToFullQuantity ?? u.ready_to_full_quantity ?? 0);
  const diferencaML = Number(u.differencesQuantity ?? u.differences_quantity ?? 0);
  const naoAptaML = Number(u.notReadyToFullQuantity ?? u.not_ready_to_full_quantity ?? 0);
  const qtdFeita = antigo.qtd_feita != null ? Number(antigo.qtd_feita || 0) : 0;
  const statusControle = antigo.status_controle || (qtdFeita >= declarado && declarado > 0 ? "Feito" : "Pendente");

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
    item_id: u.item_id || u.itemId || "",
    variation_id: u.variation_id || u.variationId || "",
    inventory_id: u.inventory_id || u.inventoryId || "",
    unit_id: u.unitId || u.id || "",
    qtd_processada_ml: Number.isFinite(processadaML) ? processadaML : "",
    qtd_apta_full_ml: Number.isFinite(aptaFullML) ? aptaFullML : "",
    qtd_diferenca_ml: Number.isFinite(diferencaML) ? diferencaML : "",
    qtd_nao_apta_full_ml: Number.isFinite(naoAptaML) ? naoAptaML : "",
    vendas_full_30d: u.inventory_detail?.sales_quantity_full ?? "",
    vendas_30d: u.inventory_detail?.sales_thirty_days ?? "",
    aptas_caminho: u.inventory_detail?.stock_waiting_for_arrival ?? "",
    estoque_vendavel: u.inventory_detail?.stock_saleable ?? "",
    conferido: antigo.conferido === true || antigo.status_controle === "Feito" || false,
    divergencia: antigo.divergencia || "",
  };
}

async function prepararPaginaComCookie(browser, conta) {
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36");
  await page.setExtraHTTPHeaders({ "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" });
  const cookies = parseCookieHeader(conta.cookie);
  if (!cookies.length) throw new Error(`Cookie inválido/vazio para ${conta.nome}`);
  await page.setCookie(...cookies);
  return page;
}

function encontrarArrayDeProdutos(obj) {
  const fila = [obj];
  const candidatos = [];
  let passos = 0;
  while (fila.length && passos < 14000) {
    passos++;
    const atual = fila.shift();
    if (!atual || typeof atual !== "object") continue;
    if (Array.isArray(atual)) {
      let score = 0;
      for (const item of atual) {
        if (!item || typeof item !== "object") continue;
        const keys = Object.keys(item).join("|");
        const temProduto = keys.includes("itemTitle") || keys.includes("item_title") || keys.includes("sku") || keys.includes("inventoryId") || keys.includes("inventory_id") || keys.includes("itemId") || keys.includes("item_id");
        const temQtd = keys.includes("declaredQuantity") || keys.includes("quantity") || keys.includes("processedQuantity") || keys.includes("readyToFullQuantity");
        if (temProduto && temQtd) score++;
      }
      if (score > 0) candidatos.push({ score, arr: atual });
      for (const v of atual) fila.push(v);
    } else {
      for (const k of Object.keys(atual)) fila.push(atual[k]);
    }
  }
  candidatos.sort((a, b) => b.score - a.score || b.arr.length - a.arr.length);
  return candidatos.length ? candidatos[0].arr : [];
}

function pegarUnitsDoCtx(ctx) {
  if (!ctx || typeof ctx !== "object") return [];
  const direto = ctx?.appProps?.pageProps?.data?.units || ctx?.appProps?.pageProps?.data?.items || ctx?.appProps?.pageProps?.data?.products || ctx?.props?.pageProps?.data?.units || ctx?.props?.pageProps?.data?.items || ctx?.data?.units || ctx?.data?.items || [];
  if (Array.isArray(direto) && direto.length) return direto;
  return encontrarArrayDeProdutos(ctx);
}

function extrairCtxDoHtml(html) {
  const marker = "_n.ctx.r";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf("=", idx);
  const start = html.indexOf("{", eq);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let quote = "";
  let escape = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  return null;
}

async function lerItensDaPagina(page) {
  let units = [];
  try {
    await page.waitForFunction(() => {
      const data = window._n?.ctx?.r?.appProps?.pageProps?.data;
      return data && Array.isArray(data.units);
    }, { timeout: 12000 });
    units = await page.evaluate(() => window._n?.ctx?.r?.appProps?.pageProps?.data?.units || []);
    if (Array.isArray(units) && units.length > 0) return units;
  } catch (_) {}
  try {
    const ctx = await page.evaluate(() => window._n?.ctx?.r || null);
    units = pegarUnitsDoCtx(ctx);
    if (Array.isArray(units) && units.length > 0) return units;
  } catch (_) {}
  const html = await page.content();
  const ctx = extrairCtxDoHtml(html);
  units = pegarUnitsDoCtx(ctx);
  return Array.isArray(units) ? units : [];
}

async function puxarItensEnvio(browser, envio) {
  const conta = contaPorNome(envio.conta);
  if (!conta) throw new Error(`Conta não encontrada: ${envio.conta}`);
  if (!conta.cookie) throw new Error(`Cookie não configurado para ${conta.nome}`);

  const urls = [
    { tipo: "units", url: `https://myaccount.mercadolivre.com.br/shipping/inbounds/${envio.id_envio}/units` },
    { tipo: "details", url: `https://myaccount.mercadolivre.com.br/shipping/inbounds/${envio.id_envio}/details` },
  ];

  let ultimoErro = "";
  for (const tentativa of urls) {
    const page = await prepararPaginaComCookie(browser, conta);
    try {
      await page.goto(tentativa.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      const atualUrl = page.url();
      const normUrl = normalizarTexto(atualUrl);
      if (normUrl.includes("login") || normUrl.includes("registration") || normUrl.includes("gz/webdevice")) throw new Error(`Redirecionado para login/validação. URL atual: ${atualUrl}`);
      const units = await lerItensDaPagina(page);
      if (!Array.isArray(units) || units.length === 0) throw new Error(`Página /${tentativa.tipo} abriu, mas não achei produtos no JSON.`);
      const antigos = envio.itens || {};
      const itens = {};
      for (const u of units) {
        const baseSku = String(u.sku || u.inventory_id || u.inventoryId || u.item_id || u.itemId || u.unitId || u.id || "SEM_SKU").trim();
        const item = normalizarItem(u, antigos[baseSku] || {});
        itens[item.sku] = item;
      }
      log(`Itens encontrados em /${tentativa.tipo} do envio ${envio.id_envio}: ${Object.keys(itens).length}`, { conta: envio.conta });
      return itens;
    } catch (e) {
      ultimoErro = `/${tentativa.tipo}: ${e.message}`;
      log(`Tentativa /${tentativa.tipo} falhou no envio ${envio.id_envio}: ${e.message}`, { conta: envio.conta });
    } finally {
      await page.close().catch(() => {});
    }
  }
  throw new Error(`Não encontrei itens nem em /units nem em /details. Último erro: ${ultimoErro}`);
}

// ============================================================
// SYNC
// ============================================================

async function sincronizarEnviosFull() {
  if (runningEnvios) return { ok: false, skipped: true, message: "Sincronização de envios já está rodando." };
  runningEnvios = true;
  const started = nowIso();
  const result = { ok: true, started_at: started, finished_at: null, total_bruto_ml: 0, atualizados_planilha: 0, contas_ok: 0, contas_sem_cookie: 0, erros: 0, detalhes: [] };

  try {
    log("Iniciando sincronização de envios Full pelo EasyPanel via Apps Script");
    await gravarLogPlanilha("Iniciando sincronização de envios Full");
    const base = await lerBanco(true);

    for (const conta of CONTAS) {
      if (!contaHabilitada(conta.nome)) {
        result.contas_sem_cookie++;
        result.detalhes.push({ conta: conta.nome, ok: false, motivo: "sem cookie ou desabilitada" });
        continue;
      }

      let contaOk = false;
      let totalConta = 0;

      for (let pagina = 0; pagina < MAX_PAGINAS_POR_CONTA; pagina++) {
        const offset = pagina * LIMITE_POR_PAGINA;
        const url = `https://myaccount.mercadolivre.com.br/api/shipping/inbounds/search?limit=${LIMITE_POR_PAGINA}&offset=${offset}`;
        try {
          const res = await fetch(url, opcoesML(conta));
          const body = await res.text();
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 250)}`);
          const dados = JSON.parse(body);
          const bruto = extrairArrayEnviosML(dados);
          if (pagina === 0) {
            const amostra = bruto && bruto.length ? bruto[0] : null;
            log(`ML ${conta.nome} página 0`, { envios: bruto.length, exemplo: amostra ? { id: amostra.id || amostra.inbound_id || amostra.inboundId || "", status: amostra.status || "", qtd: pegarQuantidadeDeclarada(amostra), data: pegarDataReferencia(amostra) } : "sem exemplo" });
          }
          contaOk = true;
          if (!bruto || bruto.length === 0) break;
          result.total_bruto_ml += bruto.length;
          totalConta += bruto.length;
          for (const envio of bruto) {
            const idEnvio = String(envio.id || envio.inbound_id || envio.inboundId || "").trim();
            if (!idEnvio) continue;
            const antigo = base[idEnvio] || {};
            base[idEnvio] = montarEnvio(envio, conta, antigo);
          }
          if (bruto.length < LIMITE_POR_PAGINA) break;
          await new Promise(r => setTimeout(r, 350));
        } catch (e) {
          result.erros++;
          result.detalhes.push({ conta: conta.nome, pagina, ok: false, erro: e.message });
          log(`Erro buscando envios ${conta.nome} página ${pagina}: ${e.message}`);
          break;
        }
      }
      if (contaOk) {
        result.contas_ok++;
        result.detalhes.push({ conta: conta.nome, ok: true, envios: totalConta });
      }
    }

    const rEnvios = await salvarEnviosWebapp(base);
    result.views = await rebuildViewsWebapp("sync_envios");
    result.atualizados_planilha = rEnvios.envios || Object.keys(base).length;
    result.finished_at = nowIso();
    lastEnviosResult = result;
    await atualizarStatusSync("sync_envios", result);
    await gravarLogPlanilha("Sincronização de envios finalizada", result);
    log("Sincronização de envios finalizada", result);
    return result;
  } catch (e) {
    result.ok = false;
    result.erros++;
    result.error = e.message;
    result.finished_at = nowIso();
    lastEnviosResult = result;
    await gravarLogPlanilha("Erro geral em envios", result);
    return result;
  } finally {
    runningEnvios = false;
  }
}

async function processarItensConcorrente(browser, envios, base, result) {
  let cursor = 0;

  async function worker(n) {
    while (true) {
      const index = cursor++;
      if (index >= envios.length) return;
      const envio = envios[index];
      result.processados++;
      try {
        log(`Worker ${n} puxando itens do envio ${envio.id_envio}`, { conta: envio.conta });
        const itens = await puxarItensEnvio(browser, envio);
        envio.itens = itens;
        envio.itens_qtd = Object.keys(itens).length;
        envio.itens_atualizados_em = nowIso();
        envio.itens_ultimo_erro = null;
        envio.itens_precisa_atualizar = false;
        envio.motivo_atualizacao_itens = "";
        envio.assinatura_itens_processada = envio.assinatura_envio_para_itens || "";
        base[envio.id_envio] = envio;
        result.atualizados++;
        result.detalhes.push({ id_envio: envio.id_envio, conta: envio.conta, ok: true, itens: envio.itens_qtd });
        log(`Itens gravados no objeto do envio ${envio.id_envio}: ${envio.itens_qtd}`);
        await new Promise(r => setTimeout(r, 700));
      } catch (e) {
        envio.itens_ultimo_erro = { mensagem: e.message, em: nowIso() };
        base[envio.id_envio] = envio;
        result.erros++;
        result.detalhes.push({ id_envio: envio.id_envio, conta: envio.conta, ok: false, erro: e.message });
        log(`Erro no envio ${envio.id_envio}: ${e.message}`, { conta: envio.conta });
      }
    }
  }

  const totalWorkers = Math.min(CONCORRENCIA_PAGINAS, envios.length);
  const workers = [];
  for (let i = 1; i <= totalWorkers; i++) workers.push(worker(i));
  await Promise.all(workers);
}

async function sincronizarItensFull(options = {}) {
  if (runningItems) return { ok: false, skipped: true, message: "Sincronização de itens já está rodando." };
  runningItems = true;
  const started = nowIso();
  const force = Boolean(options.force);
  const limit = Number(options.limit || MAX_ENVIOS_POR_RODADA);
  const result = { ok: true, started_at: started, finished_at: null, force, limit, total_planilha: 0, operacionais: 0, erro_recente_pulado: 0, para_atualizar: 0, selecionados: 0, processados: 0, atualizados: 0, erros: 0, detalhes: [] };

  try {
    log("Iniciando sincronização de itens Full");
    await gravarLogPlanilha("Iniciando sincronização de itens Full", { force, limit });
    const base = await lerBanco(true);
    const todos = Object.values(base || {}).filter(Boolean);
    const operacionais = todos.filter(envioOperacionalParaItens);
    const erroPulados = operacionais.filter(e => erroRecente(e, force));
    const candidatos = operacionais.filter(e => !erroRecente(e, force)).filter(e => precisaAtualizarItens(e, force));
    const envios = selecionarEnviosBalanceado(candidatos, limit);

    result.total_planilha = todos.length;
    result.operacionais = operacionais.length;
    result.erro_recente_pulado = erroPulados.length;
    result.para_atualizar = candidatos.length;
    result.selecionados = envios.length;

    if (!envios.length) {
      result.finished_at = nowIso();
      lastItemsResult = result;
      await atualizarStatusSync("sync_itens", result);
      return result;
    }

    const browser = await puppeteer.launch({
      headless: HEADLESS,
      executablePath: PUPPETEER_EXECUTABLE_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1366,768"],
    });

    try {
      await processarItensConcorrente(browser, envios, base, result);
    } finally {
      await browser.close().catch(() => {});
    }

    const idsProcessados = envios.map(e => String(e.id_envio));
    await salvarEnviosWebapp(base, idsProcessados);
    await salvarItensWebapp(base, idsProcessados);
    result.views = await rebuildViewsWebapp("sync_itens");

    result.finished_at = nowIso();
    lastItemsResult = result;
    await atualizarStatusSync("sync_itens", result);
    await gravarLogPlanilha("Sincronização de itens finalizada", result);
    log("Sincronização de itens finalizada", result);
    return result;
  } catch (e) {
    result.ok = false;
    result.erros++;
    result.error = e.message;
    result.finished_at = nowIso();
    lastItemsResult = result;
    await gravarLogPlanilha("Erro geral em itens", result);
    return result;
  } finally {
    runningItems = false;
  }
}

async function sincronizarTudo(options = {}) {
  const envios = await sincronizarEnviosFull();
  const itens = await sincronizarItensFull(options);
  const result = { ok: envios.ok && itens.ok, envios, itens, finished_at: nowIso() };
  lastAllResult = result;
  await atualizarStatusSync("sync_all", result);
  return result;
}

// ============================================================
// API
// ============================================================

app.get("/", (req, res) => {
  res.json({ ok: true, service: "dashfull-webapp-bridge", version: "3.0.0", routes: ["/status", "/sync-envios", "/sync-items", "/sync-all", "/sync-items-all", "/rebuild-views", "/historico_envios.json", "/api/mobile/envios"] });
});

app.get("/health", (req, res) => res.json({ ok: true, time: nowIso() }));

app.get("/status", async (req, res) => {
  let total = "";
  let webappOk = false;
  let webappError = "";
  try {
    const base = await lerBanco();
    total = Object.keys(base).length;
    webappOk = true;
  } catch (e) {
    webappError = e.message;
  }

  res.json({
    ok: true,
    webappOk,
    webappError,
    mode: WORKER_MODE,
    runningEnvios,
    runningItems,
    nextEnviosAt,
    nextItemsAt,
    total_envios_cache: total,
    lastEnviosResult,
    lastItemsResult,
    lastAllResult,
    config: {
      sheets_webapp_url_configurado: Boolean(SHEETS_WEBAPP_URL),
      webapp_chunk_size: WEBAPP_CHUNK_SIZE,
      max_paginas_por_conta: MAX_PAGINAS_POR_CONTA,
      intervalo_envios_minutos: INTERVALO_ENVIOS_MINUTOS,
      intervalo_itens_minutos: INTERVALO_ITENS_MINUTOS,
      max_envios_por_rodada: MAX_ENVIOS_POR_RODADA,
      max_por_conta_por_rodada: MAX_POR_CONTA_POR_RODADA,
      concorrencia_paginas: CONCORRENCIA_PAGINAS,
      stale_hours: STALE_HOURS,
      error_cooldown_minutes: ERROR_COOLDOWN_MINUTES,
    },
    contas: CONTAS.map(c => ({ nome: c.nome, cookie_configurado: Boolean(c.cookie), habilitada: contaHabilitada(c.nome), prioridade: prioridadeConta(c.nome) })),
  });
});

app.get("/sync-envios", async (req, res) => {
  if (!verificarChave(req, res)) return;
  res.json(await sincronizarEnviosFull());
});

app.post("/sync-envios", async (req, res) => {
  if (!verificarChave(req, res)) return;
  res.json(await sincronizarEnviosFull());
});

app.get("/sync-items", async (req, res) => {
  if (!verificarChave(req, res)) return;
  const force = String(req.query.force || "").toLowerCase() === "true" || String(req.query.force || "") === "1";
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  res.json(await sincronizarItensFull({ force, limit }));
});

app.get("/sync-items-all", async (req, res) => {
  if (!verificarChave(req, res)) return;
  const limit = req.query.limit ? Number(req.query.limit) : Math.max(MAX_ENVIOS_POR_RODADA, 80);
  res.json(await sincronizarItensFull({ force: true, limit }));
});

app.get("/rebuild-views", async (req, res) => {
  if (!verificarChave(req, res)) return;
  res.json(await rebuildViewsWebapp("manual"));
});


app.post("/sync-items", async (req, res) => {
  if (!verificarChave(req, res)) return;
  res.json(await sincronizarItensFull({ force: req.body?.force === true, limit: req.body?.limit }));
});

app.get("/sync-all", async (req, res) => {
  if (!verificarChave(req, res)) return;
  const force = String(req.query.force || "").toLowerCase() === "true" || String(req.query.force || "") === "1";
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  res.json(await sincronizarTudo({ force, limit }));
});

app.post("/sync-all", async (req, res) => {
  if (!verificarChave(req, res)) return;
  res.json(await sincronizarTudo({ force: req.body?.force === true, limit: req.body?.limit }));
});

app.get("/historico_envios.json", async (req, res) => {
  try {
    const base = await lerBanco(false);
    res.json(base);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/mobile/envios", async (req, res) => {
  try {
    const base = await lerBanco(false);
    const lista = Object.values(base || {}).map(e => {
      const itens = e.itens || {};
      const valores = Object.values(itens);
      const feitos = valores.filter(i => String(i.status_controle || "").toLowerCase() === "feito" || i.conferido === true).length;
      const parciais = valores.filter(i => String(i.status_controle || "").toLowerCase() === "parcial").length;
      return {
        conta: e.conta,
        id_envio: e.id_envio,
        status: e.status,
        status_detail: e.status_detail,
        categoria_operacional: e.categoria_operacional,
        unidades_declaradas: e.unidades_declaradas,
        unidades_recebidas: e.unidades_recebidas,
        galpao: e.galpao,
        data: e.data,
        data_reservada: e.data_reservada,
        meu_status: e.meu_status,
        operador: e.operador,
        itens_qtd: Object.keys(itens).length || e.itens_qtd || 0,
        itens_feitos: feitos,
        itens_parciais: parciais,
        itens_pendentes: Math.max(0, (Object.keys(itens).length || e.itens_qtd || 0) - feitos),
        itens_precisa_atualizar: e.itens_precisa_atualizar,
        motivo_atualizacao_itens: e.motivo_atualizacao_itens,
        itens_atualizados_em: e.itens_atualizados_em,
        itens_ultimo_erro: e.itens_ultimo_erro,
      };
    });
    res.json({ ok: true, total: lista.length, envios: lista });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


app.get("/historico_envios/:id.json", async (req, res) => {
  try {
    const base = await lerBanco(false);
    res.json(base[req.params.id] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/historico_envios/:id.json", async (req, res) => {
  try {
    const updated = await patchEnvio(req.params.id, req.body || {});
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/historico_envios/:id/itens/:sku.json", async (req, res) => {
  try {
    const updated = await patchItem(req.params.id, req.params.sku, req.body || {});
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// alias
app.get("/sync", async (req, res) => {
  if (!verificarChave(req, res)) return;
  res.json(await sincronizarTudo({}));
});

// ============================================================
// LOOP
// ============================================================

function agendarLoopContinuo() {
  if (WORKER_MODE !== "continuous") {
    log("WORKER_MODE não é continuous. Serviço aguardando chamadas manuais.", { mode: WORKER_MODE });
    return;
  }

  const intervaloEnviosMs = Math.max(1, INTERVALO_ENVIOS_MINUTOS) * 60 * 1000;
  const intervaloItensMs = Math.max(1, INTERVALO_ITENS_MINUTOS) * 60 * 1000;

  const loopEnvios = async () => {
    nextEnviosAt = new Date(Date.now() + intervaloEnviosMs).toISOString();
    try { await sincronizarEnviosFull(); } catch (e) { log(`Erro no loop de envios: ${e.message}`); }
    nextEnviosAt = new Date(Date.now() + intervaloEnviosMs).toISOString();
    setTimeout(loopEnvios, intervaloEnviosMs);
  };

  const loopItens = async () => {
    nextItemsAt = new Date(Date.now() + intervaloItensMs).toISOString();
    try { await sincronizarItensFull(); } catch (e) { log(`Erro no loop de itens: ${e.message}`); }
    nextItemsAt = new Date(Date.now() + intervaloItensMs).toISOString();
    setTimeout(loopItens, intervaloItensMs);
  };

  if (RUN_ON_START) {
    setTimeout(async () => {
      await sincronizarEnviosFull();
      await sincronizarItensFull();
      nextEnviosAt = new Date(Date.now() + intervaloEnviosMs).toISOString();
      nextItemsAt = new Date(Date.now() + intervaloItensMs).toISOString();
      setTimeout(loopEnvios, intervaloEnviosMs);
      setTimeout(loopItens, intervaloItensMs);
    }, 3000);
  } else {
    nextEnviosAt = new Date(Date.now() + intervaloEnviosMs).toISOString();
    nextItemsAt = new Date(Date.now() + intervaloItensMs).toISOString();
    setTimeout(loopEnvios, intervaloEnviosMs);
    setTimeout(loopItens, intervaloItensMs);
  }
}

async function main() {
  // Testa se o WebApp responde, mas não mata o serviço se falhar.
  try {
    await lerBanco(true);
    log("Apps Script WebApp conectado com sucesso.");
  } catch (e) {
    log(`Atenção: Apps Script WebApp ainda não respondeu corretamente: ${e.message}`);
  }

  if (process.argv.includes("once")) {
    const result = await sincronizarTudo({});
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  const server = app.listen(PORT, () => {
    log(`DashFull WebApp Bridge v3 online na porta ${PORT}`, { mode: WORKER_MODE });
    agendarLoopContinuo();
  });

  process.on("SIGTERM", () => {
    log("Recebido SIGTERM. Encerrando serviço.");
    server.close(() => process.exit(0));
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
