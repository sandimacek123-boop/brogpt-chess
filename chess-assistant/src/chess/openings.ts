/** A compact opening book: ECO code, name, and the main-line moves in SAN. */
export interface Opening {
  eco: string;
  name: string;
  moves: string[];
}

const RAW: [string, string, string][] = [
  ['B00', "King's Pawn Opening", 'e4'],
  ['A40', "Queen's Pawn Opening", 'd4'],
  ['A10', 'English Opening', 'c4'],
  ['A04', 'Réti Opening', 'Nf3'],
  ['A00', 'Polish Opening', 'b4'],
  ['A01', "Nimzo-Larsen Attack", 'b3'],
  ['A02', "Bird's Opening", 'f4'],
  ['A00', 'Grob Opening', 'g4'],
  ['C20', "King's Pawn Game", 'e4 e5'],
  ['C40', "King's Knight Opening", 'e4 e5 Nf3'],
  ['C44', "King's Knight Opening: Normal Variation", 'e4 e5 Nf3 Nc6'],
  ['C50', 'Italian Game', 'e4 e5 Nf3 Nc6 Bc4'],
  ['C50', 'Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['C53', 'Italian Game: Giuoco Piano, Main Line', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3'],
  ['C51', 'Italian Game: Evans Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4'],
  ['C55', 'Italian Game: Two Knights Defense', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['C57', 'Italian Game: Two Knights Defense, Fried Liver Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
  ['C57', 'Italian Game: Two Knights Defense, Traxler Counterattack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5'],
  ['C50', 'Italian Game: Hungarian Defense', 'e4 e5 Nf3 Nc6 Bc4 Be7'],
  ['C60', 'Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5'],
  ['C65', 'Ruy Lopez: Berlin Defense', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
  ['C68', 'Ruy Lopez: Exchange Variation', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'],
  ['C70', 'Ruy Lopez: Morphy Defense', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4'],
  ['C78', 'Ruy Lopez: Morphy Defense, Main Line', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O'],
  ['C84', 'Ruy Lopez: Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7'],
  ['C89', 'Ruy Lopez: Marshall Attack', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5'],
  ['C45', 'Scotch Game', 'e4 e5 Nf3 Nc6 d4'],
  ['C45', 'Scotch Game: Main Line', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4'],
  ['C44', 'Scotch Gambit', 'e4 e5 Nf3 Nc6 d4 exd4 Bc4'],
  ['C46', 'Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
  ['C47', 'Four Knights Game: Scotch Variation', 'e4 e5 Nf3 Nc6 Nc3 Nf6 d4'],
  ['C42', 'Petrov Defense', 'e4 e5 Nf3 Nf6'],
  ['C41', 'Philidor Defense', 'e4 e5 Nf3 d6'],
  ['C40', 'Latvian Gambit', 'e4 e5 Nf3 f5'],
  ['C30', "King's Gambit", 'e4 e5 f4'],
  ['C33', "King's Gambit Accepted", 'e4 e5 f4 exf4'],
  ['C30', "King's Gambit Declined", 'e4 e5 f4 Bc5'],
  ['C25', 'Vienna Game', 'e4 e5 Nc3'],
  ['C23', "Bishop's Opening", 'e4 e5 Bc4'],
  ['C21', 'Center Game', 'e4 e5 d4 exd4 Qxd4'],
  ['C21', 'Danish Gambit', 'e4 e5 d4 exd4 c3'],
  ['B20', 'Sicilian Defense', 'e4 c5'],
  ['B27', 'Sicilian Defense: Hyperaccelerated Fianchetto', 'e4 c5 Nf3 g6'],
  ['B50', 'Sicilian Defense: Modern Variations', 'e4 c5 Nf3 d6'],
  ['B90', 'Sicilian Defense: Najdorf Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
  ['B70', 'Sicilian Defense: Dragon Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
  ['B56', 'Sicilian Defense: Classical Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6'],
  ['B80', 'Sicilian Defense: Scheveningen Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6'],
  ['B30', 'Sicilian Defense: Old Sicilian', 'e4 c5 Nf3 Nc6'],
  ['B33', 'Sicilian Defense: Sveshnikov Variation', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5'],
  ['B40', 'Sicilian Defense: French Variation', 'e4 c5 Nf3 e6'],
  ['B23', 'Sicilian Defense: Closed', 'e4 c5 Nc3'],
  ['B22', 'Sicilian Defense: Alapin Variation', 'e4 c5 c3'],
  ['B21', 'Sicilian Defense: Smith-Morra Gambit', 'e4 c5 d4 cxd4 c3'],
  ['C00', 'French Defense', 'e4 e6'],
  ['C01', 'French Defense: Exchange Variation', 'e4 e6 d4 d5 exd5'],
  ['C02', 'French Defense: Advance Variation', 'e4 e6 d4 d5 e5'],
  ['C03', 'French Defense: Tarrasch Variation', 'e4 e6 d4 d5 Nd2'],
  ['C10', 'French Defense: Paulsen Variation', 'e4 e6 d4 d5 Nc3'],
  ['C15', 'French Defense: Winawer Variation', 'e4 e6 d4 d5 Nc3 Bb4'],
  ['C11', 'French Defense: Classical Variation', 'e4 e6 d4 d5 Nc3 Nf6'],
  ['B10', 'Caro-Kann Defense', 'e4 c6'],
  ['B12', 'Caro-Kann Defense: Advance Variation', 'e4 c6 d4 d5 e5'],
  ['B13', 'Caro-Kann Defense: Exchange Variation', 'e4 c6 d4 d5 exd5 cxd5'],
  ['B18', 'Caro-Kann Defense: Classical Variation', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
  ['B01', 'Scandinavian Defense', 'e4 d5'],
  ['B01', 'Scandinavian Defense: Main Line', 'e4 d5 exd5 Qxd5 Nc3 Qa5'],
  ['B01', 'Scandinavian Defense: Modern Variation', 'e4 d5 exd5 Nf6'],
  ['B07', 'Pirc Defense', 'e4 d6 d4 Nf6 Nc3 g6'],
  ['B06', 'Modern Defense', 'e4 g6'],
  ['B02', "Alekhine's Defense", 'e4 Nf6'],
  ['B00', "Owen's Defense", 'e4 b6'],
  ['B00', 'Nimzowitsch Defense', 'e4 Nc6'],
  ['D00', "Queen's Pawn Game", 'd4 d5'],
  ['D02', 'London System', 'd4 d5 Nf3 Nf6 Bf4'],
  ['A48', 'London System', 'd4 Nf6 Nf3 g6 Bf4'],
  ['D00', 'London System', 'd4 d5 Bf4'],
  ['D06', "Queen's Gambit", 'd4 d5 c4'],
  ['D20', "Queen's Gambit Accepted", 'd4 d5 c4 dxc4'],
  ['D30', "Queen's Gambit Declined", 'd4 d5 c4 e6'],
  ['D35', "Queen's Gambit Declined: Exchange Variation", 'd4 d5 c4 e6 Nc3 Nf6 cxd5'],
  ['D10', 'Slav Defense', 'd4 d5 c4 c6'],
  ['D43', 'Semi-Slav Defense', 'd4 d5 c4 c6 Nc3 Nf6 Nf3 e6'],
  ['D08', 'Albin Countergambit', 'd4 d5 c4 e5'],
  ['D07', 'Chigorin Defense', 'd4 d5 c4 Nc6'],
  ['A45', 'Indian Defense', 'd4 Nf6'],
  ['E00', "Indian Defense: Catalan setup", 'd4 Nf6 c4 e6 g3'],
  ['E20', 'Nimzo-Indian Defense', 'd4 Nf6 c4 e6 Nc3 Bb4'],
  ['E12', "Queen's Indian Defense", 'd4 Nf6 c4 e6 Nf3 b6'],
  ['E11', 'Bogo-Indian Defense', 'd4 Nf6 c4 e6 Nf3 Bb4+'],
  ['E60', "King's Indian Defense", 'd4 Nf6 c4 g6'],
  ['E90', "King's Indian Defense: Normal Variation", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3'],
  ['D80', 'Grünfeld Defense', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['A56', 'Benoni Defense', 'd4 Nf6 c4 c5'],
  ['A57', 'Benko Gambit', 'd4 Nf6 c4 c5 d5 b5'],
  ['E10', 'Blumenfeld Countergambit', 'd4 Nf6 c4 e6 Nf3 c5 d5 b5'],
  ['A45', 'Trompowsky Attack', 'd4 Nf6 Bg5'],
  ['A80', 'Dutch Defense', 'd4 f5'],
  ['A40', 'Englund Gambit', 'd4 e5'],
  ['A20', 'English Opening: Reversed Sicilian', 'c4 e5'],
  ['A30', 'English Opening: Symmetrical Variation', 'c4 c5'],
  ['A15', 'English Opening: Anglo-Indian Defense', 'c4 Nf6'],
  ['A07', "King's Indian Attack", 'Nf3 d5 g3'],
];

export const OPENINGS: Opening[] = RAW.map(([eco, name, moves]) => ({ eco, name, moves: moves.split(' ') }));

/** Most specific opening whose moves are a prefix of the game's SAN history. */
export function findOpening(history: string[]): Opening | null {
  let best: Opening | null = null;
  for (const o of OPENINGS) {
    if (o.moves.length > history.length) continue;
    if (o.moves.every((m, i) => history[i] === m) && (!best || o.moves.length > best.moves.length)) best = o;
  }
  return best;
}

/** True if the first `ply` moves of `history` follow a known book line. */
export function isBookPly(history: string[], ply: number): boolean {
  const prefix = history.slice(0, ply);
  return OPENINGS.some((o) => o.moves.length >= prefix.length && prefix.every((m, i) => o.moves[i] === m));
}
