# 0.7.0 — Estoque

**Data:** 2026-08-01
**Highlight:** Estoque

## Novo (feature)

- **Página Estoques:** cada local é um card com o valor guardado, o total de itens e quantos estão abaixo do mínimo, com histórico e correção de saldo item a item.
- **Lançamento em lote:** várias entradas de uma vez no formato de nota de compra, com estorno do lote inteiro em um clique.
- **Relatórios** de posição de estoque, movimentações e perdas, com filtros e exportação em CSV ou impressão A4.
- **Cabanas viraram estoque:** cada cabana do cadastro é um local automático — dá para saber quanto de enxoval e amenities está em cada uma.
- **Entrega para colaborador:** o material entregue fica registrado com o nome de quem levou, e a devolução também.
- **Responsável pela ação** em toda movimentação, para saber quem respondeu por cada retirada.

## Melhoria (improvement)

- A ficha do produto — saldo por local, lotes, validade e histórico — abre clicando no produto em qualquer tela do estoque.
- Listas de local agrupadas por tipo e listas de colaborador agrupadas por cargo.
- O quadro da camareira mostra apenas as faxinas que ela pode executar.
- A fila de automações passou a mostrar o motivo real de cada falha de envio.

## Correção (fix)

- Telas abertas por muitas horas paravam de responder depois que o sistema renovava o acesso — corrigido.
- Busca do hóspede por documento na Nova Hospedagem podia ficar carregando sem fim — corrigido.
- Local de estoque com saldo ou histórico não pode mais ser excluído.
- Faxina recusada pelo hóspede não era registrada e voltava para a fila — agora aparece no kanban da governança.
- Mensagens de WhatsApp já entregues ficavam presas em "Agendadas" — corrigido.
- Elogios e pontos a melhorar da pesquisa apareciam misturados — agora aparecem separados.
