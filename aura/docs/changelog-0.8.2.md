# 0.8.2 — Estoque por setor, site dos noivos e ajustes do comercial

**Data:** 2026-08-21
**Highlight:** Estoque & Casamentos

## Novo (feature)

### 📦 Estoque
- **Política de saldo por local:** um local pode ser estoque (controla saldo), ponto de consumo total (transferir para ele equivale a saída — manutenção, refeitório, lavanderia, casa 28) ou consumo só de algumas categorias. Devolução de um setor volta como entrada ao custo médio atual; patrimônio e bens duráveis (toalha de rosto, por exemplo) mantêm saldo no setor. Relatório novo "Consumo por setor".
- **Reposição da camareira virou feature do Estoque:** o pedido aponta o produto (marcado como "solicitável pela camareira"), nunca toca o fólio do hóspede, baixa do estoque na entrega com uma fonte única de baixa (componente → produto → categoria) e orienta o mensageiro com "retirar de X" ou "não há no X, pegar no Y". Governanta ganha a aba Reposição; o Concierge volta a ser só o catálogo do hóspede.
- **Custo médio de volta** na listagem de produtos (visível só para admin, gerência e compras).

### 💍 Casamentos — site dos noivos
- **Página pública /casamento:** código para convidados (simulador de hospedagem com a tabela do casamento e pré-reserva que cai direto no funil comercial, com selo e alarme) e código dos noivos (painel com ocupação por categoria e personalização de foto, mensagem e cores), em PT/EN/ES com o tema camaleão da pousada.
- **Preço da janela do evento pela tabela vinculada ao casamento** (preço seco, sem flutuação nem promoção); noites estendidas saem pelo tarifário normal; pré-reservas abertas descontam da disponibilidade do simulador.

### 🏨 Hospedagem
- **Mais de um pet por estadia** (até 5), no pré-check-in e na ficha da estadia; acima do limite da pousada o sistema avisa em vez de bloquear. Nova configuração "Máximo de pets" em Operacional.
- **Telefone com código de país (DDI)** separado do número, no pré-check-in (que antes nem coletava telefone) e na criação da reserva — fecha a origem do erro de envio do WhatsApp por número sem o 55.

### 🤝 Comercial
- **Orçamento em PT/EN/ES:** seletor de idioma no wizard; templates de WhatsApp e "o que está incluso" ganham versões em inglês e espanhol; a proposta pública abre no idioma escolhido, com troca pelo próprio cliente.
- **Documento internacional** (passaporte, RG, DNI, CNH) no lead, no painel do cliente e na promoção a hóspede.
- **Cotar fora da capacidade** (3 pessoas numa cabana de 2, por exemplo), sempre com justificativa, marcada na tela, na proposta e na auditoria; o pax correto viaja até a estadia e o pré-check-in.
- **Orçamento repetido virou um comparativo,** não um beco: lado a lado o que já está no funil e o que foi digitado agora, com três saídas — atualizar o existente, manter o salvo ou criar um pedido à parte. Nada do que foi digitado se perde.

## Melhoria (improvement)

- **Dados do cliente no drawer do lead só gravam ao clicar em Salvar,** com aviso ao fechar com alteração pendente (antes gravava a cada tecla).
- **Estoque e patrimônio no celular:** listas viram cards, formulários em uma coluna, modal de produto rolável com cabeçalho e rodapé fixos.
- **A etiqueta LOTE nas movimentações faz o que aparenta:** abre o conteúdo do lote. O estorno passou para o Histórico, dentro da expansão, mostrando tudo o que será invertido e acusando lote já estornado.

## Correção (fix)

- **O orçamento oferecia todas as cabanas que cabiam no pax,** ignorando as desmarcadas pelo vendedor — agora só as marcadas chegam à proposta pública e ao "a partir de".
- O seletor de tipo de documento exigia dois cliques; o motivo de perda ficava ilegível no tema claro.
- Regras de calendário do tarifário não aceitam mais escrita da recepção (só consulta, como previsto).
- Site dos noivos: limite de tentativas de código, upload sem SVG, códigos de convidado e de noivos nunca coincidem; promoção com mínimo de noites avaliada pela estadia inteira e mínimo de noites das extensões respeitado.
