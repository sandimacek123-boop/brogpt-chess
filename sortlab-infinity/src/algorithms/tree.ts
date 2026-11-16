import type { AlgoDef } from './types';
import type { SortContext } from '../core/context';

/** In-order traversal (iterative) writing values to the main array. */
function inorderWrite(ctx: SortContext, root: number, left: Int32Array, right: Int32Array, val: Int32Array) {
  const stack: number[] = [];
  let cur = root;
  let k = 0;
  while (cur >= 0 || stack.length) {
    while (cur >= 0) {
      stack.push(cur);
      cur = left[cur];
    }
    cur = stack.pop()!;
    ctx.set(k++, val[cur]);
    cur = right[cur];
  }
}

export const treeSorts: AlgoDef[] = [
  {
    id: 'tree',
    name: 'Tree Sort',
    category: 'Tree',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n²)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 2048,
    notes: 'Unbalanced binary search tree; degrades to O(n²) on sorted input.',
    description:
      'Inserts every element into a plain binary search tree, then reads it back with an in-order traversal. Fast on random data, quadratic on sorted or reversed data because the tree becomes a list.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const left = ctx.aux(n);
      const right = ctx.aux(n);
      const val = ctx.aux(n);
      for (let i = 0; i < n; i++) {
        val.set(i, ctx.get(i));
        left.set(i, -1);
        right.set(i, -1);
      }
      for (let i = 1; i < n; i++) {
        let cur = 0;
        for (;;) {
          if (ctx.cmpv(val.data[i], val.data[cur], i, cur) < 0) {
            if (left.data[cur] < 0) {
              left.set(cur, i);
              break;
            }
            cur = left.data[cur];
          } else {
            if (right.data[cur] < 0) {
              right.set(cur, i);
              break;
            }
            cur = right.data[cur];
          }
        }
      }
      inorderWrite(ctx, 0, left.data, right.data, val.data);
    },
  },
  {
    id: 'tree-avl',
    name: 'AVL Tree Sort',
    category: 'Tree',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 32768,
    notes: 'Self-balancing tree (Adelson-Velsky & Landis, 1962).',
    description:
      'Tree sort on an AVL tree: rotations keep subtree heights within one of each other, so every insertion is O(log n) even for sorted input.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const left = ctx.aux(n);
      const right = ctx.aux(n);
      const height = ctx.aux(n);
      const val = ctx.aux(n);
      const h = (x: number) => (x < 0 ? 0 : height.data[x]);
      const upd = (x: number) => height.set(x, 1 + Math.max(h(left.data[x]), h(right.data[x])));
      const rotR = (y: number) => {
        const x = left.data[y];
        left.set(y, right.data[x]);
        right.set(x, y);
        upd(y);
        upd(x);
        return x;
      };
      const rotL = (x: number) => {
        const y = right.data[x];
        right.set(x, left.data[y]);
        left.set(y, x);
        upd(x);
        upd(y);
        return y;
      };
      const insert = (node: number, i: number): number => {
        if (node < 0) return i;
        if (ctx.cmpv(val.data[i], val.data[node], i, node) < 0) left.set(node, insert(left.data[node], i));
        else right.set(node, insert(right.data[node], i));
        upd(node);
        const bal = h(left.data[node]) - h(right.data[node]);
        if (bal > 1) {
          if (h(left.data[left.data[node]]) < h(right.data[left.data[node]])) left.set(node, rotL(left.data[node]));
          return rotR(node);
        }
        if (bal < -1) {
          if (h(right.data[right.data[node]]) < h(left.data[right.data[node]])) right.set(node, rotR(right.data[node]));
          return rotL(node);
        }
        return node;
      };
      let root = -1;
      for (let i = 0; i < n; i++) {
        val.set(i, ctx.get(i));
        left.set(i, -1);
        right.set(i, -1);
        height.set(i, 1);
        root = insert(root, i);
      }
      inorderWrite(ctx, root, left.data, right.data, val.data);
    },
  },
  {
    id: 'tree-rb',
    name: 'Red–Black Tree Sort',
    category: 'Tree',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 32768,
    notes: "Left-leaning red–black tree (Sedgewick 2008), the balanced BST behind many multiset implementations.",
    description:
      'Tree sort on a left-leaning red–black tree. Nodes are coloured red or black and three local fix-ups (rotate left, rotate right, colour flip) keep the tree height within 2·log₂ n.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const left = ctx.aux(n);
      const right = ctx.aux(n);
      const red = ctx.aux(n);
      const val = ctx.aux(n);
      const isRed = (x: number) => x >= 0 && red.data[x] === 1;
      const rotL = (h: number) => {
        const x = right.data[h];
        right.set(h, left.data[x]);
        left.set(x, h);
        red.set(x, red.data[h]);
        red.set(h, 1);
        return x;
      };
      const rotR = (h: number) => {
        const x = left.data[h];
        left.set(h, right.data[x]);
        right.set(x, h);
        red.set(x, red.data[h]);
        red.set(h, 1);
        return x;
      };
      const flip = (h: number) => {
        red.set(h, 1);
        red.set(left.data[h], 0);
        red.set(right.data[h], 0);
      };
      const insert = (h: number, i: number): number => {
        if (h < 0) return i;
        if (ctx.cmpv(val.data[i], val.data[h], i, h) < 0) left.set(h, insert(left.data[h], i));
        else right.set(h, insert(right.data[h], i));
        if (isRed(right.data[h]) && !isRed(left.data[h])) h = rotL(h);
        if (isRed(left.data[h]) && isRed(left.data[left.data[h]])) h = rotR(h);
        if (isRed(left.data[h]) && isRed(right.data[h])) flip(h);
        return h;
      };
      let root = -1;
      for (let i = 0; i < n; i++) {
        val.set(i, ctx.get(i));
        left.set(i, -1);
        right.set(i, -1);
        red.set(i, 1);
        root = insert(root, i);
        red.set(root, 0);
      }
      inorderWrite(ctx, root, left.data, right.data, val.data);
    },
  },
  {
    id: 'splay',
    name: 'Splaysort',
    category: 'Tree',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 32768,
    notes: 'Moffat, Eddy & Petersson (1996). Amortized bounds.',
    description:
      'Tree sort on a splay tree: every inserted node is rotated to the root. Recently touched regions stay near the top, which makes splaysort adaptive to presortedness.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const left = ctx.aux(n);
      const right = ctx.aux(n);
      const par = ctx.aux(n);
      const val = ctx.aux(n);
      let root = 0;
      const L = left.data;
      const R = right.data;
      const P = par.data;
      const rotate = (x: number) => {
        const p = P[x];
        const g = P[p];
        if (L[p] === x) {
          left.set(p, R[x]);
          if (R[x] >= 0) par.set(R[x], p);
          right.set(x, p);
        } else {
          right.set(p, L[x]);
          if (L[x] >= 0) par.set(L[x], p);
          left.set(x, p);
        }
        par.set(p, x);
        par.set(x, g);
        if (g >= 0) {
          if (L[g] === p) left.set(g, x);
          else right.set(g, x);
        } else root = x;
      };
      const splay = (x: number) => {
        while (P[x] >= 0) {
          const p = P[x];
          const g = P[p];
          if (g < 0) rotate(x);
          else if ((L[g] === p) === (L[p] === x)) {
            rotate(p);
            rotate(x);
          } else {
            rotate(x);
            rotate(x);
          }
        }
      };
      for (let i = 0; i < n; i++) {
        val.set(i, ctx.get(i));
        left.set(i, -1);
        right.set(i, -1);
        par.set(i, -1);
      }
      for (let i = 1; i < n; i++) {
        let cur = root;
        for (;;) {
          if (ctx.cmpv(val.data[i], val.data[cur], i, cur) < 0) {
            if (L[cur] < 0) {
              left.set(cur, i);
              break;
            }
            cur = L[cur];
          } else {
            if (R[cur] < 0) {
              right.set(cur, i);
              break;
            }
            cur = R[cur];
          }
        }
        par.set(i, cur);
        splay(i);
      }
      inorderWrite(ctx, root, L, R, val.data);
    },
  },
  {
    id: 'cartesian',
    name: 'Cartesian Tree Sort',
    category: 'Tree',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: false,
    inPlace: false,
    maxN: 32768,
    notes: 'Levcopoulos & Petersson (1989).',
    description:
      'Builds a min-Cartesian tree in linear time with a stack, then repeatedly extracts the smallest node from a priority queue that initially holds only the root and receives each extracted node’s children. Adaptive: fast when the input has few local minima.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const left = ctx.aux(n);
      const right = ctx.aux(n);
      const val = ctx.aux(n);
      const stack: number[] = [];
      for (let i = 0; i < n; i++) {
        val.set(i, ctx.get(i));
        left.set(i, -1);
        right.set(i, -1);
      }
      for (let i = 0; i < n; i++) {
        let last = -1;
        while (stack.length && ctx.cmpv(val.data[stack[stack.length - 1]], val.data[i], stack[stack.length - 1], i) > 0)
          last = stack.pop()!;
        if (stack.length) right.set(stack[stack.length - 1], i);
        left.set(i, last);
        stack.push(i);
      }
      // binary min-heap of node ids
      const heap = ctx.aux(n);
      let hs = 0;
      const less = (x: number, y: number) => ctx.cmpv(val.data[heap.data[x]], val.data[heap.data[y]], heap.data[x], heap.data[y]) < 0;
      const hswap = (x: number, y: number) => {
        const t = heap.data[x];
        heap.set(x, heap.data[y]);
        heap.set(y, t);
      };
      const push = (node: number) => {
        heap.set(hs, node);
        let c = hs++;
        while (c > 0 && less(c, (c - 1) >> 1)) {
          hswap(c, (c - 1) >> 1);
          c = (c - 1) >> 1;
        }
      };
      const pop = () => {
        const top = heap.data[0];
        hs--;
        if (hs > 0) {
          heap.set(0, heap.data[hs]);
          let p = 0;
          for (;;) {
            let c = 2 * p + 1;
            if (c >= hs) break;
            if (c + 1 < hs && less(c + 1, c)) c++;
            if (less(c, p)) {
              hswap(c, p);
              p = c;
            } else break;
          }
        }
        return top;
      };
      push(stack[0]);
      for (let k = 0; k < n; k++) {
        const x = pop();
        ctx.set(k, val.data[x]);
        if (left.data[x] >= 0) push(left.data[x]);
        if (right.data[x] >= 0) push(right.data[x]);
      }
    },
  },
];
