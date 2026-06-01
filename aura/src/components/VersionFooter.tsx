import { getLatestPublishedVersion } from "@/services/changelog-service";

export async function VersionFooter() {
  const commitHash = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev";
  const shortHash = commitHash.substring(0, 7);
  const version = await getLatestPublishedVersion();

  return (
    <div className="w-full p-4 text-center border-t mt-auto">
      <p className="text-[10px] text-muted-foreground font-mono">
        {version ? `Aura v${version}` : "Aura"} • Build {shortHash}
      </p>
    </div>
  );
}
