const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const FIREBASE_DB_URL = (process.env.FIREBASE_DB_URL || 'https://dashfulll-2321b-default-rtdb.firebaseio.com').replace(/\/$/, '');
const SYNC_SECRET = process.env.SYNC_SECRET || '';
const ML_BASE = 'https://myaccount.mercadolivre.com.br';
const LIMIT = Number(process.env.ML_LIMIT || 30);
const MAX_PAGES = Number(process.env.ML_MAX_PAGES || 10);
const FETCH_ITEMS = String(process.env.FETCH_ITEMS || 'true').toLowerCase() !== 'false';

function carregarContas() {
  if (process.env.CONTAS_JSON) {
    try {
      const contas = JSON.parse(process.env.CONTAS_JSON);
      if (Array.isArray(contas)) {
        return contas.filter(c => c && c.nome && c.cookie).map(c => ({ nome: c.nome, cookie: c.cookie }));
      }
    } catch (err) {
      console.error('CONTAS_JSON inválido:', err.message);
    }
  }

  return [
    { nome: 'EHF Distribuidora', cookie: process.env.MELI_COOKIE_EHF_DISTRIBUIDORA || '' },
    { nome: 'EHF Comercio', cookie: process.env.MELI_COOKIE_EHF_COMERCIO || '' },
    { nome: 'EHF Suprimentos', cookie: process.env.MELI_COOKIE_EHF_SUPRIMENTOS || '' },
    { nome: 'EKN', cookie: process.env.MELI_COOKIE_EKN || '' }
  ].filter(c => c.cookie && !c.cookie.includes('COLE_AQUI'));
}

const MAPA_GALPOES = {
  BRSP06: 'Araçariguama',
  BRRC01: 'Perus'
};

function numeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === '' || valor === '-') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function texto(valor) {
  return String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function pegarDataReservada(envio) {
  const candidatos = [
    envio?.appointment?.date,
    envio?.appointment_date,
    envio?.date_reserved,
    envio?.reserved_date
  ].filter(Boolean);

  for (const data of candidatos) {
    const d = new Date(data);
    if (!isNaN(d.getTime())) return data;
  }
  return null;
}

function statusVencidoOuCancelado(envio) {
  const t = texto(`${envio?.status || ''} ${envio?.status_detail || ''} ${envio?.substatus || ''} ${envio?.title || ''}`);
  return t.includes('expired') || t.includes('vencido') || t.includes('cancelled') || t.includes('canceled') || t.includes('cancelado');
}

function envioValidoParaOperacao(envio) {
  if (!envio) return false;

  // Vencido/cancelado sai do painel.
  // Sem data reservada continua no painel, mas vai para a categoria "reservar_data".
  if (statusVencidoOuCancelado(envio)) return false;

  const declaradas = numeroOuNull(envio.products_count ?? envio.units_count ?? envio.quantity);
  if (declaradas === null || declaradas <= 0) return false;
  return true;
}

function categoriaOperacionalEnvio(envio) {
  return pegarDataReservada(envio) ? 'agendado' : 'reservar_data';
}

function quantidadeRecebidaSegura(envio) {
  const status = texto(`${envio?.status || ''} ${envio?.status_detail || ''} ${envio?.substatus || ''}`);
  const temRecebimentoReal = status.includes('received') || status.includes('closed') || status.includes('recebido') || status.includes('finalizado');
  if (!temRecebimentoReal) return null;
  return numeroOuNull(envio?.on_sale_units ?? envio?.available_units ?? envio?.received_units ?? envio?.accepted_units ?? envio?.units_on_sale);
}

function headersMercadoLivre(cookie) {
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    cookie,
    'x-requested-with': 'XMLHttpRequest'
  };
}

