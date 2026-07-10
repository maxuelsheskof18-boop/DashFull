document.addEventListener('DOMContentLoaded', () => {
    // 1. MAPEAMENTO DE ELEMENTOS HTML
    const sidebar = document.getElementById('sidebar');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const toggleIcon = document.getElementById('toggle-icon');
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    const pagePanes = document.querySelectorAll('.page-pane');
    const headerTitle = document.getElementById('header-title');
    const headerSubtitle = document.getElementById('header-subtitle');

    const modalOperador = document.getElementById('modal-operador');
    const inputNomeOperador = document.getElementById('input-nome-operador');
    const btnEntrarPainel = document.getElementById('btn-entrar-painel');
    const nomeOperadorHeader = document.getElementById('nome-operador-header');
    const displayOperadorClick = document.getElementById('display-operador');

    const tbodyGeral = document.getElementById('tbody-geral');
    const cardEnvios = document.getElementById('total-envios');
    const cardDeclarado = document.getElementById('total-declarado');
    const cardRecebido = document.getElementById('total-recebido');
    const cardDiscrepancia = document.getElementById('taxa-discrepancia');

    const tbodyPendencias = document.getElementById('tbody-pendencias');
    const badgePendenciasNav = document.getElementById('badge-pendencias-nav');

    const filtroConta = document.getElementById('filtro-conta');
    const filtroGalpao = document.getElementById('filtro-galpao');
    const ordenarData = document.getElementById('ordenar-data');
    let pills = document.querySelectorAll('.pills-bar .pill');
    const buscaId = document.getElementById('busca-id');
    const paginacaoInfo = document.getElementById('paginacao-info');
    const paginacaoBotoes = document.getElementById('paginacao-botoes');

    // mobile menu button (pode não existir em desktop)
    const btnOpenMenuMobile = document.getElementById('btn-open-menu-mobile');

    // 2. VARIÁVEIS GLOBAIS DE ESTADO
    let dadosLocais = [];
    let dadosFiltradosAtuais = [];
    let statusPillAtivo = 'Todos';
    let operadorAtivo = '';

    // Paginação
    let paginaAtual = 1;
    const itensPorPagina = 30;

    // Configuração de Produtividade (Minutos por peça) - alterado para 3 minutos / peça / pessoa
    const MINUTOS_POR_PECA = 3;

    let chartInstanceGalpao = null;
    let chartInstanceDivergencia = null;

    // ---- UTILITÁRIOS ----
    function formatarTempoEstimado(totalMinutos) {
        const minutosTotais = Math.max(0, Math.round(Number(totalMinutos) || 0));
        const dias = Math.floor(minutosTotais / 1440);
        const restoDia = minutosTotais % 1440;
        const horas = Math.floor(restoDia / 60);
        const minutos = restoDia % 60;
        const partes = [];
        if (dias > 0) partes.push(`${dias} dia${dias > 1 ? 's' : ''}`);
        if (horas > 0 || dias > 0) partes.push(`${horas}h`);
        partes.push(`${minutos}m`);
        return partes.join(' ');
    }

    // ---- RESUMO DE MOTORISTAS (com minimizar + seletor de mês) ----
    function garantirPillsExtras() {
        if (!document.querySelector('.pills-bar')) return;

        const inserirDepois = (statusBase, statusNovo, label, countId) => {
            if (document.querySelector(`.pills-bar [data-status="${statusNovo}"]`)) return;
            const btn = document.createElement('button');
            btn.className = 'pill';
            btn.type = 'button';
            btn.setAttribute('data-status', statusNovo);
            btn.innerHTML = `${label} <span id="${countId}">(0)</span>`;
            const ref = document.querySelector(`.pills-bar [data-status="${statusBase}"]`);
            if (ref && ref.parentNode === document.querySelector('.pills-bar') && ref.nextSibling) ref.parentNode.insertBefore(btn, ref.nextSibling);
            else document.querySelector('.pills-bar').appendChild(btn);
        };

        inserirDepois('closed_ok', 'concluidos', 'Concluídos', 'count-concluidos');
        inserirDepois('pending', 'in_preparacao', 'Em Preparação', 'count-preparacao');
        inserirDepois('pending', 'pendencia', 'Pendências', 'count-pendencias-report');

        pills = document.querySelectorAll('.pills-bar .pill');
    }

    function garantirResumoMotoristas() {
        const topo = document.querySelector('.kpi-row');
        if (!topo) return null;
        let painel = document.getElementById('painel-motoristas');
        if (painel) return painel;

        painel = document.createElement('section');
        painel.id = 'painel-motoristas';
        painel.className = 'panel-card';
        painel.style.marginTop = '16px';

        // Header com seletor de mês e botão minimizar
        painel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px;">
                <h3 style="margin:0; font-size:15px;">Resumo de Motoristas do Mês</h3>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input id="mes-seletor" type="month" style="padding:6px; border-radius:6px; border:1px solid #e2e8f0;">
                    <button id="btn-toggle-resumo" title="Minimizar / Maximizar" style="padding:6px 8px; border-radius:6px; border:1px solid #e2e8f0; background:#fff;">—</button>
                </div>
            </div>
            <div id="motoristas-resumo-corpo" style="padding:12px;"></div>
        `;
        topo.insertAdjacentElement('afterend', painel);

        initResumoControls(painel);
        return painel;
    }

    function initResumoControls(painel) {
        const btn = painel.querySelector('#btn-toggle-resumo');
        const mesSel = painel.querySelector('#mes-seletor');
        const corpo = painel.querySelector('#motoristas-resumo-corpo');

        // set default month to current month (YYYY-MM)
        const hoje = new Date();
        const defaultMonth = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        if (mesSel) {
            if (!mesSel.value) mesSel.value = defaultMonth;
        }

        // restore collapsed state
        const chave = 'resumo_motoristas_collapsed';
        const collapsed = localStorage.getItem(chave) === '1';
        if (collapsed) {
            painel.classList.add('collapsed');
            if (btn) btn.innerText = '+';
            if (corpo) corpo.style.display = 'none';
        } else {
            painel.classList.remove('collapsed');
            if (btn) btn.innerText = '—';
            if (corpo) corpo.style.display = '';
        }

        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isCollapsed = painel.classList.toggle('collapsed');
                if (isCollapsed) {
                    btn.innerText = '+';
                    if (corpo) corpo.style.display = 'none';
                    localStorage.setItem(chave, '1');
                } else {
                    btn.innerText = '—';
                    if (corpo) corpo.style.display = '';
                    localStorage.setItem(chave, '0');
                }
            });
        }

        if (mesSel) {
            mesSel.addEventListener('change', () => {
                atualizarResumoMotoristas(dadosLocais); // usa valor do seletor internamente
            });
        }
    }

    // Filtra envios pelo mês selecionado no painel (se existir)
    function obterFiltroMesDoPainel() {
        const painel = document.getElementById('painel-motoristas');
        if (!painel) return null;
        const mesSel = painel.querySelector('#mes-seletor');
        if (!mesSel || !mesSel.value) return null;
        const [ano, mes] = mesSel.value.split('-').map(Number);
        if (!ano || !mes) return null;
        return { ano, mes }; // mes: 1-12
    }

    function atualizarResumoMotoristas(envios) {
        const painel = garantirResumoMotoristas();
        if (!painel) return;
        const corpo = painel.querySelector('#motoristas-resumo-corpo');
        if (!corpo) return;

        const filtroMes = obterFiltroMesDoPainel();
        // filtra envios que tem meu_status === 'Concluído' e que ocorreram no mês selecionado (usar conclusao_data ou data)
        let concluidos = (envios || []).filter(item => item.meu_status === 'Concluído');
        if (filtroMes) {
            concluidos = concluidos.filter(item => {
                const dataBase = item.conclusao_data || item.data;
                const d = new Date(dataBase);
                if (isNaN(d.getTime())) return false;
                return (d.getFullYear() === filtroMes.ano && (d.getMonth() + 1) === filtroMes.mes);
            });
        }

        const porMotorista = {};
        const porDia = {};

        concluidos.forEach(item => {
            const motorista = String(item.motorista || 'Sem motorista').trim() || 'Sem motorista';
            porMotorista[motorista] = (porMotorista[motorista] || 0) + 1;

            const dataBase = item.conclusao_data || item.data;
            const dataObj = new Date(dataBase);
            if (!isNaN(dataObj.getTime())) {
                const chaveDia = dataObj.toLocaleDateString('pt-BR');
                if (!porDia[chaveDia]) porDia[chaveDia] = [];
                porDia[chaveDia].push({
                    motorista,
                    hora: item.conclusao_hora || item.hora_operacao || '--:--',
                    idEnvio: item.id_envio || item.id || '—'
                });
            }
        });

        const ranking = Object.entries(porMotorista)
            .sort((a, b) => b[1] - a[1])
            .map(([motorista, total]) => `<tr><td style="padding:8px 10px; border-bottom:1px solid #eef2f7;"><strong>${motorista}</strong></td><td style="padding:8px 10px; border-bottom:1px solid #eef2f7; text-align:right;">${total}</td></tr>`)
            .join('');

        const diasOrdenados = Object.keys(porDia)
            .sort((a, b) => {
                const [da, ma, ya] = a.split('/').map(Number);
                const [db, mb, yb] = b.split('/').map(Number);
                return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
            })
            .slice(0, 8)
            .map(dia => {
                const eventos = porDia[dia].slice(0, 4).map(ev => `#${ev.idEnvio} • ${ev.hora} • ${ev.motorista}`).join('<br>');
                return `<div style="padding:10px 0; border-bottom:1px solid #eef2e7;"><strong>${dia}</strong><div style="font-size:12px; color:#6b7280; margin-top:4px; line-height:1.4;">${eventos}</div></div>`;
            }).join('');

        corpo.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; align-items:start;">
                <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                    <div style="padding:10px 12px; background:#f8fafc; font-weight:700; color:#334155;">Fulls concluídos no mês selecionado</div>
                    <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead><tr><th style="text-align:left; padding:8px 10px; color:#64748b;">Motorista</th><th style="text-align:right; padding:8px 10px; color:#64748b;">Qtd</th></tr></thead>
                    <tbody>${ranking || '<tr><td colspan="2" style="padding:12px; color:#94a3b8;">Sem conclusões registradas no período.</td></tr>'}</tbody>
                    </table>
                </div>
                <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                    <div style="padding:10px 12px; background:#f8fafc; font-weight:700; color:#334155;">Linha do tempo diária</div>
                    <div style="padding:10px 12px; max-height:260px; overflow:auto; font-size:13px;">${diasOrdenados || '<div style="color:#94a3b8;">Sem lançamentos diários.</div>'}</div>
                </div>
            </div>
        `;
    }

    garantirPillsExtras();

    // ---- LOGIN DO OPERADOR ----
    function verificarOperador() {
        const salvo = localStorage.getItem('dashfull_operador');
        if (salvo && salvo.trim() !== '') {
            operadorAtivo = salvo;
            if (nomeOperadorHeader) nomeOperadorHeader.innerText = operadorAtivo;
            if (modalOperador) modalOperador.style.display = 'none';
        } else {
            if (modalOperador) modalOperador.style.display = 'flex';
            if (inputNomeOperador) inputNomeOperador.focus();
        }
    }

    if (btnEntrarPainel) {
        btnEntrarPainel.addEventListener('click', () => {
            const nomeInput = inputNomeOperador.value.trim();
            if (nomeInput === '') {
                inputNomeOperador.style.borderColor = 'var(--danger)';
                return;
            }
            localStorage.setItem('dashfull_operador', nomeInput);
            operadorAtivo = nomeInput;
            if (nomeOperadorHeader) nomeOperadorHeader.innerText = operadorAtivo;
            if (modalOperador) modalOperador.style.display = 'none';
            atualizarPainelCompleto();
        });
    }

    if (displayOperadorClick) {
        displayOperadorClick.addEventListener('click', () => {
            localStorage.removeItem('dashfull_operador');
            inputNomeOperador.value = operadorAtivo;
            verificarOperador();
        });
    }

    // ---- SIDEBAR & MOBILE ----
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            toggleIcon.className = sidebar.classList.contains('collapsed') ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
        });
    }

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(i => i.classList.remove('active'));
            pagePanes.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            const targetPage = item.getAttribute('data-page');
            const pageEl = document.getElementById(`page-${targetPage}`);
            if (pageEl) pageEl.classList.add('active');

            if (targetPage === 'visao-geral') {
                if (headerTitle) headerTitle.innerText = 'Painel de Controle';
                if (headerSubtitle) headerSubtitle.innerText = 'Monitoramento de envios em tempo real';
            } else if (targetPage === 'pendencias') {
                if (headerTitle) headerTitle.innerText = 'Gestão de Pendências';
                if (headerSubtitle) headerSubtitle.innerText = 'Controle de auditoria e quebras do Full';
            }
        });
    });

    // mobile sidebar backdrop
    let sidebarBackdrop = document.getElementById('sidebar-backdrop');
    if (!sidebarBackdrop) {
      sidebarBackdrop = document.createElement('div');
      sidebarBackdrop.id = 'sidebar-backdrop';
      document.body.appendChild(sidebarBackdrop);
    }

    function abrirSidebarMobile() {
      if (!sidebar) return;
      sidebar.classList.add('open');
      sidebarBackdrop.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
    function fecharSidebarMobile() {
      if (!sidebar) return;
      sidebar.classList.remove('open');
      sidebarBackdrop.classList.remove('show');
      document.body.style.overflow = '';
    }

    if (btnOpenMenuMobile) {
      btnOpenMenuMobile.addEventListener('click', (e) => {
        e.stopPropagation();
        if (sidebar.classList.contains('open')) fecharSidebarMobile();
        else abrirSidebarMobile();
      });
      btnOpenMenuMobile.style.display = '';
    }

    sidebarBackdrop.addEventListener('click', fecharSidebarMobile);

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) {
        if (sidebar) sidebar.classList.remove('open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('show');
        document.body.style.overflow = '';
      }
    });

    // ---- FIREBASE ----
    const FIREBASE_BASE = 'https://dashfulll-2321b-default-rtdb.firebaseio.com';

    async function carregarDadosDoBack() {
        try {
            const res = await fetch(`${FIREBASE_BASE}/historico_envios.json`);
            const data = await res.json();
            if (!data) { dadosLocais = []; atualizarPainelCompleto(); return; }

            const listaFormatada = Object.keys(data).map(id => data[id]);
            listaFormatada.sort((a, b) => new Date(b.data) - new Date(a.data));
            dadosLocais = listaFormatada;
            atualizarPainelCompleto();
        } catch (err) {
            console.error("Erro ao conectar ao Firebase:", err);
        }
    }

    async function carregarDadosSilent() {
        try {
            const res = await fetch(`${FIREBASE_BASE}/historico_envios.json`);
            const data = await res.json();
            if (!data) return;

            const listaFormatada = Object.keys(data).map(id => data[id]);
            listaFormatada.sort((a, b) => new Date(b.data) - new Date(a.data));

            if (JSON.stringify(dadosLocais) !== JSON.stringify(listaFormatada)) {
                dadosLocais = listaFormatada;
                atualizarPainelCompleto();
            }
        } catch (err) {
            // silent fail
        }
    }

    setInterval(carregarDadosSilent, 4000); // Checa o firebase a cada 4 segundos

    // ---- GRAVAÇÃO / AÇÕES GLOBAIS ----
    window.acionarBotao = async function(idEnvio, novoStatus, extra = {}) {
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}.json`;
        const agora = new Date();
        const dataAtual = agora.toLocaleDateString('pt-BR');
        const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const operador = operadorAtivo || 'Operador';
        const payload = {
            meu_status: novoStatus,
            operador: operador,
            hora_operacao: horaAtual,
            ultima_atualizacao_data: dataAtual,
            ultima_atualizacao_hora: horaAtual
        };

        if (novoStatus === 'Em Preparação') {
            payload.inicio_data = dataAtual;
            payload.inicio_hora = horaAtual;
            payload.inicio_operador = operador;
            payload.inicio_registro = `${dataAtual} ${horaAtual}`;
        }

        if (novoStatus === 'Concluído') {
            // NÃO FORÇAR motorista — apenas gravar conclusão metadata
            payload.conclusao_data = dataAtual;
            payload.conclusao_hora = horaAtual;
            payload.conclusao_operador = operador;
            payload.conclusao_registro = `${dataAtual} ${horaAtual}`;
            if (extra.motorista) payload.motorista = String(extra.motorista).trim();
        }

        Object.keys(extra || {}).forEach(k => {
            if (k !== 'motorista') payload[k] = extra[k];
        });

        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        await carregarDadosDoBack();
    };

    window.salvarMetaPrazo = async function(idEnvio, campo, valor) {
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}.json`;
        let dados = {}; dados[campo] = valor;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        // atualizar localmente (recarrega os dados)
        await carregarDadosDoBack();
    };

    window.marcarItemConferido = async function(idEnvio, sku, isChecked) {
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/itens/${sku}.json`;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferido: isChecked }) });
        await carregarDadosDoBack();
    };

    window.marcarDivergenciaItem = async function(idEnvio, sku, statusDivergencia) {
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/itens/${sku}.json`;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ divergencia: statusDivergencia }) });
        await carregarDadosDoBack();
    };


    window.atualizarQtdFeitaItem = async function(idEnvio, sku, valor) {
        const atual = (dadosLocais || []).find(x => String(x.id_envio) === String(idEnvio)) || {};
        const item = ((atual.itens || {})[sku]) || {};
        const declarado = Number(item.declarado) || 0;
        const qtdFeita = Math.max(0, Number(valor) || 0);
        const qtdFaltante = Math.max(0, declarado - qtdFeita);
        const statusControle = qtdFeita >= declarado && declarado > 0 ? 'Feito' : (qtdFeita > 0 ? 'Parcial' : (item.status_controle || 'Pendente'));
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/itens/${sku}.json`;
        await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                qtd_feita: qtdFeita,
                qtd_faltante: qtdFaltante,
                status_controle: statusControle,
                conferido: declarado > 0 && qtdFeita >= declarado,
                atualizado_em: new Date().toLocaleString('pt-BR')
            })
        });
        await carregarDadosDoBack();
    };

    window.salvarStatusControleItem = async function(idEnvio, sku, valor) {
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/itens/${sku}.json`;
        await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status_controle: valor || 'Pendente', atualizado_em: new Date().toLocaleString('pt-BR') })
        });
        await carregarDadosDoBack();
    };

    window.salvarObsItem = async function(idEnvio, sku, valor) {
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/itens/${sku}.json`;
        await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ observacao_item: String(valor || '').trim(), atualizado_em: new Date().toLocaleString('pt-BR') })
        });
    };

    // Salvar dados transporte + dificuldade + observacao (não exige motorista)
    window.salvarDadosTransporte = async function(idEnvio) {
        const motorEl = document.getElementById(`input-motorista-${idEnvio}`);
        const camEl = document.getElementById(`input-caminhao-${idEnvio}`);
        const difEl = document.getElementById(`input-dificuldade-${idEnvio}`);
        const obsEl = document.getElementById(`textarea-observacao-${idEnvio}`);

        const motorista = motorEl ? motorEl.value.trim() : '';
        const caminhao = camEl ? camEl.value.trim() : '';
        const dificuldade = difEl ? difEl.value : '';
        const observacao = obsEl ? obsEl.value.trim() : '';

        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}.json`;
        const dados = {
            motorista: motorista || '',
            caminhao_placa: caminhao || '',
            dificuldade: dificuldade || '',
            observacao: observacao || ''
        };
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        if (motorEl) motorEl.style.borderColor = '#cbd5e1';
        alert('Dados salvos.');
        await carregarDadosDoBack();
    };

    // Registrar tempo de preparação (início / fim)
    window.registrarTempoPreparacao = async function(idEnvio, tipo) {
        const campo = tipo === 'inicio' ? 'hora_inicio_preparacao' : 'hora_fim_preparacao';
        const valorLocal = new Date().toLocaleString('pt-BR');
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}.json`;
        let dados = {}; dados[campo] = valorLocal;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        alert(`${tipo === 'inicio' ? 'Início' : 'Fim'} de preparação registrado: ${valorLocal}`);
        await carregarDadosDoBack();
    };

    // ---- Atualizar equipe (versão robusta) ----
    window.atualizarEquipe = async function(idEnvioRaw) {
      try {
        const idEnvio = String(idEnvioRaw || '').replace(/[<> ]/g,'').trim();
        if (!idEnvio) { console.warn('[atualizarEquipe] id inválido:', idEnvioRaw); return; }
        console.log('[atualizarEquipe] inicio para', idEnvio);

        // encontra input de pessoas (exato ou parcial)
        let el = document.getElementById(`pessoas-input-${idEnvio}`);
        if (!el) el = document.querySelector(`[id*="${idEnvio}"][id^="pessoas-input-"], input[name="pessoas-${idEnvio}"], input[id$="${idEnvio}"]`);
        const valor = el ? Math.max(1, Number(el.value) || 1) : 1;
        console.log('[atualizarEquipe] valor pessoas =', valor, 'inputEncontrado:', !!el);

        if (typeof window.salvarMetaPrazo === 'function') {
          console.log('[atualizarEquipe] chamando salvarMetaPrazo...');
          await window.salvarMetaPrazo(idEnvio, 'pessoas_alocadas', valor);
          console.log('[atualizarEquipe] salvarMetaPrazo finalizado');
        } else {
          console.warn('[atualizarEquipe] salvarMetaPrazo não encontrada. Pulando gravação.');
        }

        // Helper para localizar elementos de estimativa (exato ou parcial)
        const findEstimElements = () => {
          const estimEl = document.getElementById(`estimativa-${idEnvio}`) || document.querySelector(`[id*="estimativa-${idEnvio}"], [id$="${idEnvio}"]`) || null;
          const minutosEl = document.getElementById(`estimativa-minutos-${idEnvio}`) || document.querySelector(`[id*="estimativa-minutos-${idEnvio}"], [id$="${idEnvio}"]`) || null;
          const horasEl = document.getElementById(`estimativa-horas-${idEnvio}`) || document.querySelector(`[id*="estimativa-horas-${idEnvio}"], [id$="${idEnvio}"]`) || null;
          const opsSpan = document.getElementById(`estimativa-ops-${idEnvio}`) || document.querySelector(`[id*="estimativa-ops-${idEnvio}"], [id$="${idEnvio}"]`) || null;
          return { estimEl, minutosEl, horasEl, opsSpan, inputEl: el };
        };

        const aplicarAtualizacaoDOM = () => {
          const { estimEl, minutosEl, horasEl, opsSpan } = findEstimElements();
          let total = 0, progresso = 0;

          if (estimEl) {
            total = Number(estimEl.getAttribute('data-total')) || total;
            progresso = Number(estimEl.getAttribute('data-progresso')) || progresso;
          } else {
            // tenta inferir total a partir do texto de minutos atual (se houver atributo)
            if (minutosEl && minutosEl.getAttribute('data-total')) total = Number(minutosEl.getAttribute('data-total')) || total;
          }

          const restante = Math.max(0, total - (progresso || 0));
          const minutosTotais = Math.ceil(restante * (typeof MINUTOS_POR_PECA !== 'undefined' ? MINUTOS_POR_PECA : 3));
          const horasEstimadas = (minutosTotais / 60 / (valor || 1));
          const tempoFormatadoLocal = (typeof formatarTempoEstimado === 'function') ? formatarTempoEstimado(minutosTotais) : `${minutosTotais} min`;

          if (estimEl) {
            estimEl.setAttribute('data-restante', restante);
            estimEl.setAttribute('data-progresso', progresso);
            estimEl.innerText = `Feitas: ${progresso} — Faltam: ${restante} • ⏳ Est: ${tempoFormatadoLocal} / ${valor} Ops`;
            console.log('[atualizarEquipe] updated estimativa-inline:', estimEl.innerText);
          }
          if (minutosEl) {
            minutosEl.innerText = `${minutosTotais} min`;
            console.log('[atualizarEquipe] updated minutosEl:', minutosEl.innerText);
          }
          if (horasEl) {
            horasEl.innerText = `${horasEstimadas.toFixed(1)} h`;
            console.log('[atualizarEquipe] updated horasEl:', horasEl.innerText);
          }
          if (opsSpan) {
            opsSpan.innerText = `${valor}`;
            console.log('[atualizarEquipe] updated opsSpan:', opsSpan.innerText);
          }

          return { estimElExists: !!estimEl, minutosElExists: !!minutosEl, horasElExists: !!horasEl };
        };

        // tenta aplicar de imediato
        let res = aplicarAtualizacaoDOM();

        // se faltou algum elemento, tenta por alguns ciclos (em caso de re-render assíncrono)
        if (!res.estimElExists || !res.minutosElExists || !res.horasElExists) {
          console.log('[atualizarEquipe] elementos não encontrados imediatamente; fazendo retries curtos...');
          let attempts = 0;
          const timer = setInterval(() => {
            attempts++;
            res = aplicarAtualizacaoDOM();
            if ((res.estimElExists && res.minutosElExists && res.horasElExists) || attempts >= 10) {
              clearInterval(timer);
              console.log('[atualizarEquipe] retries finalizados, tentativas=', attempts, 'res=', res);
            }
          }, 250);
        }

        console.log('[atualizarEquipe] fim para', idEnvio);
      } catch (err) {
        console.error('[atualizarEquipe] erro:', err);
      }
    };

    // ---- ADIÇÃO / PENDÊNCIAS / PROGRESSO ----
    window.adicionarProgresso = async function(idEnvio, produto, quantidade) {
        produto = String(produto || '').trim();
        quantidade = Number(quantidade) || 0;
        if (!produto || quantidade <= 0) { alert('Informe produto e quantidade válida'); return; }
        const key = 'p' + Date.now();
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/progresso/${key}.json`;
        const payload = { produto: produto, quantidade: quantidade, timestamp: new Date().toLocaleString('pt-BR'), operador: operadorAtivo || '' };
        await fetch(url, { method: 'PUT', headers:{ 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const prodInput = document.getElementById(`input-produto-${idEnvio}`);
        const quantInput = document.getElementById(`input-quant-${idEnvio}`);
        if (prodInput) prodInput.value = '';
        if (quantInput) quantInput.value = '';
        await carregarDadosDoBack();
    };

    window.removerProgresso = async function(idEnvio, key) {
        if (!confirm('Remover registro parcial?')) return;
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/progresso/${key}.json`;
        await fetch(url, { method: 'DELETE' });
        await carregarDadosDoBack();
    };

    window.reportarPendencia = async function(idEnvio, produto, quantidade) {
        produto = String(produto || '').trim();
        quantidade = Number(quantidade);
        if (!produto && (!quantidade || quantidade <= 0)) { alert('Informe produto ou quantidade.'); return; }
        const key = 'd' + Date.now();
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/pendencias/${key}.json`;
        const payload = { produto: produto || null, quantidade: (Number.isFinite(quantidade) ? quantidade : null), timestamp: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR'), operador: operadorAtivo || '' };
        await fetch(url, { method: 'PUT', headers:{ 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const prodInput = document.getElementById(`input-pend-prod-${idEnvio}`);
        const quantInput = document.getElementById(`input-pend-quant-${idEnvio}`);
        if (prodInput) prodInput.value = '';
        if (quantInput) quantInput.value = '';
        await carregarDadosDoBack();
    };

    window.removerPendencia = async function(idEnvio, key) {
        if (!confirm('Remover pendência reportada?')) return;
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/pendencias/${key}.json`;
        await fetch(url, { method: 'DELETE' });
        await carregarDadosDoBack();
    };
