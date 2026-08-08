# 0.7.2 — Configurações

**Data:** 2026-08-08
**Highlight:** Configurações

## Melhoria (improvement)

- **Os dados de hóspede saíram do alcance de quem não está logado.** A chave que o navegador usa para abrir o portal é pública — vai no código da página. Ela dava acesso de leitura a estadias, hóspedes, lançamentos de conta, tarefas de faxina, registros de auditoria e à agenda de contatos, sem nenhuma senha. Hoje nenhuma dessas tabelas responde a ela.
- **O portal passou a conversar com o servidor, não direto com o banco.** Todas as telas do hóspede — início, café, concierge, estruturas, mapa, eventos e pré-check-in — vão por rotas próprias que conferem o código de acesso e devolvem só os campos daquela tela. Efeito colateral bem-vindo: erro de permissão agora falha visivelmente, em vez de virar tela vazia.
- **O pré-check-in só grava os campos do formulário.** Antes, o que chegava do navegador era gravado como veio; agora há uma lista fechada do que a ficha pode alterar, tanto no envio final quanto no rascunho que salva sozinho enquanto se digita.
- **Configurações reunidas num lugar só:** a palavra "Configurações" aparecia em três pontos do menu apontando para coisas diferentes, e a tela que de fato configurava não era alcançável por nenhum deles. Agora há um índice único, buscável, preso à pousada ativa.
- **A configuração da pousada foi dividida em seis telas** — marca, operação, políticas, gastronomia, integrações e módulos — no lugar de uma tela única gigante. Cada uma salva apenas o que é dela.
- **A busca do topo passou a enxergar as configurações:** digitar "prazo", "chave" ou "faxina" agora encontra. Antes ela comparava só o nome da tela, que quase nunca contém a palavra que a pessoa tem na cabeça. O resultado mostra onde a coisa mora — "Casamentos > Prazos". Setas e Enter navegam sem precisar do mouse.
- **Atalhos para o que não mora no índice:** prazo de casamento, regras de governança e a aba Comercial do tarifário aparecem na busca e levam ao lugar certo com o painel já aberto, em vez de deixar a pessoa na tela com o ajuste ainda escondido atrás de um botão.
- **WhatsApp: dá para ver o estado da sessão.** Em Integrações aparece se ele está respondendo, travado ou desconectado, e o QR de reconexão é gerado ali mesmo — antes não havia como saber que tinha caído sem abrir o painel da Evolution.
- **Chave de integração não passa mais pelo navegador:** os segredos do WhatsApp e do Chatwoot ficam no servidor. O campo exibe só os quatro últimos dígitos, e deixá-lo em branco significa "mantém o atual".
- **Cada admin configura apenas a própria pousada:** as rotas de configuração passaram a conferir a posse da propriedade, e não só o cargo de quem pede.
- **Acabou o risco de editar a pousada errada:** a propriedade vem sempre do seletor ativo, com um selo fixo mostrando qual está sendo editada.
- Mapa do resort e Estruturas saíram da área de plataforma e viraram o que sempre foram — cadastro da pousada. Os links antigos continuam funcionando.
- Os controles ficaram iguais em todas as telas: o mesmo gesto tinha duas aparências, interruptor num lugar e caixa de seleção em outro.
- Campos multi-idioma marcam com um ponto âmbar o idioma sem texto e explicam a consequência: o hóspede naquele idioma veria o campo vazio.
- A fila de automações ganhou link para a configuração dos gatilhos — antes, ao ver que nada tinha saído, não havia caminho até a regra.
- O teste de integração deixa claro que credencial aceita não prova entrega — só um envio real prova.

## Correção (fix)

- **O catálogo do Concierge estava vazio para o hóspede.** Havia 31 itens cadastrados e nenhum aparecia: pedir lenha, carvão ou água pelo portal simplesmente não era uma opção. A tela de status do café também não conseguia nomear os itens do próprio pedido. O portal lia o banco direto, e nas tabelas protegidas a leitura voltava vazia **em vez de dar erro** — por isso a falha passou meses sem ninguém perceber. Pedir o café funcionava, o que ajudou a esconder o problema.
- O portal convidava para a pesquisa de satisfação quem **já tinha respondido**.
- **As automações eram globais entre pousadas:** havia 7 regras no banco inteiro para 3 propriedades. Configurar a segunda pousada simplesmente não funcionava e, antes de uma trava anterior, chegava a sobrescrever as regras da primeira. Agora cada pousada tem as suas.
- **As regras de boas-vindas foram apagadas sozinhas em 06/08** e o check-in parou de enfileirar a mensagem. A leitura das regras escrevia no banco quando voltava vazia, gravando valores em branco por cima das regras reais. No pior caso, agora ela não escreve nada.
- A tela de automações mostrava o código interno do gatilho no lugar do nome dele.
- **Salvar em duas abas apagava o que a outra tinha gravado**, sem avisar. A gravação passou a mesclar em vez de reescrever o bloco inteiro.
- Falha ao salvar configuração ainda exibia "salvo com sucesso" por cima de uma gravação que não aconteceu.
- O seletor do Salão do Café gravava sozinho ao clicar, furando o botão Salvar.
- Dois links do RH levavam a páginas que nunca existiram.
- Campos de formulário sumiam no tema claro.
