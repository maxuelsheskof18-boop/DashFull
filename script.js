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
    const pillsBar = document.querySelector('.pills-bar');
    let pills = document.querySelectorAll('.pills-bar .pill');
    const buscaId = document.getElementById('busca-id');
    const paginacaoInfo = document.getElementById('paginacao-info');
    const paginacaoBotoes = document.getElementById('paginacao-botoes');

    // 2. VARIÁVEIS GLOBAIS DE ESTADO
    let dadosLocais = [];
    let dadosFiltradosAtuais = [];
    let statusPillAtivo = 'Todos';
    let operadorAtivo = '';

    // Paginação
    let paginaAtual = 1;
    const itensPorPagina = 30;

    // Configuração de Produtividade (Minutos por peça)
    const MINUTOS_POR_PECA = 0.5;

    let chartInstanceGalpao = null;
    let chartInstanceDivergencia = null;

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

    function formatarDataHora(dataStr, horaStr, fallbackDataHora = '') {
        const data = dataStr || '';
        const hora = horaStr || '';
        if (data && hora) return `${data} às ${hora}`;
        if (data) return data;
        if (fallbackDataHora) return fallbackDataHora;
        return '—';
    }

    function garantirPillsExtras() {
        if (!pillsBar) return;

        const inserirDepois = (statusBase, statusNovo, label, countId) => {
            if (pillsBar.querySelector(`[data-status="${statusNovo}"]`)) return;
            const btn = document.createElement('button');
            btn.className = 'pill';
            btn.type = 'button';
            btn.setAttribute('data-status', statusNovo);
            btn.innerHTML = `${label} <span id="${countId}">(0)</span>`;
            const ref = pillsBar.querySelector(`[data-status="${statusBase}"]`);
            if (ref && ref.parentNode === pillsBar && ref.nextSibling) ref.parentNode.insertBefore(btn, ref.nextSibling);
            else pillsBar.appendChild(btn);
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
        painel.innerHTML = `
            <div class="panel-card-header">
                <h3>Resumo de Motoristas do Mês</h3>
            </div>
            <div id="motoristas-resumo-corpo" style="padding:16px; display:grid; gap:14px;"></div>
        `;
        topo.insertAdjacentElement('afterend', painel);
        return painel;
    }

    function atualizarResumoMotoristas(envios) {
        const painel = garantirResumoMotoristas();
        if (!painel) return;

        const corpo = painel.querySelector('#motoristas-resumo-corpo');
        if (!corpo) return;

        const agora = new Date();
        const mesAtual = agora.getMonth();
        const anoAtual = agora.getFullYear();

        const concluidosMes = envios.filter(item => {
            if (item.meu_status !== 'Concluído') return false;
            const baseData = item.conclusao_data || item.data;
            const dataObj = new Date(baseData);
            return !isNaN(dataObj.getTime()) && dataObj.getMonth() === mesAtual && dataObj.getFullYear() === anoAtual;
        });

        const porMotorista = {};
        const porDia = {};

        concluidosMes.forEach(item => {
            const motorista = String(item.motorista || item.motorista_nome || item.motorista_saida || 'Sem motorista').trim() || 'Sem motorista';
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
                    <div style="padding:10px 12px; background:#f8fafc; font-weight:700; color:#334155;">Fulls concluídos no mês atual</div>
                    <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead><tr><th style="text-align:left; padding:8px 10px; color:#64748b;">Motorista</th><th style="text-align:right; padding:8px 10px; color:#64748b;">Qtd</th></tr></thead>
                    <tbody>${ranking || '<tr><td colspan="2" style="padding:12px; color:#94a3b8;">Sem conclusões registradas neste mês.</td></tr>'}</tbody>
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

    // 3. CONTROLE DE LOGIN DO OPERADOR
    function verificarOperador() {
        const salvo = localStorage.getItem('dashfull_operador');
        if (salvo && salvo.trim() !== '') {
            operadorAtivo = salvo;
            nomeOperadorHeader.innerText = operadorAtivo;
            modalOperador.style.display = 'none';
        } else {
            modalOperador.style.display = 'flex';
            inputNomeOperador.focus();
        }
    }

    btnEntrarPainel.addEventListener('click', () => {
        const nomeInput = inputNomeOperador.value.trim();
        if (nomeInput === '') {
            inputNomeOperador.style.borderColor = 'var(--danger)';
            return;
        }
        localStorage.setItem('dashfull_operador', nomeInput);
        operadorAtivo = nomeInput;
        nomeOperadorHeader.innerText = operadorAtivo;
        modalOperador.style.display = 'none';
        atualizarPainelCompleto();
    });

    displayOperadorClick.addEventListener('click', () => {
        localStorage.removeItem('dashfull_operador');
        inputNomeOperador.value = operadorAtivo;
        verificarOperador();
    });

    // 4. NAVEGAÇÃO E SIDEBAR
    btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        toggleIcon.className = sidebar.classList.contains('collapsed') ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
    });

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(i => i.classList.remove('active'));
            pagePanes.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            const targetPage = item.getAttribute('data-page');
            document.getElementById(`page-${targetPage}`).classList.add('active');

            if (targetPage === 'visao-geral') {
                headerTitle.innerText = 'Painel de Controle';
                headerSubtitle.innerText = 'Monitoramento de envios em tempo real';
            } else if (targetPage === 'pendencias') {
                headerTitle.innerText = 'Gestão de Pendências';
                headerSubtitle.innerText = 'Controle de auditoria e quebras do Full';
            }
        });
    });

    // 5. CONEXÃO COM O FIREBASE E TEMPO REAL
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

    // 6. FUNÇÕES GLOBAIS DE GRAVAÇÃO (FIREBASE)
    window.acionarBotao = async function(idEnvio, novoStatus, motorista = '') {
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
            const motoristaLimpo = String(motorista || '').trim();
            if (!motoristaLimpo) {
                alert('Informe o nome do motorista antes de concluir.');
                return;
            }
            payload.conclusao_data = dataAtual;
            payload.conclusao_hora = horaAtual;
            payload.conclusao_operador = operador;
            payload.conclusao_registro = `${dataAtual} ${horaAtual}`;
            payload.motorista = motoristaLimpo;
        }

        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        await carregarDadosDoBack();
    };

    window.salvarMetaPrazo = async function(idEnvio, campo, valor) {
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}.json`;
        let dados = {}; dados[campo] = valor;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
    };

    window.marcarItemConferido = async function(idEnvio, sku, isChecked) {
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/itens/${sku}.json`;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferido: isChecked }) });
    };

    window.marcarDivergenciaItem = async function(idEnvio, sku, statusDivergencia) {
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/itens/${sku}.json`;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ divergencia: statusDivergencia }) });
    };

    // Salvar motorista e caminhão/placa via PATCH (editável inline)
    window.salvarMotoristaCaminhao = async function(idEnvio) {
        const motoristaInput = document.getElementById(`input-motorista-${idEnvio}`);
        const caminhaoInput = document.getElementById(`input-caminhao-${idEnvio}`);
        const motorista = motoristaInput ? String(motoristaInput.value || '').trim() : '';
        const caminhao = caminhaoInput ? String(caminhaoInput.value || '').trim() : '';
        if (!motorista && !caminhao) {
            alert('Informe o motorista ou os dados do caminhão para salvar.');
            return;
        }
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}.json`;
        const payload = {};
        if (motorista) payload.motorista = motorista;
        if (caminhao) payload.caminhao = caminhao;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        await carregarDadosDoBack();
    };

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

    // Pendências: reportar / remover
    window.reportarPendencia = async function(idEnvio, produto, quantidade) {
        produto = String(produto || '').trim();
        quantidade = Number(quantidade);
        if (!produto && (!quantidade || quantidade <= 0)) { alert('Informe produto ou quantidade.'); return; }
        const key = 'd' + Date.now();
        const url = `${FIREBASE_BASE}/historico_envios/${idEnvio}/pendencias/${key}.json`;
        const payload = { produto: produto || null, quantidade: (Number.isFinite(quantidade) ? quantidade : null), timestamp: new Date().toLocaleString('pt-BR'), operador: operadorAtivo || '' };
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

    // 7. FILTROS E DISTRIBUIÇÃO NA TELA
    function atualizarPainelCompleto() {
        filtrarEProcessarDados();

        const pendentes = dadosLocais.filter(item => item.status === 'closed_with_changes' || Number(item.unidades_recebidas) < Number(item.unidades_declaradas));
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
        if (countAgendados) countAgendados.innerText = `(${dadosLocais.filter(i => i.meu_status !== 'Concluído' && i.status !== 'closed_ok' && i.status !== 'closed_with_changes' && i.status !== 'cancelled').length})`;
        if (countPreparacao) countPreparacao.innerText = `(${dadosLocais.filter(i => String(i.meu_status || '').toLowerCase() === 'em preparação'.toLowerCase()).length})`;
        if (countPendenciasReport) countPendenciasReport.innerText = `(${dadosLocais.filter(i => i.pendencias && Object.keys(i.pendencias).length > 0).length})`;

        atualizarResumoMotoristas(dadosLocais);
        renderizarGraficosDinâmicos(dadosLocais);
    }

    function filtrarEProcessarDados() {
        const query = (buscaId && buscaId.value) ? buscaId.value.trim().toLowerCase() : '';
        const contaSelecionada = filtroConta ? filtroConta.value : 'Todas';
        const galpaoSelecionado = filtroGalpao ? filtroGalpao.value : 'Todos';
        const ordemSelecionada = ordenarData ? ordenarData.value : 'recente';

        dadosFiltradosAtuais = dadosLocais.filter(item => {
            const bateConta = (contaSelecionada === 'Todas' || item.conta === contaSelecionada);
            const bateGalpao = (galpaoSelecionado === 'Todos' || item.galpao === galpaoSelecionado);
            const bateId = (query === '' || String(item.id_envio || '').toLowerCase().includes(query));

            let batePill = true;
            if (statusPillAtivo === 'closed_ok') batePill = (item.status === 'closed_ok');
            else if (statusPillAtivo === 'concluidos') batePill = (item.meu_status === 'Concluído');
            else if (statusPillAtivo === 'pending') batePill = (item.meu_status !== 'Concluído' && item.status !== 'closed_ok' && item.status !== 'closed_with_changes' && item.status !== 'cancelled');
            else if (statusPillAtivo === 'closed_with_changes') batePill = (item.status === 'closed_with_changes');
            else if (statusPillAtivo === 'in_preparacao') batePill = (String(item.meu_status || '').toLowerCase() === 'em preparação'.toLowerCase());
            else if (statusPillAtivo === 'pendencia') batePill = (item.pendencias && Object.keys(item.pendencias).length > 0);

            return bateConta && bateGalpao && bateId && batePill;
        });

        dadosFiltradosAtuais.sort((a, b) => {
            return ordemSelecionada === 'recente' ? new Date(b.data) - new Date(a.data) : new Date(a.data) - new Date(b.data);
        });

        paginaAtual = 1;
        recalcularEExibirPagina();
    }

    // 8. O MOTOR DE PAGINAÇÃO
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

    // 9. RENDER DA TABELA (Geral)
    function renderizarTabelaGeral(envios) {
        if (!tbodyGeral) return;
        tbodyGeral.innerHTML = '';

        if (envios.length === 0) {
            tbodyGeral.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#6b7280;">Nenhum envio localizado.</td></tr>';
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

            // Mostrar informações de início/conclusão quando presentes
            const inicioInfo = item.inicio_registro ? `<div style="font-size:11px; color:#6b7280;">Início: ${item.inicio_registro} • ${item.inicio_operador || ''}</div>` : '';
            const conclusaoInfo = item.conclusao_registro ? `<div style="font-size:11px; color:#6b7280;">Conclusão: ${item.conclusao_registro} • ${item.conclusao_operador || ''} ${item.motorista ? '• Motorista: ' + item.motorista : ''} ${item.caminhao ? '• Caminhão: ' + item.caminhao : ''}</div>` : (item.motorista || item.caminhao ? `<div style="font-size:11px; color:#6b7280;">${item.motorista ? 'Motorista: ' + item.motorista : ''} ${item.caminhao ? '• Caminhão: ' + item.caminhao : ''}</div>` : '');

            const trPrincipal = document.createElement('tr');
            trPrincipal.style.cursor = 'pointer';
            trPrincipal.className = 'linha-envio-mestra';
            let revertBtnHtml = '';
            const statusLower = String(statusHumano || '').toLowerCase();
            if (statusLower === 'concluído' || statusLower === 'concluido') {
                revertBtnHtml = `<button class="btn-action" style="padding:6px 10px; background:#f3f4f6; border:1px solid #e5e7eb;" onclick="event.stopPropagation(); window.reverterParaPreparacao('${item.id_envio}')">Reverter</button>`;
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
                  <div class="value"><strong>${totalPecas}</strong> peças<br><small style="color:#6b7280;">Feitas: ${totalProgresso} — Faltam: ${restantePecas} • ⏳ Est: ${tempoFormatado} / ${pessoasAlocadas} Ops</small></div>
                </td>
                <td>
                  <div class="label">Galpão</div>
                  <div class="value"><span class="galpao-tag">${item.galpao || '—'}</span></div>
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
                    <button class="btn-action primary btn-concluir" style="padding:6px 10px;" onclick="event.stopPropagation(); abrirModalConclusao('${item.id_envio}')">Concluir</button>
                    ${revertBtnHtml}
                    </div>
                  </div>
                </td>
            `;

            // LINHA DETALHE (GAVETA)
            const trDetalhe = document.createElement('tr');
            trDetalhe.className = 'linha-detalhe-itens';
            trDetalhe.style.display = 'none';
            trDetalhe.style.backgroundColor = '#f8fafc';

            // Render itens (se houver)
            let itensHtml = '';
            const listaItens = (item.itens && Object.keys(item.itens).length > 0) ? item.itens : null;
            if (listaItens) {
                Object.keys(listaItens).forEach(sku => {
                    const prod = listaItens[sku] || {};
                    const checkConcluido = prod.conferido ? 'checked' : '';
                    const estiloTexto = prod.conferido ? 'text-decoration: line-through; color: #10b981;' : '';
                    itensHtml += `
                    <div style="display:flex; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #e6eef6;">
                    <div style="display:flex; gap:10px; align-items:center;">
                    <input type="checkbox" ${checkConcluido} onchange="window.marcarItemConferido('${item.id_envio}', '${sku}', this.checked)" style="transform:scale(1.1); cursor:pointer;">
                    <div style="${estiloTexto}"><strong>[${sku}]</strong> ${prod.titulo || ''}</div>
                    </div>
                    <div style="display:flex; gap:12px; align-items:center;">
                    <div style="font-weight:700; color:#475569;">${prod.declarado || 0} un</div>
                    <select onchange="window.marcarDivergenciaItem('${item.id_envio}', '${sku}', this.value)" style="padding:4px; border-radius:6px; border:1px solid #cbd5e1; font-size:12px;">
                    <option value="">Status</option>
                    <option value="OK" ${prod.divergencia === 'OK' ? 'selected' : ''}>OK</option>
                    <option value="Não Tem" ${prod.divergencia === 'Não Tem' ? 'selected' : ''}>Não Tem</option>
                    <option value="Qtd Insuficiente" ${prod.divergencia === 'Qtd Insuficiente' ? 'selected' : ''}>Qtd Insuficiente</option>
                    </select>
                    </div>
                    </div>
                    `;
                });
            }

            // Progresso parcial (lista)
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

            // Pendências (lista)
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

            // ------------------------------------------------------------
            // NOVA LÓGICA: esconder Adição Rápida e Reportar Pendência quando
            // meu_status for "Concluído", mas manter Dados de Transporte visível.
            // ------------------------------------------------------------
            const isConcluido = statusLower === 'concluído' || statusLower === 'concluido';

            const adicaoSection = isConcluido ? '' : `
                <h4 style="margin:0 0 8px 0; font-size:13px; color:#374151;">➕ Adição Rápida (Parcial)</h4>
                <div class="adicao-rapida-inputs" style="display:flex; gap:8px; margin-bottom:8px;">
                <input id="input-produto-${item.id_envio}" type="text" placeholder="Nome ou Código do produto" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" onclick="event.stopPropagation()">
                <input id="input-quant-${item.id_envio}" type="number" min="1" placeholder="Qtd feita" style="width:110px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" onclick="event.stopPropagation()">
                <button class="btn-action primary" style="padding:8px 12px;" onclick="event.stopPropagation(); window.adicionarProgresso('${item.id_envio}', document.getElementById('input-produto-${item.id_envio}').value, document.getElementById('input-quant-${item.id_envio}').value);">Adicionar</button>
                </div>
                <div class="adicao-rapida-list" style="max-height:160px; overflow:auto; border:1px solid #eef2f7; border-radius:6px;">
                ${progressoHtml || '<div style="padding:8px; color:#9aa4b2;">Nenhum registro de produção parcial.</div>'}
                </div>
            `;

            const pendenciaSection = isConcluido ? '' : `
                <h4 style="margin:0 0 8px 0; font-size:13px; color:#611a15;">🚨 Reportar Pendência</h4>
                <div class="reportar-pendencia-inputs" style="display:flex; gap:8px; margin-bottom:8px;">
                <input id="input-pend-prod-${item.id_envio}" type="text" placeholder="Produto ausente / código" style="flex:1; padding:8px; border:1px solid #f5c6cb; border-radius:6px;" onclick="event.stopPropagation()">
                <input id="input-pend-quant-${item.id_envio}" type="number" min="0" placeholder="Qtd faltando" style="width:110px; padding:8px; border:1px solid #f5c6cb; border-radius:6px;" onclick="event.stopPropagation()">
                <button class="btn-action" style="padding:8px 12px; background:#ef4444; color:white; border:none; border-radius:6px;" onclick="event.stopPropagation(); window.reportarPendencia('${item.id_envio}', document.getElementById('input-pend-prod-${item.id_envio}').value, document.getElementById('input-pend-quant-${item.id_envio}').value);">Reportar</button>
                </div>
                <div class="reportar-pendencia-list" style="max-height:160px; overflow:auto; border:1px solid #ffebeb; border-radius:6px;">
                ${pendenciasHtml || '<div style="padding:8px; color:#9aa4b2;">Nenhuma pendência reportada.</div>'}
                </div>
            `;

            // Monta o HTML da gaveta usando as seções condicionais
            trDetalhe.innerHTML = `
                <td colspan="8" style="padding:12px;">
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div style="font-weight:700; color:#374151;">📦 COMPOSIÇÃO & CONTROLES</div>
                    <div style="font-size:12px; color:#6b7280;">Equipe: <input type="number" value="${pessoasAlocadas}" min="1" onchange="window.salvarMetaPrazo('${item.id_envio}', 'pessoas_alocadas', this.value)" style="width:60px; padding:4px;"></div>
                    </div>
                    ${itensHtml ? `<div style="margin-bottom:8px;">${itensHtml}</div>` : `<div style="font-size:12px; color:#9aa4b2; margin-bottom:8px;">Nenhuma composição de itens registrada.</div>`}

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                    <div>
                    <h4 style="margin:0 0 8px 0; font-size:13px; color:#374151;">Dados de Transporte</h4>
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                    <input id="input-motorista-${item.id_envio}" type="text" placeholder="Motorista (ex: João Silva)" value="${item.motorista ? item.motorista.replace(/"/g, '&quot;') : ''}" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" onclick="event.stopPropagation()">
                    <input id="input-caminhao-${item.id_envio}" type="text" placeholder="Caminhão / Placa" value="${item.caminhao ? item.caminhao.replace(/"/g, '&quot;') : ''}" style="width:180px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;" onclick="event.stopPropagation()">
                    <button class="btn-action" style="padding:8px 12px;" onclick="event.stopPropagation(); window.salvarMotoristaCaminhao('${item.id_envio}')">Salvar</button>
                    </div>
                    <div style="font-size:12px; color:#6b7280; margin-bottom:8px;">Os campos acima podem ser alterados a qualquer momento — útil quando houver troca de motorista/caminhão.</div>
                    <hr style="border:none; border-top:1px solid #eef2f7; margin:8px 0;">
                    ${adicaoSection}
                    </div>

                    <div>
                    ${pendenciaSection}
                    </div>
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
    }

    // Função auxiliar para abrir modal de conclusão solicitando motorista (agora tenta usar campo inline)
    window.abrirModalConclusao = function(idEnvio) {
        // Primeiro, tenta obter o motorista do campo inline (se existir e preenchido)
        const motoristaInput = document.getElementById(`input-motorista-${idEnvio}`);
        const motoristaCampo = motoristaInput ? String(motoristaInput.value || '').trim() : '';
        if (motoristaCampo) {
            // usa diretamente
            window.acionarBotao(idEnvio, 'Concluído', motoristaCampo);
            return;
        }
        // Se não houver motorista preenchido inline, pergunta via prompt (comportamento legado)
        const motorista = prompt('Nome do motorista (obrigatório para concluir):');
        if (motorista === null) return; // cancelado
        if (!String(motorista || '').trim()) {
            alert('Nome do motorista inválido.');
            return;
        }
        window.acionarBotao(idEnvio, 'Concluído', motorista.trim());
    };

    // 10. RENDER PARA TELA DE PENDÊNCIAS/AUDITORIA
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

    // 11. GRÁFICOS E KPIs
    function renderizarGraficosDinâmicos(envios) {
        try {
            const qtdAraca = envios.filter(i => String(i.galpao || '').toLowerCase().includes('araçariguama') || String(i.galpao || '').toLowerCase().includes('aracariguama')).length;
            const qtdPerus = envios.filter(i => String(i.galpao || '').toLowerCase().includes('perus')).length;
            let totalDec = 0, totalRec = 0;
            envios.forEach(i => { totalDec += Number(i.unidades_declaradas) || 0; totalRec += Number(i.unidades_recebidas) || 0; });

            // chart-galpoes
            const ctxG = document.getElementById('chart-galpoes');
            if (ctxG) {
                if (chartInstanceGalpao) chartInstanceGalpao.destroy();
                chartInstanceGalpao = new Chart(ctxG.getContext('2d'), {
                    type: 'doughnut',
                    data: { labels: ['Araçariguama', 'Perus'], datasets: [{ data: [qtdAraca || 0, qtdPerus || 0], backgroundColor: ['#3483fa', '#f39c12'] }] },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }

            // chart-divergencias
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

    // EVENTOS DE TELA
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
});
