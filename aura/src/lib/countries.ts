/**
 * Países oferecidos nas telas de captura (nacionalidade, país de residência,
 * endereço do cadastro da proposta). Mesma lista que o pré-check-in usa —
 * 'XX' é o "Outro", que libera o endereço livre.
 */
export const COUNTRIES: { name: string; iso: string; flag: string; ddi: string }[] = [
  { name: "Brasil", iso: "BR", flag: "🇧🇷", ddi: "+55" },
  { name: "Estados Unidos", iso: "US", flag: "🇺🇸", ddi: "+1" },
  { name: "Argentina", iso: "AR", flag: "🇦🇷", ddi: "+54" },
  { name: "Portugal", iso: "PT", flag: "🇵🇹", ddi: "+351" },
  { name: "Uruguai", iso: "UY", flag: "🇺🇾", ddi: "+598" },
  { name: "Chile", iso: "CL", flag: "🇨🇱", ddi: "+56" },
  { name: "Paraguai", iso: "PY", flag: "🇵🇾", ddi: "+595" },
  { name: "Itália", iso: "IT", flag: "🇮🇹", ddi: "+39" },
  { name: "Alemanha", iso: "DE", flag: "🇩🇪", ddi: "+49" },
  { name: "França", iso: "FR", flag: "🇫🇷", ddi: "+33" },
  { name: "Espanha", iso: "ES", flag: "🇪🇸", ddi: "+34" },
  { name: "Reino Unido", iso: "GB", flag: "🇬🇧", ddi: "+44" },
  { name: "México", iso: "MX", flag: "🇲🇽", ddi: "+52" },
  { name: "Colômbia", iso: "CO", flag: "🇨🇴", ddi: "+57" },
  { name: "Peru", iso: "PE", flag: "🇵🇪", ddi: "+51" },
  { name: "Bolívia", iso: "BO", flag: "🇧🇴", ddi: "+591" },
  { name: "Venezuela", iso: "VE", flag: "🇻🇪", ddi: "+58" },
  { name: "Equador", iso: "EC", flag: "🇪🇨", ddi: "+593" },
  { name: "Outro", iso: "XX", flag: "🌍", ddi: "" },
];

export const getCountryByDDI = (phone: string) => {
  if (phone.startsWith("+55")) return "Brasil";
  if (phone.startsWith("+1")) return "Estados Unidos";
  if (phone.startsWith("+351")) return "Portugal";
  if (phone.startsWith("+54")) return "Argentina";
  if (phone.startsWith("+598")) return "Uruguai";
  return "Brasil"; // Fallback
};