// Voltar envio para "Pendente" (remover marcação de início)
window.reverterParaPendente = async function(idEnvio) {
  if (!confirm('Deseja realmente voltar este envio para Pendente? Isso removerá o registro de início.')) return;
  try {
    const agora = new Date();
    const dataAtual = agora.toLocaleDateString('pt-BR');
    const horaAtual = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const operador = operadorAtivo || 'Operador';
    const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}.json`;
    const payload = {
      meu_status: 'Pendente',
      inicio_data: null,
      inicio_hora: null,
      inicio_operador: null,
      inicio_registro: null,
      ultima_atualizacao_data: dataAtual,
      ultima_atualizacao_hora: horaAtual,
      operador: operador
    };
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await carregarDadosDoBack();
    alert('Envio retornado para Pendente.');
  } catch (err) {
    console.error('Erro ao reverter para Pendente', err);
    alert('Erro ao reverter envio. Veja o console para detalhes.');
  }
};
    window.reverterParaPreparacao = async function(idEnvio) {
        if (!confirm('Confirmar reverter o envio para "Em Preparação"?')) return;
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}.json`;
        const payload = {
            meu_status: 'Em Preparação',
            conclusao_data: null,
            conclusao_hora: null,
            conclusao_operador: null,
            conclusao_registro: null
        };
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        await carregarDadosDoBack();
    };

    // ---- FILTROS E RENDER ----
    function atualizarPainelCompleto() {
        filtrarEProcessarDados();

        const pendentes = dadosLocais.filter(item => item.status === 'closed_with_changes' || Number(item.unidades_recebidas || 0) < Number(item.unidades_declaradas || 0));
        if (badgePendenciasNav) badgePendenciasNav.innerText = pendentes.length;
        renderizarTabelaPendencias(pendentes);

        const countTodos = document.getElementById('count-todos');
        const countFinalizados = document.getElementById('count-finalizados');
        const countConcluidos = document.getElementById('count-concluidos');
        const countDivergencias = document.getElementById('count-divergencias');
        const countAgendados = document.getElementById('count-agendados');
        const countPreparacao = document.getElementById('count-preparacao');
        const countPendenciasReport = document.getElementById('count-pendencias-report');

        if (countTodos) countTodos.innerText = `(${dadosLocais.length})`;
        if (countFinalizados) countFinalizados.innerText = `(${dadosLocais.filter(i => i.status === 'closed_ok').length})`;
        if (countConcluidos) countConcluidos.innerText = `(${dadosLocais.filter(i => i.meu_status === 'Concluído').length})`;
        if (countDivergencias) countDivergencias.innerText = `(${dadosLocais.filter(i => i.status === 'closed_with_changes').length})`;
        // <-- ALTERAÇÃO: exclui envios com "Em Preparação" do contador de Agendados
        if (countAgendados) countAgendados.innerText = `(${dadosLocais.filter(i => i.meu_status !== 'Concluído' && i.status !== 'closed_ok' && i.status !== 'closed_with_changes' && i.status !== 'cancelled' && !String(i.meu_status || '').toLowerCase().includes('prepar')).length})`;
        if (countPreparacao) countPreparacao.innerText = `(${dadosLocais.filter(i => String(i.meu_status || '').toLowerCase() === 'em preparação'.toLowerCase()).length})`;
        if (countPendenciasReport) countPendenciasReport.innerText = `(${dadosLocais.filter(i => i.pendencias && Object.keys(i.pendencias).length > 0).length})`;

        // Atualiza o painel de motoristas com filtro de mês atual do seletor
        atualizarResumoMotoristas(dadosLocais);

        renderizarGraficosDinâmicos(dadosLocais);
    }

    function normalizarBusca(valor) {
        return String(valor || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .trim();
    }


    function resumoStatusItens(item) {
        const itens = item.itens || {};
        const totalItens = Object.keys(itens).length;
        const flagAtualizar = item.itens_precisa_atualizar === true;
        const erro = item.itens_ultimo_erro && item.itens_ultimo_erro.mensagem ? item.itens_ultimo_erro.mensagem : '';
        const atualizadoEm = item.itens_atualizados_em || '';

        if (totalItens > 0 && flagAtualizar) {
            return {
                classe: 'sync-warning',
                titulo: 'Itens carregados, atualização pendente',
                texto: `${totalItens} itens • aguardando revisão`,
                detalhe: item.motivo_atualizacao_itens || 'Envio alterado'
            };
        }

        if (totalItens > 0) {
            return {
                classe: 'sync-ok',
                titulo: 'Itens processados',
                texto: `${totalItens} itens carregados`,
                detalhe: atualizadoEm ? `Atualizado: ${new Date(atualizadoEm).toLocaleString('pt-BR')}` : 'Gravado no Firebase'
            };
        }

        if (flagAtualizar) {
            return {
                classe: 'sync-running',
                titulo: 'Na fila de processamento',
                texto: 'Aguardando worker',
                detalhe: item.motivo_atualizacao_itens || 'Será processado automaticamente'
            };
        }

        if (erro) {
            return {
                classe: 'sync-error',
                titulo: 'Erro ao buscar itens',
                texto: 'Tentará novamente',
                detalhe: erro
            };
        }

        return {
            classe: 'sync-pending',
            titulo: 'Itens ainda não carregados',
            texto: 'Em processo',
            detalhe: 'Worker Easypanel ainda vai buscar'
        };
    }

    function filtroBaseSemPill(item, query, contaSelecionada, galpaoSelecionado) {
        const bateConta = (contaSelecionada === 'Todas' || item.conta === contaSelecionada);
        const bateGalpao = (galpaoSelecionado === 'Todos' || item.galpao === galpaoSelecionado);
        const bateBusca = itemBateBusca(item, query);
        return bateConta && bateGalpao && bateBusca;
    }

    function itemBatePill(item) {
        if (statusPillAtivo === 'closed_ok') return (item.status === 'closed_ok');
        if (statusPillAtivo === 'concluidos') return (item.meu_status === 'Concluído');
        if (statusPillAtivo === 'pending') return (item.meu_status !== 'Concluído' && item.status !== 'closed_ok' && item.status !== 'closed_with_changes' && item.status !== 'cancelled' && !String(item.meu_status || '').toLowerCase().includes('prepar'));
        if (statusPillAtivo === 'closed_with_changes') return (item.status === 'closed_with_changes');
        if (statusPillAtivo === 'in_preparacao') return (String(item.meu_status || '').toLowerCase() === 'em preparação'.toLowerCase());
        if (statusPillAtivo === 'pendencia') return (item.pendencias && Object.keys(item.pendencias).length > 0);
        return true;
    }


    function itemBateBusca(item, query) {
        if (!query) return true;

        const base = [
            item.id_envio,
            item.id,
            item.conta,
            item.galpao,
            item.status,
            item.meu_status,
            item.operador,
            item.observacao
        ].map(normalizarBusca).join(' ');

        if (base.includes(query)) return true;

        const itens = item.itens || {};
        return Object.keys(itens).some(sku => {
            const prod = itens[sku] || {};
            const extra = [
                sku,
                prod.sku,
                prod.titulo,
                prod.item_id,
                prod.inventory_id,
                prod.observacao_item,
                prod.status_controle
            ].map(normalizarBusca).join(' ');
            return extra.includes(query);
        });
    }

    function filtrarEProcessarDados() {
        const query = normalizarBusca((buscaId && buscaId.value) ? buscaId.value : '');
        const contaSelecionada = filtroConta ? filtroConta.value : 'Todas';
        const galpaoSelecionado = filtroGalpao ? filtroGalpao.value : 'Todos';
        const ordemSelecionada = ordenarData ? ordenarData.value : 'recente';

        // Primeiro aplica loja/galpão/busca.
        // Os números das pills precisam respeitar estes filtros, senão aparece "tem 19"
        // mas a tabela fica vazia quando a loja selecionada não possui aqueles envios.
        const baseFiltrada = dadosLocais.filter(item => filtroBaseSemPill(item, query, contaSelecionada, galpaoSelecionado));

        atualizarContadoresPills(baseFiltrada);

        dadosFiltradosAtuais = baseFiltrada.filter(item => itemBatePill(item));

        dadosFiltradosAtuais.sort((a, b) => {
            return ordemSelecionada === 'recente' ? new Date(b.data) - new Date(a.data) : new Date(a.data) - new Date(b.data);
        });

        paginaAtual = 1;
        recalcularEExibirPagina();
    }


    function setTextoSeguro(id, texto) {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    }

    function atualizarContadoresPills(base) {
        const total = base.length;
        const finalizados = base.filter(i => i.status === 'closed_ok').length;
        const concluidos = base.filter(i => i.meu_status === 'Concluído').length;
        const divergencias = base.filter(i => i.status === 'closed_with_changes').length;
        const agendados = base.filter(i => i.meu_status !== 'Concluído' && i.status !== 'closed_ok' && i.status !== 'closed_with_changes' && i.status !== 'cancelled' && !String(i.meu_status || '').toLowerCase().includes('prepar')).length;
        const pendencias = base.filter(i => i.pendencias && Object.keys(i.pendencias).length > 0).length;
        const emPreparacao = base.filter(i => String(i.meu_status || '').toLowerCase() === 'em preparação'.toLowerCase()).length;

        setTextoSeguro('count-todos', `(${total})`);
        setTextoSeguro('count-finalizados', `(${finalizados})`);
        setTextoSeguro('count-concluidos', `(${concluidos})`);
        setTextoSeguro('count-divergencias', `(${divergencias})`);
        setTextoSeguro('count-agendados', `(${agendados})`);
        setTextoSeguro('count-pendencias', `(${pendencias})`);
        setTextoSeguro('count-em-preparacao', `(${emPreparacao})`);
    }


    function recalcularEExibirPagina() {
        const totalItens = dadosFiltradosAtuais.length;
        const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1;

        if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

        const indiceInicio = (paginaAtual - 1) * itensPorPagina;
        const indiceFim = Math.min(indiceInicio + itensPorPagina, totalItens);
        const dadosPaginados = dadosFiltradosAtuais.slice(indiceInicio, indiceFim);

        if (paginacaoInfo) paginacaoInfo.innerText = totalItens > 0 ? `Exibindo ${indiceInicio + 1}-${indiceFim} de ${totalItens} envios` : `Exibindo 0-0 de 0 envios`;

        renderizarTabelaGeral(dadosPaginados);
        recalcularCardsKPI(dadosFiltradosAtuais);
        construirBotoesPagina(totalPaginas);
    }

    function construirBotoesPagina(totalPaginas) {
        if (!paginacaoBotoes) return;
        paginacaoBotoes.innerHTML = '';
        if (totalPaginas <= 1) return;

        const btnVoltar = document.createElement('button');
        btnVoltar.innerHTML = '<i class="fa-solid fa-angle-left"></i>';
        btnVoltar.disabled = paginaAtual === 1;
        btnVoltar.addEventListener('click', () => { paginaAtual--; recalcularEExibirPagina(); });
        paginacaoBotoes.appendChild(btnVoltar);

        for (let idx = 1; idx <= totalPaginas; idx++) {
            const btnNum = document.createElement('button');
            btnNum.innerText = idx;
            if (idx === paginaAtual) btnNum.classList.add('active');
            btnNum.addEventListener('click', () => { paginaAtual = idx; recalcularEExibirPagina(); });
            paginacaoBotoes.appendChild(btnNum);
        }

        const btnAvancar = document.createElement('button');
        btnAvancar.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
        btnAvancar.disabled = paginaAtual === totalPaginas;
        btnAvancar.addEventListener('click', () => { paginaAtual++; recalcularEExibirPagina(); });
        paginacaoBotoes.appendChild(btnAvancar);
    }

    // ---- RENDER DA TABELA GERAL (COM DETALHE) ----
    function renderizarTabelaGeral(envios) {
        if (!tbodyGeral) return;
        tbodyGeral.innerHTML = '';

        if (envios.length === 0) {
            tbodyGeral.innerHTML = '<tr><td colspan="8" class="empty-state-row"><div class="empty-state-card"><strong>Nenhum envio localizado com estes filtros.</strong><span>Troque a loja, status ou limpe a busca. Os números das abas agora consideram o filtro atual.</span></div></td></tr>';
            return;
        }

        envios.forEach(item => {
            const statusHumano = item.meu_status || 'Pendente';
            let corBadge = '#6b7280';
            if (statusHumano === 'Finalizado' || statusHumano === 'Concluído') corBadge = '#10b981';
            if (statusHumano === 'Em Preparação') corBadge = '#e67e22';

            const dataLimite = item.data_limite_pronto || '';
            const horaLimite = item.hora_limite_pronto || '';
            const totalPecas = Number(item.unidades_declaradas) || 0;

            // Progresso parcial (soma das quantidades adicionadas)
            const progressoObj = item.progresso || item.progresso_parcial || {};
            let totalProgresso = 0;
            Object.keys(progressoObj).forEach(k => { totalProgresso += Number(progressoObj[k].quantidade) || 0; });
            const restantePecas = Math.max(0, totalPecas - totalProgresso);

            // Pendências existentes
            const pendenciasObj = item.pendencias || {};
            let totalPendenciasCount = 0;
            Object.keys(pendenciasObj).forEach(k => { totalPendenciasCount++; });

            // Tempo estimado considera o restante (peças ainda faltantes)
            const tempoEstimadoMinutos = Math.ceil(restantePecas * MINUTOS_POR_PECA);
            const pessoasAlocadas = Number(item.pessoas_alocadas) || 1;
            const tempoPorPessoaMin = Math.ceil(tempoEstimadoMinutos / pessoasAlocadas);
            const tempoFormatado = formatarTempoEstimado(tempoEstimadoMinutos);

            let statusLabel = 'Agendado';
            let statusClass = 'badge-azul';
            if (item.status === 'closed_ok') { statusLabel = 'Finalizado'; statusClass = 'badge-verde'; }
            else if (item.status === 'closed_with_changes') { statusLabel = 'Divergência'; statusClass = 'badge-laranja'; }
            else if (item.status === 'cancelled') { statusLabel = 'Cancelado'; statusClass = 'badge-vermelho'; }

            const dataObjeto = new Date(item.data);
            const dataFormatada = isNaN(dataObjeto.getTime()) ? '' : dataObjeto.toLocaleDateString('pt-BR');
            const horaFormatada = isNaN(dataObjeto.getTime()) ? '' : dataObjeto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const pendBadgeHtml = totalPendenciasCount > 0 ? `<div style="background:#ef4444; color:white; padding:2px 6px; border-radius:4px; font-size:10px; display:inline-block; margin-top:6px;">🚨 PENDÊNCIA (${totalPendenciasCount})</div>` : '';

            const itemSync = resumoStatusItens(item);

            const inicioInfo = item.inicio_registro ? `<div style="font-size:11px; color:#6b7280;">Início: ${item.inicio_registro} • ${item.inicio_operador || ''}</div>` : '';
            const conclusaoInfo = item.conclusao_registro ? `<div style="font-size:11px; color:#6b7280;">Conclusão: ${item.conclusao_registro} • ${item.conclusao_operador || ''}${item.motorista ? ' • Motorista: ' + item.motorista : ''}${item.caminhao_placa ? ' • Caminhão: ' + item.caminhao_placa : ''}</div>` : (item.motorista || item.caminhao_placa ? `<div style="font-size:11px; color:#6b7280;">${item.motorista ? 'Motorista: ' + item.motorista : ''} ${item.caminhao_placa ? '• Caminhão: ' + item.caminhao_placa : ''}</div>` : '');

            const trPrincipal = document.createElement('tr');
            trPrincipal.style.cursor = 'pointer';
            trPrincipal.className = 'linha-envio-mestra';
            let revertBtnHtml = '';
            const statusLower = String(statusHumano || '').toLowerCase();
            if (statusLower === 'concluído' || statusLower === 'concluido') {
                revertBtnHtml = `<button class="btn-action" style="padding:6px 10px; background:#f3f4f6; border:1px solid #e5e7eb;" onclick="event.stopPropagation(); window.reverterParaPreparacao('${item.id_envio}')">Reverter</button>`;
            }

            // Novo: botão para Voltar p/ Pendente quando estiver Em Preparação
            let voltarParaPendenteBtnHtml = '';
            if (statusLower.includes('prepar')) {
              voltarParaPendenteBtnHtml = `<button class="btn-action btn-voltar-pendente" style="padding:6px 10px; background:#f3f4f6; border:1px solid #e5e7eb;" onclick="event.stopPropagation(); window.reverterParaPendente('${item.id_envio}')">Voltar p/ Pendente</button>`;
            }

            trPrincipal.innerHTML = `
                <td>
                  <div class="label">Conta</div>
                  <div class="value"><strong>${item.conta || '—'}</strong></div>
                </td>
                <td>
                  <div class="label">Envio</div>
                  <div class="value">#${item.id_envio || item.id || '—'} <i class="fa-solid fa-chevron-down" style="font-size:10px; margin-left:5px; color:#3483fa;"></i></div>
                </td>
                <td>
                  <div class="label">Status ML</div>
                  <div class="value"><span class="status-badge ${statusClass}">${statusLabel}</span></div>
                </td>
                <td>
                  <div class="label">Status Local</div>
                  <div class="value">
                    <div style="display:flex; flex-direction:column; gap:6px;">
                    <span style="display:inline-block; background:${corBadge}; color:white; padding:4px 8px; border-radius:6px; font-weight:700; font-size:12px;">${statusHumano}</span>
                    <div style="font-size: 11px; color: #6b7280;">👤 ${item.operador || '—'} ${item.hora_operacao ? '• ' + item.hora_operacao : ''}</div>
                    ${inicioInfo}
                    ${conclusaoInfo}
                    ${pendBadgeHtml}
                    </div>
                  </div>
                </td>
                <td>
                  <div class="label">Quantidade</div>
                  <div class="value">
                    <strong>${totalPecas}</strong> peças<br>
                    <small id="estimativa-${item.id_envio}" style="color:#6b7280;"
                    data-total="${totalPecas}"
                    data-progresso="${totalProgresso}"
                    data-restante="${restantePecas}"
                    >
                    Feitas: ${totalProgresso} — Faltam: ${restantePecas} • ⏳ Est: ${tempoFormatado} / ${pessoasAlocadas} Ops
                    </small>
                    <div class="item-sync-pill ${itemSync.classe}" title="${itemSync.detalhe || ''}">
                      <span class="sync-dot-mini"></span>
                      <strong>${itemSync.titulo}</strong>
                      <small>${itemSync.texto}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="label">Galpão</div>
                  <div class="value">
                    <span class="galpao-tag">${item.galpao || '—'}</span>
                    <div style="margin-top:6px;">
                    <select id="input-dificuldade-${item.id_envio}" onchange="window.salvarDadosTransporte('${item.id_envio}')" style="font-size:11px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; outline:none; width:100%;" onclick="event.stopPropagation()">
                    <option value="">Dificuldade</option>
                    <option value="Fácil" ${item.dificuldade === 'Fácil' ? 'selected' : ''}>Fácil</option>
                    <option value="Médio" ${item.dificuldade === 'Médio' ? 'selected' : ''}>Médio</option>
                    <option value="Difícil" ${item.dificuldade === 'Difícil' ? 'selected' : ''}>Difícil</option>
                    </select>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="label">Data / Prazo</div>
                  <div class="value">
                    <div style="margin-bottom:6px;"><strong>${dataFormatada}</strong> <span style="color:#6b7280; font-size:12px;">${horaFormatada}</span></div>
                    <div style="display:flex; flex-direction:column; gap:4px; background-color: #f8fafc; padding: 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <span style="font-size: 9px; font-weight: bold; color: #475569;">PRAZO INTERNO:</span>
                    <input type="date" value="${dataLimite}" onchange="window.salvarMetaPrazo('${item.id_envio}', 'data_limite_pronto', this.value)" style="font-size:11px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; outline:none;" onclick="event.stopPropagation()">
                    <input type="time" value="${horaLimite}" onchange="window.salvarMetaPrazo('${item.id_envio}', 'hora_limite_pronto', this.value)" style="font-size:11px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; outline:none;" onclick="event.stopPropagation()">
                    </div>
                  </div>
                </td>
                <td>
                  <div class="label">Ações</div>
                  <div class="value text-center" onclick="event.stopPropagation()">
                    <div style="display:flex; gap:6px; justify-content:center;">
                    <button class="btn-action btn-preparar" style="padding:6px 10px;" onclick="event.stopPropagation(); window.acionarBotao('${item.id_envio}', 'Em Preparação')">Iniciar</button>
                    <button class="btn-action primary btn-concluir" style="padding:6px 10px;" onclick="event.stopPropagation(); window.acionarBotao('${item.id_envio}', 'Concluído')">Concluir</button>
                    ${revertBtnHtml}
                    ${voltarParaPendenteBtnHtml}
                    </div>
                  </div>
                </td>
            `;

            // LINHA DETALHE (GAVETA)
            const trDetalhe = document.createElement('tr');
            trDetalhe.className = 'linha-detalhe-itens';
            trDetalhe.style.display = 'none';
            trDetalhe.style.backgroundColor = '#f8fafc';

            // Itens HTML (layout moderno)
            let itensHtml = '';
            let resumoItensHtml = '';
            const listaItens = (item.itens && Object.keys(item.itens).length > 0) ? item.itens : null;
            if (listaItens) {
                const itensEntries = Object.entries(listaItens);
                let feitos = 0, parciais = 0, naoFeitos = 0, semMarcar = 0;

                itensHtml += `
                    <div class="items-board-v2">
                        <div class="items-board-head">
                            <div>Item</div>
                            <div>Declarado</div>
                            <div>Qtd feita</div>
                            <div>Status</div>
                            <div>Observação</div>
                        </div>
                        <div class="items-board-body">`;

                itensEntries.forEach(([sku, prod]) => {
                    prod = prod || {};
                    const declarado = Number(prod.declarado) || 0;
                    const qtdFeita = Number(prod.qtd_feita) || 0;
                    const statusControle = String(prod.status_controle || 'Pendente');
                    const conferido = !!prod.conferido || (declarado > 0 && qtdFeita >= declarado);
                    const itemIdInfo = prod.item_id || prod.inventory_id || '';
                    const obsSafe = String(prod.observacao_item || '').replace(/"/g, '&quot;');

                    if (conferido || statusControle === 'Feito') feitos++;
                    else if (qtdFeita > 0 || statusControle === 'Parcial') parciais++;
                    else naoFeitos++;
                    if (!prod.status_controle || statusControle === 'Pendente') semMarcar++;

                    itensHtml += `
                        <div class="item-row-v2 ${conferido ? 'done' : ''}">
                            <div class="item-main-v2">
                                <input type="checkbox" ${conferido ? 'checked' : ''} onchange="window.marcarItemConferido('${item.id_envio}', '${sku}', this.checked)">
                                <div class="item-copy-v2">
                                    <div class="item-sku-v2">[${sku}]</div>
                                    <div class="item-title-v2">${prod.titulo || ''}</div>
                                    <div class="item-sub-v2">${itemIdInfo}</div>
                                </div>
                            </div>
                            <div class="item-cell-v2 declared">
                                <span class="field-label-v2">Declarado</span>
                                <strong>${declarado} un</strong>
                            </div>
                            <div class="item-cell-v2">
                                <span class="field-label-v2">Qtd feita</span>
                                <input class="field-input-v2" type="number" min="0" value="${qtdFeita}" onchange="window.atualizarQtdFeitaItem('${item.id_envio}', '${sku}', this.value)">
                            </div>
                            <div class="item-cell-v2">
                                <span class="field-label-v2">Status</span>
                                <select class="field-input-v2" onchange="window.salvarStatusControleItem('${item.id_envio}', '${sku}', this.value)">
                                    <option value="Pendente" ${statusControle === 'Pendente' ? 'selected' : ''}>Pendente</option>
                                    <option value="Parcial" ${statusControle === 'Parcial' ? 'selected' : ''}>Parcial</option>
                                    <option value="Feito" ${statusControle === 'Feito' ? 'selected' : ''}>Feito</option>
                                    <option value="Não Feito" ${statusControle === 'Não Feito' ? 'selected' : ''}>Não Feito</option>
                                </select>
                            </div>
                            <div class="item-cell-v2">
                                <span class="field-label-v2">Obs.</span>
                                <input class="field-input-v2" type="text" placeholder="Ex: caixa avariada" value="${obsSafe}" onblur="window.salvarObsItem('${item.id_envio}', '${sku}', this.value)">
                            </div>
                        </div>`;
                });

                itensHtml += `</div></div>`;
                resumoItensHtml = `
                    <div class="items-summary-v2">
                        <div class="summary-chip-v2"><strong>${itensEntries.length}</strong><span>itens</span></div>
                        <div class="summary-chip-v2 green"><strong>${feitos}</strong><span>feitos</span></div>
                        <div class="summary-chip-v2 blue"><strong>${parciais}</strong><span>parciais</span></div>
                        <div class="summary-chip-v2 red"><strong>${naoFeitos}</strong><span>não feitos</span></div>
                        <div class="summary-chip-v2 amber"><strong>${semMarcar}</strong><span>sem marcar</span></div>
                    </div>`;
            }

            // Progresso e Pendencias lists
            let progressoHtml = '';
            Object.keys(progressoObj || {}).forEach(key => {
                const p = progressoObj[key];
                const ts = p.timestamp || '';
                progressoHtml += `
                    <div style="display:flex; justify-content:space-between; padding:6px 12px; border-bottom:1px solid #f1f5f9; gap:10px;">
                    <div style="font-size:13px; color:#374151;">
                    <strong>${p.produto || '—'}</strong><br>
                    <small style="color:#6b7280;">${ts}</small>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                    <span style="font-weight:800; color:#475569;">${p.quantidade || 0} un</span>
                    <button class="btn-action" style="padding:6px 8px;" onclick="event.stopPropagation(); window.removerProgresso('${item.id_envio}', '${key}')">Remover</button>
                    </div>
                    </div>`;
            });

            let pendenciasHtml = '';
            Object.keys(pendenciasObj || {}).forEach(key => {
                const d = pendenciasObj[key];
                const ts = d.timestamp || '';
                pendenciasHtml += `
                    <div style="display:flex; justify-content:space-between; padding:6px 12px; border-bottom:1px solid #ffecec; gap:10px; background:#fff7f7;">
                    <div style="font-size:13px; color:#611a15;">
                    <strong>${d.produto || '—'}</strong><br>
                    <small style="color:#6b7280;">${ts}</small>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                    <span style="font-weight:800; color:#611a15;">${d.quantidade != null ? d.quantidade + ' un' : 'Qtd não informada'}</span>
                    <button class="btn-action" style="padding:6px 8px;" onclick="event.stopPropagation(); window.removerPendencia('${item.id_envio}', '${key}')">Remover</button>
                    </div>
                    </div>`;
            });

            const isConcluido = statusLower === 'concluído' || statusLower === 'concluido';

            const adicaoSection = isConcluido ? `
                <div class="detail-empty-v2">Envio concluído — produção parcial bloqueada.</div>
            ` : `
                <div class="detail-card-v2">
                    <div class="detail-card-head-v2">
                        <h4>Adição rápida</h4>
                        <p>Lance produção parcial por produto.</p>
                    </div>
                    <div class="stack-form-v2">
                        <input id="input-produto-${item.id_envio}" type="text" placeholder="Nome ou código do produto" class="field-input-v2" onclick="event.stopPropagation()">
                        <div class="inline-form-v2">
                            <input id="input-quant-${item.id_envio}" type="number" min="1" placeholder="Qtd feita" class="field-input-v2" onclick="event.stopPropagation()">
                            <button class="btn-action primary" onclick="event.stopPropagation(); window.adicionarProgresso('${item.id_envio}', document.getElementById('input-produto-${item.id_envio}').value, document.getElementById('input-quant-${item.id_envio}').value);">Adicionar</button>
                        </div>
                    </div>
                    <div class="list-box-v2">
                        ${progressoHtml || '<div class="empty-list-v2">Nenhum registro de produção parcial.</div>'}
                    </div>
                </div>`;

            const pendenciaSection = isConcluido ? `
                <div class="detail-empty-v2">Envio concluído — pendências operacionais bloqueadas.</div>
            ` : `
                <div class="detail-card-v2">
                    <div class="detail-card-head-v2">
                        <h4>Pendências</h4>
                        <p>Registre produto ausente, divergência ou falta.</p>
                    </div>
                    <div class="stack-form-v2">
                        <input id="input-pend-prod-${item.id_envio}" type="text" placeholder="Produto ausente / código" class="field-input-v2 danger" onclick="event.stopPropagation()">
                        <div class="inline-form-v2">
                            <input id="input-pend-quant-${item.id_envio}" type="number" min="0" placeholder="Qtd faltando" class="field-input-v2 danger" onclick="event.stopPropagation()">
                            <button class="btn-action btn-danger-v2" onclick="event.stopPropagation(); window.reportarPendencia('${item.id_envio}', document.getElementById('input-pend-prod-${item.id_envio}').value, document.getElementById('input-pend-quant-${item.id_envio}').value);">Reportar</button>
                        </div>
                    </div>
                    <div class="list-box-v2 danger">
                        ${pendenciasHtml || '<div class="empty-list-v2">Nenhuma pendência reportada.</div>'}
                    </div>
                </div>`;

            const valorMotorista = item.motorista || '';
            const valorCaminhao = item.caminhao_placa || '';
            const valorObservacao = item.observacao || '';

            const transporteHtml = `
                <div class="detail-card-v2">
                    <div class="detail-card-head-v2 between">
                        <div>
                            <h4>Transporte & meta</h4>
                            <p>Controle operacional do envio.</p>
                        </div>
                        <div class="mini-actions-v2">
                            <button class="btn-action" onclick="window.registrarTempoPreparacao('${item.id_envio}', 'inicio')">Registrar início</button>
                            <button class="btn-action" onclick="window.registrarTempoPreparacao('${item.id_envio}', 'fim')">Registrar fim</button>
                            <button class="btn-action" onclick="window.salvarDadosTransporte('${item.id_envio}')">Salvar</button>
                        </div>
                    </div>
                    <div class="two-col-form-v2">
                        <input id="input-motorista-${item.id_envio}" type="text" placeholder="Motorista" value="${(valorMotorista+'').replace(/"/g,'&quot;')}" class="field-input-v2">
                        <input id="input-caminhao-${item.id_envio}" type="text" placeholder="Caminhão / Placa" value="${(valorCaminhao+'').replace(/"/g,'&quot;')}" class="field-input-v2">
                    </div>
                    <textarea id="textarea-observacao-${item.id_envio}" placeholder="Observação livre" class="field-input-v2 textarea-v2">${valorObservacao || ''}</textarea>
                    <div class="meta-grid-v2">
                        <div class="meta-card-v2">
                            <span>Estimativa</span>
                            <strong id="estimativa-minutos-${item.id_envio}">${tempoEstimadoMinutos} min</strong>
                        </div>
                        <div class="meta-card-v2">
                            <span>Horas (${pessoasAlocadas} ops)</span>
                            <strong id="estimativa-horas-${item.id_envio}">${(tempoEstimadoMinutos/60/pessoasAlocadas).toFixed(1)} h</strong>
                        </div>
                        ${item.hora_inicio_preparacao ? `<div class="meta-card-v2"><span>Início</span><strong>${item.hora_inicio_preparacao}</strong></div>` : ''}
                        ${item.hora_fim_preparacao ? `<div class="meta-card-v2"><span>Fim</span><strong>${item.hora_fim_preparacao}</strong></div>` : ''}
                    </div>
                </div>`;

            trDetalhe.innerHTML = `
                <td colspan="8" class="detail-cell-v2">
                    <div class="detail-shell-v2">
                        <div class="detail-topbar-v2">
                            <div>
                                <div class="detail-title-v2">Composição & controles</div>
                                <div class="detail-subtitle-v2">Envio #${item.id_envio} • ${item.conta || 'Sem conta'} • ${item.galpao || 'Sem galpão'}</div>
                            </div>
                            <div class="detail-topbar-actions-v2">
                                <span class="team-label-v2">Equipe</span>
                                <input id="pessoas-input-${item.id_envio}" type="number" value="${pessoasAlocadas}" min="1" class="field-input-v2 team-input-v2" onclick="event.stopPropagation()">
                                <button class="btn-action" onclick="event.stopPropagation(); window.atualizarEquipe('${item.id_envio}')">Atualizar</button>
                            </div>
                        </div>

                        <div class="detail-card-v2 item-card-v2">
                            ${itensHtml ? `${resumoItensHtml}${itensHtml}` : `<div class="detail-empty-v2">Nenhuma composição de itens registrada.</div>`}
                        </div>

                        <div class="detail-grid-v2">
                            ${transporteHtml}
                            ${adicaoSection}
                            ${pendenciaSection}
                        </div>
                    </div>
                </td>
            `;

            trPrincipal.addEventListener('click', () => {
                const icon = trPrincipal.querySelector('.fa-chevron-down, .fa-chevron-up');
                if (trDetalhe.style.display === 'none') {
                    trDetalhe.style.display = 'table-row';
                    if(icon) icon.className = 'fa-solid fa-chevron-up';
                } else {
                    trDetalhe.style.display = 'none';
                    if(icon) icon.className = 'fa-solid fa-chevron-down';
                }
            });

            tbodyGeral.appendChild(trPrincipal);
            tbodyGeral.appendChild(trDetalhe);
        });

        // ensure listeners on the "pessoas" inputs after render
        if (typeof window.__attachPessoasListeners === 'function') {
            setTimeout(() => { try { window.__attachPessoasListeners(); } catch(e) {} }, 30);
        }
    }

    // ---- TABELA DE PENDÊNCIAS, GRÁFICOS E KPIs (mantidos) ----
    function renderizarTabelaPendencias(envios) {
        if (!tbodyPendencias) return;
        tbodyPendencias.innerHTML = '';
        if (!envios || envios.length === 0) {
            tbodyPendencias.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#0f9d58; padding:30px; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Operação limpa! Nenhuma discrepância ativa.</td></tr>`;
            return;
        }
        envios.forEach(item => {
            const tr = document.createElement('tr');
            const faltas = (Number(item.unidades_declaradas) || 0) - (Number(item.unidades_recebidas) || 0);
            tr.innerHTML = `
                <td><strong>${item.conta || '—'}</strong></td>
                <td><mark>#${item.id_envio || '—'}</mark></td>
                <td><span class="status-badge badge-laranja"><i class="fa-solid fa-triangle-exclamation"></i> Quebra de Conferência</span></td>
                <td><span class="texto-danger">Faltam ${faltas} peças</span></td>
                <td><span class="galpao-tag">${item.galpao || '—'}</span></td>
                <td class="text-center"><button class="btn-action primary" style="background-color:#e67e22; border-color:#e67e22;"><i class="fa-solid fa-magnifying-glass-list"></i> Abrir Auditoria</button></td>
            `;
            tbodyPendencias.appendChild(tr);
        });
    }

    function renderizarGraficosDinâmicos(envios) {
        try {
            const qtdAraca = envios.filter(i => String(i.galpao || '').toLowerCase().includes('araçariguama') || String(i.galpao || '').toLowerCase().includes('aracariguama')).length;
            const qtdPerus = envios.filter(i => String(i.galpao || '').toLowerCase().includes('perus')).length;
            let totalDec = 0, totalRec = 0;
            envios.forEach(i => { totalDec += Number(i.unidades_declaradas) || 0; totalRec += Number(i.unidades_recebidas) || 0; });

            const ctxG = document.getElementById('chart-galpoes');
            if (ctxG) {
                if (chartInstanceGalpao) chartInstanceGalpao.destroy();
                chartInstanceGalpao = new Chart(ctxG.getContext('2d'), {
                    type: 'doughnut',
                    data: { labels: ['Araçariguama', 'Perus'], datasets: [{ data: [qtdAraca || 0, qtdPerus || 0], backgroundColor: ['#3483fa', '#f39c12'] }] },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }

            const ctxD = document.getElementById('chart-divergencias');
            if (ctxD) {
                if (chartInstanceDivergencia) chartInstanceDivergencia.destroy();
                chartInstanceDivergencia = new Chart(ctxD.getContext('2d'), {
                    type: 'bar',
                    data: { labels: ['Peças'], datasets: [{ label: 'Declarado', data: [totalDec], backgroundColor: '#3483fa' }, { label: 'Recebido', data: [totalRec], backgroundColor: '#2ecc71' }] },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }
        } catch (err) {
            console.error('Erro ao renderizar gráficos', err);
        }
    }

    function recalcularCardsKPI(envios) {
        if (!cardEnvios || !cardDeclarado || !cardRecebido || !cardDiscrepancia) return;
        cardEnvios.innerText = envios.length;
        let dec = 0, rec = 0;
        envios.forEach(e => { dec += Number(e.unidades_declaradas) || 0; rec += Number(e.unidades_recebidas) || 0; });
        cardDeclarado.innerText = dec.toLocaleString('pt-BR');
        cardRecebido.innerText = rec.toLocaleString('pt-BR');
        cardDiscrepancia.innerText = dec > 0 ? `${((dec - rec) / dec * 100).toFixed(1)}%` : '0%';
    }

    // ---- EVENTOS ----
    if (filtroConta) filtroConta.addEventListener('change', filtrarEProcessarDados);
    if (filtroGalpao) filtroGalpao.addEventListener('change', filtrarEProcessarDados);
    if (ordenarData) ordenarData.addEventListener('change', filtrarEProcessarDados);
    if (buscaId) buscaId.addEventListener('input', filtrarEProcessarDados);

    pills.forEach(p => {
        p.addEventListener('click', () => {
            pills.forEach(i => i.classList.remove('active'));
            p.classList.add('active');
            statusPillAtivo = p.getAttribute('data-status') || 'Todos';
            filtrarEProcessarDados();
        });
    });

    setInterval(() => { const lc = document.getElementById('live-clock'); if(lc) lc.innerText = new Date().toLocaleTimeString('pt-BR'); }, 1000);

    verificarOperador();
    carregarDadosDoBack();

    // ---- Helpers para attach de listeners nos inputs de pessoas ----
    window.__attachPessoasListeners = function() {
      try {
        document.querySelectorAll('[id^="pessoas-input-"]').forEach(inp => {
          const id = inp.id.replace('pessoas-input-', '');
          // remove listeners prévios (evitar duplicação)
          try { inp.removeEventListener('change', inp.__listenerAtualizarEquipe); } catch(e) {}
          const fn = () => { try { console.log('[listener] change pessoas for', id, 'value', inp.value); window.atualizarEquipe(id); } catch(e) {} };
          inp.__listenerAtualizarEquipe = fn;
          inp.addEventListener('change', fn);
          // também aplica onkeypress Enter
          try { inp.removeEventListener('keyup', inp.__listenerEnter); } catch(e) {}
          const fnEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); window.atualizarEquipe(id); } };
          inp.__listenerEnter = fnEnter;
          inp.addEventListener('keyup', fnEnter);
        });
        console.log('[__attachPessoasListeners] listeners conectados em inputs de pessoas.');
      } catch (e) {
        console.warn('[__attachPessoasListeners] erro:', e);
      }
    };

    // garante attach inicial caso já existam inputs (pode ser redundante)
    setTimeout(() => { try { window.__attachPessoasListeners(); } catch(e) {} }, 200);
});
// end DOMContentLoaded