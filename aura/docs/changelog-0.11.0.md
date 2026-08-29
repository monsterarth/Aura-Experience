# 0.11.0 — Guarita

- **Versão:** 0.11.0
- **Rótulo:** Guarita e o painel da plataforma
- **Data:** 29/08/2026
- **Destaque:** Módulo Guarita

---

### feature

1. **Módulo Guarita.** O estacionamento sai da planilha de papel e da reserva-fantasma no HMAX. A placa deixa de ser anotação do dia e vira cadastro: quando o guarita digita, o sistema responde de quem é o carro — hóspede (a placa vem do pré-check-in), fornecedor, equipe ou cliente conhecido. A digitação vira conferência.

2. App do porteiro com quatro abas: painel, registrar, pátio e turno. O painel mostra o que hoje se descobre por rádio — chegadas do dia com hora prevista e placa, saídas, evento do dia e quem está no pátio.

3. A tarifa é **do dia**, não do tempo: R$ 150 num sábado bonito de alta, R$ 30 na baixa, e dia em que o estacionamento nem abre. Definida pela recepção ou pela gestão, com valores prontos para um toque.

4. Todo veículo entra cobrável e quem dispensa é o guarita, com o botão Isento — hóspede, fornecedor e equipe normalmente não pagam, mas quem decide é quem está lá vendo quem chegou. Hóspede e visita ficam atrelados à cabana.

5. Fechamento de turno que sai somado: total recebido, quantidade de veículos, divisão por forma de pagamento, isentos por tipo e o que ficou em espécie na gaveta. É o resumo que hoje vai à recepção em papel — só que conferido.

6. A NSU do cartão é única no dia. Repetir o mesmo número em dois carros passa a ser barrado, dizendo qual carro já usou aquela NSU. E o turno não fecha com NSU pendente.

7. Placa marcada (quem saiu sem pagar) alerta na entrada, com o motivo e a data.

8. Cadastro de equipe ganhou o campo de placa: o carro do colaborador se identifica sozinho na portaria em vez de virar "visita".

9. **Painel da plataforma** (super admin) virou um cockpit de verdade. Antes mostrava quatro contagens e dizia "3 propriedades ativas" quando duas são teste. Agora mostra o trabalho executado nos últimos 30 dias, o plantão (fila travada, falhas de envio, logins recusados, semáforo das rotinas automáticas), a infraestrutura com o ranking de quem consome o banco, e a adoção módulo a módulo — propriedade sem estadia e sem ação entra como "Dormente" em vez de fingir saúde.

10. Módulos podem ser desligados por propriedade de verdade: desligar esconde o menu para todos e fecha o acesso por trás, não só some o item da lista.

### improvement

11. Movimentações do estoque abriam com seis requisições e mostravam dado incompleto enquanto carregava.

12. O sino: abrir a Comunicação passou a contar como ler as mensagens. Sem isso, nenhum gesto natural marcava nada — 3.503 notificações se acumularam em nove dias.

### fix

13. Os três índices de mensagens criados para aliviar o banco **nunca puderam ser usados**: um detalhe do PostgREST os tornava inalcançáveis, e cada consulta seguia varrendo as 36 mil linhas. Corrigidos e verificados no plano de execução.

14. App de campo: falha de carregamento se disfarçava de "não há trabalho hoje". Agora a tela diz que não conseguiu carregar.

15. "Limpar mensagens" não marcava nada quando quem clicava era o super admin.

16. **Segurança:** marcar mensagem como lida aceitava qualquer funcionário logado, de qualquer propriedade.

17. Menu suspenso dentro de janela engolia a primeira escolha e obrigava a escolher duas vezes.

18. Orçamento: editar o pedido parava na tela e voltava atrás sozinho — uma tela desatualizada regravava por cima do que tinha acabado de ser salvo.

19. Trocar a integração de canais de observação para ativo agora pede confirmação explícita.
