// Renderiza o texto de uma entrada de changelog aplicando o único marcador que
// o editor usa: **negrito**. As entradas são escritas à mão no /admin/changelog e
// nomeiam o módulo em negrito na abertura ("**Módulo Guarita.** …"). Sem isto os
// asteriscos aparecem crus nas duas superfícies públicas (/aura e /changelog).
import React from "react";

/** Quebra o texto em trechos, transformando **assim** em <strong>. */
export function ChangelogText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        // índices ímpares são o conteúdo capturado entre os pares de **
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-white">
            {part}
          </strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
