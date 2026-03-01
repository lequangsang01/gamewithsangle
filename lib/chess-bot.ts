import { Chess, Move } from "chess.js";

const pieceValues: Record<string, number> = {
    p: 10,
    n: 30,
    b: 30,
    r: 50,
    q: 90,
    k: 900,
};

// Evaluate the board
function evaluateBoard(game: Chess): number {
    let totalEvaluation = 0;
    const board = game.board();
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const piece = board[i][j];
            if (piece) {
                const val = pieceValues[piece.type] || 0;
                totalEvaluation += piece.color === "w" ? val : -val;
            }
        }
    }
    return totalEvaluation;
}

function minimax(
    game: Chess,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizingPlayer: boolean
): number {
    if (depth === 0 || game.isGameOver()) {
        return evaluateBoard(game);
    }

    const moves = game.moves({ verbose: true });

    if (isMaximizingPlayer) {
        let bestVal = -Infinity;
        for (const move of moves) {
            game.move(move);
            bestVal = Math.max(
                bestVal,
                minimax(game, depth - 1, alpha, beta, !isMaximizingPlayer)
            );
            game.undo();
            alpha = Math.max(alpha, bestVal);
            if (beta <= alpha) break;
        }
        return bestVal;
    } else {
        let bestVal = Infinity;
        for (const move of moves) {
            game.move(move);
            bestVal = Math.min(
                bestVal,
                minimax(game, depth - 1, alpha, beta, !isMaximizingPlayer)
            );
            game.undo();
            beta = Math.min(beta, bestVal);
            if (beta <= alpha) break;
        }
        return bestVal;
    }
}

export function getBotMove(game: Chess): Move | null {
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return null;

    let bestMove: Move | null = null;
    const isMaximizingPlayer = game.turn() === "w";
    let bestVal = isMaximizingPlayer ? -Infinity : Infinity;

    // Ưu tiên các nước đi ăn quân trước để alpha-beta pruning hiệu quả hơn
    moves.sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));

    for (const move of moves) {
        game.move(move);
        // Depth 3: Cân bằng tốt nhất giữa tốc độ và độ thông minh trên JavaScript thuần
        const boardVal = minimax(game, 2, -Infinity, Infinity, !isMaximizingPlayer);
        game.undo();

        if (isMaximizingPlayer) {
            if (boardVal > bestVal) {
                bestVal = boardVal;
                bestMove = move;
            }
        } else {
            if (boardVal < bestVal) {
                bestVal = boardVal;
                bestMove = move;
            }
        }
    }

    // Fallback nếu không tính được (rất hiếm khi xảy ra)
    if (!bestMove) {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    return bestMove;
}
