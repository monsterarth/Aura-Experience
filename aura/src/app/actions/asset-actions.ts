'use server';

// Ações públicas da plaqueta de patrimônio (/p/<code>). Sem sessão — o código da
// plaqueta é a única credencial. Molde: src/app/actions/issue-actions.ts.
// Toda a validação e as guardas de abuso vivem em AssetPublicService.

import { AssetPublicService } from "@/services/asset-public-service";
import { AssetPublicReportInput, AssetPublicReportResult } from "@/types/aura";

export async function reportAssetIssue(
  code: string,
  input: AssetPublicReportInput,
): Promise<AssetPublicReportResult> {
  try {
    return await AssetPublicService.createReport(code, input);
  } catch (e) {
    console.error("[reportAssetIssue]", e);
    return { ok: false, error: "Não foi possível registrar o relato." };
  }
}
