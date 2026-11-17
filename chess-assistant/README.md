# BroGPT Chess

A desktop chess assistant that runs entirely in the browser: play against Stockfish, analyse any position, and get a full game review with accuracy scores, move classifications and plain-English coaching.

Built with React 19, TypeScript, Vite, Tailwind CSS 4, [chess.js](https://github.com/jhlywa/chess.js) (rules), [chessground](https://github.com/lichess-org/chessground) (lichess's board) and [Stockfish 17.1](https://github.com/nmrugg/stockfish.js) compiled to WebAssembly, running in a Web Worker. Nothing is sent to a server.

## Run it

```bash
cd chess-assistant
npm install
npm run dev        # copies the engine into public/engine, then starts Vite
npm test           # unit tests
npm run build      # static site in dist/
```

The build is fully static with relative paths, so `dist/` can be hosted anywhere. The engine is the single-threaded "lite" build (~7 MB), so no special `Cross-Origin-*` headers are needed.

## Features

### Play
- Play White, Black or a random side against Stockfish at 8 levels (Beginner → Maximum), set with Stockfish's *Skill Level* plus a thinking-time budget.
- Hints (yellow arrow + the suggested move), take back, resign, captured pieces and material count, opening name.
- Checkmate, stalemate, threefold repetition, fifty-move rule and insufficient material end the game. From the result screen go straight to **Review game**.

### Analyze
- Live engine analysis with 1–5 lines (MultiPV), streaming depth, eval bar and arrows for the top three moves. Click a line to play its first move.
- Free play on the board for both sides with legal-move highlights and a promotion picker; navigate with ← → Home End, flip with F.
- Paste PGN or FEN to load; copy FEN or PGN out. Opening names from a built-in book of ~100 named lines (ECO codes).

### Review
- Paste a PGN (or come from Play/Analyze) and Stockfish evaluates every position at depth 10–18.
- Each move is classified **Book / Best / Excellent / Good / Inaccuracy / Mistake / Blunder / Forced**, using the drop in the mover's win probability (lichess's logistic model; 5 / 10 / 15 win-% thresholds) plus lichess's *mate created* / *mate lost* rules.
- Per-side **accuracy** from the lichess per-move accuracy formula, averaged (arithmetic + harmonic mean).
- Clickable win-probability graph with mistakes marked, "next mistake" jumping, a coach panel and board arrows showing the better move.
- The **coach** explains moves from the engine's own lines and the position: missed mates, walking into mate, which reply wins material and how much, undefended pieces, what the better move achieves.

#### How the review avoids engine blind spots
Shallow searches can miss sacrificial refutations (in Morphy's Opera Game, a fresh depth-14 search thinks 15…Nxd7 is fine and misses 16.Qb8+! Nxb8 17.Rd8#). The review therefore analyses the game **from the last position backwards**, so later refutations are already in the engine's hash table, and then runs a **consistency pass**: whenever the engine's own best move loses a lot, or a played move gains a lot, that position is searched again 6 plies deeper.

## Tests

`npm test` covers UCI parsing (scores, mates, bounds, MultiPV, POV conversion), win%/accuracy/classification including the mate rules, the opening book (every line is legal and SAN round-trips), SAN/PGN/FEN helpers, promotion, draw detection, and the coach (checkmate, missed mate, hanging queen, material swings). The UI was also exercised end to end in Chromium: playing as both colours, hints, take-back, promotion, analysis, and reviewing the Opera Game.

## Licence

GPL-3.0-or-later, because it bundles Stockfish (GPL-3.0) and chessground (GPL-3.0-or-later). Piece set: cburnett (via chessground).
