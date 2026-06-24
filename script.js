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
    const pills = document.querySelectorAll('.pills-bar .pill');
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
    async function carregarDadosDoBack() {
        try {
            const res = await fetch('https://dashfulll-2321b-default-rtdb.firebaseio.com/historico_envios.json'); 
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
            const res = await fetch('https://dashfulll-2321b-default-rtdb.firebaseio.com/historico_envios.json'); 
            const data = await res.json();
            if (!data) return;

            const listaFormatada = Object.keys(data).map(id => data[id]);
            listaFormatada.sort((a, b) => new Date(b.data) - new Date(a.data));

            if (JSON.stringify(dadosLocais) !== JSON.stringify(listaFormatada)) {
                dadosLocais = listaFormatada;
                atualizarPainelCompleto();
            }
        } catch (err) {}
    }

    setInterval(carregarDadosSilent, 4000); // Checa o firebase a cada 4 segundos

    // 6. FUNÇÕES GLOBAIS DE GRAVAÇÃO (FIREBASE)
    window.acionarBotao = async function(idEnvio, novoStatus) {
        const url = `https://dashfulll-2321b-default-rtdb.firebaseio.com/historico_envios/${idEnvio}.json`;
        const horaAtual = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        const payload = { meu_status: novoStatus, operador: operadorAtivo || 'Operador', hora_operacao: horaAtual };
        
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        await carregarDadosDoBack();
    };

    window.salvarMetaPrazo = async function(idEnvio, campo, valor) {
        const url = `https://dashfulll-2321b-default-rtdb.firebaseio.com/historico_envios/${idEnvio}.json`;
        let dados = {}; dados[campo] = valor;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
    };

    window.marcarItemConferido = async function(idEnvio, sku, isChecked) {
        const url = `https://dashfulll-2321b-default-rtdb.firebaseio.com/historico_envios/${idEnvio}/itens/${sku}.json`;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferido: isChecked }) });
    };

    window.marcarDivergenciaItem = async function(idEnvio, sku, statusDivergencia) {
        const url = `https://dashfulll-2321b-default-rtdb.firebaseio.com/historico_envios/${idEnvio}/itens/${sku}.json`;
        await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ divergencia: statusDivergencia }) });
    };

    // 7. FILTROS E DISTRIBUIÇÃO NA TELA
    function atualizarPainelCompleto() {
        filtrarEProcessarDados();

        const pendentes = dadosLocais.filter(item => item.status === 'closed_with_changes' || item.unidades_recebidas < item.unidades_declaradas);
        badgePendenciasNav.innerText = pendentes.length;
        renderizarTabelaPendencias(pendentes);

        document.getElementById('count-todos').innerText = `(${dadosLocais.length})`;
        document.getElementById('count-finalizados').innerText = `(${dadosLocais.filter(i => i.meu_status === 'Concluído').length})`;
        document.getElementById('count-divergencias').innerText = `(${dadosLocais.filter(i => i.status === 'closed_with_changes').length})`;
        document.getElementById('count-agendados').innerText = `(${dadosLocais.filter(i => i.meu_status !== 'Concluído' && i.status !== 'closed_with_changes' && i.status !== 'cancelled').length})`;

        renderizarGraficosDinâmicos(dadosLocais);
    }

    function filtrarEProcessarDados() {
        const query = buscaId.value.trim().toLowerCase();
        const contaSelecionada = filtroConta.value;
        const galpaoSelecionado = filtroGalpao.value;
        const ordemSelecionada = ordenarData.value;

        dadosFiltradosAtuais = dadosLocais.filter(item => {
            const bateConta = (contaSelecionada === 'Todas' || item.conta === contaSelecionada);
            const bateGalpao = (galpaoSelecionado === 'Todos' || item.galpao === galpaoSelecionado);
            const bateId = (query === '' || String(item.id_envio).includes(query));
            
            let batePill = true;
            if (statusPillAtivo === 'closed_ok') batePill = (item.meu_status === 'Concluído');
            else if (statusPillAtivo === 'pending') batePill = (item.meu_status !== 'Concluído' && item.status !== 'cancelled');
            else if (statusPillAtivo === 'closed_with_changes') batePill = (item.status === 'closed_with_changes');

            return bateConta && bateGalpao && bateId && batePill;
        });

        dadosFiltradosAtuais.sort((a, b) => {
            return ordemSelecionada === 'recente' ? new Date(b.data) - new Date(a.data) : new Date(a.data) - new Date(b.data);
        });

        paginaAtual = 1;
        recalcularEExibirPagina();
    }

    // 8. O MOTOR DE PAGINAÇÃO (ESTÁ AQUI!)
    function recalcularEExibirPagina() {
        const totalItens = dadosFiltradosAtuais.length;
        const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1;

        if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

        const indiceInicio = (paginaAtual - 1) * itensPorPagina;
        const indiceFim = Math.min(indiceInicio + itensPorPagina, totalItens);
        const dadosPaginados = dadosFiltradosAtuais.slice(indiceInicio, indiceFim);

        paginacaoInfo.innerText = totalItens > 0 ? `Exibindo ${indiceInicio + 1}-${indiceFim} de ${totalItens} envios` : `Exibindo 0-0 de 0 envios`;

        renderizarTabelaGeral(dadosPaginados);
        recalcularCardsKPI(dadosFiltradosAtuais);
        construirBotoesPagina(totalPaginas);
    }

    function construirBotoesPagina(totalPaginas) {
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

    // 9. RENDER DA TABELA NOVA (COM ACORDEÃO E ITENS)
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
            const tempoEstimadoMinutos = Math.ceil(totalPecas * MINUTOS_POR_PECA);
            const pessoasAlocadas = item.pessoas_alocadas || 1;
            const horasNecessarias = (tempoEstimadoMinutos / 60 / pessoasAlocadas).toFixed(1);

            let statusLabel = 'Agendado';
            let statusClass = 'badge-azul';
            if (item.status === 'closed_ok') { statusLabel = 'Finalizado'; statusClass = 'badge-verde'; }
            else if (item.status === 'closed_with_changes') { statusLabel = 'Divergência'; statusClass = 'badge-laranja'; }
            else if (item.status === 'cancelled') { statusLabel = 'Cancelado'; statusClass = 'badge-vermelho'; }

            // 👉 CORREÇÃO: Variáveis de data devidamente declaradas
            const dataObjeto = new Date(item.data);
            const dataFormatada = dataObjeto.toLocaleDateString('pt-BR');
            const horaFormatada = dataObjeto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            // Lógica do Status do Operador
            let meuStatusHtml = '';
            if (statusHumano === 'Concluído' || statusHumano === 'Em Preparação') {
                meuStatusHtml = `
                    <div class="local-status-wrapper">
                        <span class="badge" style="background-color:${corBadge}; color:white; padding: 2px 8px; font-size: 11px; font-weight:700; border-radius:4px;">${statusHumano}</span>
                        <div style="font-size: 10px; color: #6b7280; margin-top: 2px; font-weight: 600;">👤 ${item.operador} às ${item.hora_operacao}</div>
                    </div>`;
            } else {
                 meuStatusHtml = `
                    <div class="local-status-wrapper">
                        <span class="badge" style="background-color:#6b7280; color:white; padding: 2px 8px; font-size: 11px; font-weight:700; border-radius:4px;">Pendente</span>
                        <div style="font-size: 10px; color: #6b7280; margin-top: 2px; font-weight: 600;">⏱️ Aguardando Início</div>
                    </div>`;
            }

            // LINHA MESTRA
            const trPrincipal = document.createElement('tr');
            trPrincipal.style.cursor = 'pointer';
            trPrincipal.className = 'linha-envio-mestra';
            trPrincipal.innerHTML = `
                <td><strong>${item.conta}</strong></td>
                <td>#${item.id_envio} <i class="fa-solid fa-chevron-down" style="font-size:10px; margin-left:5px; color:#3483fa;"></i></td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td>${meuStatusHtml}</td>
                <td><strong>${totalPecas}</strong> peças<br><small style="color:#6b7280;">⏳ Est: ${horasNecessarias}h / ${pessoasAlocadas} Ops</small></td>
                <td><span class="galpao-tag">${item.galpao}</span></td>
                
                <td>
                    <div style="margin-bottom: 6px;">
                        <strong>${dataFormatada}</strong> <span style="color:#6b7280; font-size:12px;">${horaFormatada}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:2px; background-color: #f8fafc; padding: 4px; border-radius: 4px; border: 1px solid #e2e8f0;">
                        <span style="font-size: 9px; font-weight: bold; color: #475569;">PRAZO INTERNO:</span>
                        <input type="date" value="${dataLimite}" onchange="window.salvarMetaPrazo('${item.id_envio}', 'data_limite_pronto', this.value)" style="font-size:11px; padding:2px; border:1px solid #cbd5e1; border-radius:4px; outline:none;" onclick="event.stopPropagation()">
                        <input type="time" value="${horaLimite}" onchange="window.salvarMetaPrazo('${item.id_envio}', 'hora_limite_pronto', this.value)" style="font-size:11px; padding:2px; border:1px solid #cbd5e1; border-radius:4px; outline:none;" onclick="event.stopPropagation()">
                    </div>
                </td>
                
                <td class="text-center" onclick="event.stopPropagation()">
                    <div style="display:flex; gap:5px; justify-content:center;">
                        <button class="btn-action btn-preparar" style="padding:4px 8px;" onclick="window.acionarBotao('${item.id_envio}', 'Em Preparação')">Iniciar</button>
                        <button class="btn-action primary btn-concluir" style="padding:4px 8px;" onclick="window.acionarBotao('${item.id_envio}', 'Concluído')">Concluir</button>
                    </div>
                </td>
            `;

            // LINHA GAVETA (ITENS)
            const trDetalhe = document.createElement('tr');
            trDetalhe.className = 'linha-detalhe-itens';
            trDetalhe.style.display = 'none'; 
            trDetalhe.style.backgroundColor = '#f8fafc';

            let itensHtml = '';
            // Itens reais do Firebase ou Itens Mockados para teste
            const listaItens = item.itens || {
                "sku_padrao_1": { titulo: "Produto Geral do Envio - Lote A", declarado: Math.ceil(totalPecas*0.4), conferido: false, divergencia: "" },
                "sku_padrao_2": { titulo: "Produto Geral do Envio - Lote B", declarado: Math.floor(totalPecas*0.6), conferido: false, divergencia: "" }
            };

            Object.keys(listaItens).forEach(sku => {
                const prod = listaItens[sku];
                const checkConcluido = prod.conferido ? 'checked' : '';
                const estiloTexto = prod.conferido ? 'text-decoration: line-through; color: #10b981;' : '';
                
                itensHtml += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 15px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">
                        <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                            <input type="checkbox" ${checkConcluido} onchange="window.marcarItemConferido('${item.id_envio}', '${sku}', this.checked)" style="transform: scale(1.2); cursor:pointer;">
                            <span style="${estiloTexto}"><strong>[${sku}]</strong> ${prod.titulo}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <span style="font-weight: 600; color: #475569;">Qtd: ${prod.declarado} un</span>
                            <select onchange="window.marcarDivergenciaItem('${item.id_envio}', '${sku}', this.value)" style="padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 12px; background-color: ${prod.divergencia ? '#fee2e2' : '#fff'}; color: ${prod.divergencia ? '#ef4444' : '#475569'};">
                                <option value="">Status Item...</option>
                                <option value="OK" ${prod.divergencia === 'OK' ? 'selected' : ''}>✅ Tudo Certo</option>
                                <option value="Não Tem" ${prod.divergencia === 'Não Tem' ? 'selected' : ''}>❌ Não Tem o Item</option>
                                <option value="Qtd Insuficiente" ${prod.divergencia === 'Qtd Insuficiente' ? 'selected' : ''}>⚠️ Qtd Insuficiente</option>
                            </select>
                        </div>
                    </div>
                `;
            });

            trDetalhe.innerHTML = `
                <td colspan="8" style="padding: 15px !important;">
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                        <div style="background: #edf2f7; padding: 8px 15px; font-weight: bold; font-size: 12px; color: #4a5568; border-top-left-radius:7px; border-top-right-radius:7px; display:flex; justify-content:space-between;">
                            <span>📦 COMPOSIÇÃO DE PRODUTOS DESTE FULL</span>
                            <span style="color:#2b6cb0;">Equipe Alocada: <input type="number" value="${pessoasAlocadas}" min="1" onchange="window.salvarMetaPrazo('${item.id_envio}', 'pessoas_alocadas', this.value)" style="width:45px; text-align:center; border:1px solid #cbd5e1; border-radius:4px;"> Ops</span>
                        </div>
                        ${itensHtml}
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

    function renderizarTabelaPendencias(envios) {
        if (!tbodyPendencias) return;
        tbodyPendencias.innerHTML = '';
        if (envios.length === 0) {
            tbodyPendencias.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#0f9d58; padding:30px; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Operação limpa! Nenhuma discrepância ativa.</td></tr>`;
            return;
        }
        envios.forEach(item => {
            const tr = document.createElement('tr');
            const faltas = item.unidades_declaradas - item.unidades_recebidas;
            tr.innerHTML = `
                <td><strong>${item.conta}</strong></td>
                <td><mark>#${item.id_envio}</mark></td>
                <td><span class="status-badge badge-laranja"><i class="fa-solid fa-triangle-exclamation"></i> Quebra de Conferência</span></td>
                <td><span class="texto-danger">Faltam ${faltas} peças</span></td>
                <td><span class="galpao-tag">${item.galpao}</span></td>
                <td class="text-center"><button class="btn-action primary" style="background-color:#e67e22; border-color:#e67e22;"><i class="fa-solid fa-magnifying-glass-list"></i> Abrir Auditoria</button></td>
            `;
            tbodyPendencias.appendChild(tr);
        });
    }

    function renderizarGraficosDinâmicos(envios) {
        const qtdAraca = envios.filter(i => i.galpao.includes('Araçariguama')).length;
        const qtdPerus = envios.filter(i => i.galpao.includes('Perus')).length;
        let totalDec = 0, totalRec = 0;
        envios.forEach(i => { totalDec += Number(i.unidades_declaradas) || 0; totalRec += Number(i.unidades_recebidas) || 0; });

        if (chartInstanceGalpao) chartInstanceGalpao.destroy();
        const ctxG = document.getElementById('chart-galpoes');
        if(ctxG) chartInstanceGalpao = new Chart(ctxG.getContext('2d'), { type: 'doughnut', data: { labels: ['Araçariguama', 'Perus'], datasets: [{ data: [qtdAraca || 1, qtdPerus || 0], backgroundColor: ['#3483fa', '#f39c12'] }] }, options: { responsive: true, maintainAspectRatio: false } });

        if (chartInstanceDivergencia) chartInstanceDivergencia.destroy();
        const ctxD = document.getElementById('chart-divergencias');
        if(ctxD) chartInstanceDivergencia = new Chart(ctxD.getContext('2d'), { type: 'bar', data: { labels: ['Peças'], datasets: [{ label: 'Declarado', data: [totalDec], backgroundColor: '#3483fa' }, { label: 'Recebido', data: [totalRec], backgroundColor: '#2ecc71' }] }, options: { responsive: true, maintainAspectRatio: false } });
    }

    function recalcularCardsKPI(envios) {
        if(cardEnvios) cardEnvios.innerText = envios.length;
        let dec = 0, rec = 0;
        envios.forEach(e => { dec += Number(e.unidades_declaradas) || 0; rec += Number(e.unidades_recebidas) || 0; });
        if(cardDeclarado) cardDeclarado.innerText = dec.toLocaleString('pt-BR');
        if(cardRecebido) cardRecebido.innerText = rec.toLocaleString('pt-BR');
        if(cardDiscrepancia) cardDiscrepancia.innerText = dec > 0 ? `${((dec - rec) / dec * 100).toFixed(1)}%` : '0%';
    }

    // EVENTOS DE TELA
    if(filtroConta) filtroConta.addEventListener('change', filtrarEProcessarDados);
    if(filtroGalpao) filtroGalpao.addEventListener('change', filtrarEProcessarDados);
    if(ordenarData) ordenarData.addEventListener('change', filtrarEProcessarDados);
    if(buscaId) buscaId.addEventListener('input', filtrarEProcessarDados);

    pills.forEach(p => {
        p.addEventListener('click', () => {
            pills.forEach(i => i.classList.remove('active'));
            p.classList.add('active');
            statusPillAtivo = p.getAttribute('data-status');
            filtrarEProcessarDados();
        });
    });

    setInterval(() => { const lc = document.getElementById('live-clock'); if(lc) lc.innerText = new Date().toLocaleTimeString('pt-BR'); }, 1000);

    verificarOperador();
    carregarDadosDoBack();
});
