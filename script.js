const BACKEND = (window.DASHFULL_BACKEND || "https://atendente-dashfull-itens-worker.2cwhzy.easypanel.host").replace(/\/$/, "");

let base = {};
let envios = [];
let itensFlat = [];
let produtosMes = [];
let produtosMesCache = {};
let detailCache = {};
let loadingDetails = new Set();
let prefetchTimer = null;
let view = "resumo";
let currentOperator = localStorage.getItem("dashfull_operator") || "";
let openOperacaoId = null;
let openItemsId = null;

const DATA_REFRESH_MS = 12000;
const STATUS_REFRESH_MS = 15000;
const AUTO_SYNC_ITEMS_MS = 180000;
const AUTO_SYNC_LOCK_KEY = "dashfull_auto_sync_items_lock";
const DETAIL_CACHE_KEY = "dashfull_detail_cache_v15";
const PENDING_PATCHES_KEY = "dashfull_pending_patches_v21";
const DETAIL_CACHE_MAX = 120;
const DETAIL_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
let refreshTimer = null;
let statusTimer = null;
let autoSyncTimer = null;
let pendingTimer = null;
let isLoadingData = false;
let lastDataSignature = "";
let enviosRenderLimit = 80;
let itensRenderLimit = 400;

const COLORS = ["#2563eb","#22c55e","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#64748b"];
const $ = (id) => document.getElementById(id);

function html(v) {
  return String(v ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[m]));
}

