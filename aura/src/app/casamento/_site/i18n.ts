// i18n do site dos noivos — padrão da casa: dicionário inline, sem lib.
// O idioma abre por navigator.language e o visitante troca na tela.

export type SiteLang = 'pt' | 'en' | 'es';

export interface SiteStrings {
  // Capa
  weddingOf: string;
  welcomeDefault: string;
  hostedBy: string;
  // Simulador — estadia
  yourStay: string;
  eventWeekend: string;
  alwaysIncluded: string;
  arriveEarlier: string;
  leaveLater: string;
  night: string;
  nights: string;
  checkIn: string;
  checkOut: string;
  // Simulador — ocupantes
  whoIsComing: string;
  adults: string;
  adultsHint: string;
  children: string;
  childrenHint: string;
  babies: string;
  babiesHint: string;
  pets: string;
  petsHint: string;
  seePrices: string;
  calculating: string;
  // Opções
  chooseCabin: string;
  totalForStay: string;
  perNight: string;
  eventWindowLabel: string;
  extraNightsLabel: string;
  petFeeLabel: string;
  unitsLeft: (n: number) => string;
  lastOne: string;
  soldOut: string;
  choose: string;
  seePhotos: string;
  adjustSearch: string;
  // Contato / pré-reserva
  yourDetails: string;
  fullName: string;
  whatsapp: string;
  email: string;
  optional: string;
  policyAccept: string;
  policyRead: string;
  policyClose: string;
  confirmPreBook: string;
  sending: string;
  nothingCharged: string;
  // Confirmação
  requestSent: string;
  requestSentBody: string;
  summaryCategory: string;
  summaryDates: string;
  summaryTotal: string;
  newQuote: string;
  // Painel dos noivos
  couplePanel: string;
  panelTab: string;
  simulatorTab: string;
  occupancyTitle: string;
  occupancySub: string;
  unitsTotal: string;
  freeUnits: string;
  pendingUnits: string;
  confirmedUnits: string;
  customizeTitle: string;
  customizeSub: string;
  coverPhoto: string;
  coverPhotoHint: string;
  uploadPhoto: string;
  uploading: string;
  removePhoto: string;
  welcomeMessageLabel: string;
  welcomeMessageHint: string;
  colorsLabel: string;
  colorPrimary: string;
  colorBackground: string;
  colorSurface: string;
  resetColors: string;
  save: string;
  saving: string;
  saved: string;
  giftsTitle: string;
  giftsSoon: string;
  // Erros (códigos do serviço)
  errors: Record<string, string>;
}

const ERRORS_PT: Record<string, string> = {
  not_found: 'Não foi possível acessar o casamento — confira o código.',
  invalid_dates: 'Datas inválidas.',
  window_required: 'O fim de semana do evento é sempre incluído na estadia.',
  extend_limit: 'Extensão de noites acima do limite permitido.',
  too_many_guests: 'Para grupos com mais de 6 pessoas, fale direto com a recepção.',
  invalid_pax: 'Informe ao menos 1 adulto.',
  rate_unavailable: 'A tarifa do casamento está indisponível — fale com a recepção.',
  uncovered: 'Algumas das noites extras ainda não têm tarifa — tente menos noites ou fale com a recepção.',
  min_nights: 'Esse período exige um número mínimo de noites — ajuste as datas ou fale com a recepção.',
  no_options: 'Nenhuma acomodação disponível para essa composição.',
  missing_name: 'Informe seu nome completo.',
  missing_phone: 'Informe um WhatsApp válido (com DDD).',
  invalid_email: 'E-mail inválido.',
  policy_required: 'É preciso aceitar a política de privacidade.',
  invalid_option: 'Escolha uma acomodação.',
  sold_out: 'Essa acomodação acabou de esgotar — escolha outra.',
  duplicate: 'Já existe uma pré-reserva com este WhatsApp — fale com a recepção.',
  server_error: 'Erro inesperado — tente de novo em instantes.',
  rate_limited: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.',
};

const ERRORS_EN: Record<string, string> = {
  not_found: 'Could not access the wedding — check the code.',
  invalid_dates: 'Invalid dates.',
  window_required: 'The event weekend is always included in the stay.',
  extend_limit: 'Night extension above the allowed limit.',
  too_many_guests: 'For groups larger than 6, please contact the front desk.',
  invalid_pax: 'At least 1 adult is required.',
  rate_unavailable: 'The wedding rate is unavailable — please contact the front desk.',
  uncovered: 'Some of the extra nights have no rate yet — try fewer nights or contact the front desk.',
  min_nights: 'This period requires a minimum number of nights — adjust the dates or contact the front desk.',
  no_options: 'No accommodation available for this party size.',
  missing_name: 'Please enter your full name.',
  missing_phone: 'Please enter a valid phone number.',
  invalid_email: 'Invalid e-mail.',
  policy_required: 'You must accept the privacy policy.',
  invalid_option: 'Please choose an accommodation.',
  sold_out: 'That accommodation just sold out — pick another one.',
  duplicate: 'There is already a pre-booking with this phone — contact the front desk.',
  server_error: 'Unexpected error — please try again shortly.',
  rate_limited: 'Too many attempts. Wait 15 minutes and try again.',
};

