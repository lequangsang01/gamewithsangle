import clientPromise from "@/lib/mongodb";
import { Filter } from "mongodb";

export type Player = {
  name: string;
  color?: string;
  avatar?: string;
  [key: string]: unknown;
};

export interface BaseGameRoom {
  roomId: string;
  gameType: string;
  players: Player[];
  maxPlayers: number;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

const DB_NAME = "gamewithsangle";
const normalize = (value: string) => value.trim().toLowerCase();

export async function getRoom<T extends BaseGameRoom>(
  gameType: string,
  roomId: string
): Promise<T | null> {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const col = db.collection<T>(`${gameType}_rooms`);
  const result = await col.findOne({ roomId } as Filter<T>);
  return result as T | null;
}

export async function createRoom<T extends BaseGameRoom>(params: {
  gameType: string;
  roomId: string;
  playerName: string;
  playerData?: Partial<Player>;
  initialRoomData?: Partial<T>;
  maxPlayers?: number;
}): Promise<T> {
  const {
    gameType,
    roomId,
    playerName,
    playerData = {},
    initialRoomData = {},
    maxPlayers = 2,
  } = params;

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const col = db.collection<T>(`${gameType}_rooms`);
  const now = new Date();

  const existing = await col.findOne({ roomId } as Filter<T>);
  const player: Player = {
    name: playerName,
    ...playerData,
  };

  const newRoom: T = {
    roomId,
    gameType,
    players: [player],
    maxPlayers,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...initialRoomData,
  } as T;

  await col.updateOne(
    { roomId } as Filter<T>,
    { $set: newRoom } as any,
    { upsert: true }
  );

  const room = await col.findOne({ roomId } as Filter<T>);
  if (!room) throw new Error("Failed to create room");
  return room as T;
}

export async function joinRoom<T extends BaseGameRoom>(params: {
  gameType: string;
  roomId: string;
  playerName: string;
  playerData?: Partial<Player>;
  assignColor?: (existingPlayers: Player[]) => string | undefined;
}): Promise<T> {
  const {
    gameType,
    roomId,
    playerName,
    playerData = {},
    assignColor,
  } = params;

  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const col = db.collection<T>(`${gameType}_rooms`);
  const now = new Date();

  const room = await col.findOne({ roomId } as Filter<T>);
  if (!room) {
    throw new Error("Room không tồn tại");
  }

  // Check max players
  const currentPlayers = Array.isArray(room.players) ? [...room.players] : [];
  const maxPlayers = typeof room.maxPlayers === "number" ? room.maxPlayers : 2;
  if (currentPlayers.length >= maxPlayers) {
    throw new Error(
      `Phòng đã đầy (tối đa ${maxPlayers} người chơi)`
    );
  }

  // Check if player already exists
  const exists = currentPlayers.find(
    (p) => normalize(p.name) === normalize(playerName)
  );

  if (!exists) {
    let color: string | undefined;
    if (assignColor) {
      color = assignColor(currentPlayers);
    }

    currentPlayers.push({
      name: playerName,
      ...(color && { color }),
      ...playerData,
    });

    await col.updateOne(
      { roomId } as Filter<T>,
      { $set: { players: currentPlayers, updatedAt: now } } as any
    );
  }

  const updatedRoom = await col.findOne({ roomId } as Filter<T>);
  if (!updatedRoom) {
    throw new Error("Failed to update room");
  }
  return updatedRoom as T;
}

export async function updateRoom<T extends BaseGameRoom>(
  gameType: string,
  roomId: string,
  updates: Partial<T>
): Promise<T> {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const col = db.collection<T>(`${gameType}_rooms`);
  const now = new Date();

  await col.updateOne(
    { roomId } as Filter<T>,
    { $set: { ...updates, updatedAt: now } } as any
  );

  const room = await col.findOne({ roomId } as Filter<T>);
  if (!room) {
    throw new Error("Room không tồn tại");
  }
  return room as T;
}

