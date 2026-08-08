# 0.7.1 — Patrimônio

**Data:** 2026-08-02
**Highlight:** Patrimônio

## Novo (feature)

- **Plaqueta com QR Code:** cada bem ganha um código próprio e um endereço permanente — apontar a câmera do celular para a plaqueta abre a ficha do equipamento, sem senha e sem app.
- **Relatar problema pela plaqueta:** hóspede, camareira ou técnico escaneia o QR, descreve o defeito e anexa foto; o chamado nasce no quadro da manutenção já sabendo qual equipamento é e onde ele está.
- **Ficha do ativo:** dados, fotos, nota fiscal, garantia, chamados de manutenção e quanto já custaram, movimentações, depreciação mês a mês e quem mexeu no cadastro.
- **Baixa de patrimônio:** com motivo, data, valor recebido e documento — o histórico contábil fica preservado e o sistema mostra se houve ganho ou perda na venda.
- **Conferência de patrimônio:** abra uma campanha por local, percorra bipando ou digitando os códigos e feche vendo o que foi encontrado, o que estava em outro lugar e o que não apareceu; os itens deslocados corrigem o cadastro sozinhos.
- **Responsável e movimentação:** quem responde por cada bem e para onde ele foi, com motivo — responde ao "cadê a TV da cabana 7".
- **Relatórios de patrimônio:** posição patrimonial, razão de depreciação, garantias a vencer, custo de manutenção por bem e baixas do período, com filtros, CSV e impressão A4.
- **Folha de etiquetas:** gera as etiquetas em A4 para colar nas plaquetas, com prévia em tamanho real e ajustes de tamanho, logo, moldura e nome do ativo.
- **Nº de patrimônio automático:** gerado em sequência, sem repetir, com prefixo configurável.
- **Histórico de movimentações do estoque:** uma tela para procurar no que já aconteceu, com filtros por período, tipo, produto, estoque, responsável e palavra dentro da observação.

## Melhoria (improvement)

- **O estoque parou de parecer setor financeiro:** o valor em reais saiu das telas do dia a dia, que agora falam em saldo, unidades e estoque mínimo. Quanto vale continua em Visão Geral, Compras, Fornecedores, Relatórios e Perdas.
- As observações escritas no lançamento passaram a aparecer na ficha do produto e nas últimas movimentações, não só no histórico.
- Da página de um estoque ou da ficha de um produto dá para abrir o histórico já filtrado por ele.
- Lista de patrimônio com filtros por status, categoria, local, responsável e situação da garantia.
- A etiqueta só é impressa se a pousada tiver domínio próprio configurado: como o QR fica gravado na plaqueta, usar o endereço do Aura prenderia o patrimônio a este sistema.
- Logo completa da propriedade, com o nome escrito, usada na etiqueta grande — as duas versões passaram a ter upload direto.
- Exclusão de ativo é recusada quando existe qualquer histórico; o caminho passa a ser a baixa.

## Correção (fix)

- A depreciação de um mês era calculada com a data de hoje, e não com o fim daquele mês — reprocessar um período fechado dava outro valor. Agora o número é sempre o mesmo.
- Bem baixado continuaria depreciando para sempre; o valor contábil agora congela na data da baixa.
- Excluir um ativo apagava junto toda a depreciação lançada — corrigido.
- Uma cabana podia ficar presa em "ocupada" sem ninguém hospedado, sem check-out a fazer e sem aceitar entrada nova — corrigido.
- Check-in que falhava ao gravar ainda dizia "realizado". Agora a recepção é avisada de que não foi gravado, e nada fica alterado pela metade.
