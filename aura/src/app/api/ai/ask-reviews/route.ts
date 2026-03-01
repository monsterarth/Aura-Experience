// src/app/api/ai/ask-reviews/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
  try {
    const { question, comments } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({
        answer: "A chave do Gemini (GEMINI_API_KEY) não está configurada no ambiente."
      });
    }

    if (!comments || comments.length === 0) {
      return NextResponse.json({
        answer: "Não há comentários de hóspedes no período selecionado para analisar."
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    Você é um assistente de inteligência de negócios focado em hospitalidade, atuando no sistema Aura Experience.
    Sua tarefa é responder à pergunta do gestor da pousada baseando-se EXCLUSIVAMENTE nas avaliações fornecidas abaixo.
    
    REGRA IMPORTANTÍSSIMA:
    - Se a informação solicitada não estiver nas avaliações fornecidas, responda de forma direta que não há menções sobre o assunto no período selecionado. Não invente ou presuma informações.
    - Seja claro, objetivo e profissional.

    AVALIAÇÕES DOS HÓSPEDES (Período filtrado):
    ${comments.map((c: string, index: number) => `[Avaliação ${index + 1}]: ${c}`).join('\n')}

    PERGUNTA DO GESTOR:
    "${question}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ answer: text.trim() });
  } catch (error) {
    console.error("Erro na API de Perguntas do Gemini:", error);
    return NextResponse.json(
      { error: "Falha ao processar a pergunta com a IA." }, 
      { status: 500 }
    );
  }
}