// Transformação GPS → posição normalizada (0..1) na imagem ilustrada.
//
// Modo preferido: transformação affine (6 parâmetros) calibrada por Ground
// Control Points (GCPs) via mínimos quadrados — exige ≥3 pontos.
//   px = a·lng + b·lat + c
//   py = d·lng + e·lat + f
// Fallback: mapeamento linear pelos limites (bounds) quando há <3 GCPs.

export type Gcp = { lat: number; lng: number; px: number; py: number };
export type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };
export type AffineTransform = { a: number; b: number; c: number; d: number; e: number; f: number };

// Resolve sistema linear 3x3 (eliminação de Gauss). Retorna null se singular.
function solve3x3(M: number[][], v: number[]): number[] | null {
    const A = M.map((row, i) => [...row, v[i]]);
    for (let col = 0; col < 3; col++) {
        // pivô parcial
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

// Ajusta px ≈ a·lng + b·lat + c por mínimos quadrados (normal equations).
function fitAxis(gcps: Gcp[], target: (g: Gcp) => number): [number, number, number] | null {
    // Monta A^T·A (3x3) e A^T·t (3)
    let sLL = 0, sLa = 0, sL = 0, saa = 0, sa = 0, sN = gcps.length;
    let tL = 0, ta = 0, t1 = 0;
    for (const g of gcps) {
        const lng = g.lng, lat = g.lat, t = target(g);
        sLL += lng * lng; sLa += lng * lat; sL += lng;
        saa += lat * lat; sa += lat;
        tL += t * lng; ta += t * lat; t1 += t;
    }
    const M = [
        [sLL, sLa, sL],
        [sLa, saa, sa],
        [sL, sa, sN],
    ];
    return solve3x3(M, [tL, ta, t1]) as [number, number, number] | null;
}

export function buildTransform(gcps: Gcp[]): AffineTransform | null {
    if (!gcps || gcps.length < 3) return null;
    const x = fitAxis(gcps, g => g.px);
    const y = fitAxis(gcps, g => g.py);
    if (!x || !y) return null;
    return { a: x[0], b: x[1], c: x[2], d: y[0], e: y[1], f: y[2] };
}

// Retorna posição normalizada (0..1) ou null se fora de qualquer calibração.
export function gpsToFraction(
    lat: number,
    lng: number,
    opts: { gcps?: Gcp[]; bounds?: Bounds },
): { x: number; y: number } | null {
    const transform = buildTransform(opts.gcps ?? []);
    if (transform) {
        const { a, b, c, d, e, f } = transform;
        return { x: a * lng + b * lat + c, y: d * lng + e * lat + f };
    }
    if (opts.bounds) {
        const { minLat, maxLat, minLng, maxLng } = opts.bounds;
        if (maxLng === minLng || maxLat === minLat) return null;
        return {
            x: (lng - minLng) / (maxLng - minLng),
            y: (maxLat - lat) / (maxLat - minLat), // y invertido: latitude cresce p/ cima
        };
    }
    return null;
}
