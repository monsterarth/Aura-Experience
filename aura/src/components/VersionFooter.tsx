export function VersionFooter() {
  // A Vercel injeta essa variável automaticamente em cada deploy.
  // Se rodar no localhost, ele usa "dev" como fallback.
  const commitHash = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev";
  
  // Um hash de commit tem 40 caracteres. Pegamos só os 7 primeiros para ficar elegante.
  const shortHash = commitHash.substring(0, 7);
  
  // A versão "v0" você atualiza manualmente quando fizer grandes saltos (v1, v2).
  const appVersion = "v0"; 

  return (
    <div className="w-full p-4 text-center border-t mt-auto">
      <p className="text-[10px] text-muted-foreground font-mono">
        Aura {appVersion} • Build {shortHash}
      </p>
    </div>
  );
}