function norm(v) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function pct(n) {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n)}%`;
}

function toDateInputValue(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}

function currentMonthValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 7);
}

function formatDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" });
}

function formatTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    const m = String(v).match(/(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : "—";
  }
  return d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
}

function formatDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function dateInputValue(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0,10);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}

function timeInputValue(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    const m = String(v).match(/(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : "";
  }
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(11,16);
}

function dificuldadeBadgeClass(value) {
  const s = norm(value);
  if (s.includes("facil") || s.includes("fácil")) return "difficulty-facil";
  if (s.includes("medio") || s.includes("médio")) return "difficulty-medio";
  if (s.includes("dificil") || s.includes("difícil")) return "difficulty-dificil";
  return "";
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}



function loadDetailCache() {
  try {
    const raw = localStorage.getItem(DETAIL_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const next = {};
    for (const [id, pack] of Object.entries(parsed || {})) {
      if (!pack || !pack.savedAt || now - pack.savedAt > DETAIL_CACHE_TTL_MS) continue;
      if (pack.data && pack.data.id_envio) next[id] = pack.data;
    }
    detailCache = next;
  } catch(e) {
    detailCache = {};
  }
}

function saveDetailCache() {
  try {
    const entries = Object.entries(detailCache || {})
      .filter(([,data]) => data && data.id_envio && data.itens && Object.keys(data.itens || {}).length)
      .sort((a,b) => String(b[1].atualizado_em || b[1].itens_atualizados_em || "").localeCompare(String(a[1].atualizado_em || a[1].itens_atualizados_em || "")))
      .slice(0, DETAIL_CACHE_MAX);

    const payload = {};
    for (const [id, data] of entries) {
      payload[id] = { savedAt: Date.now(), data };
    }
    localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(payload));
  } catch(e) {}
}

function clearDetailCache() {
  detailCache = {};
  localStorage.removeItem(DETAIL_CACHE_KEY);
  rebuildFlat();
  renderActive();
  toast("Cache local dos itens limpo");
}

function dataSignature(obj) {
  try {
    const values = Object.values(obj || {});
    let itens = 0;
    let latest = "";
    for (const e of values) {
      itens += Object.keys(e.itens || {}).length;
      const candidates = [
        e.atualizado_em,
        e.hora_operacao,
        e.itens_atualizados_em,
        e.ultima_sincronizacao,
        e.operador_ultima_alteracao,
        e.meu_status,
        e.motorista,
        e.caminhao_placa
      ].filter(Boolean).join("|");
      if (candidates > latest) latest = candidates;
    }
    return `${values.length}|${itens}|${latest}`;
  } catch(e) {
    return String(Date.now());
  }
}

function shouldRunAutoSyncLock() {
  const now = Date.now();
  const last = Number(localStorage.getItem(AUTO_SYNC_LOCK_KEY) || 0);
  if (now - last < AUTO_SYNC_ITEMS_MS - 2000) return false;
  localStorage.setItem(AUTO_SYNC_LOCK_KEY, String(now));
  return true;
}

function setAutoSyncStatus(mode, text) {
  const dot = document.getElementById("autoSyncDot");
  const title = document.getElementById("autoSyncTitle");
  const desc = document.getElementById("autoSyncText");
  if (!dot || !desc || !title) return;
  dot.className = `auto-dot ${mode || ""}`;
  title.textContent = mode === "run" ? "Sync rodando" : mode === "err" ? "Sync com erro" : "Sync automático";
  desc.textContent = text || "";
}


function getPendingPatches() {
  try { return JSON.parse(localStorage.getItem(PENDING_PATCHES_KEY) || "[]") || []; }
  catch(e) { return []; }
}

function savePendingPatches(list) {
  try { localStorage.setItem(PENDING_PATCHES_KEY, JSON.stringify(list || [])); }
  catch(e) {}
}

function addPendingPatch(entry) {
  const list = getPendingPatches();
  const key = entry.key || `${entry.type}|${entry.id}|${entry.sku || ""}`;
  const next = list.filter(x => x.key !== key);
  next.push({ ...entry, key, created_at: entry.created_at || new Date().toISOString(), tries: entry.tries || 0 });
  savePendingPatches(next.slice(-500));
  updatePendingBadge();
}

function updatePendingBadge() {
  const total = getPendingPatches().length;
  if (total > 0) setAutoSyncStatus("err", `${total} alteração(ões) pendente(s) de sincronizar`);
}

async function processPendingPatches() {
  const list = getPendingPatches();
  if (!list.length) return;
  const remaining = [];
  for (const item of list) {
    try {
      if (item.type === "item") {
        await api(`/historico_envios/${encodeURIComponent(item.id)}/itens/${encodeURIComponent(item.sku)}.json`, { method:"PATCH", body:JSON.stringify(item.patch) });
      } else if (item.type === "envio") {
        await api(`/historico_envios/${encodeURIComponent(item.id)}.json`, { method:"PATCH", body:JSON.stringify(item.patch) });
      }
    } catch(e) {
      remaining.push({ ...item, tries: Number(item.tries || 0) + 1, last_error: e.message, last_try_at: new Date().toISOString() });
    }
  }
  savePendingPatches(remaining);
  if (!remaining.length) {
    setAutoSyncStatus("ok", "Pendências sincronizadas");
    toast("Alterações pendentes sincronizadas");
    await loadData(true);
  } else {
    updatePendingBadge();
  }
}

function startRealtimeLoops() {
  clearInterval(refreshTimer);
  clearInterval(statusTimer);
  clearInterval(autoSyncTimer);
  clearInterval(pendingTimer);

  refreshTimer = setInterval(() => {
    if (document.hidden || !currentOperator) return;
    loadData(true);
  }, DATA_REFRESH_MS);

  statusTimer = setInterval(() => {
    if (document.hidden) return;
    refreshBackendStatus();
  }, STATUS_REFRESH_MS);

  autoSyncTimer = setInterval(() => {
    if (document.hidden || !currentOperator) return;
    autoSyncItems();
  }, AUTO_SYNC_ITEMS_MS);

  pendingTimer = setInterval(() => {
    if (document.hidden || !currentOperator) return;
    processPendingPatches();
  }, 10000);

  refreshBackendStatus();
  updatePendingBadge();
  setTimeout(() => processPendingPatches(), 3000);
  setTimeout(() => autoSyncItems(), 10000);
}

async function refreshBackendStatus() {
  try {
    const status = await api("/status");
    const running = status.runningItems || status.runningEnvios;
    const lastItems = status.lastItemsResult;
    if (running) {
      setAutoSyncStatus("run", status.runningItems ? "Puxando itens em segundo plano" : "Puxando envios");
    } else if (lastItems?.erros) {
      setAutoSyncStatus("err", `${lastItems.erros} erro(s) na última rodada`);
    } else {
      const next = status.nextItemsAt ? new Date(status.nextItemsAt).toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"}) : "";
      setAutoSyncStatus("ok", next ? `Itens automáticos • próxima ${next}` : "Itens automáticos ativos");
    }
  } catch(e) {
    setAutoSyncStatus("err", "Não consegui ler /status");
  }
}

async function autoSyncItems() {
  if (!shouldRunAutoSyncLock()) return;
  try {
    setAutoSyncStatus("run", "Verificando itens pendentes");
    try {
      await api("/sync-items?limit=30");
    } catch (e) {
      await api("/sync-items-all?limit=30");
    }
    setAutoSyncStatus("ok", "Rodada automática concluída");
    await loadData(true);
  } catch(e) {
    setAutoSyncStatus("err", "Falha na rodada automática");
  }
}

async function api(path, options = {}) {
  const res = await fetch(`${BACKEND}${path}`, {
    ...options,
    headers: { "Content-Type":"application/json", ...(options.headers || {}) }
  });
  const txt = await res.text();
  let json;
  try { json = txt ? JSON.parse(txt) : null; }
  catch(e) { throw new Error(`Resposta não JSON: ${txt.slice(0, 180)}`); }
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

function ensureOperator() {
  if (!currentOperator) {
    $("operatorModal").classList.remove("hidden");
    setTimeout(() => $("operatorInput").focus(), 80);
  } else {
    $("currentOperator").textContent = currentOperator;
    $("operatorModal").classList.add("hidden");
  }
}

function saveOperator() {
  const name = $("operatorInput").value.trim();
  if (!name) {
    toast("Digite o nome do operador");
    return;
  }
  currentOperator = name;
  localStorage.setItem("dashfull_operator", currentOperator);
  $("currentOperator").textContent = currentOperator;
  $("operatorModal").classList.add("hidden");
  toast(`Operador ativo: ${currentOperator}`);
  startRealtimeLoops();
}

function classifyStatus(e) {
  const s = norm([e.status, e.status_detail, e.categoria_operacional, e.meu_status].join(" "));
  const rawStatus = norm(e.status || "");
  const rawDetail = norm(e.status_detail || "");

  // Separação principal conforme status do Mercado Livre.
  // Agendado aqui significa "está para enviar/receber no Full", não apenas ter uma data.
  if (
    rawStatus.includes("refused") ||
    rawDetail.includes("refused") ||
    s.includes("recusado")
  ) return "recusado";

  if (
    rawStatus.includes("cancel") ||
    rawDetail.includes("cancel") ||
    s.includes("cancelado") ||
    s.includes("canceled")
  ) return "cancelado";

  if (
    rawStatus.includes("finish") ||
    rawStatus.includes("closed") ||
    rawStatus.includes("done") ||
    rawDetail.includes("finish") ||
    rawDetail.includes("closed") ||
    s.includes("finalizado") ||
    s.includes("concluido") ||
    s.includes("concluído")
  ) return "finalizado";

  if (
    rawStatus.includes("problem") ||
    rawDetail.includes("problem") ||
    rawStatus.includes("processed_with_problems") ||
    rawDetail.includes("processed_with_problems") ||
    s.includes("problema")
  ) return "problema";

  if (
    e.categoria_operacional === "ignorado" ||
    rawStatus.includes("expired") ||
    rawDetail.includes("expired") ||
    s.includes("vencido")
  ) return "ignorado";

  if (e.categoria_operacional === "reservar_data") return "reservar_data";

  // Status ativo/operacional do ML, ou envio com data válida e sem problema/finalização.
  if (
    e.tem_data_reservada ||
    e.data_reservada ||
    e.categoria_operacional === "agendado" ||
    rawStatus.includes("received") ||
    rawStatus.includes("receiving") ||
    rawStatus.includes("scheduled") ||
    rawStatus.includes("in_transit") ||
    rawStatus.includes("inbound")
  ) return "agendado";

  return "pendente";
}

function statusLabel(st) {
  return {
    agendado:"Agendado",
    reservar_data:"Reservar data",
    finalizado:"Finalizado",
    cancelado:"Cancelado",
    recusado:"Recusado",
    problema:"Com problema",
    ignorado:"Ignorado",
    pendente:"Pendente"
  }[st] || st;
}

function statusBadgeClass(st) {
  return {
    recusado: "refused",
    problema: "problem",
    finalizado: "finished",
    cancelado: "cancelled",
    ignorado: "cancelled",
    agendado: "info",
    reservar_data: "warn",
    pendente: "warn"
  }[st] || "info";
}

function envioDateKey(e) {
  const v = e.data_reservada || e.data_referencia || e.data || e.data_criacao_ml || "";
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}

function envioMonthKey(e) {
  const k = envioDateKey(e);
  return k ? k.slice(0,7) : "";
}

function shipmentPlatformDate(e) {
  return e.data_reservada || e.data_referencia || e.data || e.data_criacao_ml || "";
}

function mergeEnvioLocal(payload) {
  if (!payload || !payload.id_envio) return null;
  const id = String(payload.id_envio);
  const current = base[id] || {};
  const merged = { ...current, ...payload };
  if (current.itens && !payload.itens) merged.itens = current.itens;
  base[id] = merged;
  if (merged.itens && Object.keys(merged.itens).length) {
    detailCache[id] = merged;
    saveDetailCache();
  }
  return merged;
}

function getEnvioById(id) {
  return base[String(id)] || null;
}

function getCachedDetail(id) {
  return detailCache[String(id)] || null;
}

function hasDetailedItems(e) {
  const detail = getCachedDetail(e.id_envio) || e;
  return !!(detail && detail.itens && Object.keys(detail.itens || {}).length);
}

function getItemCount(e) {
  const detail = getCachedDetail(e.id_envio) || e || {};
  return Object.keys(detail.itens || {}).length || Number(detail.itens_qtd || e?.itens_qtd || 0) || 0;
}

async function ensureEnvioDetail(id, options = {}) {
  const key = String(id);
  if (!key) return null;

  const cached = getCachedDetail(key);
  if (cached && cached.itens && Object.keys(cached.itens || {}).length && !options.force) return cached;

  if (loadingDetails.has(key)) return null;

  loadingDetails.add(key);
  try {
    if (!options.silent) renderActive();

    // 1) Primeiro tenta o endpoint individual.
    let detail = null;
    try {
      detail = await api(`/historico_envios/${encodeURIComponent(key)}.json`);
    } catch (oneErr) {
      detail = null;
    }

    // 2) Se o endpoint individual vier sem itens, busca o histórico completo
    // e pega o envio pelo ID. Isso resolve quando a planilha já tem itens,
    // mas a rota individual não está anexando os itens.
    if (!detail || !detail.itens || !Object.keys(detail.itens || {}).length) {
      try {
        const full = await api("/historico_envios.json");
        if (full && full[key]) {
          const fromFull = full[key];
          detail = { ...(detail || {}), ...fromFull };
        }
      } catch (fullErr) {}
    }

    if (detail && detail.id_envio) {
      const merged = mergeEnvioLocal(detail);

      if (!merged.itens || !Object.keys(merged.itens || {}).length) {
        // Se mesmo assim não veio, mantém o resumo e mostra mensagem correta.
        merged.itens_detalhe_status = "nao_retornado_pelo_backend";
        base[key] = merged;
      }

      rebuildFlat();
      renderActive();
      return merged;
    }

    return detail;
  } catch (e) {
    if (!options.silent) toast(`Erro ao carregar itens do envio ${key}: ${e.message}`);
    return null;
  } finally {
    loadingDetails.delete(key);
    if (!options.silent) renderActive();
  }
}

async function prefetchAgendadosVisiveis() {
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(async () => {
    try {
      const targets = filteredEnvios().filter(e => classifyStatus(e) === 'agendado').slice(0, 8);
      for (const e of targets) {
        if (!getCachedDetail(e.id_envio) && !loadingDetails.has(String(e.id_envio))) {
          await ensureEnvioDetail(e.id_envio, { silent: true });
          await new Promise(r => setTimeout(r, 120));
        }
      }
    } catch (e) {}
  }, 250);
}

function getItens(e) {
  const detail = getCachedDetail(e?.id_envio) || e || {};
  return Object.entries(detail.itens || {}).map(([sku,item]) => [sku, item || {}]);
}

function envioProcess(e) {
  const items = getItens(e);
  const itemCount = getItemCount(e);
  const detailLoaded = hasDetailedItems(e);
  const isLoading = loadingDetails.has(String(e.id_envio));

  if (items.length) {
    let declarado = 0, feita = 0, pendentes = 0, feitos = 0, parciais = 0, naoTem = 0;
    for (const [,it] of items) {
      const dec = Number(it.declarado || 0);
      const qf = Number(it.qtd_feita || 0);
      declarado += dec;
      feita += qf;
      const st = norm(it.status_controle || "");
      if (st.includes("parcial")) parciais++;
      else if (st.includes("nao tem") || st.includes("não tem")) naoTem++;
      else if (st.includes("feito") && !st.includes("nao") && !st.includes("não")) feitos++;
      else pendentes++;
    }
    const percent = declarado > 0 ? Math.min(100, (feita / declarado) * 100) : 0;
    return { totalItems: items.length, declarado, feita, falta: Math.max(0, declarado - feita), percent, pendentes, feitos, parciais, naoTem, fromSummary:false };
  }

  const totalItems = Number(e.itens_qtd || 0) || 0;
  const feitos = Number(e.itens_feitos || 0) || 0;
  const parciais = Number(e.itens_parciais || 0) || 0;
  const pendentes = Number(e.itens_pendentes || Math.max(0, totalItems - feitos - parciais)) || 0;
  const declared = Number(e.unidades_declaradas || 0) || 0;
  const feita = 0;
  const percent = totalItems > 0 ? Math.min(100, ((feitos + (parciais * 0.5)) / totalItems) * 100) : 0;
  return { totalItems, declarado: declared, feita, falta: Math.max(0, totalItems - feitos), percent, pendentes, feitos, parciais, naoTem:0, fromSummary:true };
}

function isDivergente(e) {
  const p = envioProcess(e);
  const declared = Number(e.unidades_declaradas || p.declarado || 0);
  const received = Number(e.unidades_recebidas || 0);

  if (e.itens_ultimo_erro?.mensagem) return true;

  const s = norm([e.status, e.status_detail, e.categoria_operacional].join(" "));
  if (s.includes("problem") || s.includes("problema") || s.includes("refused") || s.includes("recusado")) return true;

  for (const [,it] of getItens(e)) {
    const st = norm(it.status_controle || "");
    const falta = Number(it.qtd_faltante || 0);
    const diverg = norm(it.divergencia || it.observacao_item || "");
    if (st.includes("nao tem") || st.includes("não tem") || diverg.includes("diverg")) return true;
    if (falta > 0 && (st.includes("parcial") || st.includes("feito"))) return true;
  }

  if (received && declared && received !== declared) return true;

  return false;
}


function envioVisualClasses(e) {
  const classes = [];
  const status = classifyStatus(e);
  if (status) classes.push(`status-${status}`);
  if (isDivergente(e)) classes.push("card-divergente");
  if (e.itens_ultimo_erro?.mensagem) classes.push("card-error-items");
  else if (!getItemCount(e)) classes.push("card-no-items");
  else if (hasDetailedItems(e)) classes.push("card-loaded-items");
  else classes.push("card-summary-items");
  if (loadingDetails.has(String(e.id_envio))) classes.push("card-loading-items");
  return classes.join(" ");
}

function envioAttentionText(e) {
  if (e.itens_ultimo_erro?.mensagem) return "Erro ao puxar itens";
  if (isDivergente(e)) return "Divergente";
  if (!getItemCount(e)) return "Sem itens";
  if (loadingDetails.has(String(e.id_envio))) return "Carregando itens";
  if (hasDetailedItems(e)) return "Itens no cache";
  return "Resumo da planilha";
}

function itemBadge(e) {
  const p = envioProcess(e);
  const totalItems = getItemCount(e);
  if (loadingDetails.has(String(e.id_envio))) return { cls:"info", text:"Carregando itens" };
  if (e.itens_ultimo_erro?.mensagem) return { cls:"err", text:"Erro itens" };
  if (!totalItems) return { cls:"warn", text:"Sem itens" };
  if (hasDetailedItems(e) && p.percent >= 100) return { cls:"ok", text:"100% feito" };
  if (hasDetailedItems(e) && p.percent > 0) return { cls:"info", text:pct(p.percent) };
  if (e.itens_precisa_atualizar) return { cls:"warn", text:"Na fila" };
  if (totalItems && !hasDetailedItems(e)) return { cls:"info", text:`${totalItems} itens resumo` };
  return { cls:"warn", text:"0% feito" };
}

function rebuildFlat() {
  envios = Object.values(base || {}).filter(e => e && e.id_envio);
  itensFlat = [];
  for (const e of envios) {
    const detail = getCachedDetail(e.id_envio) || e;
    for (const [sku, item] of Object.entries(detail.itens || {})) {
      itensFlat.push({ envio: base[String(e.id_envio)] || e, sku, item });
    }
  }
}

function getFilters() {
  return {
    q: norm($("searchInput").value),
    conta: $("filterConta").value,
    status: $("filterStatus").value,
    itemProcess: $("filterItemProcess").value,
    date: $("filterDate").value,
    month: $("filterMonth").value || currentMonthValue()
  };
}

function envioMatches(e, f) {
  if (f.conta !== "Todas" && e.conta !== f.conta) return false;

  const st = classifyStatus(e);
  const proc = envioProcess(e);

  if (f.status !== "todos") {
    if (f.status === "sem_itens" && proc.totalItems > 0) return false;
    else if (f.status === "erro_itens" && !e.itens_ultimo_erro?.mensagem) return false;
    else if (f.status === "divergente" && !isDivergente(e)) return false;
    else if (!["sem_itens","erro_itens","divergente"].includes(f.status) && st !== f.status) return false;
  }

  if (f.itemProcess === "100" && !(proc.totalItems && proc.percent >= 100)) return false;
  if (f.itemProcess === "andamento" && !(proc.totalItems && proc.percent > 0 && proc.percent < 100)) return false;
  if (f.itemProcess === "0" && !(proc.totalItems && proc.percent <= 0)) return false;
  if (f.itemProcess === "sem_itens" && proc.totalItems > 0) return false;

  if (f.date && envioDateKey(e) !== f.date) return false;

  if (!f.q) return true;

  const blob = norm([
    e.id_envio, e.conta, e.status, e.status_detail, e.categoria_operacional, e.meu_status,
    e.operador, e.operador_ultima_alteracao, e.galpao, e.motorista, e.caminhao_placa, e.veiculo,
    e.data_prevista_pronto, e.hora_prevista_pronto, e.dificuldade,
    ...getItens(e).flatMap(([sku,it]) => [sku, it.titulo, it.status_controle, it.observacao_item, it.atualizado_por, it.inventory_id, it.item_id])
  ].join(" "));
  return blob.includes(f.q);
}

function itemMatches(x, f) {
  if (!envioMatches(x.envio, {...f, q:""})) return false;
  if (!f.q) return true;
  const blob = norm([x.envio.id_envio, x.envio.conta, x.sku, x.item.titulo, x.item.status_controle, x.item.observacao_item, x.item.atualizado_por].join(" "));
  return blob.includes(f.q);
}

function filteredEnvios() {
  const f = getFilters();
  return envios.filter(e => envioMatches(e, f));
}

function filteredItens() {
  const f = getFilters();
  return itensFlat.filter(x => itemMatches(x, f));
}

function populateContas() {
  const select = $("filterConta");
  const current = select.value || "Todas";
  const contas = [...new Set(envios.map(e => e.conta).filter(Boolean))].sort();
  select.innerHTML = `<option value="Todas">Todas</option>` + contas.map(c => `<option value="${html(c)}">${html(c)}</option>`).join("");
  select.value = contas.includes(current) ? current : "Todas";
}

async function loadData(silent = false) {
  if (isLoadingData) return;
  isLoadingData = true;
  try {
    if (!silent) {
      $("statusText").textContent = "Carregando";
      $("statusDot").className = "dot";
    }
    // v17: não chama mais /api/mobile/envios.
    // Seu backend atual ainda responde 404 nessa rota; por isso o console ficava poluído.
    // O painel volta a usar diretamente o endpoint que já funciona.
    let nextBase = await api("/historico_envios.json");
    nextBase = nextBase || {};

    // Mantém na tela os itens/detalhes já carregados no navegador para não reabrir lento.
    for (const [id, current] of Object.entries(base || {})) {
      if (current?.itens && nextBase[id] && !nextBase[id].itens) nextBase[id].itens = current.itens;
    }
    for (const [id, cached] of Object.entries(detailCache || {})) {
      if (cached?.itens && nextBase[id] && !nextBase[id].itens) nextBase[id].itens = cached.itens;
    }
    const nextSig = dataSignature(nextBase);
    if (nextSig !== lastDataSignature) {
      base = nextBase || {};
      lastDataSignature = nextSig;
      rebuildFlat();
      populateContas();
      renderAll();
      if (view === 'envios') prefetchAgendadosVisiveis();
    }
    $("statusText").textContent = "Online";
    $("statusDot").className = "dot ok";
    $("lastLoadText").textContent = new Date().toLocaleTimeString("pt-BR");
  } catch(e) {
    $("statusText").textContent = "Erro";
    $("statusDot").className = "dot err";
    $("lastLoadText").textContent = e.message.slice(0, 60);
    if (!silent) toast("Erro ao carregar: " + e.message);
  } finally {
    isLoadingData = false;
  }
}

function setView(next) {
  view = next;
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  document.getElementById(`view-${next}`).classList.add("active");
  document.querySelectorAll(".nav-btn,.mobile-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.view === next));

  const labels = {
    resumo:["Resumo operacional","Painel geral com gráficos, operadores, motoristas e fila crítica."],
    envios:["Envios Full","Cada envio mostra data/hora da plataforma, data prevista, operador, motorista e itens."],
    itens:["Itens dos Full","Conferência global por produto, SKU e operador."],
    produtos:["Produtos / Mês","Contagem mensal dos produtos enviados para Full. Todo mês começa em zero."],
    motoristas:["Motoristas e veículos","Resumo mensal de Full por motorista e por veículo."],
    sync:["Sincronização","Atualização do Mercado Livre e reorganização da planilha."]
  };
  $("pageTitle").textContent = labels[next][0];
  $("pageSubtitle").textContent = labels[next][1];
  renderActive();
  if (next === "envios") prefetchAgendadosVisiveis();
}

function renderAll() {
  renderActive();
}

function renderActive() {
  if (view === "resumo") renderResumo();
  else if (view === "envios") renderEnvios();
  else if (view === "itens") renderItens();
  else if (view === "produtos") renderProdutosMes();
  else if (view === "motoristas") renderMotoristas();
  else if (view === "sync") {
    // não precisa renderizar tabelas na tela de sync
  }
}

function resetRenderLimits() {
  enviosRenderLimit = 80;
  itensRenderLimit = 400;
}

function renderResumo() {
  const list = filteredEnvios();
  const itens = filteredItens();
  const f = getFilters();

  let dec = 0, feita = 0;
  for (const e of list) {
    const p = envioProcess(e);
    dec += p.declarado;
    feita += p.feita;
  }
  const progress = dec ? (feita / dec) * 100 : 0;
  const motoristasMes = monthlyDriverRows(f.month, "motorista").filter(r => r.name !== "Sem motorista");

  $("kpiEnvios").textContent = list.length;
  $("kpiItens").textContent = itens.length;
  $("kpiProgresso").textContent = pct(progress);
  $("kpiSemItens").textContent = list.filter(e => envioProcess(e).totalItems === 0).length;
  $("kpiMotoristas").textContent = motoristasMes.length;
  $("kpiErros").textContent = list.filter(e => e.itens_ultimo_erro?.mensagem).length;

  renderStatusChart(list);
  renderContasChart(list);
  renderTimelineChart(list);
  renderItensStatusChart(list);
  renderMotoristasChart(f.month);
  renderFilaCritica(list);
}

function groupCount(items, fn) {
  const m = new Map();
  for (const item of items) {
    const k = fn(item) || "Sem informação";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a,b) => b[1]-a[1]);
}

function renderBarChart(el, data, options = {}) {
  const max = Math.max(1, ...data.map(x => x[1]));
  el.innerHTML = data.slice(0, options.limit || 10).map(([label,value],i) => `
    <div class="bar-row">
      <div class="bar-label" title="${html(label)}">${html(label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, value/max*100)}%;background:${COLORS[i%COLORS.length]}"></div></div>
      <div class="bar-value">${value}</div>
    </div>
  `).join("") || `<div class="subline">Sem dados para o filtro atual.</div>`;
}

function renderDonutChart(el, data) {
  const total = data.reduce((a,x) => a + x[1], 0);
  if (!total) {
    el.innerHTML = `<div class="subline">Sem dados para o filtro atual.</div>`;
    return;
  }
  let acc = 0;
  const radius = 82;
  const circ = 2 * Math.PI * radius;
  const rings = data.map(([label,value],i) => {
    const portion = value / total;
    const dash = portion * circ;
    const gap = circ - dash;
    const offset = -acc * circ;
    acc += portion;
    return `<circle cx="120" cy="120" r="${radius}" fill="none" stroke="${COLORS[i%COLORS.length]}" stroke-width="26" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${offset}" transform="rotate(-90 120 120)" />`;
  }).join("");
  const legend = data.map(([label,value],i) => `<span class="legend-item"><i class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></i>${html(label)}: <strong>${value}</strong></span>`).join("");
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:260px 1fr;gap:10px;align-items:center">
      <svg class="svg-chart" viewBox="0 0 240 240" style="height:240px">
        <circle cx="120" cy="120" r="${radius}" fill="none" stroke="#e8eef7" stroke-width="26" />
        ${rings}
        <text x="120" y="112" text-anchor="middle" font-size="30" font-weight="900" fill="#0b1220">${total}</text>
        <text x="120" y="136" text-anchor="middle" font-size="12" fill="#64748b">envios</text>
      </svg>
      <div class="legend">${legend}</div>
    </div>
  `;
}

function renderLineChart(el, data) {
  if (!data.length) {
    el.innerHTML = `<div class="subline">Sem datas para exibir.</div>`;
    return;
  }
  const sorted = data.sort((a,b) => String(a[0]).localeCompare(String(b[0]))).slice(-18);
  const w = 900, h = 240, pad = 34;
  const max = Math.max(1, ...sorted.map(x => x[1]));
  const points = sorted.map(([date,value],i) => {
    const x = pad + (sorted.length === 1 ? 0 : i * ((w-pad*2)/(sorted.length-1)));
    const y = h - pad - (value/max) * (h-pad*2);
    return {date,value,x,y};
  });
  const poly = points.map(p => `${p.x},${p.y}`).join(" ");
  const circles = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#2563eb"><title>${p.date}: ${p.value}</title></circle>`).join("");
  const labels = points.map((p,i) => i % Math.ceil(points.length/7) === 0 ? `<text x="${p.x}" y="${h-8}" text-anchor="middle" font-size="11" fill="#64748b">${p.date.slice(5)}</text>` : "").join("");
  const grid = [0,.25,.5,.75,1].map(t => {
    const y = h - pad - t*(h-pad*2);
    return `<line x1="${pad}" x2="${w-pad}" y1="${y}" y2="${y}" stroke="#e8eef7"/><text x="6" y="${y+4}" font-size="10" fill="#94a3b8">${Math.round(t*max)}</text>`;
  }).join("");
  el.innerHTML = `<svg class="svg-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    ${grid}
    <polyline points="${poly}" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${circles}
    ${labels}
  </svg>`;
}

