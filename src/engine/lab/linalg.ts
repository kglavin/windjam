// Level 10's linear algebra: real symmetric and complex Hermitian eigendecomposition (Jacobi), and a complex solve.
// Small matrices only (arrays of up to a dozen elements, codes of 31 chips).

export interface CMatrix {
  re: number[][];
  im: number[][];
}
export interface CVector {
  re: number[];
  im: number[];
}

// Eigenvalues (descending) and unit eigenvectors (columns as arrays) of a real symmetric matrix, by cyclic Jacobi.
export function symEig(a0: number[][]): { values: number[]; vectors: number[][] } {
  const n = a0.length;
  const a = a0.map((r) => r.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = [...Array(n).keys()].sort((i, j) => a[j][j] - a[i][i]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => v.map((row) => row[i])) };
}

const cdot = (x: CVector, y: CVector) => {
  // xᴴ y
  let re = 0;
  let im = 0;
  for (let k = 0; k < x.re.length; k++) {
    re += x.re[k] * y.re[k] + x.im[k] * y.im[k];
    im += x.re[k] * y.im[k] - x.im[k] * y.re[k];
  }
  return { re, im };
};

// Eigenvalues (descending) and unit eigenvectors of a Hermitian matrix, through the real symmetric form
// [[Re, −Im], [Im, Re]], whose eigenvalues come in equal pairs; one vector of each pair is kept.
export function hermitianEig(m: CMatrix): { values: number[]; vectors: CVector[] } {
  const n = m.re.length;
  const s = Array.from({ length: 2 * n }, (_, i) =>
    Array.from({ length: 2 * n }, (_, j) => {
      const r = i % n;
      const c = j % n;
      if (i < n && j < n) return m.re[r][c];
      if (i >= n && j >= n) return m.re[r][c];
      if (i < n) return -m.im[r][c];
      return m.im[r][c];
    }));
  const e = symEig(s);
  const values: number[] = [];
  const vectors: CVector[] = [];
  for (let k = 0; k < 2 * n && vectors.length < n; k++) {
    const x = e.vectors[k];
    const v = { re: x.slice(0, n), im: x.slice(n) };
    if (vectors.some((u) => Math.hypot(cdot(u, v).re, cdot(u, v).im) > 0.5)) continue;
    const norm = Math.sqrt(cdot(v, v).re);
    vectors.push({ re: v.re.map((z) => z / norm), im: v.im.map((z) => z / norm) });
    values.push(e.values[k]);
  }
  return { values, vectors };
}

// Solve A x = b for complex A (Gaussian elimination with pivoting).
export function complexSolve(A: CMatrix, b: CVector): CVector {
  const n = b.re.length;
  const ar = A.re.map((r, i) => [...r, b.re[i]]);
  const ai = A.im.map((r, i) => [...r, b.im[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.hypot(ar[r][c], ai[r][c]) > Math.hypot(ar[p][c], ai[p][c])) p = r;
    [ar[c], ar[p]] = [ar[p], ar[c]];
    [ai[c], ai[p]] = [ai[p], ai[c]];
    const d = ar[c][c] * ar[c][c] + ai[c][c] * ai[c][c];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      // f = A[r][c] / A[c][c]
      const fr = (ar[r][c] * ar[c][c] + ai[r][c] * ai[c][c]) / d;
      const fi = (ai[r][c] * ar[c][c] - ar[r][c] * ai[c][c]) / d;
      for (let k = c; k <= n; k++) {
        const xr = ar[c][k];
        const xi = ai[c][k];
        ar[r][k] -= fr * xr - fi * xi;
        ai[r][k] -= fr * xi + fi * xr;
      }
    }
  }
  const re: number[] = [];
  const im: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = ar[i][i] * ar[i][i] + ai[i][i] * ai[i][i];
    re.push((ar[i][n] * ar[i][i] + ai[i][n] * ai[i][i]) / d);
    im.push((ai[i][n] * ar[i][i] - ar[i][n] * ai[i][i]) / d);
  }
  return { re, im };
}

export const cInner = cdot;
