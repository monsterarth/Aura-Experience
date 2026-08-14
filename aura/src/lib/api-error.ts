// src/lib/api-error.ts
// Resposta de erro padronizada para API routes: loga o detalhe no SERVIDOR e
// devolve uma mensagem genérica ao cliente. Evita vazar mensagem crua do
// Postgres/Supabase (nomes de coluna, constraint, schema) na resposta HTTP.
import { NextResponse } from 'next/server';

export function serverError(context: string, e: unknown, status = 500) {
  console.error(`[${context}]`, e);
  return NextResponse.json({ error: 'Erro interno do servidor.' }, { status });
}
