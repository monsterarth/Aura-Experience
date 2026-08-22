// Copiar texto no admin.
//
// `navigator.clipboard` é o caminho normal, mas ele exige contexto seguro E o
// documento em foco — e depois de um `await` (salvar o orçamento antes de
// copiar, por exemplo) parte dos navegadores já considera o gesto do usuário
// expirado e recusa a escrita. O fallback de textarea + execCommand cobre esses
// casos; quem chama só avisa "copiado" quando ISTO retorna true, porque o pior
// desfecho é o vendedor achar que copiou e mandar a mensagem antiga.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai no fallback
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // Fora da tela, mas renderizado: `display:none` não é selecionável.
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);   // iOS ignora o select() sozinho
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
