export const validateCPF = (cpf: string) => {
  const cleanCPF = cpf.replace(/\D/g, "");
  if (cleanCPF.length !== 11 || /^(\d)\1+$/.test(cleanCPF)) return false;
  let sum = 0, rest;
  for (let i = 1; i <= 9; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  rest = (sum * 10) % 11;
  if ((rest === 10) || (rest === 11)) rest = 0;
  if (rest !== parseInt(cleanCPF.substring(9, 10))) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum = sum + parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  rest = (sum * 10) % 11;
  if ((rest === 10) || (rest === 11)) rest = 0;
  return rest === parseInt(cleanCPF.substring(10, 11));
};

export const fetchCEP = async (cep: string) => {
  const cleanCEP = cep.replace(/\D/g, "");
  if (cleanCEP.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
  return res.json();
};

export const translations = {
  pt: { welcome: "Bem-vindo", identity: "Identidade", address: "Endereço", arrival: "Sua Chegada", pet: "Trarei um Pet", finish: "Finalizar" },
  en: { welcome: "Welcome", identity: "Identity", address: "Address", arrival: "Your Arrival", pet: "I'll bring a Pet", finish: "Finish" },
  es: { welcome: "Bienvenido", identity: "Identidad", address: "Dirección", arrival: "Su Llegada", pet: "Traeré uma Mascota", finish: "Finalizar" }
};