function renderStatusChart(list) {
  const labels = {agendado:"Agendados",reservar_data:"Reservar data",finalizado:"Finalizados",cancelado:"Cancelados",recusado:"Recusados",problema:"Com problema",ignorado:"Ignorados",pendente:"Pendentes"};
  renderDonutChart($("chartStatus"), groupCount(list, e => labels[classifyStatus(e)] || "Outro"));
}

function renderContasChart(list) {
  renderBarChart($("chartContas"), groupCount(list, e => e.conta || "Sem conta"), {limit:8});
}

function renderTimelineChart(list) {
  renderLineChart($("chartTimeline"), groupCount(list.filter(e => envioDateKey(e)), e => envioDateKey(e)));
}

function renderItensStatusChart(list) {
  const counts = new Map([["Feitos",0],["Parciais",0],["Pendentes",0],["Não tem",0]]);
  for (const e of list) {
    for (const [,it] of getItens(e)) {
      const st = norm(it.status_controle || "Pendente");
      if (st.includes("parcial")) counts.set("Parciais", counts.get("Parciais")+1);
      else if (st.includes("nao tem") || st.includes("não tem")) counts.set("Não tem", counts.get("Não tem")+1);
      else if (st.includes("feito") && !st.includes("nao") && !st.includes("não")) counts.set("Feitos", counts.get("Feitos")+1);
      else counts.set("Pendentes", counts.get("Pendentes")+1);
    }
  }
  renderBarChart($("chartItensStatus"), [...counts.entries()], {limit:8});
}

