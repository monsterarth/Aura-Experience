import { NextResponse } from "next/server";
import { getLatestPublishedVersion } from "@/services/changelog-service";

export const revalidate = 300; // cache 5 min

export async function GET() {
  const version = await getLatestPublishedVersion();
  return NextResponse.json({ version });
}
