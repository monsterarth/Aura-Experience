# 0.10.0 — Estadias e Conta

- **Versão:** 0.10.0
- **Rótulo:** Estadias e Conta
- **Data:** 25/08/2026
- **Destaque:** A conta é a estadia

---

### feature

1. A aba "Conta" saiu de cena: a conta virou parte da própria estadia. Abrir uma hospedagem mostra os quatro sinais que a recepção precisa — chave, objetos emprestados, esquecidos e a conta em si — no mesmo lugar em que se vê quem está na cabana.

2. A conta agora é a MESMA nas três telas (modal, ficha rápida e ficha completa). Antes cada uma tinha a sua, e a mais bonita era a que menos gente usava.

3. Lançar na conta deixou de ser só texto livre: a aba "Do catálogo" traz busca, filtro por grupo e carrinho sobre os itens do Concierge — frigobar, amenidades, empréstimos. É o mesmo caminho da camareira pelo app: cobra o preço, baixa o estoque pela ficha técnica e registra a entrega. O lançamento avulso continua na outra aba.

4. Empréstimos deixaram de ser uma anotação digitada no check-out e passaram a ser o que já eram no sistema: itens entregues e não devolvidos. O que a governança ou o mensageiro entregam aparece na conta sozinho, com "Devolvido" e "Extraviado" (que cobra o valor de perda) na própria linha. O passo 2 do check-out virou conferência: lista o que está com o hóspede para devolver na hora.

5. A ficha rápida renasceu. Mostra de relance quem está na cabana — titular, acompanhantes **pelo nome** (a lista tinha sumido da tela) e pets como parte do grupo, mais a placa do veículo —, as pendências em aberto (chave, empréstimos, esquecidos, pedidos de governança e concierge) e a origem da reserva em pill: Balcão, Site, Booking, com o código do canal e aviso quando as automações estão desligadas para OTA.

6. Cabana, datas, hóspedes e horário previsto subiram para o cabeçalho do modal; check-in/out, editar e ficha completa viraram ícones no canto. O que se faz mil vezes por dia precisa de alvo, não de rótulo. A chegada prevista some depois que o hóspede chega.

7. Estadias encerradas ganharam a grade "Últimas saídas": um card por cabana, sempre visível, até outro check-out sobrepor. Cabana sem saída aparece apagada em vez de deixar buraco; cabana fora de operação fica fora. No card: quem saiu, há quantos dias, a nota da avaliação e a carteira que abre a conta.

8. O histórico de encerradas agora é paginado. O corte em 100 linhas era mudo — o resto simplesmente não existia.

9. Cada pessoa escolhe como vê a lista de estadias (cartão, compacto ou lista) e a escolha fica salva no usuário, não no navegador: o PC da recepção é compartilhado. Filtros e ordenação de verdade, e as reservas futuras separadas por chegada em até 72 horas.

10. Proposta pública: depois de aceitar, o próprio cliente preenche os dados da reserva — titular, endereço, acompanhantes, placa, pet e forma de pagamento. Chega pronto, sem a recepção redigitar do WhatsApp.

11. A ficha do hóspede agora sabe quando foi criada. As datas reais foram recuperadas do histórico de auditoria onde existiam.

### improvement

12. Orçamento: as acomodações são compostas na própria calculadora, a ordem muda por arrasto no drawer e a acomodação de cabana única já leva o nome dela.

13. Ambiente de teste ficou impossível de confundir com produção: aviso na barra lateral, no rodapé e na barra do celular. Junto veio um banco de testes que espelha a produção e um modo seguro em que nenhuma mensagem sai de verdade.

14. Preparação para receber reservas dos canais (Booking, site) direto no sistema, sem digitação. Ainda desligado — entra em modo de observação primeiro.

### fix

15. O alerta "Doc pendente" ficava preso para sempre em algumas fichas. A raiz era o cadastro provisório que nunca virava o documento do hóspede; agora vira sozinho.

16. Automações mandavam mensagem duplicada para o hóspede e a lista de conversas congelava.

17. Tarifário: o botão "Sobrepor" do conflito de regras voltou a funcionar — e parou de destruir o calendário quando falhava no meio.

18. Comercial: casamento voltou a marcar a cotação, cabana única já vem escolhida e a aba Negociação ganhou o botão Salvar que faltava.
