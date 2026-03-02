export type Color = "white" | "black";
export type PieceType = "p" | "r" | "n" | "b" | "q" | "k";

export type Piece = {
  id: string;
  type: PieceType;
  color: Color;
};

export type BoardState = (Piece | null)[][];

export const BOARD_SIZE = 8;
export const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function pieceToSymbol(piece: Piece | null) {
  if (!piece) return "";
  const symbols: Record<PieceType, string> = {
    p: "♟",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "♛",
    k: "♚",
  };
  return piece.color === "white" ? symbols[piece.type].toUpperCase() : symbols[piece.type];
}

export function coordsToSquare(row: number, col: number) {
  const file = files[col];
  const rank = BOARD_SIZE - row;
  return `${file}${rank}`;
}

export function convertBoard(boardData: ReturnType<import("chess.js").Chess["board"]>): BoardState {
  return boardData.map((row, rIdx) =>
    row.map((sq, cIdx) => {
      if (!sq) return null;
      return {
        id: `${sq.type}-${sq.color}-${rIdx}-${cIdx}`,
        type: sq.type as PieceType,
        color: sq.color === "w" ? "white" : "black",
      };
    })
  );
}

export function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const AVATARS = ["🐱", "🐶", "🐼", "🐯", "🐵", "🐸", "🐧", "🐰", "🐻", "🦊"];

export const normalize = (value: string) => value.trim().toLowerCase();