function renderMotoristasChart(month) {
  const rows = monthlyDriverRows(month, "motorista").filter(r => r.name !== "Sem motorista");
  renderBarChart($("chartMotoristas"), rows.map(r => [r.name, r.total]), {limit:8});
}

function renderFilaCritica(list) {
  const fila = [...list].sort((a,b) => {
    const pa = priorityScore(a), pb = priorityScore(b);
    if (pa !== pb) return pb - pa;
    return String(envioDateKey(a)).localeCompare(String(envioDateKey(b)));
  }).slice(0, 10);
  $("filaCriticaCount").textContent = fila.length;
  $("filaCritica").innerHTML = fila.map(e => priorityCard(e)).join("") || `<div class="subline">Nenhuma prioridade encontrada.</div>`;
}

function priorityScore(e) {
  let score = 0;
  const p = envioProcess(e);
  if (!p.totalItems) score += 5;
  if (e.itens_ultimo_erro?.mensagem) score += 8;
  if (e.itens_precisa_atualizar) score += 3;
  if (classifyStatus(e) === "agendado") score += 2;
  if (p.percent > 0 && p.percent < 100) score += 3;
  return score;
}

function priorityCard(e) {
  const proc = envioProcess(e);
  const b = itemBadge(e);
  return `<article class="priority-card">
    <div>
      <div class="title-line"><strong>#${html(e.id_envio)}</strong><span class="badge dark">${html(e.conta || "")}</span><span class="badge ${b.cls}">${b.text}</span></div>
      <div class="subline">${html(e.galpao || "—")} • Plataforma: ${formatDateTime(shipmentPlatformDate(e))} • ${html(e.status || "")}</div>
      <div class="badges"><span class="badge info">Itens: ${proc.totalItems}</span><span class="badge">Operador: ${html(e.operador || e.operador_ultima_alteracao || "sem operador")}</span><span class="badge">Motorista: ${html(e.motorista || "sem motorista")}</span></div>
    </div>
    <button class="mini-btn dark" onclick="focusEnvio('${html(e.id_envio)}')">Abrir aqui</button>
  </article>`;
}

function renderEnvios() {
  const all = filteredEnvios().sort((a,b) => {
    const order = { agendado: 0, divergente: 1, reservar_data: 2, pendente: 3, problema: 4, recusado: 5, cancelado: 6, finalizado: 7, ignorado: 8 };
    const sa = isDivergente(a) && classifyStatus(a) === "agendado" ? "divergente" : classifyStatus(a);
    const sb = isDivergente(b) && classifyStatus(b) === "agendado" ? "divergente" : classifyStatus(b);
    const oa = order[sa] ?? 99;
    const ob = order[sb] ?? 99;
    if (oa !== ob) return oa - ob;
    return String(envioDateKey(a)).localeCompare(String(envioDateKey(b))) || String(a.conta).localeCompare(String(b.conta));
  });
  const list = all.slice(0, enviosRenderLimit);
  $("enviosCount").textContent = `${all.length} envios`;
  const more = all.length > list.length ? `
    <div class="load-more-wrap">
      <button class="mini-btn dark" onclick="enviosRenderLimit += 80; renderEnvios();">Mostrar mais ${Math.min(80, all.length - list.length)} de ${all.length - list.length} restantes</button>
    </div>` : `<div class="load-more-wrap"><span class="perf-note">Renderização otimizada: ${list.length} envios exibidos</span></div>`;
  $("enviosList").innerHTML = (list.map(e => envioCard(e)).join("") || `<div class="subline">Nenhum envio localizado.</div>`) + more;
  prefetchAgendadosVisiveis();
}

