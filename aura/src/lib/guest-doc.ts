// Documento do hóspede — normalização e teste de "está preenchido?".
// Uma única implementação porque a resposta precisa ser idêntica em três lugares:
// a chave da ficha (`guests.id` é o documento normalizado), o alerta "Doc pendente"
// da lista de estadias e o script de migração dos ids provisórios.

/** "123.456.789-00" → "12345678900"; "N/A" → "NA". Maiúsculas, só letras e dígitos. */
export function normalizeDocument(raw?: string | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * true quando a ficha tem um número de documento de verdade.
 * Descarta vazio, "N/A" (o placeholder gravado pelo formulário de nova reserva)
 * e qualquer coisa curta demais para ser CPF, RG, DNI ou passaporte.
 */
export function hasValidDocument(document?: { number?: string | null } | null): boolean {
  return normalizeDocument(document?.number).length > 3;
}
