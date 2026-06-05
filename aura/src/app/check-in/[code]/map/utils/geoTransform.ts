// Transformação GPS → posição normalizada (0..1) na imagem ilustrada.
//
// Mapas ILUSTRADOS não são geometricamente fiéis (perspectiva, distâncias
// artísticas), então uma única transformação affine GLOBAL não consegue
// representá-los — com muitos pontos o mínimos-quadrados "espalha" o erro e
// piora em todo lugar.
//
// Solução: affine LOCAL ponderada (Shepard). Para cada consulta, calcula uma
// affine dando mais peso aos GCPs próximos do ponto. Isso:
//   - respeita a distorção local do mapa desenhado;
//   - é robusto a um GCP ruim isolado (peso baixo quando distante);
//   - degrada para affine global quando os pontos são esparsos.
//
// Coordenadas são normalizadas pelo centroide (lat/lng no Brasil ~ -28/-48
// geram produtos grandes que deixam o sistema mal condicionado).
//
// Fallback: mapeamento linear por bounds quando há <3 GCPs válidos.

export type Gcp    = { lat: number; lng: number; px: number; py: number };
export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

// --- Validação ---

export function isValidGcp(g: Gcp): boolean {
    return (
        Number.isFinite(g.lat) && Number.isFinite(g.lng) &&
        Number.isFinite(g.px)  && Number.isFinite(g.py)  &&
        !(g.lat === 0 && g.lng === 0) &&          // ponto adicionado mas não preenchido
        g.px >= -0.05 && g.px <= 1.05 &&          // pixel dentro (com folga) da imagem
        g.py >= -0.05 && g.py <= 1.05
    );
}

export function sanitizeGcps(gcps: Gcp[]): Gcp[] {
    return (gcps ?? []).filter(isValidGcp);
}

// --- Álgebra linear ---

function solve3x3(M: number[][], v: number[]): number[] | null {
    const A = M.map((row, i) => [...row, v[i]]);
    for (let col = 0; col < 3; col++) {
        let pivot = col;
        for (let r = col + 1; r < 3; r++) {
            if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
        }
        if (Math.abs(A[pivot][col]) < 1e-15) return null;
        [A[col], A[pivot]] = [A[pivot], A[col]];
        for (let r = 0; r < 3; r++) {
            if (r === col) continue;
            const factor = A[r][col] / A[col][col];
            for (let k = col; k < 4; k++) A[r][k] -= factor * A[col][k];
        }
    }
    return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}

// Mínimos quadrados ponderados para v = a·lng + b·lat + c
function fitAxisWeighted(pts: Gcp[], target: (g: Gcp) => number, weights: number[]): [number, number, number] | null {
    let sLL = 0, sLa = 0, sL = 0, saa = 0, sa = 0, sW = 0;
    let tL = 0, ta = 0, t1 = 0;
    for (let i = 0; i < pts.length; i++) {
        const w = weights[i];
        const L = pts[i].lng, A = pts[i].lat, t = target(pts[i]);
        sLL += w * L * L; sLa += w * L * A; sL += w * L;
        saa += w * A * A; sa += w * A; sW += w;
        tL += w * t * L; ta += w * t * A; t1 += w * t;
    }
    const M = [[sLL, sLa, sL], [sLa, saa, sa], [sL, sa, sW]];
    return solve3x3(M, [tL, ta, t1]) as [number, number, number] | null;
}

function centroid(gcps: Gcp[]) {
    const meanLat = gcps.reduce((s, g) => s + g.lat, 0) / gcps.length;
    const meanLng = gcps.reduce((s, g) => s + g.lng, 0) / gcps.length;
    return { meanLat, meanLng };
}

// Diagonal do conjunto (em graus) — usada para definir o raio de suavização.
function spreadDiagonal(pts: Gcp[]): number {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const p of pts) {
        if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
        if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
    }
    return Math.hypot(maxLng - minLng, maxLat - minLat);
}