const ERRORS_ES: Record<string, string> = {
  not_found: 'No fue posible acceder a la boda — revise el código.',
  invalid_dates: 'Fechas inválidas.',
  window_required: 'El fin de semana del evento siempre está incluido en la estadía.',
  extend_limit: 'Extensión de noches por encima del límite permitido.',
  too_many_guests: 'Para grupos de más de 6 personas, hable con la recepción.',
  invalid_pax: 'Informe al menos 1 adulto.',
  rate_unavailable: 'La tarifa de la boda no está disponible — hable con la recepción.',
  uncovered: 'Algunas noches extra aún no tienen tarifa — pruebe menos noches o hable con la recepción.',
  min_nights: 'Ese período exige un número mínimo de noches — ajuste las fechas o hable con la recepción.',
  no_options: 'Ninguna cabaña disponible para esa composición.',
  missing_name: 'Informe su nombre completo.',
  missing_phone: 'Informe un WhatsApp válido.',
  invalid_email: 'Correo inválido.',
  policy_required: 'Es necesario aceptar la política de privacidad.',
  invalid_option: 'Elija una cabaña.',
  sold_out: 'Esa cabaña se acaba de agotar — elija otra.',
  duplicate: 'Ya existe una pre-reserva con este WhatsApp — hable con la recepción.',
  server_error: 'Error inesperado — intente de nuevo en instantes.',
  rate_limited: 'Demasiados intentos. Espere 15 minutos e intente de nuevo.',
};