function normalizarItem(u, itemSalvo = {}) {
  const sku = String(u?.sku || u?.seller_sku || u?.inventory_id || u?.inventoryId || u?.item_id || u?.id || 'Produto_Geral').trim();
  const declarado = numeroOuNull(u?.quantity ?? u?.declared_quantity ?? u?.units ?? u?.amount) || 0;
  const qtdFeitaSalva = numeroOuNull(itemSalvo.qtd_feita ?? itemSalvo.quantidade_feita ?? itemSalvo.qtd_conferida);
  const statusControle = itemSalvo.status_controle || itemSalvo.controle_status || (itemSalvo.conferido ? 'feito' : 'pendente');
  const qtdFeita = qtdFeitaSalva !== null ? qtdFeitaSalva : (itemSalvo.conferido ? declarado : 0);

  return {
    sku,
    titulo: u?.item_title || u?.title || u?.name || u?.product_name || itemSalvo.titulo || 'Produto sem título',
    declarado,
    item_id: u?.item_id || u?.itemId || itemSalvo.item_id || '',
    inventory_id: u?.inventory_id || u?.inventoryId || itemSalvo.inventory_id || '',

    // Controle operacional preservado a cada sincronização
    status_controle: statusControle,
    qtd_feita: qtdFeita,
    qtd_faltante: Math.max(0, declarado - qtdFeita),
    observacao_item: itemSalvo.observacao_item || '',
    atualizado_por: itemSalvo.atualizado_por || '',
    atualizado_em: itemSalvo.atualizado_em || '',
    conferido: Boolean(itemSalvo.conferido) || statusControle === 'feito' || (declarado > 0 && qtdFeita >= declarado),
    divergencia: itemSalvo.divergencia || (statusControle === 'feito' ? 'OK' : '')
  };
}
function deepFindUnits(obj, limit = 5000) {
  const visitados = new Set();
  const fila = [obj];
  let steps = 0;
  const candidatos = [];

  while (fila.length && steps < limit) {
    steps += 1;
    const atual = fila.shift();
    if (!atual || typeof atual !== 'object') continue;
    if (visitados.has(atual)) continue;
    visitados.add(atual);

    if (Array.isArray(atual)) {
      const score = atual.reduce((acc, item) => {
        if (!item || typeof item !== 'object') return acc;
        const keys = Object.keys(item).join('|').toLowerCase();
        const temProduto = keys.includes('sku') || keys.includes('item') || keys.includes('inventory') || keys.includes('title') || keys.includes('product');
        const temQtd = keys.includes('quantity') || keys.includes('units') || keys.includes('amount');
        return acc + (temProduto && temQtd ? 1 : 0);
      }, 0);
      if (score > 0) candidatos.push({ score, arr: atual });
      atual.forEach(v => fila.push(v));
    } else {
      Object.values(atual).forEach(v => fila.push(v));
    }
  }

  candidatos.sort((a, b) => b.score - a.score || b.arr.length - a.arr.length);
  return candidatos[0]?.arr || [];
}

function extrairJsonsDaPagina(html) {
  const jsons = [];
  const patterns = [
    /_n\.ctx\.r\s*=\s*({[\s\S]+?});\s*_n\.ctx\.r\.assets/,
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]+?});\s*<\/script>/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match || !match[1]) continue;
    try { jsons.push(JSON.parse(match[1])); } catch (_) {}
  }
  return jsons;
}

async function buscarItensDoEnvio(conta, idEnvio, itensAntigos = {}) {
  const url = `${ML_BASE}/shipping/inbounds/${encodeURIComponent(idEnvio)}/units`;
  try {
    const res = await axios.get(url, {
      headers: headersMercadoLivre(conta.cookie),
      maxRedirects: 0,
      validateStatus: s => s >= 200 && s < 400,
      timeout: 25000
    });

    const html = String(res.data || '');
    const jsons = extrairJsonsDaPagina(html);
    let units = [];

    for (const json of jsons) {
      units = json?.appProps?.pageProps?.data?.units ||
              json?.props?.pageProps?.data?.units ||
              json?.initialState?.units ||
              deepFindUnits(json);
      if (Array.isArray(units) && units.length > 0) break;
    }

    const itensMapeados = {};
    (units || []).forEach(u => {
      const temp = normalizarItem(u);
      if (!temp.sku) return;
      const salvo = itensAntigos[temp.sku] || {};
      const normalizado = normalizarItem(u, salvo);
      itensMapeados[normalizado.sku] = normalizado;
    });

    return itensMapeados;
  } catch (err) {
    console.warn(`Não foi possível buscar itens do envio ${idEnvio}: ${err.message}`);
    return {};
  }
}

function formatarEnvio(envio, conta, antigo = {}) {
  const idEnvio = String(envio?.id || envio?.inbound_id || envio?.inboundId || '').trim();
  const dataReservada = pegarDataReservada(envio);
  const codigoGalpao = envio?.logistic_center_id || envio?.warehouse_id || '';
  const declaradas = numeroOuNull(envio?.products_count ?? envio?.units_count ?? envio?.quantity);
  const recebidas = quantidadeRecebidaSegura(envio);

  return {
    conta: conta.nome,
    id_envio: idEnvio,
    status: envio?.status || 'unknown',
    status_detail: envio?.status_detail || envio?.substatus || '',
    unidades_declaradas: declaradas,
    unidades_recebidas: recebidas,
    galpao: MAPA_GALPOES[codigoGalpao] || codigoGalpao || '---',
    // Nunca usa date_created/new Date como Data Reservada.
    // Se o ML mandar "-", data fica null e a dashboard separa em "Reservar Data".
    data: dataReservada,
    data_reservada: dataReservada,
    tem_data_reservada: Boolean(dataReservada),
    categoria_operacional: categoriaOperacionalEnvio(envio),
    data_origem: dataReservada ? 'appointment.date' : null,
    data_criacao_ml: envio?.date_created || envio?.created_at || '',
    link_envio: `${ML_BASE}/shipping/inbounds/${idEnvio}/units`,
    meu_status: antigo.meu_status || 'Pendente',
    operador: antigo.operador || '',
    hora_operacao: antigo.hora_operacao || '',
    data_limite_pronto: antigo.data_limite_pronto || '',
    hora_limite_pronto: antigo.hora_limite_pronto || '',
    pessoas_alocadas: antigo.pessoas_alocadas || 1,
    motorista: antigo.motorista || '',
    caminhao_placa: antigo.caminhao_placa || '',
    dificuldade: antigo.dificuldade || '',
    observacao: antigo.observacao || '',
    progresso: antigo.progresso || {},
    pendencias: antigo.pendencias || {},
    itens: antigo.itens || {},
    ativo_operacao: true,
    ultima_sincronizacao: new Date().toISOString()
  };
}

