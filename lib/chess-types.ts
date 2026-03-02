import type { Color, Piece, BoardState } from "./chess-utils";

export type Player = { name: string; color: Color; avatar?: string };

export type RoomState = {
  roomId: string;
  players: Player[];
  moves?: string[];
  fen?: string;
  turn?: Color;
  roundIndex?: number;
  updatedAt?: string;
};

export type SocketPayload =
  | {
      type: "move";
      fen: string;
      move: { from: string; to: string };
      turn: Color;
      room?: RoomState | null;
      playerName: string;
      clientId?: string;
    }
  | {
      type: "room";
      room: RoomState | null;
      clientId?: string;
    }
  | {
      type: "reset";
      room: RoomState | null;
      clientId?: string;
    };

export type { Color, Piece, BoardState };

