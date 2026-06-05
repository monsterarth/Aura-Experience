// Transformação GPS → posição normalizada (0..1) na imagem ilustrada.
//
// Modo preferido: transformação affine (6 parâmetros) calibrada por Ground
// Control Points (GCPs) via mínimos quadrados.
//   px = a·lng + b·lat + c
//   py = d·lng + e·lat + f
//
// IMPORTANTE — normalização de coordenadas:
// lat/lng no Brasil têm valores absolutos grandes (~-28, ~-48).
// O cálculo dos mínimos quadrados envolve produtos como (-28)² = 784 enquanto
// os valores pixel são 0..1. Essa diferença de escala (≈1000x) torna o sistema
// de equações mal condicionado e produz erros de escala e offset significativos.
// Fix: subtrair a média (centroide) dos GCPs antes de qualquer cálculo.
//
// Fallback: mapeamento linear pelos limites (bounds) quando há <3 GCPs.

export type Gcp    = { lat: number; lng: number; px: number; py: number };
export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };
export type AffineTransform = { a: number; b: number; c: number; d: number; e: number; f: number };

// --- Álgebra linear ---

function solve3x3(M: number[][], v: number[]): number[] | null {
    const A = M.map((row, i) => [...row, v[i]]);
    for (let col = 0; col < 3; col++) {
        let pivot = col;
        for (let r = col + 1; r < 3; r++) {
            if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
        }
        if (Math.abs(A[pivot][col]) < 1e-12) return null;
        [A[col], A[pivot]] = [A[pivot], A[col]];
        for (let r = 0; r < 3; r++) {
            if (r === col) continue;
            const factor = A[r][col] / A[col][col];
            for (let k = col; k < 4; k++) A[r][k] -= factor * A[col][k];
        }
    }
    return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}

function fitAxis(gcps: Gcp[], target: (g: Gcp) => number): [number, number, number] | null {
    let sLL = 0, sLa = 0, sL = 0, saa = 0, sa = 0;
    const sN = gcps.length;
    let tL = 0, ta = 0, t1 = 0;
    for (const g of gcps) {
        const { lng, lat } = g;
        const t = target(g);
        sLL += lng * lng; sLa += lng * lat; sL += lng;
        saa += lat * lat; sa  += lat;
        tL += t * lng; ta += t * lat; t1 += t;
    }
    const Mx = [[sLL, sLa, sL], [sLa, saa, sa], [sL, sa, sN]];
    return solve3x3(Mx, [tL, ta, t1]) as [number, number, number] | null;
}

// Constrói a transformação affine a partir de GCPs já normalizados.
function buildTransformNormalized(gcps: Gcp[]): AffineTransform | null {
    if (gcps.length < 3) return null;
    const x = fitAxis(gcps, g => g.px);
    const y = fitAxis(gcps, g => g.py);
    if (!x || !y) return null;
    return { a: x[0], b: x[1], c: x[2], d: y[0], e: y[1], f: y[2] };
}

// --- API pública ---

export function gpsToFraction(
    lat: number,
    lng: number,
    opts: { gcps?: Gcp[]; bounds?: Bounds },
): { x: number; y: number } | null {

    const gcps = opts.gcps ?? [];

    if (gcps.length >= 3) {
        // 1) Calcula centroide para normalização
        const meanLat = gcps.reduce((s, g) => s + g.lat, 0) / gcps.length;
        const meanLng = gcps.reduce((s, g) => s + g.lng, 0) / gcps.length;

        // 2) Normaliza GCPs (trabalha com diferenças pequenas ≈ 0.0001 em vez de valores absolutos ≈ 28)
        const normalized = gcps.map(g => ({
            lat: g.lat - meanLat,
            lng: g.lng - meanLng,
            px:  g.px,
            py:  g.py,
        }));

        const t = buildTransformNormalized(normalized);
        if (t) {
            const { a, b, c, d, e, f } = t;
            // 3) Normaliza o ponto de consulta com o mesmo centroide
            const nlat = lat - meanLat;
            const nlng = lng - meanLng;
            return {
                x: a * nlng + b * nlat + c,
                y: d * nlng + e * nlat + f,
            };
        }
    }

    // Fallback linear por bounds (sem GCPs suficientes)
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
