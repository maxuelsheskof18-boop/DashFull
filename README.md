# DashFull Sistema Único v11

Atualizações:
- 100% responsivo: desktop, tablet e mobile.
- Mobile refinado com cards, filtros, gráficos e edição.
- Atualização quase em tempo real: o painel consulta a base a cada 6 segundos.
- Alterações feitas por um operador aparecem para os outros automaticamente.
- Salvamento otimista: atualiza na tela na hora e grava no backend.
- Itens em segundo plano: o app monitora /status e força rodadas leves de /sync-items?limit=30 com trava local.
- O backend também deve ficar em WORKER_MODE=continuous para puxar itens automaticamente.
- Botão de puxar itens continua existindo apenas para forçar ou corrigir erro.

Backend configurado:
https://atendente-dashfull-itens-worker.2cwhzy.easypanel.host

Variáveis recomendadas no EasyPanel:
WORKER_MODE=continuous
RUN_ON_START=true
INTERVALO_ITENS_MINUTOS=5
MAX_ENVIOS_POR_RODADA=30
CONCORRENCIA_PAGINAS=3
ERROR_COOLDOWN_MINUTES=180
