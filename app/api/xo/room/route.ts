import {
  getRoom,
  createRoom,
  joinRoom,
  updateRoom,
  type BaseGameRoom,
  type Player,
} from "@/lib/game-room";

type XOPlayer = Player & { symbol: "X" | "O" };

interface XORoom extends BaseGameRoom {
  players: XOPlayer[];
  board: (string | null)[][]; // 3x3 board, null or "X" or "O"
  turn: "X" | "O";
  roundIndex: number;
  winner?: "X" | "O" | "draw" | null;
  lastMoveBy?: string;
}

const GAME_TYPE = "xo";
const INITIAL_BOARD: (string | null)[][] = [
  [null, null, null],
  [null, null, null],
  [null, null, null],
];
const MAX_PLAYERS = 2;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");

  if (!roomId) {
    return new Response(JSON.stringify({ error: "roomId is required" }), {
      status: 400,
    });
  }

  try {
    const room = await getRoom<XORoom>(GAME_TYPE, roomId);
    return new Response(JSON.stringify({ room }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

type PostBody =
  | {
      action: "create";
      playerName: string;
      roomId?: string;
      avatar?: string;
    }
  | {
      action: "join";
      playerName: string;
      roomId: string;
      avatar?: string;
    }
  | {
      action: "move";
      roomId: string;
      row: number;
      col: number;
      playerName: string;
    }
  | {
      action: "finish";
      roomId: string;
    };

function checkWinner(board: (string | null)[][]): "X" | "O" | "draw" | null {
  // Check rows
  for (let i = 0; i < 3; i++) {
    if (board[i][0] && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
      return board[i][0] as "X" | "O";
    }
  }

  // Check columns
  for (let i = 0; i < 3; i++) {
    if (board[0][i] && board[0][i] === board[1][i] && board[1][i] === board[2][i]) {
      return board[0][i] as "X" | "O";
    }
  }

  // Check diagonals
  if (board[0][0] && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
    return board[0][0] as "X" | "O";
  }
  if (board[0][2] && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
    return board[0][2] as "X" | "O";
  }

  // Check for draw
  const isFull = board.every((row) => row.every((cell) => cell !== null));
  if (isFull) return "draw";

  return null;
}

export async function POST(req: Request) {
  const body = (await req.json()) as PostBody;

  if (body.action === "create") {
    try {
      const baseId =
        body.roomId ?? Math.random().toString(36).slice(2, 8).toUpperCase();
      const roomId = baseId.toUpperCase();

      const existing = await getRoom<XORoom>(GAME_TYPE, roomId);
      const roundIndex = existing?.roundIndex ?? 0;
      const firstSymbol = roundIndex % 2 === 0 ? "X" : "O";

      const room = await createRoom<XORoom>({
        gameType: GAME_TYPE,
        roomId,
        playerName: body.playerName,
        playerData: { symbol: firstSymbol, avatar: body.avatar },
        maxPlayers: MAX_PLAYERS,
        initialRoomData: {
          board: INITIAL_BOARD.map((row) => [...row]),
          turn: "X",
          roundIndex,
        },
      });

      return new Response(JSON.stringify({ roomId, room }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (body.action === "join") {
    try {
      const roomId = body.roomId.toUpperCase();

      const existingRoom = await getRoom<XORoom>(GAME_TYPE, roomId);
      if (!existingRoom) {
        return new Response(JSON.stringify({ error: "Room không tồn tại" }), {
          status: 404,
        });
      }

      // Check max players before joining
      const currentPlayers = existingRoom.players ?? [];
      if (currentPlayers.length >= MAX_PLAYERS) {
        return new Response(
          JSON.stringify({
            error: `Phòng đã đầy (tối đa ${MAX_PLAYERS} người chơi)`,
          }),
          { status: 403 }
        );
      }

      // Assign symbol: if 1 player exists, assign opposite symbol
      const assignSymbol = (players: Player[]): string | undefined => {
        if (players.length === 0) {
          return existingRoom.roundIndex % 2 === 0 ? "X" : "O";
        } else if (players.length === 1) {
          const firstPlayer = players[0] as XOPlayer;
          return firstPlayer.symbol === "X" ? "O" : "X";
        }
        return undefined;
      };

      const symbol = assignSymbol(currentPlayers);
      const room = await joinRoom<XORoom>({
        gameType: GAME_TYPE,
        roomId,
        playerName: body.playerName,
        playerData: { symbol: symbol as "X" | "O", avatar: body.avatar },
      });

      return new Response(JSON.stringify({ roomId, room }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.message.includes("đầy") ? 403 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (body.action === "move") {
    try {
      const { roomId, row, col, playerName } = body;

      const room = await getRoom<XORoom>(GAME_TYPE, roomId);
      if (!room) {
        return new Response(JSON.stringify({ error: "Room không tồn tại" }), {
          status: 404,
        });
      }

      // Validate move
      if (row < 0 || row >= 3 || col < 0 || col >= 3) {
        return new Response(JSON.stringify({ error: "Nước đi không hợp lệ" }), {
          status: 400,
        });
      }

      const board = room.board ?? INITIAL_BOARD.map((r) => [...r]);
      if (board[row][col] !== null) {
        return new Response(JSON.stringify({ error: "Ô này đã được đánh" }), {
          status: 400,
        });
      }

      // Find player
      const player = room.players.find((p) => normalize(p.name) === normalize(playerName));
      if (!player) {
        return new Response(JSON.stringify({ error: "Người chơi không tồn tại" }), {
          status: 400,
        });
      }

      const xoPlayer = player as XOPlayer;
      if (room.turn !== xoPlayer.symbol) {
        return new Response(JSON.stringify({ error: "Chưa tới lượt của bạn" }), {
          status: 400,
        });
      }

      // Make move
      board[row][col] = xoPlayer.symbol;
      const winner = checkWinner(board);
      const nextTurn = room.turn === "X" ? "O" : "X";

      const updatedRoom = await updateRoom<XORoom>(GAME_TYPE, roomId, {
        board,
        turn: winner ? room.turn : nextTurn,
        winner: winner ?? undefined,
        lastMoveBy: playerName,
      } as Partial<XORoom>);

      return new Response(JSON.stringify({ roomId, room: updatedRoom }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (body.action === "finish") {
    try {
      const { roomId } = body;

      const room = await getRoom<XORoom>(GAME_TYPE, roomId);
      if (!room) {
        return new Response(JSON.stringify({ error: "Room không tồn tại" }), {
          status: 404,
        });
      }

      const nextRound = (room.roundIndex ?? 0) + 1;
      const swappedPlayers: XOPlayer[] = (room.players ?? []).map((p) => {
        const nextSymbol: "X" | "O" = p.symbol === "X" ? "O" : "X";
        return { ...p, symbol: nextSymbol };
      });

      const updatedRoom = await updateRoom<XORoom>(GAME_TYPE, roomId, {
        board: INITIAL_BOARD.map((row) => [...row]),
        turn: "X",
        roundIndex: nextRound,
        players: swappedPlayers,
        winner: undefined,
        lastMoveBy: undefined,
      } as Partial<XORoom>);

      return new Response(JSON.stringify({ roomId, room: updatedRoom }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), {
    status: 400,
  });
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

