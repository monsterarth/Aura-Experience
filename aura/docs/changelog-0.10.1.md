# 0.10.1 — A nota entra pelo XML

- **Versão:** 0.10.1
- **Rótulo:** A nota entra pelo XML
- **Data:** 26/08/2026
- **Destaque:** Compra pelo XML

---

### feature

1. Lançar compra digitando item a item acabou. Entra o XML da nota (solto ou o .zip do contador) e ele já traz fornecedor, itens, quantidades, custos, frete e desconto prontos.

2. O sistema aprende o de-para do fornecedor: "REFRIG COCA COLA 2L CX/6" vira "Coca-Cola 2L" daqui, e da próxima vez ele lembra — inclusive do fator de embalagem (1 caixa = 12 unidades), que a nota costuma entregar de graça.

3. A linha que não é estoque vira ativo em Patrimônio na mesma leva, já ligada à compra.

4. A mesma nota não entra duas vezes: a chave de acesso é única por propriedade. E a compra nasce em rascunho — quem mexe em saldo, custo médio e validade continua sendo o botão Receber.

5. Foto tirada no celular agora é comprimida no próprio navegador antes de subir. Foto de 8 MB vira algo na casa de centenas de KB, sem diferença visível na tela.

### improvement

6. Os aplicativos de campo pediam **cinco meses** de faxinas a cada atualização de tela — 779 KB por chamada, em cada aparelho, o dia inteiro. Agora pedem só a janela que a tela realmente usa. A app da camareira ficou visivelmente mais rápida no 4G da fazenda.

### fix

7. **Segurança:** a chave pública do site — a que viaja no JavaScript de qualquer visitante — conseguia ler **e escrever** 36 mil mensagens, com telefone e conteúdo, além dos registros de comunicação. Dava para enfileirar mensagem que o sistema mandaria pelo WhatsApp da pousada, e para apagar o histórico. Fechado.

8. **Segurança:** o isolamento entre propriedades não existia de fato no navegador. Simulando o acesso de outra pousada, era possível enxergar 394 hóspedes, 448 estadias, 192 contas e 1.807 tarefas da Fazenda do Rosa. Agora cada propriedade só enxerga a si mesma.

9. Camareira: um toque acidental podia pular a faxina sem confirmação, e desfazer era igualmente fácil de disparar sem querer. Ação destrutiva agora pede segurar para confirmar, tem trava contra clique fantasma e desfazer dentro do próprio app.

10. Evento de vários dias sumia do portal do hóspede no meio do próprio evento.

11. Eventos: a escrita saiu do navegador e passou por rota própria com validação de verdade.
