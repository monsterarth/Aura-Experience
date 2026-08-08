# 0.6.0 — Manutenção em Produção

**Data:** 2026-07-13
**Highlight:** Módulo novo

## Novo (feature)

- Módulo de Manutenção em produção: console de gestão do coordenador (`/maintenance-ops`) para atribuir técnicos, acompanhar o quadro e aprovar/reprovar ordens de serviço, e app do técnico (`/maintenance`) para executar com checklist e foto de conclusão.
- Reportar Manutenção de qualquer lugar: camareira, garçom, houseman e recepção agora abrem chamados com foto direto dos seus apps — a demanda cai no pool do coordenador na hora.
- Manutenções preventivas automáticas: as regras periódicas cadastradas no kanban geram tarefas sozinhas todos os dias às 17:20, sem depender de ninguém lembrar.
- Coordenador de manutenção cai direto no console de gestão ao entrar no sistema; quem acumula cargos alterna de área pelo seletor no topo do app.

## Melhoria (improvement)

- Todas as ações de manutenção e da conferência de checkout (incluindo o frigobar) passaram a ser processadas no servidor: acabou o spinner infinito quando o celular bloqueia logo após o toque.
- Permissões por ação na manutenção: técnico executa; atribuir, aprovar, reprovar e apagar são exclusivos da coordenação e governança.
- Mensagens de erro reais nos apps de campo: em vez de um aviso genérico, a tela informa o motivo (ex.: conflito com uma estadia ativa na cabana).
- Chamado novo sem técnico definido agora notifica todo o time de manutenção por push.

## Correção (fix)

- Ficha de estadias de "uso da casa" não abria em Estadias nem no Mapa de Reservas, o que também impedia o check-out — corrigido.
- Conferência da governança travava ao lançar o frigobar (botão girando sem concluir) — corrigido.
- Marcação de checklist do técnico não se perde mais em silêncio se a conexão ou a sessão falhar: a tela desfaz o ✓ e permite tentar de novo.
- Rotina de preventivas não gera mais tarefas duplicadas quando executada mais de uma vez no mesmo dia.