async function lerFirebaseAtual() {
  try {
    const res = await axios.get(`${FIREBASE_DB_URL}/historico_envios.json`, { timeout: 20000 });
    return res.data || {};
  } catch (err) {
    console.warn('Não consegui ler Firebase antes de sincronizar:', err.message);
    return {};
  }
}

async function buscarInboundsConta(conta, firebaseAtual = {}, incluirItens = FETCH_ITEMS) {
  const resultados = [];
  const invalidosParaRemover = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * LIMIT;
    const url = `${ML_BASE}/api/shipping/inbounds/search?limit=${LIMIT}&offset=${offset}`;
    let bruto = [];

    try {
      const resposta = await axios.get(url, {
        headers: headersMercadoLivre(conta.cookie),
        maxRedirects: 0,
        validateStatus: s => s >= 200 && s < 400,
        timeout: 25000
      });
      bruto = resposta.data?.results || resposta.data?.data || [];
    } catch (err) {
      console.error(`Erro na conta ${conta.nome}:`, err.message);
      break;
    }

    if (!Array.isArray(bruto) || bruto.length === 0) break;

    for (const envio of bruto) {
      const idEnvio = String(envio?.id || envio?.inbound_id || envio?.inboundId || '').trim();
      if (!idEnvio) continue;

      if (!envioValidoParaOperacao(envio)) {
        invalidosParaRemover.push(idEnvio);
        continue;
      }

      const antigo = firebaseAtual[idEnvio] || {};
      const formatado = formatarEnvio(envio, conta, antigo);

      if (incluirItens) {
        const itens = await buscarItensDoEnvio(conta, idEnvio, antigo.itens || {});
        if (Object.keys(itens).length > 0) formatado.itens = itens;
      }

      resultados.push(formatado);
    }

    if (bruto.length < LIMIT) break;
  }

  return { resultados, invalidosParaRemover };
}

async function obterDadosDoFull({ incluirItens = FETCH_ITEMS, incluirPayloadFirebase = false } = {}) {
  const contas = carregarContas();
  const firebaseAtual = incluirPayloadFirebase ? await lerFirebaseAtual() : {};
  const todos = [];
  const invalidos = [];

  for (const conta of contas) {
    const { resultados, invalidosParaRemover } = await buscarInboundsConta(conta, firebaseAtual, incluirItens);
    todos.push(...resultados);
    invalidos.push(...invalidosParaRemover);
  }

  todos.sort((a, b) => {
    const da = a.data ? new Date(a.data).getTime() : 0;
    const db = b.data ? new Date(b.data).getTime() : 0;
    return db - da;
  });

  if (!incluirPayloadFirebase) return todos;

  const payload = {};
  todos.forEach(envio => { payload[envio.id_envio] = envio; });
  invalidos.forEach(id => { payload[id] = null; });
  return { lista: todos, payload, invalidos_removidos: invalidos.length };
}

app.get('/health', (req, res) => {
  res.json({ ok: true, contas_configuradas: carregarContas().map(c => c.nome), firebase: FIREBASE_DB_URL });
});

app.get('/api/full/inbounds', async (req, res) => {
  try {
    const incluirItens = String(req.query.itens ?? 'true').toLowerCase() !== 'false';
    const dados = await obterDadosDoFull({ incluirItens });
    res.json(dados);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: true, mensagem: err.message });
  }
});

app.get('/api/full/inbounds/:id/items', async (req, res) => {
  try {
    const contas = carregarContas();
    const contaNome = texto(req.query.conta || '');
    const conta = contas.find(c => texto(c.nome) === contaNome) || contas[0];
    if (!conta) return res.status(400).json({ erro: true, mensagem: 'Nenhuma conta com cookie configurado.' });

    const firebaseAtual = await lerFirebaseAtual();
    const itensAntigos = firebaseAtual?.[req.params.id]?.itens || {};
    const itens = await buscarItensDoEnvio(conta, req.params.id, itensAntigos);
    res.json({ id_envio: req.params.id, conta: conta.nome, itens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: true, mensagem: err.message });
  }
});

app.post('/api/full/sync-firebase', async (req, res) => {
  try {
    if (SYNC_SECRET && req.query.secret !== SYNC_SECRET && req.headers['x-sync-secret'] !== SYNC_SECRET) {
      return res.status(401).json({ erro: true, mensagem: 'Secret inválido.' });
    }

    const { lista, payload, invalidos_removidos } = await obterDadosDoFull({ incluirItens: FETCH_ITEMS, incluirPayloadFirebase: true });
    if (Object.keys(payload).length > 0) {
      await axios.patch(`${FIREBASE_DB_URL}/historico_envios.json`, payload, { timeout: 30000 });
    }

    res.json({ ok: true, total_envios: lista.length, invalidos_removidos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: true, mensagem: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DashFull API rodando na porta ${PORT}`);
});
