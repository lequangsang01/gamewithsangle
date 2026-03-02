import { Chess } from "chess.js";

export function describeGame(
  chess: Chess,
  t: (key: string, values?: Record<string, string>) => string
): string {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) {
      const winnerColor = chess.turn() === "w" ? t("chess.black") : t("chess.white");
      return t("chess.status.checkmate", { winner: winnerColor });
    }
    if (chess.isDraw()) return t("chess.status.draw");
  }
  if (chess.inCheck()) {
    const color = chess.turn() === "w" ? t("chess.white") : t("chess.black");
    return t("chess.status.inCheck", { color });
  }
  return chess.turn() === "w" ? t("chess.status.whiteTurn") : t("chess.status.blackTurn");
}

