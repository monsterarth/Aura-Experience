import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Termos de Uso | Aura',
  description: 'Termos e Condições Gerais de Uso do Aura Software.',
};

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-[#111111] text-gray-300 py-12 px-6 sm:px-12 font-sans selection:bg-[#00BFFF]/30">
      <div className="max-w-4xl mx-auto bg-[#1a1a1a] rounded-3xl shadow-2xl p-8 md:p-12 lg:p-16 border border-white/5 relative overflow-hidden">
        
        {/* Luzes Suaves de Fundo */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#00BFFF] rounded-full blur-[250px] opacity-[0.05] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-yellow-400 rounded-full blur-[200px] opacity-[0.03] pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 mb-12">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-gray-400 hover:text-[#00BFFF] transition-colors mb-8 font-medium text-sm md:text-base bg-white/5 px-4 py-2 rounded-lg"
          >
            <ArrowLeft size={16} />
            Voltar para a página inicial
          </Link>
          
          <h1 className="text-3xl md:text-5xl font-black text-white mb-6 tracking-tight leading-tight">
            Termos e Condições Gerais de Uso
          </h1>
          
          <div className="flex flex-col sm:flex-row sm:gap-4 text-sm text-gray-500 font-medium">
            <p>Data de disponibilização: 05/04/2026</p>
            <p className="hidden sm:block text-[#00BFFF]">•</p>
            <p>Última atualização: 05/04/2026</p>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="relative z-10 space-y-8 text-base md:text-lg leading-relaxed text-gray-300">
          
          <p>
            Estes Termos e Condições de Uso (&ldquo;Termos&rdquo;) regulam a relação comercial e o licenciamento de uso entre a empresa <strong className="text-white">PETRY TECH</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 42.007.398/0001-38, doravante denominada &ldquo;<strong className="text-white">AURA</strong>&rdquo; ou &ldquo;<strong className="text-white">FORNECEDORA</strong>&rdquo;, e a pessoa física ou jurídica que adquire a assinatura, doravante denominada &ldquo;<strong className="text-white">CLIENTE</strong>&rdquo; ou &ldquo;<strong className="text-white">ASSINANTE</strong>&rdquo;.
          </p>
          
          <p>
            O objeto deste instrumento é o regramento da utilização do software de gestão de hospedagem e experiência do hóspede denominado &ldquo;<strong className="text-white">AURA SOFTWARE</strong>&rdquo;, fornecido na modalidade SaaS (Software como Serviço), acessado integralmente via navegador de internet, sem necessidade de instalação pelo Cliente.
          </p>
          
          <div className="bg-[#00BFFF]/10 border-l-4 border-[#00BFFF] p-6 rounded-r-xl my-10 shadow-inner">
            <p className="font-bold text-[#E0FFFF] m-0 tracking-wide">
              AO CONTRATAR E UTILIZAR O AURA SOFTWARE, O CLIENTE DECLARA TER LIDO, COMPREENDIDO E ACEITO INTEGRALMENTE ESTES TERMOS.
            </p>
          </div>

          <hr className="border-white/10 my-12" />

          {/* Índice */}
          <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-wider text-sm">Índice</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 list-none p-0 text-[#00BFFF]/90 font-medium text-sm md:text-base">
            <li><a href="#conceitos" className="hover:text-white transition-colors">1. Conceitos Importantes</a></li>
            <li><a href="#natureza" className="hover:text-white transition-colors">2. Natureza e Eficácia dos Termos</a></li>
            <li><a href="#requisitos" className="hover:text-white transition-colors">3. Requisitos Técnicos e Condições de Operação</a></li>
            <li><a href="#responsabilidades-terceiros" className="hover:text-white transition-colors">4. Delimitação de Responsabilidades e Relação com Terceiros</a></li>
            <li><a href="#objeto-licenca" className="hover:text-white transition-colors">5. Objeto e Licença de Uso</a></li>
            <li><a href="#planos" className="hover:text-white transition-colors">6. Planos, Pagamento, Renovação e Cancelamento</a></li>
            <li><a href="#suporte-sla" className="hover:text-white transition-colors">7. Política de Suporte Técnico e SLA</a></li>
            <li><a href="#obrigacoes" className="hover:text-white transition-colors">8. Obrigações, Responsabilidades e Limitações</a></li>
            <li><a href="#propriedade" className="hover:text-white transition-colors">9. Propriedade Intelectual</a></li>
            <li><a href="#lgpd" className="hover:text-white transition-colors">10. Privacidade e Proteção de Dados (LGPD)</a></li>
            <li><a href="#disposicoes" className="hover:text-white transition-colors">11. Disposições Gerais</a></li>
            <li><a href="#foro" className="hover:text-white transition-colors">12. Foro e Legislação Aplicável</a></li>
          </ul>

          <hr className="border-white/10 my-12" />

          {/* Seção 1 */}
          <h2 id="conceitos" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-yellow-400 pl-4">1. Conceitos Importantes</h2>
          <p>Para facilitar a leitura e interpretação deste documento, adotamos as seguintes definições:</p>
          <ul className="space-y-4 my-6 pl-4 border-l-2 border-white/5">
            <li><strong className="text-white block mb-1">Cliente (ou Assinante):</strong> Pessoa física ou jurídica que adquire a assinatura do Aura Software, responsável pelo pagamento e pela gestão dos Usuários e Hóspedes vinculados à sua conta.</li>
            <li><strong className="text-white block mb-1">Aura Software:</strong> Plataforma desenvolvida e de propriedade exclusiva da Petry Tech, fornecida na modalidade SaaS. Trata-se de uma solução tecnológica 2 em 1 que combina (i) um módulo de Guest Experience e (ii) um módulo de Gestão de Operações.</li>
            <li><strong className="text-white block mb-1">Módulo Guest Experience:</strong> Funcionalidades voltadas ao hóspede, que podem incluir check-in digital, solicitações de serviços, comunicação com a pousada, guia de atrações e demais recursos de relacionamento.</li>
            <li><strong className="text-white block mb-1">Módulo de Gestão de Operações:</strong> Funcionalidades voltadas à equipe interna do estabelecimento, como gerenciamento de tarefas, controle de solicitações, organização de setores e acompanhamento de atividades operacionais.</li>
            <li><strong className="text-white block mb-1">Usuário:</strong> Pessoa autorizada pelo Cliente a acessar o painel de gestão do sistema (administradores, supervisores, recepcionistas, camareiras, etc.).</li>
            <li><strong className="text-white block mb-1">Hóspede:</strong> Pessoa que utiliza o módulo de Guest Experience, mediante convite ou link fornecido pelo Cliente (Assinante).</li>
            <li><strong className="text-white block mb-1">Assinatura:</strong> Modalidade de contratação com cobrança recorrente (mensal ou anual), que concede direito de acesso e uso do software.</li>
            <li><strong className="text-white block mb-1">Plano:</strong> Configuração de funcionalidades e limites de uso adquirida pelo Cliente no momento da contratação.</li>
          </ul>

          {/* Seção 2 */}
          <h2 id="natureza" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-yellow-400 pl-4">2. Natureza e Eficácia dos Termos</h2>
          <div className="space-y-4">
            <p><strong className="text-white">2.1.</strong> Ao adquirir a assinatura do Aura Software, o Cliente concorda integralmente com estes Termos. A aceitação é condição indispensável para a liberação do acesso e utilização da plataforma.</p>
            <p><strong className="text-white">2.2.</strong> A realização do pagamento ou o simples início da utilização do Aura Software implica, para todos os fins de direito, na aceitação plena, inequívoca e irrevogável de todas as condições estabelecidas nestes Termos e suas futuras atualizações.</p>
            <p><strong className="text-white">2.3.</strong> O Cliente reconhece que estes Termos possuem força de contrato vinculante, substituindo quaisquer acordos verbais ou trocas de mensagens anteriores.</p>
            <p><strong className="text-white">2.4.</strong> Pela teoria da aparência, a Aura considerará válida a contratação realizada mediante o fornecimento de dados cadastrais e pagamento, declarando o Cliente que a pessoa responsável pela compra possui plenos poderes para representá-lo.</p>
            <p><strong className="text-white">2.5.</strong> A Aura poderá alterar estes Termos a qualquer momento. O uso continuado da plataforma após a publicação das alterações confirma a aceitação dos novos Termos.</p>
          </div>

          {/* Seção 3 */}
          <h2 id="requisitos" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-yellow-400 pl-4">3. Requisitos Técnicos e Condições de Operação</h2>
          <p>Por ser uma solução SaaS, o Aura Software não requer instalação de softwares ou servidores por parte do Cliente. Basta uma conexão à internet e um dispositivo compatível.</p>
          
          <h3 className="text-xl font-semibold text-white mt-8 mb-4">3.1. Requisitos do Dispositivo (Usuários — Painel de Gestão):</h3>
          <ul className="list-disc list-inside space-y-2 mb-6 ml-2">
            <li><strong>Navegador:</strong> Google Chrome, Mozilla Firefox, Microsoft Edge ou Safari — versões atualizadas.</li>
            <li><strong>Sistema Operacional:</strong> Windows 10+, macOS 11+, ou distribuições Linux modernas.</li>
            <li><strong>Memória (RAM):</strong> 4 GB ou mais (recomendado 8 GB).</li>
            <li><strong>Conexão:</strong> Internet estável, com velocidade mínima de 5 Mbps.</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mt-8 mb-4">3.2. Requisitos do Dispositivo (Hóspedes — Guest Experience):</h3>
          <ul className="list-disc list-inside space-y-2 mb-6 ml-2">
            <li><strong>Dispositivos Móveis:</strong> Smartphone com Android 9+ ou iOS 14+, com navegador atualizado.</li>
            <li><strong>Conexão:</strong> Wi-Fi do estabelecimento ou dados móveis.</li>
            <li>O acesso pelo Hóspede é realizado via link ou QR Code, sem necessidade de instalação de aplicativo (exceto se optado por versão white-label).</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mt-8 mb-4">3.3. Veracidade das Informações:</h3>
          <p>O Cliente deve fornecer informações verdadeiras, exatas e atuais no momento do cadastro. A Aura reserva o direito de recusar o cadastro ou suspender contas cujos titulares adotem condutas contrárias a estes Termos, sem necessidade de notificação prévia.</p>

          <h3 className="text-xl font-semibold text-white mt-8 mb-4">3.4. Integrações com Terceiros:</h3>
          <p>O Aura Software poderá oferecer integrações com plataformas de terceiros (canais de comunicação, gateways de pagamento, sistemas de reserva). O uso dessas integrações está sujeito aos termos próprios de cada plataforma, sendo responsabilidade do Cliente aceitar tais condições.</p>

          {/* Seção 4 */}
          <h2 id="responsabilidades-terceiros" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-yellow-400 pl-4">4. Delimitação de Responsabilidades e Relação com Terceiros</h2>
          <div className="space-y-4">
            <p><strong className="text-white">4.1.</strong> Estes Termos disciplinam exclusivamente a relação comercial entre a Aura e o Cliente (Assinante).</p>
            <p><strong className="text-white">4.2. Responsabilidade sobre a Equipe:</strong> O Cliente é o único responsável pela seleção, contratação, remuneração e gestão de seus funcionários (Usuários), isentando a Aura de qualquer vínculo trabalhista ou responsabilidade solidária.</p>
            <p><strong className="text-white">4.3. Responsabilidade sobre os Hóspedes:</strong> O Cliente é o único responsável pelas informações compartilhadas com seus Hóspedes por meio da plataforma e pelo relacionamento estabelecido com eles.</p>
            <p><strong className="text-white">4.4.</strong> A Aura não possui qualquer vínculo contratual com os Hóspedes. Qualquer disputa iniciada por Hóspede decorrente do serviço de hospedagem deverá ser assumida pelo Cliente.</p>
          </div>

          {/* Seção 5 */}
          <h2 id="objeto-licenca" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-[#00BFFF] pl-4">5. Objeto e Licença de Uso</h2>
          <div className="space-y-4">
            <p><strong className="text-white">5.1. Objeto:</strong> O contrato concede ao Cliente uma licença de uso de software não exclusiva, intransferível e temporária do Aura Software, na modalidade SaaS, pelo período contratado.</p>
            <p><strong className="text-white">5.2. Escopo:</strong> A licença permite acessar os módulos contratados, configurar o perfil, cadastrar Usuários/Hóspedes e receber atualizações.</p>
            <p><strong className="text-white">5.3. Restrições:</strong> Sob pena de cancelamento imediato e medidas judiciais, é vedado ao Cliente:</p>
            <ul className="list-[lower-alpha] list-inside space-y-2 ml-4 mb-4">
              <li>Copiar, vender, distribuir ou sublicenciar o sistema ou seu código-fonte.</li>
              <li>Realizar engenharia reversa, descompilação ou acesso ao código-fonte.</li>
              <li>Ceder, alugar, transferir ou compartilhar o acesso com terceiros não vinculados.</li>
              <li>Utilizar o sistema para fins ilícitos, fraudulentos ou contrários à ordem pública.</li>
              <li>Tentar comprometer a segurança ou disponibilidade da plataforma.</li>
            </ul>
            <p><strong className="text-white">5.4. Natureza SaaS:</strong> O Cliente declara-se ciente de que a Aura hospeda e mantém a infraestrutura. O Cliente não terá acesso direto aos servidores.</p>
          </div>

          {/* Seção 6 */}
          <h2 id="planos" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-[#00BFFF] pl-4">6. Planos, Pagamento, Renovação e Cancelamento</h2>
          
          <h3 className="text-xl font-semibold text-white mt-8 mb-4">6.1. Natureza da Contratação:</h3>
          <p>A assinatura é realizada com cobrança recorrente (mensal ou anual), conforme escolhido no momento da contratação.</p>
          
          <h3 className="text-xl font-semibold text-white mt-8 mb-4">6.2. Planos e Funcionalidades:</h3>
          <p>Os planos e seus limites são apresentados na página oficial. A Aura reserva-se o direito de alterar planos, com aviso prévio aos Clientes ativos.</p>

          <h3 className="text-xl font-semibold text-white mt-8 mb-4">6.3. Pagamento:</h3>
          <ul className="space-y-2 ml-2">
            <li><strong className="text-white">6.3.1.</strong> Processados de forma automática via cartão, boleto ou PIX.</li>
            <li><strong className="text-white">6.3.2.</strong> A licença é ativada após a confirmação do pagamento.</li>
            <li><strong className="text-white">6.3.3.</strong> Em caso de falha, a Aura notificará e concederá 05 (cinco) dias para regularização antes de suspender a conta.</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mt-8 mb-4">6.4. Renovação Automática:</h3>
          <ul className="space-y-2 ml-2">
            <li><strong className="text-white">6.4.1.</strong> Renovada automaticamente ao final de cada ciclo.</li>
            <li><strong className="text-white">6.4.2.</strong> O Cliente pode cancelar a renovação automática a qualquer momento via painel, sendo mantida a assinatura até o fim do período já pago.</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mt-8 mb-4">6.5. Política de Cancelamento e Reembolso:</h3>
          <ul className="space-y-2 ml-2">
            <li><strong className="text-white">6.5.1. Prazo de Arrependimento (7 dias):</strong> O Cliente poderá solicitar cancelamento e reembolso integral em até 07 (sete) dias após a contratação.</li>
            <li><strong className="text-white">6.5.2. Cancelamento após 7 dias:</strong> O acesso permanece ativo até o término do período pago, sem reembolso proporcional (pro rata).</li>
            <li><strong className="text-white">6.5.3.</strong> Solicitações devem ser realizadas via painel de controle ou canais de atendimento.</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mt-8 mb-4">6.6. Reajuste de Preços:</h3>
          <p>A Aura pode reajustar valores para preservar equilíbrio econômico. Clientes ativos serão avisados com 30 dias de antecedência (aplicável na renovação). Planos anuais mantêm o preço vigente durante os 12 meses garantidos.</p>

          <h3 className="text-xl font-semibold text-white mt-8 mb-4">6.7. Custos Variáveis de Terceiros:</h3>
          <p>Custos de terceiros integrados são de responsabilidade do Cliente:</p>
          <ul className="list-[upper-roman] list-inside space-y-1 ml-4 mb-4">
            <li>Tarifas de canais de comunicação (WhatsApp API, SMS).</li>
            <li>Gateways de pagamento.</li>
            <li>Sistemas de reserva ou OTAs.</li>
            <li>Consumo de APIs de terceiros.</li>
          </ul>

          <h3 className="text-xl font-semibold text-white mt-8 mb-4">6.8. Inadimplência e Suspensão:</h3>
          <p>No caso de falha de pagamento ou Chargeback, a Aura suspenderá o acesso à plataforma e ao suporte. A Aura também poderá recusar novas compras de inadimplentes.</p>

          {/* Seção 7 */}
          <h2 id="suporte-sla" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-[#00BFFF] pl-4">7. Política de Suporte Técnico e SLA</h2>
          <div className="space-y-4">
            <p><strong className="text-white">7.1. Canais e Horários:</strong> Prestado via portal de tickets, chat ou e-mail. Horário: Segunda a Sexta, 09h às 18h (Brasília).</p>
            <p><strong className="text-white">7.2. Tempo de Resposta (SLA):</strong> O prazo máximo para resposta a novo chamado é de até 02 (dois) dias úteis.</p>
            
            <p><strong className="text-white block mt-6 mb-2">7.3. O que está incluso no Suporte:</strong></p>
            <ul className="list-[upper-roman] list-inside space-y-1 ml-4">
              <li>Esclarecimento de dúvidas sobre os recursos nativos.</li>
              <li>Investigação e correção de bugs no código.</li>
              <li>Auxílio em configurações do software Aura.</li>
              <li>Orientação sobre integrações suportadas.</li>
            </ul>

            <p><strong className="text-white block mt-6 mb-2">7.4. Limitações (o que NÃO está incluso):</strong></p>
            <ul className="list-[upper-roman] list-inside space-y-1 ml-4">
              <li>Suporte para ferramentas de terceiros não homologadas.</li>
              <li>Criação de fluxos de automação ou consultoria de negócios.</li>
              <li>Acesso remoto ao dispositivo do Cliente.</li>
              <li>Customizações exclusivas de layout/código.</li>
              <li>Instabilidades de integrações não oficiais.</li>
              <li>Problemas de conectividade, rede ou computadores locais do Cliente.</li>
            </ul>

            <p><strong className="text-white">7.5. Conduta:</strong> A Aura encerrará suportes caso o cliente adote postura agressiva ou desrespeitosa.</p>
          </div>

          {/* Seção 8 */}
          <h2 id="obrigacoes" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-yellow-400 pl-4">8. Obrigações, Responsabilidades e Limitações</h2>
          <div className="space-y-4">
            <p><strong className="text-white">8.1. Obrigações da Aura:</strong> Manter a plataforma disponível, atualizar segurança, prestar suporte técnico devido e garantir a infraestrutura.</p>
            <p><strong className="text-white">8.2. Obrigações do Cliente:</strong> Fornecer dados verdadeiros, manter pagamento em dia, usar licitamente o software, e gerir acesso e credenciais relativas a seus hóspedes e integrações de terceiros.</p>
            
            <h3 className="text-xl font-semibold text-white mt-8 mb-4">8.3. Disponibilidade:</h3>
            <p><strong className="text-white">8.3.1.</strong> A Aura envidará os melhores esforços para disponibilidade 24/7 (salvo manutenção programada ou força maior).</p>
            <p><strong className="text-white">8.3.2.</strong> A Aura não se responsabiliza por indisponibilidades ocasionadas por terceiros (nuvem AWS/Azure, operadoras de dados) ou ataques cibernéticos em grande escala.</p>
            
            <h3 className="text-xl font-semibold text-white mt-8 mb-4">8.4. Limitações sobre Serviços Terceirizados:</h3>
            <p>Se ferramentas alheias mudarem de política, saírem do ar ou bloqueadas (ex: Facebook, WhatsApp APIs), a Aura isenta-se da responsabilidade sistêmica. Isso não isenta a mensalidade do plano.</p>
            
            <h3 className="text-xl font-semibold text-white mt-8 mb-4">8.5. Limitação de Responsabilidade Global:</h3>
            <p>A Aura não será responsável por lucros cessantes, perdas financeiras, interrupções ou dados perdidos resultantes do mau uso ou impossibilidade temporária de uso, até a extensão permitida por lei.</p>
          </div>

          {/* Seção 9 */}
          <h2 id="propriedade" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-[#00BFFF] pl-4">9. Propriedade Intelectual</h2>
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-white mt-8 mb-4">9.1. Titularidade da Aura:</h3>
            <p>O software, logotipos, arquitetura e APIs são propriedade exclusiva da Petry Tech.</p>
            <ul className="ml-4 space-y-2">
              <li><strong className="text-white">9.1.1.</strong> O contrato cede licença temperada, não titularidade.</li>
              <li><strong className="text-white">9.1.2.</strong> Ocultar o copyright da plataforma é vedado.</li>
            </ul>

            <h3 className="text-xl font-semibold text-white mt-8 mb-4">9.2. Titularidade do Cliente:</h3>
            <p>Dados cadastrais da pousada, informações dos de Hóspedes e base de negócios pertencem somente ao Cliente.</p>

            <h3 className="text-xl font-semibold text-white mt-8 mb-4">9.3. Portabilidade de Dados:</h3>
            <p>O Cliente pode requisitar os dados cruciais cadastrados após ou em prestes do cancelamento em padrão compatível (via CSV/JSON).</p>
          </div>

          {/* Seção 10 */}
          <h2 id="lgpd" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-yellow-400 pl-4">10. Privacidade e Proteção de Dados (LGPD)</h2>
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-white mt-8 mb-4">10.1. Papéis das Partes (Lei nº 13.709/2018):</h3>
            <ul className="space-y-3 ml-2">
              <li><strong className="text-white">10.1.1. Aura como Controladora:</strong> Sobre dados nominais do Assinante/Pagador.</li>
              <li><strong className="text-white">10.1.2. Aura como Operadora:</strong> Sobre dados dos Hóspedes que trafegam na ferramenta, agindo só sob estrita instrução do negócio Cliente.</li>
              <li><strong className="text-white">10.1.3. Cliente como Controlador:</strong> Responsável total pela legalidade na captação inicial da informação do hóspede na ponta final.</li>
            </ul>

            <h3 className="text-xl font-semibold text-white mt-8 mb-4">10.2. Transparência:</h3>
            <p>Dados estritamente necessários são trabalhados para eficácia comercial. Nenhuma lista de clientes será vendida para terceiros pela ferramenta Aura.</p>

            <h3 className="text-xl font-semibold text-white mt-8 mb-4">10.3. Proteção e Prevenção:</h3>
            <p>Defesas padronizadas de nuvem são adotadas. Os clientes devem preservar bem suas próprias senhas individualmente.</p>

            <h3 className="text-xl font-semibold text-white mt-8 mb-4">10.4. Exclusão de Base:</h3>
            <p>Contas canceladas são purgadas e deletados seus registros contidos em até 90 dias úteis caso a lei não exija sua permanência fito comprovações judiciais passadas.</p>
          </div>

          {/* Seção 11 */}
          <h2 id="disposicoes" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-[#00BFFF] pl-4">11. Disposições Gerais</h2>
          <p>Aura poderá atualizar este marco legal. Clientes notificados confirmam anuência se permanecerem com uso continuado vigente.</p>
          <div className="space-y-4 mt-6">
            <p><strong className="text-white">11.1. Comunicações:</strong> E-mails e avisos de sistema presumem validade comunicatória mútua.</p>
            <p><strong className="text-white">11.2. Tolerância:</strong> Falta pontual da exigência no contrato não significa leniência sobre suas linhas escritas.</p>
            <p><strong className="text-white">11.3. Conduta e Respeito:</strong> Assédio corporativo ou comportamentos agressivos ao SAC levam diretamente ao abalroamento do contrato de assinatura em ato incontinente e punitivo.</p>
            <p><strong className="text-white">11.4. Cessão:</strong> M&A da AURA Software permite passar o portfólio adiante a novos mantenedores legais assumirem prestação.</p>
            <p><strong className="text-white">11.5. Independência:</strong> Se claudica parte interpretativa pela vara judicial, a parte que sobrevive é eficaz.</p>
          </div>

          {/* Seção 12 */}
          <h2 id="foro" className="text-2xl font-bold text-white mt-16 mb-6 scroll-mt-24 border-l-4 border-yellow-400 pl-4">12. Foro e Legislação Aplicável</h2>
          <div className="space-y-4">
            <p><strong className="text-white">12.1.</strong> Contrato regido pelas leis da República Federativa do Brasil: Código Civil, CDC, LGPD e Lei Geral de Software (Lei nº 9.609/1998).</p>
            <p><strong className="text-white">12.2.</strong> Fica eleito o foro privilegiado restrito a Comarca Judicial de Imbituba - Santa Catarina.</p>
          </div>

          <hr className="border-white/10 my-16" />

          {/* Assinatura */}
          <div className="text-center font-medium space-y-1 mb-8 opacity-75">
            <p className="text-white text-xl font-bold mb-4">Petry Tech — Aura Software</p>
            <p>CNPJ: 42.007.398/0001-38</p>
            <p>Imbituba - SC, Brasil</p>
            <p className="text-sm mt-4 text-[#00BFFF]">Última atualização: 05/04/2026</p>
          </div>

        </div>
      </div>
    </div>
  );
}
