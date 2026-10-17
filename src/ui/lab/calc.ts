// A small calculator for the level: recursive descent, no eval.
//   expr   = term { ('+' | '-') term }
//   term   = unary { ('*' | '/') unary }        also × and ÷
//   unary  = '-' unary | power
//   power  = atom [ '^' unary ]                 right associative, so -2^2 = -4 and 2^-1 = 0.5
//   atom   = number | 'ans' | func '(' expr ')' | '(' expr ')'
//   func   = log10 | ln | sqrt
// Numbers are decimal with an optional exponent (1e6, 2.5e-3).

export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

class CalcError extends Error {}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[a-z][a-z0-9]*/i.exec(src.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0].toLowerCase() });
      i += id[0].length;
      continue;
    }
    const op = c === '×' ? '*' : c === '÷' ? '/' : c === '−' ? '-' : c;
    if ('+-*/^()'.includes(op)) {
      out.push({ t: 'op', v: op });
      i++;
      continue;
    }
    throw new CalcError(`Unexpected "${c}"`);
  }
  return out;
}

const FUNCS: Record<string, (x: number) => number> = {
  log10: (x) => {
    if (x <= 0) throw new CalcError('log10 needs a positive number');
    return Math.log10(x);
  },
  ln: (x) => {
    if (x <= 0) throw new CalcError('ln needs a positive number');
    return Math.log(x);
  },
  sqrt: (x) => {
    if (x < 0) throw new CalcError('sqrt of a negative number');
    return Math.sqrt(x);
  },
};

export function evaluate(src: string, ans?: number): CalcResult {
  try {
    const toks = tokenize(src);
    if (toks.length === 0) return { ok: false, error: 'Type a calculation' };
    let pos = 0;
    const peek = () => toks[pos];
    const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;

    const expr = (): number => {
      let x = term();
      while (isOp('+') || isOp('-')) {
        const op = (toks[pos++] as { v: string }).v;
        const y = term();
        x = op === '+' ? x + y : x - y;
      }
      return x;
    };
    const term = (): number => {
      let x = unary();
      while (isOp('*') || isOp('/')) {
        const op = (toks[pos++] as { v: string }).v;
        const y = unary();
        if (op === '/' && y === 0) throw new CalcError('Divide by zero');
        x = op === '*' ? x * y : x / y;
      }
      return x;
    };
    const unary = (): number => {
      if (isOp('-')) {
        pos++;
        return -unary();
      }
      if (isOp('+')) {
        pos++;
        return unary();
      }
      return power();
    };
    const power = (): number => {
      const base = atom();
      if (isOp('^')) {
        pos++;
        return base ** unary();
      }
      return base;
    };
    const atom = (): number => {
      const tok = toks[pos++];
      if (!tok) throw new CalcError('Unfinished calculation');
      if (tok.t === 'num') return tok.v;
      if (tok.t === 'op' && tok.v === '(') {
        const x = expr();
        if (!isOp(')')) throw new CalcError('Missing )');
        pos++;
        return x;
      }
      if (tok.t === 'id') {
        if (tok.v === 'ans') {
          if (ans === undefined) throw new CalcError('No previous result');
          return ans;
        }
        const f = FUNCS[tok.v];
        if (!f) throw new CalcError(`Unknown "${tok.v}"`);
        if (!isOp('(')) throw new CalcError(`${tok.v} needs ( )`);
        pos++;
        const x = expr();
        if (!isOp(')')) throw new CalcError('Missing )');
        pos++;
        return f(x);
      }
      throw new CalcError(`Unexpected "${tok.v}"`);
    };

    const value = expr();
    if (pos < toks.length) throw new CalcError(`Unexpected "${(toks[pos] as { v: string | number }).v}"`);
    if (!Number.isFinite(value)) return { ok: false, error: 'Not a number' };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof CalcError ? e.message : 'Cannot calculate' };
  }
}

// A result as shown and inserted: at most 10 significant digits.
export const formatResult = (v: number): string => String(Number(v.toPrecision(10)));
