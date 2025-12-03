import clientPromise from "@/lib/mongodb";

type Player = { name: string; color: "white" | "black" };

interface ChessRoom {
  roomId: string;
  players: Player[];
  moves: string[];
  fen: string;
  turn: "white" | "black";
  roundIndex: number;
  lastMoveBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DB_NAME = "gamewithsangle";
const COLLECTION = "chess_rooms";
const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const normalize = (value: string) => value.trim().toLowerCase();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");

  if (!roomId) {
    return new Response(JSON.stringify({ error: "roomId is required" }), {
      status: 400,
    });
  }

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const col = db.collection<ChessRoom>(COLLECTION);

  const room = await col.findOne({ roomId });

  return new Response(JSON.stringify({ room }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

type PostBody =
  | {
      action: "create";
      playerName: string;
      roomId?: string;
    }
  | {
      action: "join";
      playerName: string;
      roomId: string;
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

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const col = db.collection<ChessRoom>(COLLECTION);

  if (body.action === "create") {
    const baseId =
      body.roomId ?? Math.random().toString(36).slice(2, 8).toUpperCase();
    const roomId = baseId.toUpperCase();
    const now = new Date();

    const existing = await col.findOne({ roomId });
    const roundIndex = existing?.roundIndex ?? 0;
    const firstColor = roundIndex % 2 === 0 ? "white" : "black";

    const nextDoc: ChessRoom = {
      roomId,
      players: [{ name: body.playerName, color: firstColor }],
      moves: [],
      fen: INITIAL_FEN,
      turn: "white",
      roundIndex,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await col.updateOne(
      { roomId },
      { $set: nextDoc },
      { upsert: true }
    );

    const room = await col.findOne({ roomId });

    return new Response(JSON.stringify({ roomId, room }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (body.action === "join") {
    const roomId = body.roomId.toUpperCase();
    const now = new Date();

    const room = await col.findOne({ roomId });
    if (!room) {
      return new Response(JSON.stringify({ error: "Room không tồn tại" }), {
        status: 404,
      });
    }

    const players = Array.isArray(room.players) ? [...room.players] : [];
    const exists = players.find(
      (p) => normalize(p.name) === normalize(body.playerName)
    );

    if (!exists) {
      let color: "white" | "black" = "white";
      if (players.length === 0) {
        color = room.roundIndex % 2 === 0 ? "white" : "black";
      } else if (players.length === 1) {
        color = players[0].color === "white" ? "black" : "white";
      } else {
        color = players.length % 2 === 0 ? "white" : "black";
      }

      players.push({ name: body.playerName, color });

      await col.updateOne(
        { roomId },
        { $set: { players, updatedAt: now } }
      );
    }

    const updatedRoom = await col.findOne({ roomId });

    return new Response(JSON.stringify({ roomId, room: updatedRoom }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (body.action === "move") {
    const { roomId, move, fen, turn, playerName } = body;
    const now = new Date();

    const room = await col.findOne({ roomId });
    if (!room) {
      return new Response(JSON.stringify({ error: "Room không tồn tại" }), {
        status: 404,
      });
    }

    if (!room.players || room.players.length < 2) {
      return new Response(
        JSON.stringify({ error: "Cần có đủ 2 người trong phòng trước khi bắt đầu chơi." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    await col.updateOne(
      { roomId },
      {
        $push: { moves: move },
        $set: {
          updatedAt: now,
          fen,
          turn,
          lastMoveBy: playerName,
        },
      }
    );

    const updatedRoom = await col.findOne({ roomId });

    return new Response(JSON.stringify({ roomId, room: updatedRoom }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (body.action === "finish") {
    const { roomId } = body;
    const now = new Date();
    const room = await col.findOne({ roomId });

    if (!room) {
      return new Response(JSON.stringify({ error: "Room không tồn tại" }), {
        status: 404,
      });
    }

    const nextRound = (room.roundIndex ?? 0) + 1;
    const swappedPlayers: Player[] = (room.players ?? []).map((p) => {
      const nextColor: Player["color"] =
        p.color === "white" ? "black" : "white";
      return { name: p.name, color: nextColor };
    });

    await col.updateOne(
      { roomId },
      {
        $set: {
          moves: [],
          fen: INITIAL_FEN,
          turn: "white",
          roundIndex: nextRound,
          players: swappedPlayers,
          updatedAt: now,
        },
        $unset: { lastMoveBy: "" },
      }
    );

    const updatedRoom = await col.findOne({ roomId });

    return new Response(JSON.stringify({ roomId, room: updatedRoom }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), {
    status: 400,
  });
}



