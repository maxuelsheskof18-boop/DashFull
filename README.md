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


## v18
Correções visuais e de console:
- Corrige a linha verde esticada no card.
- O indicador volta a ser apenas uma bolinha pequena.
- Remove o erro `ReferenceError: next is not defined` ao clicar nos filtros.
- Mantém cache, destaques e carregamento por envio.


## v19
Correção para itens já existentes na planilha demorando:
- Ao clicar em Ver itens, o front tenta o envio individual.
- Se a rota individual não devolver itens, busca /historico_envios.json e extrai aquele ID.
- Mostra mensagem clara quando a planilha tem resumo de itens, mas o backend não devolve os itens detalhados.
- Backend incluído ajustado para /historico_envios/:id.json devolver itens junto do envio.


## v20 — Produtos / Mês
- Nova aba: Produtos / Mês.
- Todo mês começa em 0.
- Soma os itens enviados para Full por mês, SKU e produto.
- Mostra quantidade prevista, confirmada, total do mês, quantidade de Fulls, contas e último envio.
- Permite exportar CSV.
- Front tenta usar /api/produtos-mes; se o backend ainda não tiver, calcula localmente com os itens já carregados.
- Backend incluído já possui /api/produtos-mes.


## v21 — Correção do salvar itens
- Corrige o problema visual em que a alteração salvava localmente, mas a tela re-renderizava usando o cache antigo.
- Agora o cache local de detalhes é atualizado junto com o item salvo.
- Ao marcar status “Feito”, se a quantidade estiver 0, preenche automaticamente com a quantidade declarada.
- Se o backend/EasyPanel não responder, a alteração não some: fica na fila local e tenta sincronizar depois.
- Cada item mostra status: alterado, salvando, salvo ou pendente.
- Botão “Salvar todos os itens abertos”.
