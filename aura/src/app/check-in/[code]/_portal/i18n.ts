import type { Lang } from "./context";

/* ============================================================
   Portal do Hóspede — strings PT/EN/ES (i18n inline, padrão do
   projeto: sem biblioteca, selecionado por preferredLanguage).
   ============================================================ */

export interface PortalStrings {
    // comuns
    copy: string; copied: string; cancel: string; back: string;
    // tabs
    tabHome: string; tabExplore: string; tabOrders: string; tabStay: string;
    // saudações
    goodMorning: string; goodAfternoon: string; goodEvening: string;
    // home
    night: string; of: string; checkout: string;
    journeyToday: string; quickAccess: string;
    qaBreakfast: string; qaBreakfastSub: string;
    qaSchedule: string; qaScheduleSub: string;
    qaConcierge: string; qaConciergeSub: string;
    qaMap: string; qaMapSub: string;
    keyAccess: string; keyAccessSub: string;
    wifiShort: string; wifiShortSub: string;
    talkReception: string; talkReceptionSub: string;
    poweredBy: string;
    // timeline (Aura)
    tlBreakfastTitle: string; tlBreakfastBody: string; tlBreakfastCta: string;
    tlCheckoutTitle: string; tlCheckoutBody: string; tlCheckoutCta: string;
    tlDndTitle: string; tlDndBody: string; tlDndCta: string;
    tlExploreTitle: string; tlExploreBody: string; tlExploreCta: string;
    // stay
    stayTitle: string; accommodation: string; checkin: string; petLabel: string;
    rateStay: string; rateStaySub: string;
    essentials: string; roomServices: string; guidesInfo: string;
    dndRow: string; dndOnSub: string; dndOffSub: string;
    reportRow: string; reportRowSub: string;
    lateRow: string; lateRowSub: string;
    mapRow: string; mapRowSub: string;
    guideRules: string; guideRulesSub: string;
    guidePet: string; guidePetSub: string;
    guidePrivacy: string; guidePrivacySub: string;
    // placeholders (explore / orders)
    exploreTitle: string; exploreLead: string;
    ordersTitle: string; ordersLead: string;
    openScreen: string;
    breakfastFull: string; breakfastFullSub: string;
    structuresFull: string; structuresFullSub: string;
    conciergeFull: string; conciergeFullSub: string;
    eventsFull: string; eventsFullSub: string;
    mapFull: string; mapFullSub: string;
    // sheets — access
    accessTitle: string; gatePassword: string; typeOnKeypad: string;
    cabinAccess: string; cabinAccessSub: string;
    // sheets — wifi
    wifiTitle: string; scanToConnect: string; networkSSID: string; wifiPassword: string; wifiNotSet: string;
    // sheets — contact
    contactTitle: string; teamOnline: string; quickQuestions: string;
    qTowels: string; qCheckout: string; qRestaurant: string; qDoubt: string;
    openWhatsApp: string; messageSent: string; contactUnavailable: string;
    // sheets — dnd
    dndSheetTitle: string; dndSheetBody: string; opt1h: string; opt24h: string; opt48h: string;
    dndEnabledToast: string; cleaningResumed: string;
    // sheets — report
    reportTitle: string; whatAttention: string; typeCabin: string; typeArea: string; typeBug: string;
    describeIssue: string; attachPhoto: string; canEnterNow: string; sendReport: string;
    reportSent: string; selectArea: string;
    // sheets — late checkout
    lateTitle: string; lateBody: string; requestReception: string; lateSent: string;
    // sheets — map
    mapTitle: string; openFullMap: string; youAreHere: string;
}

