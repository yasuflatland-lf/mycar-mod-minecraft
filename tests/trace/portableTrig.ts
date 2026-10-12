// V8 computes Math.sin, Math.cos, and Math.tan in compiled C code whose last
// bit differs between builds: Node 24.21.0 gives different results on macOS
// arm64 and Linux x64 for the same radians, while Math.hypot and ** agree.
// The traces compare numbers exactly, so the trace tests replace these three
// with the fdlibm kernels in plain JavaScript, whose double arithmetic gives
// the same bits on every platform. Import this module before anything from
// src/, because driveInput.ts calls Math.tan when it loads.

const S1 = -0.16666666666666632;
const S2 = 0.00833333333332249;
const S3 = -0.0001984126982985795;
const S4 = 0.0000027557313707070068;
const S5 = -2.5050760253406863e-8;
const S6 = 1.58969099521155e-10;
const C1 = 0.0416666666666666;
const C2 = -0.001388888888887411;
const C3 = 0.00002480158728947673;
const C4 = -2.7557314351390663e-7;
const C5 = 2.087572321298175e-9;
const C6 = -1.1359647557788195e-11;
const INV_PIO2 = 0.6366197723675814;
const PIO2_1 = 1.5707963267341256;
const PIO2_1T = 6.077100506506192e-11;
const PIO4 = 0.7853981633974483;
// Over |x| <= 34 these functions stay within 3.5e-16 relative of the native
// ones (measured). Larger arguments would need a finer reduction than the one
// Cody-Waite step below; the trace only passes angles of less than one turn.
const MAX_ARGUMENT = 34;

/** sin(x + y) for |x + y| <= pi/4, with y the tail of the reduced argument. */
function kernelSin(x: number, y: number): number {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

/** cos(x + y) for |x + y| <= pi/4. */
function kernelCos(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const one = 1 - hz;
  return one + (1 - one - hz + (z * r - x * y));
}

/** x = n * pi/2 + (head + tail), with |head + tail| <= pi/4. */
function reduce(x: number): { n: number; head: number; tail: number } {
  if (!(Math.abs(x) <= MAX_ARGUMENT)) {
    throw new RangeError(`portable trig argument out of range: ${x}`);
  }
  if (Math.abs(x) <= PIO4) return { n: 0, head: x, tail: 0 };
  const n = Math.floor(x * INV_PIO2 + 0.5);
  const r = x - n * PIO2_1;
  const w = n * PIO2_1T;
  const head = r - w;
  return { n: n & 3, head, tail: r - head - w };
}

function sin(x: number): number {
  const { n, head, tail } = reduce(x);
  if (n === 0) return kernelSin(head, tail);
  if (n === 1) return kernelCos(head, tail);
  if (n === 2) return -kernelSin(head, tail);
  return -kernelCos(head, tail);
}

function cos(x: number): number {
  const { n, head, tail } = reduce(x);
  if (n === 0) return kernelCos(head, tail);
  if (n === 1) return -kernelSin(head, tail);
  if (n === 2) return -kernelCos(head, tail);
  return kernelSin(head, tail);
}

Math.sin = sin;
Math.cos = cos;
Math.tan = (x) => sin(x) / cos(x);
