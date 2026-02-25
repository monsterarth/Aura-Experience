import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("URL ausente", { status: 400 });
  }

  try {
    // A Vercel vai buscar a mídia na Hostinger por baixo dos panos
    const response = await fetch(url);
    if (!response.ok) throw new Error("Falha ao buscar mídia");

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();

    // Devolve para a tela já em formato seguro (HTTPS)
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // Faz cache para não pesar a VM
      },
    });
  } catch (error) {
    console.error("Erro no proxy de mídia:", error);
    return new NextResponse("Erro ao carregar mídia", { status: 500 });
  }
}