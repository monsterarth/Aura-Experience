"use client";

// Leitura da placa pela câmera — OFFLINE.
//
// O reconhecimento roda no próprio aparelho (Tesseract em WebAssembly, com os
// modelos servidos de /tesseract), então funciona sem internet e **nenhuma foto
// sai do celular nem é armazenada**: o quadro capturado vira texto e é
// descartado. Guardar a imagem fica para quando houver folga de egress.
//
// O ML Kit do Google resolveria isso melhor, mas é SDK nativo (Android/iOS) e
// este app é web — não há como chamá-lo de dentro do navegador. A API nativa de
// detecção de texto do Chrome ainda exige flag experimental.
//
// A leitura é SUGESTÃO: quem confirma é o guarita. Digitar continua sendo o
// caminho principal; isto é o atalho.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { T, displayPlate, normalizePlate } from "./guarita-ui";

/** Mercosul (ABC1D23) e o padrão antigo (ABC1234) numa expressão só. */
const PLATE_RE = /[A-Z]{3}[0-9][0-9A-Z][0-9]{2}/g;

/** O OCR confunde estes o tempo todo; a posição no padrão da placa desempata. */
const LETTER_FIX: Record<string, string> = { "0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "4": "A" };
const DIGIT_FIX: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", A: "4", G: "6" };

/**
 * Tenta encaixar o texto lido no formato de placa: 3 letras, 1 dígito, 1 solto,
 * 2 dígitos. Corrige as trocas clássicas por posição.
 */
function coercePlate(raw: string): string | null {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (let i = 0; i + 7 <= clean.length; i++) {
    const w = clean.slice(i, i + 7).split("");
    for (let p = 0; p < 3; p++) if (/[0-9]/.test(w[p])) w[p] = LETTER_FIX[w[p]] ?? w[p];
    if (/[A-Z]/.test(w[3])) w[3] = DIGIT_FIX[w[3]] ?? w[3];
    for (const p of [5, 6]) if (/[A-Z]/.test(w[p])) w[p] = DIGIT_FIX[w[p]] ?? w[p];
    const candidate = w.join("");
    PLATE_RE.lastIndex = 0;
    if (PLATE_RE.test(candidate)) return candidate;
  }
  return null;
}

/**
 * Prepara o quadro para o OCR: recorta a faixa da moldura, amplia, tira a cor e
 * binariza. Sem isso a leitura de placa é loteria.
 */
function preprocess(video: HTMLVideoElement): HTMLCanvasElement {
  const vw = video.videoWidth, vh = video.videoHeight;
  const cropW = Math.round(vw * 0.82);
  const cropH = Math.round(vh * 0.22);
  const sx = Math.round((vw - cropW) / 2);
  const sy = Math.round((vh - cropH) / 2);

  const scale = Math.min(3, Math.max(1.5, 900 / cropW));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropW * scale);
  canvas.height = Math.round(cropH * scale);

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;

  // Cinza + média, para o corte não depender da luz do dia.
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = px[i + 1] = px[i + 2] = g;
    sum += g;
  }
  const mean = sum / (px.length / 4);
  const cut = mean * 0.88;
  for (let i = 0; i < px.length; i += 4) {
    const v = px[i] < cut ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// O worker é caro de subir (~8 MB de modelo); vive enquanto o app estiver aberto.
let workerPromise: Promise<any> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        // Tudo do próprio domínio: sem CDN, funciona offline depois do 1º uso.
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract",
        langPath: "/tesseract",
        gzip: false,
      });
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
      });
      return worker;
    })().catch(err => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

type Phase = "starting" | "ready" | "reading" | "result" | "error";

export function PlateScanner({ onPick, onClose }: { onPick: (plate: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [result, setResult] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase("ready");
        void getWorker().catch(() => {}); // aquece enquanto ele mira
      } catch {
        if (!cancelled) {
          setError("Não consegui abrir a câmera. Verifique a permissão ou digite a placa.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  const read = useCallback(async () => {
    if (!videoRef.current || phase === "reading") return;
    setPhase("reading");
    try {
      const canvas = preprocess(videoRef.current);
      const worker = await getWorker();
      const { data } = await worker.recognize(canvas);
      const text = String(data?.text ?? "").trim();
      setRawText(text);
      setResult(coercePlate(text));
      setPhase("result");
    } catch {
      setError("Não consegui processar a imagem. Tente de novo ou digite a placa.");
      setPhase("error");
    }
  }, [phase]);

  const btn: React.CSSProperties = {
    height: 56, borderRadius: 16, border: "none", cursor: "pointer",
    fontFamily: "inherit", fontSize: 16, fontWeight: 800,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, background: "#000",
      display: "flex", flexDirection: "column",
    }}>
      {/* Câmera */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />

        {/* Moldura: a placa precisa preencher esta faixa */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{
            width: "82%", aspectRatio: "3.6 / 1", borderRadius: 12,
            border: `3px solid ${phase === "reading" ? T.g2 : "rgba(255,255,255,0.9)"}`,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }} />
        </div>

        {/* Cabeçalho */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "16px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ background: "rgba(0,0,0,0.55)", borderRadius: 12, padding: "9px 13px", maxWidth: 260 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Enquadre a placa</div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 2, lineHeight: 1.4 }}>
              Preencha a moldura e mantenha firme
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.55)",
            border: "none", color: "#fff", fontSize: 22, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
          }}>×</button>
        </div>
      </div>

      {/* Base */}
      <div style={{ padding: "16px 16px 24px", background: T.bg, display: "flex", flexDirection: "column", gap: 12 }}>
        {phase === "error" && (
          <>
            <div style={{ fontSize: 14, color: T.amber, lineHeight: 1.5 }}>{error}</div>
            <button onClick={onClose} style={{ ...btn, background: T.glass2, color: T.text }}>Digitar a placa</button>
          </>
        )}

        {phase === "result" && (
          result ? (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted2 }}>Li a placa</div>
                <div style={{ fontFamily: T.mono, fontSize: 34, fontWeight: 700, letterSpacing: ".12em", color: T.text, marginTop: 6 }}>
                  {displayPlate(result)}
                </div>
              </div>
              <button onClick={() => onPick(normalizePlate(result))} style={{ ...btn, background: T.grad, color: "#0b0d14" }}>
                Usar esta placa
              </button>
              <button onClick={() => { setResult(null); setPhase("ready"); }} style={{
                height: 48, borderRadius: 14, background: "transparent", border: `1px solid ${T.border2}`,
                color: T.muted, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>Ler de novo</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, color: T.amber, lineHeight: 1.5, textAlign: "center" }}>
                Não reconheci uma placa{rawText ? ` (li "${rawText.slice(0, 18)}")` : ""}. Aproxime mais ou digite.
              </div>
              <button onClick={() => { setResult(null); setPhase("ready"); }} style={{ ...btn, background: T.grad, color: "#0b0d14" }}>
                Tentar de novo
              </button>
              <button onClick={onClose} style={{
                height: 48, borderRadius: 14, background: "transparent", border: `1px solid ${T.border2}`,
                color: T.muted, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>Digitar a placa</button>
            </>
          )
        )}

        {(phase === "ready" || phase === "reading" || phase === "starting") && (
          <>
            <button onClick={() => void read()} disabled={phase !== "ready"} style={{
              ...btn,
              background: phase === "ready" ? T.grad : T.glass2,
              color: phase === "ready" ? "#0b0d14" : T.muted2,
            }}>
              {phase === "starting" ? "Abrindo a câmera…" : phase === "reading" ? "Lendo…" : "Ler placa"}
            </button>
            <div style={{ fontSize: 11.5, color: T.muted2, textAlign: "center", lineHeight: 1.5 }}>
              A leitura acontece no aparelho. Nenhuma foto é enviada ou guardada.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
