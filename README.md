# DashFull Sistema Único v13

Correções:
- Agendados agora usa status real do Mercado Livre/operacional.
- Recusados/refused não entram mais em Agendados.
- processed_with_problems/problemas não entram mais em Agendados.
- Cancelados, finalizados, recusados e problemas ficam separados.
- Novo filtro: Divergentes.
- Itens e envios começam priorizando agendados.
- Backend de itens também foi ajustado para puxar primeiro agendados e pular recusados/cancelados/finalizados/problemas.

Backend configurado:
https://atendente-dashfull-itens-worker.2cwhzy.easypanel.host


## v14
- Lista principal mais rápida: usa resumo leve e carrega detalhes por ID do envio.
- Ao clicar em Ver itens ou Detalhes, busca o envio específico no histórico da planilha.
- Cards mais separados visualmente, com trilha lateral para deixar claro um envio abaixo do outro.


## v15
- Cache local dos detalhes/itens já abertos.
- Depois que um envio foi aberto uma vez, os itens aparecem muito mais rápido.
- Botão “Limpar cache local” na aba Sincronizar.
- Destaque visual forte:
  - amarelo para divergente
  - vermelho para erro de itens
  - amarelo claro para sem itens
  - verde para itens no cache
  - azul piscando quando está carregando


## v16
Correção do erro 404 em /api/mobile/envios:
- O front agora tenta /api/mobile/envios.
- Se o backend ainda não tiver essa rota, cai automaticamente para /historico_envios.json.
- O backend incluído nesta versão também já tem a rota /api/mobile/envios.
- Botões de puxar itens tentam /sync-items e, se não existir, tentam /sync-items-all.


## v17
Correção definitiva do erro 404 no console:
- Removida a chamada automática para /api/mobile/envios.
- O painel usa diretamente /historico_envios.json, que é o endpoint que já funciona no seu backend atual.
- Mantém cache local dos itens já abertos.
- Mantém abertura por ID do envio quando clicar em Detalhes ou Ver itens.