export const portalI18n: Record<Lang, PortalStrings> = {
    pt: {
        copy: "Copiar", copied: "Copiado", cancel: "Cancelar", back: "Voltar",
        tabHome: "Início", tabExplore: "Explorar", tabOrders: "Pedidos", tabStay: "Estadia",
        goodMorning: "Bom dia", goodAfternoon: "Boa tarde", goodEvening: "Boa noite",
        night: "Noite", of: "de", checkout: "Check-out",
        journeyToday: "Sua jornada hoje", quickAccess: "Acesso rápido",
        qaBreakfast: "Café da manhã", qaBreakfastSub: "Montar cesta",
        qaSchedule: "Agendar área", qaScheduleSub: "Espaços e horários",
        qaConcierge: "Concierge", qaConciergeSub: "Itens & serviços",
        qaMap: "Mapa & GPS", qaMapSub: "Toda a propriedade",
        keyAccess: "Chave & acessos", keyAccessSub: "Portão · cabana · áreas",
        wifiShort: "Wi-Fi do chalé", wifiShortSub: "Conectar com QR",
        talkReception: "Falar com a recepção", talkReceptionSub: "Resposta em minutos · 24h",
        poweredBy: "portal por",
        tlBreakfastTitle: "Monte sua cesta de café", tlBreakfastBody: "Garanta o café de amanhã entregue no seu chalé.", tlBreakfastCta: "Montar cesta",
        tlCheckoutTitle: "Check-out às {time}", tlCheckoutBody: "Precisa de mais tempo? Posso pedir um late check-out à recepção.", tlCheckoutCta: "Pedir late check-out",
        tlDndTitle: "Não Perturbe ativo", tlDndBody: "Limpeza suspensa até {time}.", tlDndCta: "Gerenciar",
        tlExploreTitle: "Descubra o que rola hoje", tlExploreBody: "Áreas para agendar e eventos da propriedade.", tlExploreCta: "Explorar",
        stayTitle: "Sua estadia", accommodation: "Sua acomodação", checkin: "Check-in", petLabel: "Pet",
        rateStay: "Avaliar sua estadia", rateStaySub: "Leva 1 minuto e ajuda muito 🌿",
        essentials: "Essenciais", roomServices: "Serviços do quarto", guidesInfo: "Guias & informações",
        dndRow: "Não Perturbe", dndOnSub: "Ativo · retoma às {time}", dndOffSub: "Suspender limpeza do quarto",
        reportRow: "Reportar um problema", reportRowSub: "Cabana, área comum ou app",
        lateRow: "Pedir late check-out", lateRowSub: "A recepção responde rápido",
        mapRow: "Mapa & como chegar", mapRowSub: "GPS de toda a propriedade",
        guideRules: "Regras da casa", guideRulesSub: "Horários, silêncio e convivência",
        guidePet: "Política pet", guidePetSub: "Regras para o seu pet",
        guidePrivacy: "Privacidade (LGPD)", guidePrivacySub: "Como tratamos seus dados",
        exploreTitle: "Explorar a propriedade", exploreLead: "Agende áreas, descubra eventos e o mapa.",
        ordersTitle: "Seus pedidos", ordersLead: "Café da manhã, concierge e acompanhamento.",
        openScreen: "Abrir",
        breakfastFull: "Café da manhã", breakfastFullSub: "Agende a entrega no seu chalé",
        structuresFull: "Agendar áreas", structuresFullSub: "Jacuzzi, spa, lago e mais",
        conciergeFull: "Concierge", conciergeFullSub: "Peça itens e serviços",
        eventsFull: "Eventos", eventsFullSub: "Na propriedade e na região",
        mapFull: "Mapa do resort", mapFullSub: "Áreas, GPS e reservas",
        accessTitle: "Chave & acessos", gatePassword: "Senha do portão principal", typeOnKeypad: "Digite no teclado do portão",
        cabinAccess: "Sua acomodação", cabinAccessSub: "Fechadura digital · mesma senha",
        wifiTitle: "Wi-Fi do chalé", scanToConnect: "Aponte a câmera para conectar", networkSSID: "Rede (SSID)", wifiPassword: "Senha", wifiNotSet: "O Wi-Fi da acomodação ainda não foi configurado.",
        contactTitle: "Falar com a recepção", teamOnline: "Equipe online · resposta em minutos", quickQuestions: "Perguntas rápidas",
        qTowels: "Preciso de toalhas extras", qCheckout: "Como faço o check-out?", qRestaurant: "Recomenda um restaurante?", qDoubt: "Estou com uma dúvida",
        openWhatsApp: "Abrir conversa no WhatsApp", messageSent: "Abrindo WhatsApp…", contactUnavailable: "Contato não configurado pela propriedade.",
        dndSheetTitle: "Suspender a limpeza?", dndSheetBody: "Faxinas de check-out nunca são suspensas. Por quanto tempo?", opt1h: "1 hora", opt24h: "24 horas", opt48h: "48 horas",
        dndEnabledToast: "Não Perturbe ativado", cleaningResumed: "Limpeza retomada",
        reportTitle: "Reportar problema", whatAttention: "O que precisa de atenção?", typeCabin: "Problema na cabana", typeArea: "Área comum", typeBug: "Algo no app",
        describeIssue: "Descreva o problema…", attachPhoto: "Anexar foto (opcional)", canEnterNow: "A equipe pode entrar agora?", sendReport: "Enviar relatório",
        reportSent: "Relatório enviado · obrigado!", selectArea: "Selecione a área",
        lateTitle: "Late check-out", lateBody: "Seu check-out é às {time}. Para qual horário gostaria de estender? Confirmamos conforme disponibilidade.", requestReception: "Pedir à recepção", lateSent: "Pedido enviado · a recepção confirma em breve",
        mapTitle: "Mapa da propriedade", openFullMap: "Abrir mapa interativo completo", youAreHere: "Você está aqui",
    },
    en: {
        copy: "Copy", copied: "Copied", cancel: "Cancel", back: "Back",
        tabHome: "Home", tabExplore: "Explore", tabOrders: "Orders", tabStay: "Stay",
        goodMorning: "Good morning", goodAfternoon: "Good afternoon", goodEvening: "Good evening",
        night: "Night", of: "of", checkout: "Check-out",
        journeyToday: "Your day today", quickAccess: "Quick access",
        qaBreakfast: "Breakfast", qaBreakfastSub: "Build your basket",
        qaSchedule: "Book an area", qaScheduleSub: "Spaces and times",
        qaConcierge: "Concierge", qaConciergeSub: "Items & services",
        qaMap: "Map & GPS", qaMapSub: "The whole property",
        keyAccess: "Keys & access", keyAccessSub: "Gate · cabin · areas",
        wifiShort: "Cabin Wi-Fi", wifiShortSub: "Connect with QR",
        talkReception: "Talk to reception", talkReceptionSub: "Reply in minutes · 24h",
        poweredBy: "portal by",
        tlBreakfastTitle: "Build your breakfast basket", tlBreakfastBody: "Secure tomorrow's breakfast delivered to your cabin.", tlBreakfastCta: "Build basket",
        tlCheckoutTitle: "Check-out at {time}", tlCheckoutBody: "Need more time? I can request a late check-out from reception.", tlCheckoutCta: "Request late check-out",
        tlDndTitle: "Do Not Disturb on", tlDndBody: "Cleaning paused until {time}.", tlDndCta: "Manage",
        tlExploreTitle: "See what's on today", tlExploreBody: "Areas to book and property events.", tlExploreCta: "Explore",
        stayTitle: "Your stay", accommodation: "Your accommodation", checkin: "Check-in", petLabel: "Pet",
        rateStay: "Rate your stay", rateStaySub: "Takes a minute and helps a lot 🌿",
        essentials: "Essentials", roomServices: "Room services", guidesInfo: "Guides & info",
        dndRow: "Do Not Disturb", dndOnSub: "On · resumes at {time}", dndOffSub: "Pause room cleaning",
        reportRow: "Report a problem", reportRowSub: "Cabin, common area or app",
        lateRow: "Request late check-out", lateRowSub: "Reception replies fast",
        mapRow: "Map & directions", mapRowSub: "GPS for the whole property",
        guideRules: "House rules", guideRulesSub: "Hours, quiet and etiquette",
        guidePet: "Pet policy", guidePetSub: "Rules for your pet",
        guidePrivacy: "Privacy", guidePrivacySub: "How we handle your data",
        exploreTitle: "Explore the property", exploreLead: "Book areas, find events and the map.",
        ordersTitle: "Your orders", ordersLead: "Breakfast, concierge and tracking.",
        openScreen: "Open",
        breakfastFull: "Breakfast", breakfastFullSub: "Schedule delivery to your cabin",
        structuresFull: "Book areas", structuresFullSub: "Jacuzzi, spa, lake and more",
        conciergeFull: "Concierge", conciergeFullSub: "Request items and services",
        eventsFull: "Events", eventsFullSub: "On property and nearby",
        mapFull: "Resort map", mapFullSub: "Areas, GPS and bookings",
        accessTitle: "Keys & access", gatePassword: "Main gate password", typeOnKeypad: "Type on the gate keypad",
        cabinAccess: "Your accommodation", cabinAccessSub: "Digital lock · same code",
        wifiTitle: "Cabin Wi-Fi", scanToConnect: "Point your camera to connect", networkSSID: "Network (SSID)", wifiPassword: "Password", wifiNotSet: "The accommodation Wi-Fi hasn't been set up yet.",
        contactTitle: "Talk to reception", teamOnline: "Team online · reply in minutes", quickQuestions: "Quick questions",
        qTowels: "I need extra towels", qCheckout: "How do I check out?", qRestaurant: "Any restaurant tips?", qDoubt: "I have a question",
        openWhatsApp: "Open WhatsApp chat", messageSent: "Opening WhatsApp…", contactUnavailable: "Contact not set up by the property.",
        dndSheetTitle: "Pause cleaning?", dndSheetBody: "Check-out cleanings are never paused. For how long?", opt1h: "1 hour", opt24h: "24 hours", opt48h: "48 hours",
        dndEnabledToast: "Do Not Disturb enabled", cleaningResumed: "Cleaning resumed",
        reportTitle: "Report a problem", whatAttention: "What needs attention?", typeCabin: "Cabin problem", typeArea: "Common area", typeBug: "Something in the app",
        describeIssue: "Describe the problem…", attachPhoto: "Attach photo (optional)", canEnterNow: "Can the team enter now?", sendReport: "Send report",
        reportSent: "Report sent · thank you!", selectArea: "Select the area",
        lateTitle: "Late check-out", lateBody: "Your check-out is at {time}. Until when would you like to extend? We'll confirm based on availability.", requestReception: "Ask reception", lateSent: "Request sent · reception will confirm shortly",
        mapTitle: "Property map", openFullMap: "Open full interactive map", youAreHere: "You are here",
    },
    es: {
        copy: "Copiar", copied: "Copiado", cancel: "Cancelar", back: "Volver",
        tabHome: "Inicio", tabExplore: "Explorar", tabOrders: "Pedidos", tabStay: "Estancia",
        goodMorning: "Buenos días", goodAfternoon: "Buenas tardes", goodEvening: "Buenas noches",
        night: "Noche", of: "de", checkout: "Check-out",
        journeyToday: "Tu día hoy", quickAccess: "Acceso rápido",
        qaBreakfast: "Desayuno", qaBreakfastSub: "Armar tu cesta",
        qaSchedule: "Reservar área", qaScheduleSub: "Espacios y horarios",
        qaConcierge: "Concierge", qaConciergeSub: "Ítems y servicios",
        qaMap: "Mapa y GPS", qaMapSub: "Toda la propiedad",
        keyAccess: "Llave y accesos", keyAccessSub: "Portón · cabaña · áreas",
        wifiShort: "Wi-Fi de la cabaña", wifiShortSub: "Conectar con QR",
        talkReception: "Hablar con recepción", talkReceptionSub: "Respuesta en minutos · 24h",
        poweredBy: "portal por",
        tlBreakfastTitle: "Arma tu cesta de desayuno", tlBreakfastBody: "Asegura el desayuno de mañana en tu cabaña.", tlBreakfastCta: "Armar cesta",
        tlCheckoutTitle: "Check-out a las {time}", tlCheckoutBody: "¿Necesitas más tiempo? Puedo pedir late check-out a recepción.", tlCheckoutCta: "Pedir late check-out",
        tlDndTitle: "No Molestar activo", tlDndBody: "Limpieza pausada hasta las {time}.", tlDndCta: "Gestionar",
        tlExploreTitle: "Descubre qué hay hoy", tlExploreBody: "Áreas para reservar y eventos de la propiedad.", tlExploreCta: "Explorar",
        stayTitle: "Tu estancia", accommodation: "Tu alojamiento", checkin: "Check-in", petLabel: "Mascota",
        rateStay: "Evaluar tu estancia", rateStaySub: "Toma un minuto y ayuda mucho 🌿",
        essentials: "Esenciales", roomServices: "Servicios de habitación", guidesInfo: "Guías e información",
        dndRow: "No Molestar", dndOnSub: "Activo · reanuda a las {time}", dndOffSub: "Pausar la limpieza",
        reportRow: "Reportar un problema", reportRowSub: "Cabaña, área común o app",
        lateRow: "Pedir late check-out", lateRowSub: "Recepción responde rápido",
        mapRow: "Mapa y cómo llegar", mapRowSub: "GPS de toda la propiedad",
        guideRules: "Reglas de la casa", guideRulesSub: "Horarios, silencio y convivencia",
        guidePet: "Política de mascotas", guidePetSub: "Reglas para tu mascota",
        guidePrivacy: "Privacidad", guidePrivacySub: "Cómo tratamos tus datos",
        exploreTitle: "Explorar la propiedad", exploreLead: "Reserva áreas, descubre eventos y el mapa.",
        ordersTitle: "Tus pedidos", ordersLead: "Desayuno, concierge y seguimiento.",
        openScreen: "Abrir",
        breakfastFull: "Desayuno", breakfastFullSub: "Programa la entrega en tu cabaña",
        structuresFull: "Reservar áreas", structuresFullSub: "Jacuzzi, spa, lago y más",
        conciergeFull: "Concierge", conciergeFullSub: "Pide ítems y servicios",
        eventsFull: "Eventos", eventsFullSub: "En la propiedad y la región",
        mapFull: "Mapa del resort", mapFullSub: "Áreas, GPS y reservas",
        accessTitle: "Llave y accesos", gatePassword: "Clave del portón principal", typeOnKeypad: "Marca en el teclado del portón",
        cabinAccess: "Tu alojamiento", cabinAccessSub: "Cerradura digital · misma clave",
        wifiTitle: "Wi-Fi de la cabaña", scanToConnect: "Apunta la cámara para conectar", networkSSID: "Red (SSID)", wifiPassword: "Contraseña", wifiNotSet: "El Wi-Fi del alojamiento aún no fue configurado.",
        contactTitle: "Hablar con recepción", teamOnline: "Equipo en línea · respuesta en minutos", quickQuestions: "Preguntas rápidas",
        qTowels: "Necesito toallas extra", qCheckout: "¿Cómo hago el check-out?", qRestaurant: "¿Recomiendas un restaurante?", qDoubt: "Tengo una duda",
        openWhatsApp: "Abrir chat de WhatsApp", messageSent: "Abriendo WhatsApp…", contactUnavailable: "Contacto no configurado por la propiedad.",
        dndSheetTitle: "¿Pausar la limpieza?", dndSheetBody: "Las limpiezas de check-out nunca se pausan. ¿Por cuánto tiempo?", opt1h: "1 hora", opt24h: "24 horas", opt48h: "48 horas",
        dndEnabledToast: "No Molestar activado", cleaningResumed: "Limpieza reanudada",
        reportTitle: "Reportar problema", whatAttention: "¿Qué necesita atención?", typeCabin: "Problema en la cabaña", typeArea: "Área común", typeBug: "Algo en la app",
        describeIssue: "Describe el problema…", attachPhoto: "Adjuntar foto (opcional)", canEnterNow: "¿El equipo puede entrar ahora?", sendReport: "Enviar reporte",
        reportSent: "Reporte enviado · ¡gracias!", selectArea: "Selecciona el área",
        lateTitle: "Late check-out", lateBody: "Tu check-out es a las {time}. ¿Hasta qué hora deseas extender? Confirmamos según disponibilidad.", requestReception: "Pedir a recepción", lateSent: "Pedido enviado · recepción confirmará pronto",
        mapTitle: "Mapa de la propiedad", openFullMap: "Abrir mapa interactivo completo", youAreHere: "Estás aquí",
    },
};
