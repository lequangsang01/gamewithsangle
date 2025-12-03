import clientPromise from "@/lib/mongodb";

type Player = { name: string; color: "white" | "black" };

interface ChessRoom {
  roomId: string;
  players: Player[];
  moves: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DB_NAME = "gamewithsangle";
const COLLECTION = "chess_rooms";

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
      body.roomId ??
      Math.random().toString(36).slice(2, 8).toUpperCase().toString();

    const roomId = baseId.toUpperCase();
    const now = new Date();

    const existing = await col.findOne({ roomId });
    if (existing) {
      // nếu trùng, ta vẫn reset ván mới
      await col.updateOne(
        { roomId },
        {
          $set: {
            players: [
              { name: body.playerName, color: "white" as const },
            ],
            moves: [],
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
    } else {
      await col.insertOne({
        roomId,
        players: [{ name: body.playerName, color: "white" as const }],
        moves: [],
        createdAt: now,
        updatedAt: now,
      });
    }

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

    const players = Array.isArray((room as any).players)
      ? (room as any).players
      : [];

    const exists = players.find(
      (p: any) => p.name?.toLowerCase() === body.playerName.toLowerCase()
    );

    if (!exists) {
      let color: "white" | "black" = "white";
      if (players.length === 0) color = "white";
      else if (players.length === 1) {
        color = players[0].color === "white" ? "black" : "white";
      } else {
        color = "black";
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
    const { roomId, move } = body;
    const now = new Date();

    const room = await col.findOne({ roomId });
    if (!room) {
      return new Response(JSON.stringify({ error: "Room không tồn tại" }), {
        status: 404,
      });
    }

    await col.updateOne(
      { roomId },
      {
        $push: { moves: move },
        $set: { updatedAt: now },
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
    await col.deleteOne({ roomId });
    return new Response(JSON.stringify({ roomId, cleared: true }), {
      status: 200,
    });
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), {
    status: 400,
  });
}