function envioCard(e) {
  const proc = envioProcess(e);
  const badge = itemBadge(e);
  const status = classifyStatus(e);
  const items = getItens(e);
  const itemCount = getItemCount(e);
  const detailLoaded = hasDetailedItems(e);
  const isLoading = loadingDetails.has(String(e.id_envio));
  const showOperacao = String(openOperacaoId) === String(e.id_envio);
  const showItems = String(openItemsId) === String(e.id_envio);
  const plataforma = shipmentPlatformDate(e);
  const dataPrevista = e.data_prevista_pronto || e.data_limite_pronto || "";
  const horaPrevista = e.hora_prevista_pronto || e.hora_limite_pronto || "";

  return `<article class="envio-card ${envioVisualClasses(e)}" id="envio-${html(e.id_envio)}">
    <div class="card-alert-strip">${envioAttentionText(e)}</div>
    <div class="envio-head">
      <div class="card-click-zone" onclick="toggleOperacao('${html(e.id_envio)}')">
        <div class="title-line">
          <strong>#${html(e.id_envio)}</strong>
          <span class="badge dark">${html(e.conta || "")}</span>
          <span class="badge ${statusBadgeClass(status)}">${statusLabel(status)}</span>
          <span class="badge ${badge.cls}">${badge.text}</span>
          ${isDivergente(e) ? `<span class="badge divergente">Divergente</span>` : ""}${e.dificuldade ? `<span class="badge ${dificuldadeBadgeClass(e.dificuldade)}">${html(e.dificuldade)}</span>` : ""}
        </div>
        <div class="subline">Status ML: ${html(e.status || "—")} ${e.status_detail ? "• " + html(e.status_detail) : ""}</div>
      </div>
      <div class="envio-actions">
        <button class="mini-btn" onclick="patchEnvio('${html(e.id_envio)}', {meu_status:'Em separação'})">Em separação</button>
        <button class="mini-btn" onclick="patchEnvio('${html(e.id_envio)}', {meu_status:'Finalizado'})">Finalizar</button>
        <button class="mini-btn dark" onclick="toggleOperacao('${html(e.id_envio)}')">${showOperacao ? "Ocultar detalhes" : "Detalhes"}</button>
        <button class="mini-btn dark" onclick="toggleItems('${html(e.id_envio)}')">${showItems ? "Ocultar itens" : "Ver itens"}</button>
      </div>
    </div>

    <div class="envio-meta">
      <div class="meta-box"><span>Data plataforma</span><strong>${formatDate(plataforma)}</strong></div>
      <div class="meta-box"><span>Hora plataforma</span><strong>${formatTime(plataforma)}</strong></div>
      <div class="meta-box"><span>Galpão</span><strong>${html(e.galpao || "—")}</strong></div>
      <div class="meta-box"><span>Declarado</span><strong>${e.unidades_declaradas || proc.declarado || "—"}</strong></div>
      <div class="meta-box"><span>${detailLoaded ? "Feito" : "Itens da planilha"}</span><strong>${detailLoaded ? `${proc.feita || 0} / ${proc.declarado || 0}` : `${Number(e.itens_feitos || 0)} feitos • ${itemCount} itens`}</strong></div>
      <div class="meta-box"><span>Motorista</span><strong>${html(e.motorista || "sem motorista")}</strong></div>
    </div>

    <div style="margin-top:12px">
      <div class="progress"><span style="width:${Math.round(proc.percent)}%"></span></div>
            <div class="subline">${detailLoaded ? `${pct(proc.percent)} do processo dos itens • falta ${proc.falta}` : isLoading ? `Carregando itens do envio #${html(e.id_envio)}...` : `Resumo rápido: ${itemCount} itens na planilha • ${Number(e.itens_feitos || 0)} feitos • clique em Ver itens para carregar pelo ID do envio`}</div>
    </div>

    <div class="inline-actions-row">
      <div class="left-actions">
        <button class="mini-btn" onclick="toggleOperacao('${html(e.id_envio)}')">${showOperacao ? "Ocultar operação" : "Abrir operação"}</button>
        <button class="mini-btn" onclick="toggleItems('${html(e.id_envio)}')">${showItems ? "Ocultar itens" : `Itens (${itemCount})`}</button>
      </div>
      <div class="right-actions">
        <span id="save-state-${html(e.id_envio)}" class="quick-save-state saved">${hasDetailedItems(e) ? "cache local" : (e.atualizado_em ? "salvo" : "")}</span>
      </div>
    </div>

    <div class="operation-panel ${showOperacao ? "" : "is-hidden"}">
      <div class="operation-title">
        <strong>Operação, transporte e previsão de pronto</strong>
        <small>Esse bloco só aparece no envio aberto e salva com atualização instantânea.</small>
      </div>

      <div class="operation-grid">
        <div class="field">
          <label>Motorista</label>
          <input id="motorista-${html(e.id_envio)}" placeholder="Nome do motorista" value="${html(e.motorista || "")}" />
        </div>

        <div class="field">
          <label>Veículo / placa</label>
          <input id="veiculo-${html(e.id_envio)}" placeholder="Ex: Doblo branca / ABC1D23" value="${html(e.caminhao_placa || e.veiculo || "")}" />
        </div>

        <div class="field">
          <label>Pessoas</label>
          <input id="pessoas-${html(e.id_envio)}" title="Quantidade de pessoas alocadas nesse Full" type="number" min="1" value="${html(e.pessoas_alocadas || 1)}" />
        </div>

        <div class="field">
          <label>Dificuldade</label>
          <select id="dificuldade-${html(e.id_envio)}">
            ${["","Fácil","Médio","Difícil"].map(v => `<option value="${v}" ${(e.dificuldade || "") === v ? "selected" : ""}>${v || "Selecionar"}</option>`).join("")}
          </select>
        </div>

        <div class="field">
          <label>Data prevista pronto</label>
          <input id="data-prevista-${html(e.id_envio)}" type="date" value="${html(dateInputValue(dataPrevista))}" />
        </div>

        <div class="field">
          <label>Hora prevista pronto</label>
          <input id="hora-prevista-${html(e.id_envio)}" type="time" value="${html(timeInputValue(horaPrevista))}" />
        </div>
      </div>

      <div class="field" style="margin-top:10px">
        <label>Observação do envio</label>
        <input id="observacao-${html(e.id_envio)}" placeholder="Observação do envio" value="${html(e.observacao || "")}" />
      </div>

      <div class="time-grid">
        <div class="time-card"><span>Data/hora plataforma</span><strong>${formatDateTime(plataforma)}</strong></div>
        <div class="time-card"><span>Previsão pronto</span><strong>${dataPrevista ? formatDate(dataPrevista) : "—"} ${horaPrevista ? "às " + html(horaPrevista) : ""}</strong></div>
        <div class="time-card"><span>Última operação</span><strong>${formatDateTime(e.hora_operacao || e.atualizado_em || e.ultima_sincronizacao)}</strong></div>
        <div class="time-card"><span>Atualizado por</span><strong>${html(e.operador_ultima_alteracao || e.atualizado_por || e.operador || "—")}</strong></div>
      </div>

      <div class="operation-actions">
        <span class="save-hint">Salvar ficou mais rápido: atualiza a tela na hora e grava no backend em seguida.</span>
        <button class="mini-btn" onclick="applyCurrentOperatorToEnvio('${html(e.id_envio)}')">Assumir como operador</button>
        <button class="save-btn blue" onclick="saveEnvioOperacao('${html(e.id_envio)}')">Salvar operação</button>
      </div>
    </div>

    <div class="items-inline ${showItems ? "" : "is-hidden"}">
      <button class="items-toggle" onclick="toggleItems('${html(e.id_envio)}')">
        <span>Itens do envio na mesma página</span>
        <span class="pill">${itemCount} itens • ${pct(proc.percent)}</span>
      </button>
      <div class="items-bulk-actions">
        <button class="mini-btn dark" onclick="saveAllOpenItems('${html(e.id_envio)}')">Salvar todos os itens abertos</button>
        <span class="subline">Ao marcar Feito, a quantidade preenche automaticamente com o declarado.</span>
      </div>
      <div id="items-${html(e.id_envio)}" class="items-panel open">
        ${isLoading ? `<div class="subline">Carregando itens do envio #${html(e.id_envio)} direto da planilha...</div>` : items.length ? items.slice(0,160).map(([sku,it]) => itemRow(e.id_envio, sku, it)).join("") : itemCount ? `<div class="subline">A planilha informa ${itemCount} itens, mas o backend ainda não devolveu a lista detalhada desse envio. Atualize também o backend v19 para liberar esses itens por ID.</div>` : `<div class="subline">Sem itens carregados ainda. O sincronizador em segundo plano vai preencher quando houver dados.</div>`}
      </div>
    </div>
  </article>`;
}


function getItemCurrent(id, sku) {
  const detail = detailCache[String(id)] || base[String(id)] || {};
  return detail.itens?.[sku] || base[String(id)]?.itens?.[sku] || null;
}

function handleItemStatusChange(id, skuEnc, key) {
  const sku = decodeURIComponent(skuEnc);
  const status = document.getElementById(`status-${key}`)?.value || "Pendente";
  const qtdEl = document.getElementById(`qtd-${key}`);
  const item = getItemCurrent(id, sku) || {};
  const declarado = Number(item.declarado || 0);

  if (status === "Feito" && qtdEl && Number(qtdEl.value || 0) <= 0 && declarado > 0) {
    qtdEl.value = declarado;
  }

  if ((status === "Pendente" || status === "Não feito") && qtdEl && Number(qtdEl.value || 0) < 0) {
    qtdEl.value = 0;
  }

  const state = document.getElementById(`item-state-${key}`);
  if (state) {
    state.className = "item-state dirty";
    state.textContent = "alterado";
  }
}

function markItemDirty(key) {
  const state = document.getElementById(`item-state-${key}`);
  if (state) {
    state.className = "item-state dirty";
    state.textContent = "alterado";
  }
}

function itemRow(id, sku, it) {
  const key = `${id}-${String(sku).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const statusAtual = it.status_controle || "Pendente";
  const qtdAtual = it.qtd_feita ?? 0;
  return `<div class="item-row" id="item-row-${html(key)}">
    <div>
      <strong>${html(it.titulo || sku)}</strong>
      <div class="subline">SKU ${html(sku)} • Dec ${it.declarado || 0} • Falta ${it.qtd_faltante || 0} • Operador ${html(it.atualizado_por || "—")}</div>
      <span id="item-state-${html(key)}" class="item-state saved">${it.atualizado_em ? "salvo" : ""}</span>
    </div>
    <input id="qtd-${html(key)}" type="number" min="0" value="${html(qtdAtual)}" oninput="markItemDirty('${html(key)}')" />
    <select id="status-${html(key)}" onchange="handleItemStatusChange('${html(id)}','${encodeURIComponent(sku)}','${html(key)}')">
      ${["Pendente","Feito","Parcial","Não tem","Não feito"].map(s => `<option ${statusAtual === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <div class="item-actions">
      <textarea id="obs-${html(key)}" placeholder="Obs do item" oninput="markItemDirty('${html(key)}')">${html(it.observacao_item || "")}</textarea>
      <button class="save-btn" onclick="saveItem('${html(id)}','${encodeURIComponent(sku)}','${html(key)}')">Salvar</button>
    </div>
  </div>`;
}

async function toggleOperacao(id) {
  const opening = String(openOperacaoId) !== String(id);
  openOperacaoId = opening ? String(id) : null;
  renderEnvios();
  renderMotoristas();
  setTimeout(() => document.getElementById(`envio-${id}`)?.scrollIntoView({behavior:"smooth", block:"nearest"}), 40);
  if (opening) await ensureEnvioDetail(id, { silent: false });
}

async function toggleItems(id) {
  const opening = String(openItemsId) !== String(id);
  openItemsId = opening ? String(id) : null;
  renderEnvios();
  renderMotoristas();
  setTimeout(() => document.getElementById(`envio-${id}`)?.scrollIntoView({behavior:"smooth", block:"nearest"}), 40);
  if (opening) await ensureEnvioDetail(id, { silent: false });
}

async function focusEnvio(id) {
  setView("envios");
  openOperacaoId = String(id);
  openItemsId = null;
  renderEnvios();
  setTimeout(() => document.getElementById(`envio-${id}`)?.scrollIntoView({behavior:"smooth", block:"start"}), 80);
  await ensureEnvioDetail(id, { silent: true });
  renderEnvios();
}

function applyCurrentOperatorToEnvio(id) {
  if (!currentOperator) return ensureOperator();
  patchEnvio(id, { operador: currentOperator });
}

function renderItens() {
  const all = filteredItens().sort((a,b) => {
    const order = { agendado: 0, divergente: 1, reservar_data: 2, pendente: 3, problema: 4, recusado: 5, cancelado: 6, finalizado: 7, ignorado: 8 };
    const sa = isDivergente(a.envio) && classifyStatus(a.envio) === "agendado" ? "divergente" : classifyStatus(a.envio);
    const sb = isDivergente(b.envio) && classifyStatus(b.envio) === "agendado" ? "divergente" : classifyStatus(b.envio);
    const oa = order[sa] ?? 99;
    const ob = order[sb] ?? 99;
    if (oa !== ob) return oa - ob;
    return String(envioDateKey(a.envio)).localeCompare(String(envioDateKey(b.envio))) || String(a.sku).localeCompare(String(b.sku));
  });
  const list = all.slice(0, itensRenderLimit);
  $("itensCount").textContent = `${all.length} itens`;
  const emptyHint = !all.length ? `<div class="subline">Nenhum item carregado ainda para o filtro atual. Abra um envio em "Envios Full" para carregar seus itens pelo ID, ou aguarde a pré-carga em segundo plano.</div>` : "";
  const table = emptyHint || `<table class="items-table">
    <thead><tr><th>Envio</th><th>Conta</th><th>SKU</th><th>Produto</th><th>Qtd</th><th>Status</th><th>Operador</th><th>Obs</th></tr></thead>
    <tbody>${list.map(x => `<tr>
      <td><strong>#${html(x.envio.id_envio)}</strong><div class="subline">${formatDateTime(shipmentPlatformDate(x.envio))}</div></td>
      <td>${html(x.envio.conta || "")}</td>
      <td>${html(x.sku)}</td>
      <td><div class="product-name">${html(x.item.titulo || "")}</div><div class="subline">${html(x.item.inventory_id || "")}</div></td>
      <td>Dec: ${x.item.declarado || 0}<br>Feita: ${x.item.qtd_feita || 0}<br>Falta: ${x.item.qtd_faltante || 0}</td>
      <td><span class="badge">${html(x.item.status_controle || "Pendente")}</span></td>
      <td>${html(x.item.atualizado_por || x.envio.operador || "—")}</td>
      <td>${html(x.item.observacao_item || "")}</td>
    </tr>`).join("")}</tbody>
  </table>`;
  const more = all.length > list.length ? `
    <div class="load-more-wrap">
      <button class="mini-btn dark" onclick="itensRenderLimit += 400; renderItens();">Mostrar mais ${Math.min(400, all.length - list.length)} de ${all.length - list.length} restantes</button>
    </div>` : `<div class="load-more-wrap"><span class="perf-note">Renderização otimizada: ${list.length} itens exibidos</span></div>`;
  $("itensList").innerHTML = table + more;
}


function produtoNome(item, sku) { return item.titulo || item.nome || item.product_name || item.descricao || sku || "Produto sem nome"; }
function produtoSku(sku, item) { return sku || item.sku || item.inventory_id || item.item_id || "SEM_SKU"; }
function quantidadePrevistaItem(item) { return Number(item.declarado || item.quantidade || item.qtd || item.qtd_declarada || 0) || 0; }
function quantidadeConfirmadaItem(item) { return Number(item.qtd_feita || item.quantidade_feita || item.qtd_confirmada || 0) || 0; }
function monthLabelBR(month) {
  if (!month) return "Mês atual";
  const [y,m] = String(month).split("-");
  const nomes = ["","janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${nomes[Number(m)] || m} de ${y}`;
}
function gerarProdutosMesLocal(month) {
  const rows = new Map();
  const enviosDoMes = envios.filter(e => envioMonthKey(e) === month);
  for (const envio of enviosDoMes) {
    for (const [skuRaw, item] of getItens(envio)) {
      const sku = produtoSku(skuRaw, item);
      const nome = produtoNome(item, sku);
      const key = `${month}|${sku}`;
      const prevista = quantidadePrevistaItem(item);
      const confirmada = quantidadeConfirmadaItem(item);
      const quantidade = confirmada > 0 ? confirmada : prevista;
      if (!rows.has(key)) {
        rows.set(key, { mes: month, sku, produto: nome, quantidade_prevista: 0, quantidade_confirmada: 0, quantidade_enviada: 0, fulls: new Set(), contas: new Set(), galpoes: new Set(), ultimo_envio: "", chave: key });
      }
      const row = rows.get(key);
      row.produto = nome || row.produto;
      row.quantidade_prevista += prevista;
      row.quantidade_confirmada += confirmada;
      row.quantidade_enviada += quantidade;
      row.fulls.add(String(envio.id_envio));
      if (envio.conta) row.contas.add(envio.conta);
      if (envio.galpao) row.galpoes.add(envio.galpao);
      const dt = shipmentPlatformDate(envio);
      if (dt && String(dt) > String(row.ultimo_envio || "")) row.ultimo_envio = dt;
    }
  }
  return [...rows.values()].map(r => ({ ...r, fulls_count: r.fulls.size, contas: [...r.contas].join(" / "), galpoes: [...r.galpoes].join(" / "), fulls: [...r.fulls].join(", ") })).sort((a,b) => b.quantidade_enviada - a.quantidade_enviada || String(a.produto).localeCompare(String(b.produto)));
}
async function carregarProdutosMes(month, force = false) {
  const key = month || currentMonthValue();
  if (!force && produtosMesCache[key]) { produtosMes = produtosMesCache[key]; return produtosMes; }
  try {
    const resp = await api(`/api/produtos-mes?mes=${encodeURIComponent(key)}`);
    const rows = Array.isArray(resp?.produtos) ? resp.produtos : [];
    produtosMes = rows; produtosMesCache[key] = rows; return rows;
  } catch(e) {
    produtosMes = gerarProdutosMesLocal(key); produtosMesCache[key] = produtosMes; return produtosMes;
  }
}
function renderProdutosMes() {
  const f = getFilters();
  const month = f.month || currentMonthValue();
  carregarProdutosMes(month).then(rows => {
    const q = f.q;
    const filtered = rows.filter(r => !q || norm([r.sku, r.produto, r.contas, r.galpoes, r.fulls].join(" ")).includes(q));
    const totalUnidades = filtered.reduce((acc,r) => acc + Number(r.quantidade_enviada || r.quantidade || 0), 0);
    const totalConfirmado = filtered.reduce((acc,r) => acc + Number(r.quantidade_confirmada || 0), 0);
    const fulls = new Set();
    for (const r of filtered) String(r.fulls || "").split(",").map(x => x.trim()).filter(Boolean).forEach(id => fulls.add(id));
    $("prodKpiUnidades").textContent = totalUnidades;
    $("prodKpiSkus").textContent = filtered.length;
    $("prodKpiFulls").textContent = fulls.size;
    $("prodKpiConfirmado").textContent = totalConfirmado;
    $("produtosCount").textContent = `${filtered.length} produtos`;
    $("produtosStatus").textContent = `Mês: ${monthLabelBR(month)} • ${filtered.length} SKUs`;
    renderProdutosTabela(filtered.slice(0, 300));
    renderProdutosTopChart(filtered.slice(0, 10));
  });
}
function renderProdutosTabela(rows) {
  const htmlRows = rows.map((r, idx) => `
    <tr>
      <td><strong>${idx + 1}</strong></td>
      <td><div class="product-name">${html(r.produto || "")}</div><div class="subline">SKU ${html(r.sku || "")}</div></td>
      <td><strong>${Number(r.quantidade_enviada || r.quantidade || 0)}</strong><div class="subline">previsto + confirmado</div></td>
      <td>${Number(r.quantidade_prevista || 0)}</td>
      <td>${Number(r.quantidade_confirmada || 0)}</td>
      <td>${Number(r.fulls_count || 0)}</td>
      <td>${html(r.contas || "—")}</td>
      <td>${r.ultimo_envio ? formatDate(r.ultimo_envio) : "—"}</td>
    </tr>`).join("");
  $("produtosResumo").innerHTML = `<table class="items-table produtos-table"><thead><tr><th>#</th><th>Produto</th><th>Qtd mês</th><th>Previsto</th><th>Confirmado</th><th>Fulls</th><th>Contas</th><th>Último envio</th></tr></thead><tbody>${htmlRows || `<tr><td colspan="8">Nenhum produto movimentado nesse mês.</td></tr>`}</tbody></table>`;
}
function renderProdutosTopChart(rows) {
  const data = rows.map(r => [r.produto || r.sku, Number(r.quantidade_enviada || r.quantidade || 0)]);
  renderBarChart($("produtosTopChart"), data, { limit: 10 });
}
function exportarProdutosMesCSV() {
  const month = getFilters().month || currentMonthValue();
  const rows = produtosMes || [];
  const header = ["mes","sku","produto","quantidade_mes","quantidade_prevista","quantidade_confirmada","fulls_count","contas","galpoes","ultimo_envio"];
  const csv = [header.join(";"), ...rows.map(r => header.map(h => {
    const val = h === "quantidade_mes" ? (r.quantidade_enviada || r.quantidade || 0) : (r[h] ?? "");
    return `"${String(val).replace(/"/g,'""')}"`;
  }).join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `produtos_mes_${month}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
async function atualizarProdutosMes(force = true) {
  const month = getFilters().month || currentMonthValue();
  produtosMesCache[month] = null;
  await carregarProdutosMes(month, force);
  renderProdutosMes();
  toast("Produtos / Mês atualizado");
}

function monthlyDriverRows(month, field) {
  const map = new Map();
  const filtered = envios.filter(e => !month || envioMonthKey(e) === month);
  for (const e of filtered) {
    const name = String(e[field] || (field === "caminhao_placa" ? e.veiculo : "") || "").trim() || (field === "motorista" ? "Sem motorista" : "Sem veículo");
    if (!map.has(name)) map.set(name, { name, total:0, finalizados:0, agendados:0, itens:0, feito:0, declarado:0, envios:[] });
    const row = map.get(name);
    const p = envioProcess(e);
    row.total++;
    row.itens += p.totalItems;
    row.feito += p.feita;
    row.declarado += p.declarado;
    if (classifyStatus(e) === "finalizado") row.finalizados++;
    if (classifyStatus(e) === "agendado") row.agendados++;
    row.envios.push(e);
  }
  return [...map.values()].sort((a,b) => b.total - a.total);
}

function renderMotoristas() {
  const f = getFilters();
  const rowsMotorista = monthlyDriverRows(f.month, "motorista");
  const rowsVeiculo = monthlyDriverRows(f.month, "caminhao_placa");
  $("motoristasCount").textContent = `${rowsMotorista.filter(r => r.name !== "Sem motorista").length} motoristas`;
  $("veiculosCount").textContent = `${rowsVeiculo.filter(r => r.name !== "Sem veículo").length} veículos`;

  $("motoristasResumo").innerHTML = rowsMotorista.map(driverCard).join("") || `<div class="subline">Sem dados no mês.</div>`;
  $("veiculosResumo").innerHTML = rowsVeiculo.map(driverCard).join("") || `<div class="subline">Sem dados no mês.</div>`;

  const monthEnvios = envios.filter(e => !f.month || envioMonthKey(e) === f.month).filter(e => envioMatches(e, {...f, date:""}));
  $("transporteEnviosCount").textContent = `${monthEnvios.length} envios`;
  const show = monthEnvios.slice(0, 80);
  $("transporteEnvios").innerHTML = show.map(e => envioCard(e)).join("") + (monthEnvios.length > show.length ? `<div class="load-more-wrap"><span class="perf-note">Mostrando 80 de ${monthEnvios.length}. Use busca/filtros para reduzir.</span></div>` : "") || `<div class="subline">Nenhum envio no mês.</div>`;
}

function driverCard(r) {
  const percent = r.declarado ? (r.feito / r.declarado) * 100 : 0;
  return `<article class="motorista-card">
    <div class="motorista-card-head">
      <strong>${html(r.name)}</strong>
      <span class="pill">${r.total} Full</span>
    </div>
    <div class="badges">
      <span class="badge ok">${r.finalizados} finalizados</span>
      <span class="badge info">${r.agendados} agendados</span>
      <span class="badge">${r.itens} SKUs</span>
      <span class="badge warn">${pct(percent)} itens</span>
    </div>
    <div class="progress"><span style="width:${Math.round(percent)}%"></span></div>
  </article>`;
}


function setSaveState(id, state, text) {
  const el = document.getElementById(`save-state-${id}`);
  if (!el) return;
  el.className = `quick-save-state ${state || ""}`;
  el.textContent = text || "";
}

function patchLocalEnvio(id, patch) {
  const key = String(id);
  if (!base[key]) base[key] = { id_envio: key, itens: {} };
  base[key] = { ...base[key], ...patch };

  if (detailCache[key]) {
    detailCache[key] = { ...detailCache[key], ...patch };
    if (base[key].itens && !detailCache[key].itens) detailCache[key].itens = base[key].itens;
    saveDetailCache();
  }

  rebuildFlat();
  renderActive();
}

function patchLocalItem(id, sku, patch) {
  const key = String(id);
  if (!base[key]) base[key] = { id_envio: key, itens: {} };
  if (!base[key].itens) base[key].itens = {};
  if (!base[key].itens[sku]) base[key].itens[sku] = { sku };

  const current = base[key].itens[sku];
  const next = { ...current, ...patch, sku };
  const declarado = Number(next.declarado || 0);
  const feita = Number(next.qtd_feita || 0);
  next.qtd_faltante = Math.max(0, declarado - feita);

  base[key].itens[sku] = next;

  // Correção principal: se existe cache de detalhes, atualiza o cache também.
  // Antes a tela re-renderizava lendo o item antigo do detailCache e parecia que não salvava.
  if (!detailCache[key]) detailCache[key] = { ...(base[key] || {}), id_envio: key, itens: {} };
  if (!detailCache[key].itens) detailCache[key].itens = {};
  detailCache[key].itens[sku] = next;
  detailCache[key] = { ...detailCache[key], itens_qtd: Object.keys(detailCache[key].itens || {}).length, atualizado_em: new Date().toISOString() };
  saveDetailCache();

  rebuildFlat();
  renderActive();
}


async function saveAllOpenItems(id) {
  const envio = detailCache[String(id)] || base[String(id)] || {};
  const itens = Object.entries(envio.itens || {});
  if (!itens.length) {
    toast("Nenhum item aberto para salvar");
    return;
  }
  for (const [sku] of itens) {
    const key = `${id}-${String(sku).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const row = document.getElementById(`item-row-${key}`);
    if (row) await saveItem(id, encodeURIComponent(sku), key);
  }
  toast("Itens abertos enviados para salvar");
}

async function saveEnvioOperacao(id) {
  if (!currentOperator) return ensureOperator();

  const motorista = document.getElementById(`motorista-${id}`)?.value || "";
  const veiculo = document.getElementById(`veiculo-${id}`)?.value || "";
  const pessoas = Number(document.getElementById(`pessoas-${id}`)?.value || 1);
  const dificuldade = document.getElementById(`dificuldade-${id}`)?.value || "";
  const dataPrevista = document.getElementById(`data-prevista-${id}`)?.value || "";
  const horaPrevista = document.getElementById(`hora-prevista-${id}`)?.value || "";
  const observacao = document.getElementById(`observacao-${id}`)?.value || "";

  await patchEnvio(id, {
    motorista,
    caminhao_placa: veiculo,
    veiculo,
    pessoas_alocadas: pessoas,
    dificuldade,
    data_prevista_pronto: dataPrevista,
    hora_prevista_pronto: horaPrevista,
    data_limite_pronto: dataPrevista,
    hora_limite_pronto: horaPrevista,
    observacao
  });
}

async function saveItem(id, skuEnc, key) {
  const sku = decodeURIComponent(skuEnc);
  const item = getItemCurrent(id, sku) || {};
  const qtdEl = document.getElementById(`qtd-${key}`);
  const status = document.getElementById(`status-${key}`)?.value || "Pendente";
  const obs = document.getElementById(`obs-${key}`)?.value || "";
  const state = document.getElementById(`item-state-${key}`);

  let qtd = Number(qtdEl?.value || 0);
  const declarado = Number(item.declarado || 0);
  if (status === "Feito" && qtd <= 0 && declarado > 0) {
    qtd = declarado;
    if (qtdEl) qtdEl.value = declarado;
  }

  if (state) {
    state.className = "item-state saving";
    state.textContent = "salvando...";
  }

  const ok = await patchItem(id, skuEnc, {
    qtd_feita: qtd,
    status_controle: status,
    observacao_item: obs
  });

  if (state) {
    state.className = ok ? "item-state saved" : "item-state pending";
    state.textContent = ok ? "salvo" : "pendente";
  }
}

async function patchEnvio(id, patch) {
  if (!currentOperator) return ensureOperator();

  const payload = {
    ...patch,
    operador_ultima_alteracao: currentOperator,
    operador: patch.operador !== undefined ? patch.operador : (base[id]?.operador || currentOperator),
    atualizado_por: currentOperator,
    atualizado_em: new Date().toISOString(),
    hora_operacao: new Date().toISOString()
  };

  setSaveState(id, "saving", "salvando...");
  patchLocalEnvio(id, payload);

  try {
    await api(`/historico_envios/${encodeURIComponent(id)}.json`, { method:"PATCH", body:JSON.stringify(payload) });
    setSaveState(id, "saved", `salvo por ${currentOperator}`);
    toast(`Salvo por ${currentOperator}`);
    return true;
  } catch(e) {
    addPendingPatch({ type:"envio", id:String(id), patch: payload });
    setSaveState(id, "error", "pendente sincronizar");
    toast("Sem resposta do backend. Alteração ficou na fila e tentará sincronizar.");
    return false;
  }
}

async function patchItem(id, skuEnc, patch) {
  if (!currentOperator) return ensureOperator();
  const sku = decodeURIComponent(skuEnc);

  const payload = {
    ...patch,
    atualizado_por: currentOperator,
    atualizado_em: new Date().toISOString()
  };

  setSaveState(id, "saving", "salvando item...");
  patchLocalItem(id, sku, payload);

  try {
    await api(`/historico_envios/${encodeURIComponent(id)}/itens/${encodeURIComponent(sku)}.json`, { method:"PATCH", body:JSON.stringify(payload) });
    const envioPatch = {
      operador_ultima_alteracao: currentOperator,
      operador: base[id]?.operador || currentOperator,
      atualizado_por: currentOperator,
      atualizado_em: new Date().toISOString()
    };
    patchLocalEnvio(id, envioPatch);
    await api(`/historico_envios/${encodeURIComponent(id)}.json`, {
      method:"PATCH",
      body:JSON.stringify(envioPatch)
    });
    setSaveState(id, "saved", `item salvo por ${currentOperator}`);
    toast(`Item salvo por ${currentOperator}`);
    return true;
  } catch(e) {
    // Não reverte mais a tela: deixa salvo localmente e cria fila para sincronizar.
    addPendingPatch({ type:"item", id:String(id), sku, patch: payload });
    setSaveState(id, "error", "pendente sincronizar");
    toast("Sem resposta do backend. Alteração ficou na fila e tentará sincronizar.");
    return false;
  }
}


async function runSyncItems(limit, label) {
  $("syncLog").textContent = label + "...\n";
  try {
    let json;
    try {
      json = await api(`/sync-items?limit=${limit}`);
    } catch (e) {
      json = await api(`/sync-items-all?limit=${limit}`);
    }
    $("syncLog").textContent += JSON.stringify(json, null, 2);
    toast("Sincronização de itens finalizada");
    await loadData();
  } catch(e) {
    $("syncLog").textContent += "\nERRO: " + e.message;
    toast("Erro na sincronização de itens");
  }
}

async function runSync(path, label) {
  $("syncLog").textContent = label + "...\n";
  try {
    const json = await api(path);
    $("syncLog").textContent += JSON.stringify(json, null, 2);
    toast("Sincronização finalizada");
    await loadData();
  } catch(e) {
    $("syncLog").textContent += "\nERRO: " + e.message;
    toast("Erro na sincronização");
  }
}

function applyQuick(value) {
  $("filterStatus").value = value;
  document.querySelectorAll(".quick").forEach(b => b.classList.toggle("active", b.dataset.quick === value));
  resetRenderLimits();
  renderActive();
}

function bind() {
  $("toggleSidebar").addEventListener("click", () => $("app").classList.toggle("sidebar-collapsed"));
  $("operatorSave").addEventListener("click", saveOperator);
  $("operatorInput").addEventListener("keydown", (e) => { if (e.key === "Enter") saveOperator(); });
  $("changeOperator").addEventListener("click", () => {
    $("operatorInput").value = currentOperator;
    $("operatorModal").classList.remove("hidden");
    setTimeout(() => $("operatorInput").focus(), 80);
  });

  document.querySelectorAll(".nav-btn,.mobile-tab").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
  ["searchInput","filterConta","filterStatus","filterItemProcess","filterDate","filterMonth"].forEach(id => $(id).addEventListener("input", () => {
    if (id === "filterStatus") document.querySelectorAll(".quick").forEach(b => b.classList.toggle("active", b.dataset.quick === $("filterStatus").value));
    resetRenderLimits();
    renderActive();
  }));
  document.querySelectorAll(".quick").forEach(btn => btn.addEventListener("click", () => applyQuick(btn.dataset.quick)));
  $("btnToday").addEventListener("click", () => { $("filterDate").value = toDateInputValue(); resetRenderLimits(); renderActive(); });
  $("btnClearDate").addEventListener("click", () => { $("filterDate").value = ""; resetRenderLimits(); renderActive(); });
  $("btnRefresh").addEventListener("click", loadData);

  // Usa rota existente no backend atual. Isso remove o erro 404 de /sync-items-all.
  $("btnSyncEnviosTop").addEventListener("click", () => runSync("/sync-envios", "Puxando envios"));
  $("btnSyncItensTop").addEventListener("click", () => runSyncItems(80, "Puxando itens"));
  $("btnSyncEnvios").addEventListener("click", () => runSync("/sync-envios", "Puxando envios"));
  $("btnSyncItens30").addEventListener("click", () => runSyncItems(30, "Puxando 30 itens"));
  $("btnSyncItens80").addEventListener("click", () => runSyncItems(80, "Puxando 80 itens"));
  $("btnRebuildViews").addEventListener("click", () => runSync("/rebuild-views", "Reorganizando abas"));
  const clearCacheBtn = $("btnClearCache");
  if (clearCacheBtn) clearCacheBtn.addEventListener("click", clearDetailCache);
  const btnProdutos = $("btnAtualizarProdutos");
  if (btnProdutos) btnProdutos.addEventListener("click", () => atualizarProdutosMes(true));
  const btnProdutosSync = $("btnAtualizarProdutosSync");
  if (btnProdutosSync) btnProdutosSync.addEventListener("click", () => atualizarProdutosMes(true));
  const btnExportProdutos = $("btnExportarProdutos");
  if (btnExportProdutos) btnExportProdutos.addEventListener("click", exportarProdutosMesCSV);
}

document.addEventListener("DOMContentLoaded", () => {
  $("filterMonth").value = currentMonthValue();
  loadDetailCache();
  rebuildFlat();
  $("currentOperator").textContent = currentOperator || "—";
  bind();
  ensureOperator();
  loadData();
  startRealtimeLoops();
});
