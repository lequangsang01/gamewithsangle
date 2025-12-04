import clientPromise from "@/lib/mongodb";

type Player = { name: string; color: "white" | "black"; avatar?: string };

interface ChessRoom {
  roomId: string;
  players: Player[];
  updatedAt: Date;
}

const DB_NAME = "gamewithsangle";
const COLLECTION = "chess_rooms";

export async function GET() {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const col = db.collection<ChessRoom>(COLLECTION);

  // Chỉ lấy các phòng còn "online": có ít nhất 1 người chơi
  // và được cập nhật trong vòng N phút gần đây (proxy cho còn người đang online).
  // Ở đây tạm chọn 5 phút, bạn có thể chỉnh nếu muốn.
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const rooms = await col
    .find({
      players: { $exists: true, $not: { $size: 0 } },
      updatedAt: { $gte: fiveMinutesAgo },
    })
    .sort({ updatedAt: -1 })
    .limit(50)
    .project<Pick<ChessRoom, "roomId" | "players" | "updatedAt">>({
      roomId: 1,
      players: 1,
      updatedAt: 1,
    })
    .toArray();

  // Chuyển Date -> string để dễ render phía client
  const safeRooms = rooms.map((r) => ({
    roomId: r.roomId,
    players: r.players ?? [],
    updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
  }));

  return new Response(JSON.stringify({ rooms: safeRooms }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}


