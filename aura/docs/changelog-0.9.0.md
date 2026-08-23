# 0.9.0 — Nova interface do admin

**Data:** 2026-08-22
**Highlight:** Interface nova

## Novo (feature)

### 📱 O admin inteiro no celular
- **Todas as páginas funcionam no telefone:** barra de abas inferior com os 4 destinos do cargo + "Mais" (menu completo), botão flutuante de ação nas listas, barra de ações fixa nos formulários, tabelas que viram cards, kanbans que mostram uma coluna por vez (chips para trocar de etapa) e modais que viram folhas (curtos) ou tela cheia (formulários longos).
- **Escalas e tarifário mantêm a matriz,** rolável na horizontal, com a primeira coluna fixa para não perder a referência.
- **Uma sobreposição por vez, sempre com fechamento visível,** inputs com tamanho que não dá zoom no iPhone, área de toque mínima de 44px e respeito ao entalhe dos aparelhos.

### 🎨 Uma identidade só — e tema claro
- **Tema claro completo** (paleta fria/azulada), escolhido em Preferências, em todas as páginas do admin — além do escuro de sempre. Fonte DM Sans no admin inteiro.
- **Kit de componentes único** (cabeçalho de página, indicadores, cards, pills, botões, abas, filtros, busca, campos, listas, diálogos e skeletons): as páginas genéricas ganharam a cara do Aura, a mesma de Concierge e Casamentos.

### ✨ Movimento e feedback
- **Carregamento com skeletons** no lugar de spinners; entradas e saídas suaves (e interrompíveis) em diálogos, folhas e drawers; botões com estado de carregamento; toasts posicionados para não cobrir a ação.
- **Confirmações na identidade do sistema:** as janelas "OK/Cancelar" do navegador sumiram do admin — excluir, cancelar e arquivar pedem confirmação num diálogo do Aura, com o botão perigoso marcado.
- Respeita a opção "reduzir movimento" do aparelho.

## Melhoria (improvement)

- **Páginas grandes divididas em peças menores** (Estadias, ficha da estadia, nova hospedagem, Hóspedes, Recepção, RH, Concierge, pedidos F&B, cardápio, Calendário, Eventos, agenda de estruturas), com dados e tempo real em hooks próprios — menos risco a cada mudança.
- Abas e filtros sincronizados com a URL (voltar e compartilhar link mantêm a tela); estados vazio, carregando e erro desenhados em todas as listas.
- Ações dos cards sempre visíveis (toque não tem "passar o mouse"); cores que só funcionavam no escuro trocadas por tokens que valem nos dois temas.
- Pull-to-refresh só dispara no topo da lista certa; zoom liberado nas telas; sidebar recolhida não some mais no celular.

## Correção (fix)

- Modal de impersonar ficava preso dentro do menu lateral; o menu abria recolhido no celular; loader preto piscava no tema claro; botões do topo sumiam no desktop; barra de ações nunca fixava no celular — tudo corrigido no novo shell.
- Arquivo auxiliar do wizard de cotação (cópia segura de texto) estava fora do repositório; o build de produção passou a incluí-lo.