export const siteI18n: Record<SiteLang, SiteStrings> = {
  pt: {
    weddingOf: 'Casamento de',
    welcomeDefault: 'Será uma alegria receber você para celebrar com a gente. Simule abaixo a sua hospedagem para o fim de semana do evento.',
    hostedBy: 'Hospedagem em',
    yourStay: 'Sua estadia',
    eventWeekend: 'Fim de semana do evento',
    alwaysIncluded: 'sempre incluído',
    arriveEarlier: 'Chegar antes',
    leaveLater: 'Sair depois',
    night: 'noite',
    nights: 'noites',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    whoIsComing: 'Quem vem com você',
    adults: 'Adultos',
    adultsHint: '13 anos ou mais',
    children: 'Crianças',
    childrenHint: '3 a 12 anos (pagantes)',
    babies: 'Bebês',
    babiesHint: 'até 2 anos (isentos)',
    pets: 'Pets',
    petsHint: 'taxa por diária',
    seePrices: 'Ver valores e disponibilidade',
    calculating: 'Calculando…',
    chooseCabin: 'Escolha sua acomodação',
    totalForStay: 'total da estadia',
    perNight: '/noite',
    eventWindowLabel: 'Fim de semana do evento',
    extraNightsLabel: 'Noites extras',
    petFeeLabel: 'Taxa pet',
    unitsLeft: (n) => `${n} disponíve${n > 1 ? 'is' : 'l'}`,
    lastOne: 'Última disponível!',
    soldOut: 'Esgotado',
    choose: 'Escolher',
    seePhotos: 'Ver fotos',
    adjustSearch: 'Ajustar datas ou ocupantes',
    yourDetails: 'Seus dados',
    fullName: 'Nome completo',
    whatsapp: 'WhatsApp (com DDD)',
    email: 'E-mail',
    optional: 'opcional',
    policyAccept: 'Li e aceito a política de privacidade',
    policyRead: 'Ler a política',
    policyClose: 'Fechar',
    confirmPreBook: 'Confirmar pré-reserva',
    sending: 'Enviando…',
    nothingCharged: 'Nada será cobrado agora — a recepção confirma a reserva com você pelo WhatsApp.',
    requestSent: 'Pré-reserva enviada!',
    requestSentBody: 'Sua acomodação ficou reservada para você. A recepção vai confirmar os detalhes e o pagamento pelo WhatsApp.',
    summaryCategory: 'Acomodação',
    summaryDates: 'Período',
    summaryTotal: 'Valor total',
    newQuote: 'Fazer outra simulação',
    couplePanel: 'Painel dos noivos',
    panelTab: 'Painel',
    simulatorTab: 'Simulador',
    occupancyTitle: 'Ocupação das cabanas',
    occupancySub: 'Como estão as reservas dos seus convidados no fim de semana do evento.',
    unitsTotal: 'cabanas',
    freeUnits: 'livres',
    pendingUnits: 'pré-reservadas',
    confirmedUnits: 'confirmadas',
    customizeTitle: 'Personalização',
    customizeSub: 'Deixe a página com a cara de vocês — foto, mensagem e cores.',
    coverPhoto: 'Foto de capa',
    coverPhotoHint: 'JPG/PNG até 5MB',
    uploadPhoto: 'Enviar foto',
    uploading: 'Enviando…',
    removePhoto: 'Remover',
    welcomeMessageLabel: 'Mensagem de boas-vindas',
    welcomeMessageHint: 'O texto que seus convidados leem na capa.',
    colorsLabel: 'Cores da página',
    colorPrimary: 'Destaque',
    colorBackground: 'Fundo',
    colorSurface: 'Cartões',
    resetColors: 'Voltar ao padrão',
    save: 'Salvar alterações',
    saving: 'Salvando…',
    saved: 'Alterações salvas!',
    giftsTitle: 'Lista de presentes',
    giftsSoon: 'Em breve — aqui vocês vão poder montar a lista de presentes e compartilhar com os convidados.',
    errors: ERRORS_PT,
  },
  en: {
    weddingOf: 'The wedding of',
    welcomeDefault: 'We would love to have you celebrate with us. Simulate your stay for the event weekend below.',
    hostedBy: 'Lodging at',
    yourStay: 'Your stay',
    eventWeekend: 'Event weekend',
    alwaysIncluded: 'always included',
    arriveEarlier: 'Arrive earlier',
    leaveLater: 'Leave later',
    night: 'night',
    nights: 'nights',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    whoIsComing: 'Who is coming with you',
    adults: 'Adults',
    adultsHint: '13 and older',
    children: 'Children',
    childrenHint: '3–12 years (paying)',
    babies: 'Babies',
    babiesHint: 'up to 2 years (free)',
    pets: 'Pets',
    petsHint: 'fee per night',
    seePrices: 'See rates & availability',
    calculating: 'Calculating…',
    chooseCabin: 'Choose your accommodation',
    totalForStay: 'total for the stay',
    perNight: '/night',
    eventWindowLabel: 'Event weekend',
    extraNightsLabel: 'Extra nights',
    petFeeLabel: 'Pet fee',
    unitsLeft: (n) => `${n} available`,
    lastOne: 'Last one available!',
    soldOut: 'Sold out',
    choose: 'Choose',
    seePhotos: 'See photos',
    adjustSearch: 'Adjust dates or guests',
    yourDetails: 'Your details',
    fullName: 'Full name',
    whatsapp: 'WhatsApp / phone',
    email: 'E-mail',
    optional: 'optional',
    policyAccept: 'I have read and accept the privacy policy',
    policyRead: 'Read the policy',
    policyClose: 'Close',
    confirmPreBook: 'Confirm pre-booking',
    sending: 'Sending…',
    nothingCharged: 'Nothing will be charged now — the front desk will confirm your booking via WhatsApp.',
    requestSent: 'Pre-booking sent!',
    requestSentBody: 'Your accommodation is being held for you. The front desk will confirm details and payment via WhatsApp.',
    summaryCategory: 'Accommodation',
    summaryDates: 'Dates',
    summaryTotal: 'Total',
    newQuote: 'Make another simulation',
    couplePanel: 'Couple’s panel',
    panelTab: 'Panel',
    simulatorTab: 'Simulator',
    occupancyTitle: 'Cabin occupancy',
    occupancySub: 'How your guests’ bookings look for the event weekend.',
    unitsTotal: 'cabins',
    freeUnits: 'free',
    pendingUnits: 'pre-booked',
    confirmedUnits: 'confirmed',
    customizeTitle: 'Customization',
    customizeSub: 'Make the page yours — photo, message and colors.',
    coverPhoto: 'Cover photo',
    coverPhotoHint: 'JPG/PNG up to 5MB',
    uploadPhoto: 'Upload photo',
    uploading: 'Uploading…',
    removePhoto: 'Remove',
    welcomeMessageLabel: 'Welcome message',
    welcomeMessageHint: 'The text your guests read on the cover.',
    colorsLabel: 'Page colors',
    colorPrimary: 'Accent',
    colorBackground: 'Background',
    colorSurface: 'Cards',
    resetColors: 'Reset to default',
    save: 'Save changes',
    saving: 'Saving…',
    saved: 'Changes saved!',
    giftsTitle: 'Gift registry',
    giftsSoon: 'Coming soon — here you will be able to build a gift registry and share it with your guests.',
    errors: ERRORS_EN,
  },
  es: {
    weddingOf: 'La boda de',
    welcomeDefault: 'Será una alegría recibirte para celebrar con nosotros. Simula abajo tu hospedaje para el fin de semana del evento.',
    hostedBy: 'Hospedaje en',
    yourStay: 'Tu estadía',
    eventWeekend: 'Fin de semana del evento',
    alwaysIncluded: 'siempre incluido',
    arriveEarlier: 'Llegar antes',
    leaveLater: 'Salir después',
    night: 'noche',
    nights: 'noches',
    checkIn: 'Check-in',
    checkOut: 'Check-out',
    whoIsComing: 'Quién viene contigo',
    adults: 'Adultos',
    adultsHint: '13 años o más',
    children: 'Niños',
    childrenHint: '3 a 12 años (pagan)',
    babies: 'Bebés',
    babiesHint: 'hasta 2 años (gratis)',
    pets: 'Mascotas',
    petsHint: 'tasa por noche',
    seePrices: 'Ver precios y disponibilidad',
    calculating: 'Calculando…',
    chooseCabin: 'Elige tu cabaña',
    totalForStay: 'total de la estadía',
    perNight: '/noche',
    eventWindowLabel: 'Fin de semana del evento',
    extraNightsLabel: 'Noches extra',
    petFeeLabel: 'Tasa mascota',
    unitsLeft: (n) => `${n} disponible${n > 1 ? 's' : ''}`,
    lastOne: '¡Última disponible!',
    soldOut: 'Agotado',
    choose: 'Elegir',
    seePhotos: 'Ver fotos',
    adjustSearch: 'Ajustar fechas o huéspedes',
    yourDetails: 'Tus datos',
    fullName: 'Nombre completo',
    whatsapp: 'WhatsApp',
    email: 'Correo',
    optional: 'opcional',
    policyAccept: 'Leí y acepto la política de privacidad',
    policyRead: 'Leer la política',
    policyClose: 'Cerrar',
    confirmPreBook: 'Confirmar pre-reserva',
    sending: 'Enviando…',
    nothingCharged: 'No se cobrará nada ahora — la recepción confirmará tu reserva por WhatsApp.',
    requestSent: '¡Pre-reserva enviada!',
    requestSentBody: 'Tu cabaña quedó reservada para ti. La recepción confirmará los detalles y el pago por WhatsApp.',
    summaryCategory: 'Cabaña',
    summaryDates: 'Período',
    summaryTotal: 'Total',
    newQuote: 'Hacer otra simulación',
    couplePanel: 'Panel de los novios',
    panelTab: 'Panel',
    simulatorTab: 'Simulador',
    occupancyTitle: 'Ocupación de las cabañas',
    occupancySub: 'Cómo van las reservas de tus invitados en el fin de semana del evento.',
    unitsTotal: 'cabañas',
    freeUnits: 'libres',
    pendingUnits: 'pre-reservadas',
    confirmedUnits: 'confirmadas',
    customizeTitle: 'Personalización',
    customizeSub: 'Deja la página con su estilo — foto, mensaje y colores.',
    coverPhoto: 'Foto de portada',
    coverPhotoHint: 'JPG/PNG hasta 5MB',
    uploadPhoto: 'Subir foto',
    uploading: 'Subiendo…',
    removePhoto: 'Quitar',
    welcomeMessageLabel: 'Mensaje de bienvenida',
    welcomeMessageHint: 'El texto que tus invitados leen en la portada.',
    colorsLabel: 'Colores de la página',
    colorPrimary: 'Acento',
    colorBackground: 'Fondo',
    colorSurface: 'Tarjetas',
    resetColors: 'Volver al estándar',
    save: 'Guardar cambios',
    saving: 'Guardando…',
    saved: '¡Cambios guardados!',
    giftsTitle: 'Lista de regalos',
    giftsSoon: 'Próximamente — aquí podrán armar la lista de regalos y compartirla con los invitados.',
    errors: ERRORS_ES,
  },
};

const LOCALE: Record<SiteLang, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

/** "12 de setembro de 2026" no idioma da tela. */
export function longDate(iso: string, lang: SiteLang): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00`).toLocaleDateString(LOCALE[lang], {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** "sex, 11/09" — curto, para os cards de data. */
export function shortDate(iso: string, lang: SiteLang): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00`).toLocaleDateString(LOCALE[lang], {
    weekday: 'short', day: '2-digit', month: '2-digit',
  });
}

export function money(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function moneyFull(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
