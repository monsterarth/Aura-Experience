import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  Smartphone, 
  ShieldCheck, 
  MessageSquare, 
  Brush, 
  Hotel, 
  Sparkles,
  LogIn,
  Users,
  CheckCircle2,
  CalendarDays,
  Wand2,
  CheckCheck,
  Bot
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="dark min-h-screen bg-zinc-950 text-slate-50 flex flex-col font-sans selection:bg-primary/40">
      
      {/* Navbar - Premium Dark Glassmorphism */}
      <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-7 w-7 text-primary animate-pulse" />
            <span className="font-extrabold text-2xl tracking-tighter">Aura Experience</span>
          </div>
          
          <nav className="hidden lg:flex gap-10 text-sm font-semibold text-slate-300">
            <Link href="#vitrine" className="hover:text-primary transition-colors">A Plataforma</Link>
            <Link href="#features" className="hover:text-primary transition-colors">Módulos</Link>
            <Link href="#solucao" className="hover:text-primary transition-colors">A Experiência</Link>
            <Link href="#tecnologia" className="hover:text-primary transition-colors">Tecnologia</Link>
          </nav>

          <div className="flex items-center gap-4">
            {/* Login de Hóspedes */}
            <Link href="/check-in/login">
              <Button variant="ghost" className="hidden sm:flex items-center gap-2.5 text-sm font-semibold hover:bg-white/5">
                <Smartphone className="h-4.5 w-4.5" />
                Portal do Hóspede
              </Button>
            </Link>
            
            {/* Login Administrativo */}
            <Link href="/admin/login">
              <Button variant="default" className="flex items-center gap-2.5 shadow-lg shadow-primary/25 h-11 px-5">
                <LogIn className="h-4.5 w-4.5" />
                Acesso Equipe
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-32 pb-40 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px]"></div>
          
          <div className="container relative mx-auto px-4 text-center z-10">
            <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/15 px-4 py-1.5 text-sm font-medium text-primary mb-10">
              <Sparkles className="h-4 w-4 mr-2" />
              Sua pousada no próximo nível
            </div>
            
            <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter mb-8 max-w-5xl mx-auto leading-tight">
              A evolução da <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-blue-500 to-emerald-500">hospitalidade digital.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-3xl mx-auto leading-relaxed font-light">
              Muito além da gestão. Automatize rotinas, <span className="font-semibold text-white">humanize o atendimento</span> e conecte sua equipe via WhatsApp em uma plataforma ultra rápida.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
              <Button size="lg" className="h-14 px-10 text-lg shadow-2xl shadow-primary/30 font-bold">
                Agendar Demonstração VIP
                <ArrowRight className="ml-2.5 h-6 w-6" />
              </Button>
              <Link href="/check-in/login">
                <Button size="lg" variant="outline" className="h-14 px-10 text-lg bg-zinc-900 border-zinc-700 hover:bg-zinc-800 font-bold">
                  Testar Check-in
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Vitrine da Plataforma (Mockups Nativos em CSS/Tailwind) */}
        <section id="vitrine" className="py-24 bg-zinc-900 border-y border-zinc-800 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none"></div>
          
          <div className="container mx-auto px-4 relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <div className="h-16 w-16 rounded-3xl bg-primary/20 flex items-center justify-center mb-8 mx-auto shadow-inner border border-primary/20">
                <Wand2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight">Menos telas. Mais clareza.</h2>
              <p className="text-slate-300 text-lg leading-relaxed">
                Centralizamos a FNRH, a logística de hóspedes e a comunicação em interfaces desenhadas para agilidade. Veja como a sua equipe vai operar na prática.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
              
              {/* Mockup 1: Card de Hospedagem */}
              <div className="flex flex-col gap-6">
                <div className="text-sm font-bold text-zinc-400 uppercase tracking-widest px-2">Ficha 360º de Hospedagem</div>
                
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-2xl relative overflow-hidden group hover:border-zinc-700 transition-all">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-green-400"></div>
                  
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold mb-3 uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                        Em Andamento
                      </div>
                      <h3 className="text-2xl font-extrabold text-white">Lucas & Dienifer</h3>
                      <p className="text-sm text-zinc-400 mt-1">01 - Praia 2 Dormitórios • 6 Hóspedes</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-white bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800">
                        12 - 15 Nov
                      </div>
                      <div className="text-xs text-zinc-500 mt-2 font-medium">3 Noites</div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-zinc-500 font-medium">Logística e Restrições</span>
                      <div className="flex flex-wrap gap-2">
                        <span className="bg-rose-500/10 text-rose-300 px-2.5 py-1.5 rounded-md text-xs font-semibold border border-rose-500/20 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> Intolerância a Lactose
                        </span>
                        <span className="bg-blue-500/10 text-blue-300 px-2.5 py-1.5 rounded-md text-xs font-semibold border border-blue-500/20 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Kit Pet Adicionado
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-6 mt-6 border-t border-zinc-800/50">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      FNRH Concluída
                    </div>
                    <Button size="sm" variant="secondary" className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold">
                      Abrir Ficha
                    </Button>
                  </div>
                </div>
              </div>

              {/* Mockup 2: Omnichannel WhatsApp */}
              <div className="flex flex-col gap-6">
                <div className="text-sm font-bold text-zinc-400 uppercase tracking-widest px-2">Central Omnichannel Aura</div>
                
                <div className="bg-[#0b141a] border border-zinc-800 rounded-2xl flex flex-col h-[380px] shadow-2xl overflow-hidden font-sans relative">
                  {/* WhatsApp Header */}
                  <div className="bg-[#202c33] px-4 py-3.5 flex items-center gap-4 border-b border-zinc-800/50">
                    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-zinc-300"/>
                    </div>
                    <div className="flex-1">
                      <div className="text-white text-[15px] font-semibold">Lucas</div>
                      <div className="text-[#8696a0] text-[13px] flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5"/> Assistente Aura • Cabana 01
                      </div>
                    </div>
                  </div>
                  
                  {/* WhatsApp Body */}
                  <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto bg-[#0b141a] relative z-10">
                    {/* Data Badge */}
                    <div className="flex justify-center mb-2">
                      <span className="bg-[#182229] text-[#8696a0] text-[11px] uppercase font-semibold px-3 py-1.5 rounded-lg shadow-sm">
                        Hoje
                      </span>
                    </div>

                    {/* Mensagem Bot (Pre-check-in) */}
                    <div className="self-start bg-[#202c33] text-[#e9edef] rounded-xl rounded-tl-none px-3.5 py-2.5 max-w-[85%] text-[14.5px] leading-relaxed shadow-sm relative">
                      Olá Lucas, tudo bem? Aqui é da Fazenda do Rosa. ✨<br/><br/>
                      Faltam apenas 48h para a sua chegada! Para agilizar sua entrada na cabana, por favor, realize o seu Check-in Digital no link abaixo:<br/><br/>
                      <span className="text-blue-400 underline cursor-pointer">aura.host/checkin/fr-889</span>
                      <span className="text-[11px] text-[#8696a0] float-right mt-3 ml-4">10:00</span>
                    </div>

                    {/* Mensagem Hóspede */}
                    <div className="self-end bg-[#005c4b] text-[#e9edef] rounded-xl rounded-tr-none px-3.5 py-2.5 max-w-[85%] text-[14.5px] leading-relaxed shadow-sm relative mt-2">
                      Feito! Muito rápido o sistema de vocês. Chegaremos por volta das 14h, ok?
                      <div className="text-[11px] text-[#8696a0] flex items-center justify-end gap-1 mt-1">
                        10:15 <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]"/>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Problema vs Solução */}
        <section id="solucao" className="py-24 relative overflow-hidden">
          <div className="container mx-auto px-4 relative z-10">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div>
                <h2 className="text-4xl md:text-5xl font-extrabold mb-8 tracking-tight">Menos tempo em processos. <br/>Mais tempo para o <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-500">encantamento.</span></h2>
                <p className="text-slate-300 mb-10 text-lg leading-relaxed font-light">
                  O Aura substitui o caos de rádios, mensagens picadas e planilhas por um ecossistema inteligente. Dê adeus às falhas de comunicação e foque no que importa: <span className="font-semibold text-white">o acolhimento do hóspede.</span>
                </p>
                <ul className="space-y-6">
                  {[
                    "Governança sabe a prioridade de limpeza e avisa a recepção no instante que termina.",
                    "Automatize mensagens desde antes da hospedagem com pré check-in e direções, até o pós-check-out com agradecimentos.",
                    "Coleta de dados da FNRH completamente digital e segura."
                  ].map((item, i) => (
                    <li key={i} className="flex items-start">
                      <div className="h-7 w-7 rounded-lg bg-green-950 border border-green-800 flex items-center justify-center mr-4.5 shrink-0 mt-0.5">
                        <CheckCircle2 className="h-4.5 w-4.5 text-green-400" />
                      </div>
                      <span className="text-slate-200 text-lg font-normal leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 p-10 shadow-3xl overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-500 group-hover:h-1.5 transition-all"></div>
                <div className="flex justify-between items-center mb-8 pb-8 border-b border-zinc-800">
                  <div className="flex gap-4 items-center">
                    <div className="h-12 w-12 rounded-xl bg-primary/20 border border-primary/20 flex items-center justify-center">
                      <Brush className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold text-lg tracking-tight">Status da Cabana</div>
                      <div className="text-sm text-slate-500">Atualizado: agora mesmo</div>
                    </div>
                  </div>
                  <div className="px-4 py-1.5 rounded-full bg-green-950 border border-green-800 text-green-400 text-sm font-bold shadow-inner">
                    Limpo & Pronto
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                    <div className="h-9 bg-zinc-800 rounded-lg w-full"></div>
                  </div>
                  <div className="h-9 bg-zinc-800 rounded-lg w-2/3"></div>
                  <div className="h-9 bg-zinc-800 rounded-lg w-5/6"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Features - Cards Premium Dark */}
        <section id="features" className="py-24 bg-zinc-900 border-y border-zinc-800">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-4xl md:text-5xl font-extrabold mb-5 tracking-tight">O cuidado mora nos detalhes.</h2>
              <p className="text-slate-300 text-lg leading-relaxed">
                Uma arquitetura modular desenhada especificamente para as necessidades operacionais de hotéis boutique e propriedades de charme.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="bg-black border border-zinc-800 rounded-2xl p-9 hover:border-blue-800 hover:shadow-2xl hover:shadow-blue-900/10 transition-all hover:-translate-y-1 group">
                <div className="h-14 w-14 rounded-xl bg-blue-950/40 border border-blue-900 flex items-center justify-center mb-8 transition-colors group-hover:bg-blue-950">
                  <Smartphone className="h-7 w-7 text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4 tracking-tight">Portal do Hóspede VIP</h3>
                <p className="text-slate-300 text-base leading-relaxed font-light">
                  Sua identidade de marca na palma da mão do cliente. Check-in sem atrito, menu de experiências, manuais da cabana e Wi-Fi com acesso instantâneo.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-black border border-zinc-800 rounded-2xl p-9 hover:border-emerald-800 hover:shadow-2xl hover:shadow-emerald-900/10 transition-all hover:-translate-y-1 group">
                <div className="h-14 w-14 rounded-xl bg-emerald-950/40 border border-emerald-900 flex items-center justify-center mb-8 transition-colors group-hover:bg-emerald-950">
                  <Brush className="h-7 w-7 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4 tracking-tight">Governança Integrada</h3>
                <p className="text-slate-300 text-base leading-relaxed font-light">
                  Mini-app otimizado para a equipe de limpeza. Geração de tarefas de turnover e checklists de cabanas com comunicação visual e direta com a recepção.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-black border border-zinc-800 rounded-2xl p-9 hover:border-green-800 hover:shadow-2xl hover:shadow-green-900/10 transition-all hover:-translate-y-1 group">
                <div className="h-14 w-14 rounded-xl bg-green-950/40 border border-green-900 flex items-center justify-center mb-8 transition-colors group-hover:bg-green-950">
                  <MessageSquare className="h-7 w-7 text-green-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4 tracking-tight">Comunicação Automática</h3>
                <p className="text-slate-300 text-base leading-relaxed font-light">
                  Automatize mensagens desde antes da hospedagem com pré check-in e direções, durante a estadia com os avisos importantes e após, com os agradecimentos e NPS.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-black border border-zinc-800 rounded-2xl p-9 hover:border-purple-800 hover:shadow-2xl hover:shadow-purple-900/10 transition-all hover:-translate-y-1 group">
                <div className="h-14 w-14 rounded-xl bg-purple-950/40 border border-purple-900 flex items-center justify-center mb-8 transition-colors group-hover:bg-purple-950">
                  <ShieldCheck className="h-7 w-7 text-purple-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4 tracking-tight">Conformidade FNRH 2026</h3>
                <p className="text-slate-300 text-base leading-relaxed font-light">
                  O motor de coleta de dados já é desenhado sob os padrões da API Serpro v2.0, garantindo segurança jurídica para as novas leis do Ministério do Turismo.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-black border border-zinc-800 rounded-2xl p-9 hover:border-orange-800 hover:shadow-2xl hover:shadow-orange-900/10 transition-all hover:-translate-y-1 group">
                <div className="h-14 w-14 rounded-xl bg-orange-950/40 border border-orange-900 flex items-center justify-center mb-8 transition-colors group-hover:bg-orange-950">
                  <CalendarDays className="h-7 w-7 text-orange-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4 tracking-tight">Ficha Hóspede 360°</h3>
                <p className="text-slate-300 text-base leading-relaxed font-light">
                  Entenda quem está chegando: acompanhe montagem de camas extras, restrições alimentares e kits pet diretamente na ficha logística.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-black border border-zinc-800 rounded-2xl p-9 hover:border-rose-800 hover:shadow-2xl hover:shadow-rose-900/10 transition-all hover:-translate-y-1 group">
                <div className="h-14 w-14 rounded-xl bg-rose-950/40 border border-rose-900 flex items-center justify-center mb-8 transition-colors group-hover:bg-rose-950">
                  <Hotel className="h-7 w-7 text-rose-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4 tracking-tight">Gestão de Anexos</h3>
                <p className="text-slate-300 text-base leading-relaxed font-light">
                  Controle de propriedades independentes ou anexos da pousada em uma única plataforma, simplificando a logística para hotéis que possuem expansões.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section id="cta" className="py-24 relative overflow-hidden bg-zinc-950 border-t border-zinc-800">
          <div className="absolute inset-0 bg-primary/5"></div>
          <div className="container relative mx-auto px-4 text-center z-10">
            <h2 className="text-5xl md:text-6xl font-extrabold mb-6 tracking-tight">Pronto para a evolução?</h2>
            <p className="text-2xl text-slate-300 mb-12 max-w-3xl mx-auto font-light leading-relaxed">
              Dê adeus ao caos operacional. O Aura Experience Engine adapta-se à logística da sua pousada boutique para que você foque no que realmente importa: <span className="text-white font-semibold">o hóspede</span>.
            </p>
            <Button size="lg" className="h-16 px-12 text-xl shadow-2xl shadow-primary/30 font-bold">
              Solicitar Acesso ao Aura Engine
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-black py-16">
        <div className="container mx-auto px-4 footer-premium">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3 opacity-90">
              <Sparkles className="h-6 w-6 text-primary" />
              <span className="font-extrabold text-xl tracking-tighter">Aura Experience</span>
            </div>
            <div className="flex gap-10 text-sm font-semibold text-slate-400">
              <Link href="/admin/login" className="hover:text-primary transition-colors">Acesso Admin</Link>
              <Link href="#" className="hover:text-primary transition-colors">Logística</Link>
              <Link href="#" className="hover:text-primary transition-colors">Privacidade</Link>
              <Link href="#" className="hover:text-primary transition-colors">Termos</Link>
            </div>
          </div>
          <div className="mt-12 text-center text-sm text-slate-600 font-light border-t border-zinc-800 pt-8">
            &copy; {new Date().getFullYear()} Aura Experience Engine. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}