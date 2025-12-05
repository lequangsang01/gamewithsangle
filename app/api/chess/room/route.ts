import {
  getRoom,
  createRoom,
  joinRoom,
  updateRoom,
  type BaseGameRoom,
  type Player,
} from "@/lib/game-room";

type ChessPlayer = Player & { color: "white" | "black" };

interface ChessRoom extends BaseGameRoom {
  players: ChessPlayer[];
  moves: string[];
  fen: string;
  turn: "white" | "black";
  roundIndex: number;
  lastMoveBy?: string;
}

const GAME_TYPE = "chess";
const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
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
    const room = await getRoom<ChessRoom>(GAME_TYPE, roomId);
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
      move: string;
      fen: string;
      turn: "white" | "black";
      playerName: string;
    }
  | {
      action: "finish";
      roomId: string;
    };

export async function POST(req: Request) {
  const body = (await req.json()) as PostBody;

  if (body.action === "create") {
    try {
      const baseId =
        body.roomId ?? Math.random().toString(36).slice(2, 8).toUpperCase();
      const roomId = baseId.toUpperCase();

      const existing = await getRoom<ChessRoom>(GAME_TYPE, roomId);
      const roundIndex = existing?.roundIndex ?? 0;
      const firstColor = roundIndex % 2 === 0 ? "white" : "black";

      const room = await createRoom<ChessRoom>({
        gameType: GAME_TYPE,
        roomId,
        playerName: body.playerName,
        playerData: { color: firstColor, avatar: body.avatar },
        maxPlayers: MAX_PLAYERS,
        initialRoomData: {
          moves: [],
          fen: INITIAL_FEN,
          turn: "white",
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

      const existingRoom = await getRoom<ChessRoom>(GAME_TYPE, roomId);
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

      // Assign color: if 1 player exists, assign opposite color
      const assignColor = (players: Player[]): string | undefined => {
        if (players.length === 0) {
          return existingRoom.roundIndex % 2 === 0 ? "white" : "black";
        } else if (players.length === 1) {
          const firstPlayer = players[0] as ChessPlayer;
          // Kiểm tra rõ ràng màu của người chơi đầu tiên
          if (firstPlayer.color === "white") {
            return "black";
          } else if (firstPlayer.color === "black") {
            return "white";
          }
          // Nếu người đầu tiên chưa có màu, gán dựa trên roundIndex
          return existingRoom.roundIndex % 2 === 0 ? "black" : "white";
        }
        return undefined;
      };

      const room = await joinRoom<ChessRoom>({
        gameType: GAME_TYPE,
        roomId,
        playerName: body.playerName,
        playerData: { avatar: body.avatar },
        assignColor,
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
      const { roomId, move, fen, turn, playerName } = body;

      const room = await getRoom<ChessRoom>(GAME_TYPE, roomId);
      if (!room) {
        return new Response(JSON.stringify({ error: "Room không tồn tại" }), {
          status: 404,
        });
      }

      const updatedRoom = await updateRoom<ChessRoom>(GAME_TYPE, roomId, {
        moves: [...(room.moves ?? []), move],
        fen,
        turn,
        lastMoveBy: playerName,
      } as Partial<ChessRoom>);

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

      const room = await getRoom<ChessRoom>(GAME_TYPE, roomId);
      if (!room) {
        return new Response(JSON.stringify({ error: "Room không tồn tại" }), {
          status: 404,
        });
      }

      const nextRound = (room.roundIndex ?? 0) + 1;
      const swappedPlayers: ChessPlayer[] = (room.players ?? []).map((p) => {
        const nextColor: "white" | "black" =
          p.color === "white" ? "black" : "white";
        return { ...p, color: nextColor };
      });

      const updatedRoom = await updateRoom<ChessRoom>(GAME_TYPE, roomId, {
        moves: [],
        fen: INITIAL_FEN,
        turn: "white",
        roundIndex: nextRound,
        players: swappedPlayers,
        lastMoveBy: undefined,
      } as Partial<ChessRoom>);

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



