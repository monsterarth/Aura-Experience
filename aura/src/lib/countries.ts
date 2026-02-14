export const getCountryByDDI = (phone: string) => {
  if (phone.startsWith("+55")) return "Brasil";
  if (phone.startsWith("+1")) return "Estados Unidos";
  if (phone.startsWith("+351")) return "Portugal";
  if (phone.startsWith("+54")) return "Argentina";
  if (phone.startsWith("+598")) return "Uruguai";
  return "Brasil"; // Fallback
};