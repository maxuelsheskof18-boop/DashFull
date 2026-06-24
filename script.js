document.addEventListener('DOMContentLoaded', () => {
    // Links de Navegação Lateral & Colapso
    const sidebar = document.getElementById('sidebar');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const toggleIcon = document.getElementById('toggle-icon');
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    const pagePanes = document.querySelectorAll('.page-pane');
    const headerTitle = document.getElementById('header-title');
    const headerSubtitle = document.getElementById('header-subtitle');

    // Elementos do Operador
    const modalOperador = document.getElementById('modal-operador');
    const inputNomeOperador = document.getElementById('input-nome-operador');
    const btnEntrarPainel = document.getElementById('btn-entrar-painel');
    const nomeOperadorHeader = document.getElementById('nome-operador-header');
    const displayOperadorClick = document.getElementById('display-operador');

    // Elementos do Painel Geral
    const tbodyGeral = document.getElementById('tbody-geral');
    const cardEnvios = document.getElementById('total-envios');
    const cardDeclarado = document.getElementById('total-declarado');
    const cardRecebido = document.getElementById('total-recebido');
    const cardDiscrepancia = document.getElementById('taxa-discrepancia');

    // Elementos das Pendências
    const tbodyPendencias = document.getElementById('tbody-pendencias');
    const badgePendenciasNav = document.getElementById('badge-pendencias-nav');

    // Controles, Filtros e Paginação
    const filtroConta = document.getElementById('filtro-conta');
    const filtroGalpao = document.getElementById('filtro-galpao');
    const ordenarData = document.getElementById('ordenar-data');
    const pills = document.querySelectorAll('.pills-bar .pill');
    const buscaId = document.getElementById('busca-id');
    const paginacaoInfo = document.getElementById('paginacao-info');
    const paginacaoBotoes = document.getElementById('paginacao-botoes');

    // Estado da Aplicação
    let dadosLocais = [];
    let dadosFiltradosAtuais = [];
    let statusPillAtivo = 'Todos';
    let operadorAtivo = '';

    // Configurações de Paginação (30 itens por página)
    let paginaAtual = 1;
    const itensPorPagina = 30;

    // Instâncias do ChartJS
    let chartInstanceGalpao = null;
    let chartInstanceDivergencia = null;

    // 🪟 CONTROLE DO OPERADOR (ENTRADA SEGURA)
    function verificarOperador() {
        const salvo = localStorage.getItem('dashfull_operador');
        if (salvo && salvo.trim() !== '') {
            operadorAtivo = salvo;
            nomeOperadorHeader.innerText = operadorAtivo;
            modalOperador.setAttribute('aria-hidden', 'true');
            modalOperador.style.display = 'none';
        } else {
            modalOperador.setAttribute('aria-hidden', 'false');
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
        
        modalOperador.setAttribute('aria-hidden', 'true');
        modalOperador.style.display = 'none'; 
        
        atualizarPainelCompleto();
    });

    displayOperadorClick.addEventListener('click', () => {
        localStorage.removeItem('dashfull_operador');
        inputNomeOperador.value = operadorAtivo;
        verificarOperador();
    });

    // 🔄 RECOLHIMENTO DO MENU LATERAL (SIDEBAR COLLAPSE)
    btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        if (sidebar.classList.contains('collapsed')) {
            toggleIcon.className = 'fa-solid fa-chevron-right';
            btnToggleSidebar.setAttribute('title', 'Expandir Menu');
        } else {
            toggleIcon.className = 'fa-solid fa-chevron-left';
            btnToggleSidebar.setAttribute('title', 'Recolher Menu');
        }
    });

    // 🔄 ALTERNADOR DE ABAS DA SIDEBAR
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(i => i.classList.remove('active'));
            pagePanes.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            const targetPage = item.getAttribute('data-page');
            const targetPane = document.getElementById(`page-${targetPage}`);
            
            if (targetPane) targetPane.classList.add('active');

            if (targetPage === 'visao-geral') {
                headerTitle.innerText = 'Painel de Controle';
                headerSubtitle.innerText = 'Monitoramento de envios em tempo real';
            } else if (targetPage === 'pendencias') {
                headerTitle.innerText = 'Gestão de Pendências';
                headerSubtitle.innerText = 'Controle de auditoria e quebras do Full';
            }
        });
    });

    // 📡 CAPTURA DE DADOS DO FIREBASE EM TEMPO REAL
    async function carregarDadosDoBack() {
        try {
            const res = await fetch('https://dashfulll-2321b-default-rtdb.firebaseio.com/historico_envios.json'); 
            const data = await res.json();

            if (!data) {
                dadosLocais = [];
                atualizarPainelCompleto();
                return;
            }

            // Converte objeto do Firebase para Array
            const listaFormatada = Object.keys(data).map(id => data[id]);

            // Ordena do mais recente para o mais antigo
            listaFormatada.sort((a, b) => new Date(b.data) - new Date(a.data));

            dadosLocais = listaFormatada;
            atualizarPainelCompleto();

            const statusBadge = document.getElementById('sync-status');
            if (statusBadge) {
                statusBadge.innerText = 'Sincronização completa!';
                statusBadge.style.backgroundColor = '#e6f6ee';
                statusBadge.style.color = '#0f9d58';
            }

        } catch (err) {
            console.error("Erro ao conectar ao Firebase:", err);
            const statusBadge = document.getElementById('sync-status');
            if (statusBadge) {
                statusBadge.innerText = 'Erro de conexão';
                statusBadge.style.backgroundColor = '#fee2e2';
                statusBadge.style.color = '#ef4444';
            }
        }
    }

    // ⚡ FUNÇÃO GLOBAL PARA ATUALIZAR STATUS NO FIREBASE (REPLICA PARA TODOS)
    window.alterarStatusEnvio = async function(idEnvio, novoStatus) {
        const statusBadge = document.getElementById('sync-status');
        if (statusBadge) {
            statusBadge.innerText = 'A atualizar na nuvem...';
            statusBadge.style.backgroundColor = '#fef3c7';
            statusBadge.style.color = '#d97706';
        }

        const url = `https://dashfulll-2321b-default-rtdb.firebaseio.com/historico_envios/${idEnvio}.json`;

        try {
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meu_status: novoStatus })
            });

            if (!res.ok) throw new Error('Falha na resposta do servidor');

            console.log(`✅ Envio ${idEnvio} atualizado com sucesso para: ${novoStatus}`);
            await carregarDadosDoBack();

        } catch (erro) {
            console.error("❌ Erro ao sincronizar a ação do operador:", erro);
            if (statusBadge) {
                statusBadge.innerText = 'Erro ao sincronizar';
                statusBadge.style.backgroundColor = '#fee2e2';
                statusBadge.style.color = '#ef4444';
            }
        }
    };

    // 📋 CONSTRUTOR GERAL E RECALCULADOR
    function atualizarPainelCompleto() {
        filtrarEProcessarDados();

        const pendentes = dadosLocais.filter(item => item.status === 'closed_with_changes' || item.unidades_recebidas < item.unidades_declaradas);
        badgePendenciasNav.innerText = pendentes.length;
        renderizarTabelaPendencias(pendentes);

        document.getElementById('count-todos').innerText = `(${dadosLocais.length})`;
        document.getElementById('count-finalizados').innerText = `(${dadosLocais.filter(i => i.status === 'closed_ok').length})`;
        document.getElementById('count-divergencias').innerText = `(${dadosLocais.filter(i => i.status === 'closed_with_changes').length})`;
        document.getElementById('count-agendados').innerText = `(${dadosLocais.filter(i => i.status === 'pending' || i.status === 'active').length})`;

        renderizarGraficosDinâmicos(dadosLocais);
    }

    // 🔍 ENGINE DE FILTRAGEM AVANÇADA COMBINADA + ORDENAÇÃO
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
            if (statusPillAtivo === 'closed_ok') batePill = (item.status === 'closed_ok');
            else if (statusPillAtivo === 'closed_with_changes') batePill = (item.status === 'closed_with_changes');
            else if (statusPillAtivo === 'pending') batePill = (item.status === 'pending' || item.status === 'active');

            return bateConta && bateGalpao && bateId && batePill;
        });

        dadosFiltradosAtuais.sort((a, b) => {
            return ordemSelecionada === 'recente' 
                ? new Date(b.data) - new Date(a.data)
                : new Date(a.data) - new Date(b.data);
        });

        paginaAtual = 1;
        recalcularEExibirPagina();
    }

    // 🔢 MOTOR DE PAGINAÇÃO
    function recalcularEExibirPagina() {
        const totalItens = dadosFiltradosAtuais.length;
        const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1;

        if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

        const indiceInicio = (paginaAtual - 1) * itensPorPagina;
        const indiceFim = Math.min(indiceInicio + itensPorPagina, totalItens);

        const dadosPaginados = dadosFiltradosAtuais.slice(indiceInicio, indiceFim);

        paginacaoInfo.innerText = totalItens > 0 
            ? `Exibindo ${indiceInicio + 1}-${indiceFim} de ${totalItens} envios`
            : `Exibindo 0-0 de 0 envios`;

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

    // 📋 RENDER: VISÃO GERAL (INTEGRADO COM FIREBASE E DROPDOWN)
    function renderizarTabelaGeral(envios) {
        if (!tbodyGeral) return;
        tbodyGeral.innerHTML = '';

        if (envios.length === 0) {
            tbodyGeral.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#6b7280;">Nenhum envio localizado.</td></tr>';
            return;
        }

        envios.forEach(envio => {
            // Definições de Cores para o Status Interno (Firebase)
            const statusHumano = envio.meu_status || 'Pendente';
            let corBadge = '#6b7280'; 
            if (statusHumano === 'Finalizado') corBadge = '#10b981'; 
            if (statusHumano === 'Com Divergência') corBadge = '#ef4444'; 
            if (statusHumano === 'Agendado') corBadge = '#3b82f6'; 

            // Definições de Cores para o Status Original do ML
            let statusLabel = 'Agendado';
            let statusClass = 'badge-azul';
            if (envio.status === 'closed_ok') { statusLabel = 'Finalizado'; statusClass = 'badge-verde'; }
            else if (envio.status === 'closed_with_changes') { statusLabel = 'Divergência'; statusClass = 'badge-laranja'; }
            else if (envio.status === 'expired') { statusLabel = 'Expirado'; statusClass = 'badge-vermelho'; }
            else if (envio.status === 'cancelled') { statusLabel = 'Cancelado'; statusClass = 'badge-vermelho'; }

            // Datas e Volumes
            const dataObjeto = new Date(envio.data);
            const dataFormatada = dataObjeto.toLocaleDateString('pt-BR');
            const horaFormatada = dataObjeto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const temQuebra = envio.unidades_recebidas < envio.unidades_declaradas;
            const unidadesHtml = temQuebra 
                ? `<span class="texto-danger"><strong>${envio.unidades_declaradas}</strong> / ${envio.unidades_recebidas} <i class="fa-solid fa-triangle-exclamation"></i></span>`
                : `<strong>${envio.unidades_declaradas}</strong> / ${envio.unidades_recebidas}`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${envio.conta}</strong></td>
                <td>#${envio.id_envio}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                
                <td>
                    <span style="background-color: ${corBadge}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                        ${statusHumano}
                    </span>
                </td>
                
                <td>${unidadesHtml}</td>
                <td><span class="galpao-tag">${envio.galpao}</span></td>
                <td><strong>${dataFormatada}</strong> <span style="color:#6b7280; font-size:12px;">${horaFormatada}</span></td>
                
                <td class="text-center">
                    <select onchange="window.alterarStatusEnvio('${envio.id_envio}', this.value)" style="padding: 4px; border-radius: 4px; border: 1px solid #d1d5db; font-size: 13px; cursor: pointer; outline: none;">
                        <option value="Pendente" ${statusHumano === 'Pendente' ? 'selected' : ''}>⏳ Pendente</option>
                        <option value="Agendado" ${statusHumano === 'Agendado' ? 'selected' : ''}>📅 Agendado</option>
                        <option value="Finalizado" ${statusHumano === 'Finalizado' ? 'selected' : ''}>✅ Finalizado</option>
                        <option value="Com Divergência" ${statusHumano === 'Com Divergência' ? 'selected' : ''}>⚠️ Com Divergência</option>
                    </select>
                </td>
            `;
            tbodyGeral.appendChild(tr);
        });
    }

    // ⚠️ RENDER: SEGUNDA PÁGINA PENDÊNCIAS
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
                <td class="text-center">
                    <button class="btn-action primary" style="background-color:#e67e22; border-color:#e67e22;"><i class="fa-solid fa-magnifying-glass-list"></i> Abrir Auditoria</button>
                </td>
            `;
            tbodyPendencias.appendChild(tr);
        });
    }

    // 📉 CHART ENGINE
    function renderizarGraficosDinâmicos(envios) {
        const qtdAraca = envios.filter(i => i.galpao.includes('Araçariguama')).length;
        const qtdPerus = envios.filter(i => i.galpao.includes('Perus')).length;

        let totalDec = 0, totalRec = 0;
        envios.forEach(i => { totalDec += i.unidades_declaradas; totalRec += i.unidades_recebidas; });

        if (chartInstanceGalpao) chartInstanceGalpao.destroy();
        const ctxGalpao = document.getElementById('chart-galpoes');
        if(ctxGalpao) {
            chartInstanceGalpao = new Chart(ctxGalpao.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Araçariguama', 'Perus'],
                    datasets: [{
                        data: [qtdAraca || 1, qtdPerus || 0],
                        backgroundColor: ['#3483fa', '#f39c12'],
                        borderWidth: 2
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, weight: 600 } } } } }
            });
        }

        if (chartInstanceDivergencia) chartInstanceDivergencia.destroy();
        const ctxDivergencia = document.getElementById('chart-divergencias');
        if(ctxDivergencia) {
            chartInstanceDivergencia = new Chart(ctxDivergencia.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: ['Métricas Totais de Peças'],
                    datasets: [
                        { label: 'Declarado', data: [totalDec], backgroundColor: '#3483fa' },
                        { label: 'Recebido', data: [totalRec], backgroundColor: '#2ecc71' }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { labels: { boxWidth: 12, font: { weight: 600 } } } } }
            });
        }
    }

    // 📊 RECALCULADOR DE KPIs
    function recalcularCardsKPI(envios) {
        if(cardEnvios) cardEnvios.innerText = envios.length;
        let dec = 0, rec = 0;
        envios.forEach(e => { dec += Number(e.unidades_declaradas); rec += Number(e.unidades_recebidas); });

        if(cardDeclarado) cardDeclarado.innerText = dec.toLocaleString('pt-BR');
        if(cardRecebido) cardRecebido.innerText = rec.toLocaleString('pt-BR');

        if(cardDiscrepancia) {
            if (dec > 0) {
                const quebra = dec - rec;
                cardDiscrepancia.innerText = `${((quebra / dec) * 100).toFixed(1)}%`;
            } else {
                cardDiscrepancia.innerText = '0%';
            }
        }
    }

    // 🎛️ ESCUTAS DE EVENTOS DE FILTRAGEM
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

    // ⏱️ RELÓGIO OPERACIONAL
    setInterval(() => {
        const liveClock = document.getElementById('live-clock');
        if(liveClock) liveClock.innerText = new Date().toLocaleTimeString('pt-BR');
    }, 1000);

    // Arranca verificando se o operador já está logado e carregando os dados
    verificarOperador();
    carregarDadosDoBack();
});