// Avalia uma affine local ponderada por proximidade ao ponto (qLng,qLat).
// `smoothing` é o raio (em graus) onde os pontos têm peso relevante.
function localAffineEval(norm: Gcp[], qLng: number, qLat: number, smoothing: number): { x: number; y: number } | null {
    const s2 = smoothing * smoothing;
    const weights = norm.map(g => 1 / ((g.lng - qLng) ** 2 + (g.lat - qLat) ** 2 + s2));
    const x = fitAxisWeighted(norm, g => g.px, weights);
    const y = fitAxisWeighted(norm, g => g.py, weights);
    if (!x || !y) return null;
    return { x: x[0] * qLng + x[1] * qLat + x[2], y: y[0] * qLng + y[1] * qLat + y[2] };
}

// --- API pública ---

export function gpsToFraction(
    lat: number,
    lng: number,
    opts: { gcps?: Gcp[]; bounds?: Bounds },
): { x: number; y: number } | null {

    const gcps = sanitizeGcps(opts.gcps ?? []);

    if (gcps.length >= 3) {
        const { meanLat, meanLng } = centroid(gcps);
        const norm = gcps.map(g => ({ lat: g.lat - meanLat, lng: g.lng - meanLng, px: g.px, py: g.py }));
        const qLat = lat - meanLat, qLng = lng - meanLng;

        const diag = spreadDiagonal(norm);
        // Raio de suavização ≈ 30% da diagonal: equilibra "modelar a distorção
        // local" (raio menor) vs "ser robusto a pins imprecisos" (raio maior).
        const smoothing = diag > 0 ? diag * 0.3 : 1e-4;

        const f = localAffineEval(norm, qLng, qLat, smoothing)
            // fallback: affine global (raio enorme → pesos ~iguais)
            ?? localAffineEval(norm, qLng, qLat, diag * 100 || 1);
        if (f) return f;
    }

    if (opts.bounds) {
        const { minLat, maxLat, minLng, maxLng } = opts.bounds;
        if (maxLng === minLng || maxLat === minLat) return null;
        return {
            x: (lng - minLng) / (maxLng - minLng),
            y: (maxLat - lat) / (maxLat - minLat),
        };
    }

    return null;
}

// Diagnóstico de calibração: para cada GCP válido, mede o quanto ele discorda
// dos demais (leave-one-out) — prevê a posição dele usando os OUTROS pontos via
// affine global e compara com a posição marcada. Resíduo alto = coordenada
// errada / pin no lugar errado.
// Retorna, por índice do array original, o erro em % da imagem (ou null).
export function gcpResidualsPercent(gcps: Gcp[]): (number | null)[] {
    const result: (number | null)[] = (gcps ?? []).map(() => null);
    const validIdx = (gcps ?? []).map((g, i) => ({ g, i })).filter(({ g }) => isValidGcp(g));
    if (validIdx.length < 4) return result; // precisa sobrar ≥3 ao remover 1

    for (const { g: target, i: targetIdx } of validIdx) {
        const others = validIdx.filter(v => v.i !== targetIdx).map(v => v.g);
        const { meanLat, meanLng } = centroid(others);
        const norm = others.map(o => ({ lat: o.lat - meanLat, lng: o.lng - meanLng, px: o.px, py: o.py }));
        const w = norm.map(() => 1); // affine global (sem ponderação) p/ medir consenso
        const x = fitAxisWeighted(norm, p => p.px, w);
        const y = fitAxisWeighted(norm, p => p.py, w);
        if (!x || !y) continue;
        const qLng = target.lng - meanLng, qLat = target.lat - meanLat;
        const predX = x[0] * qLng + x[1] * qLat + x[2];
        const predY = y[0] * qLng + y[1] * qLat + y[2];
        result[targetIdx] = Math.hypot(predX - target.px, predY - target.py) * 100;
    }
    return result;
}
