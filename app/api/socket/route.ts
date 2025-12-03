export const runtime = "edge";

type EdgeWebSocket = WebSocket & { accept?: () => void };

interface EdgeWebSocketPair {
  0: EdgeWebSocket;
  1: EdgeWebSocket;
}

declare const WebSocketPair: { new (): EdgeWebSocketPair };

type SocketMessage = {
  type: string;
  [key: string]: unknown;
};

const roomSockets = new Map<string, Set<WebSocket>>();

function broadcast(roomId: string, data: string, skip?: WebSocket) {
  const sockets = roomSockets.get(roomId);
  if (!sockets) return;
  for (const socket of sockets) {
    if (socket === skip) continue;
    try {
      socket.send(data);
    } catch {
      // swallow network errors
    }
  }
}

export async function GET(req: Request) {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");
  const player = searchParams.get("player") ?? "unknown";

  if (!roomId) {
    return new Response("roomId is required", { status: 400 });
  }

  const pair = new WebSocketPair();
  const client = pair[0] as EdgeWebSocket;
  const server = pair[1] as EdgeWebSocket;

  const sockets = roomSockets.get(roomId) ?? new Set<WebSocket>();
  sockets.add(server);
  roomSockets.set(roomId, sockets);

  server.accept?.();
  try {
    server.send(
      JSON.stringify({
        type: "joined",
        roomId,
        player,
        occupants: sockets.size,
      } satisfies SocketMessage)
    );
  } catch {
    // ignore initial send failure
  }

  server.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    broadcast(roomId, event.data, server);
  });

  const cleanUp = () => {
    const roomClients = roomSockets.get(roomId);
    if (!roomClients) return;
    roomClients.delete(server);
    if (roomClients.size === 0) {
      roomSockets.delete(roomId);
    }
  };

  server.addEventListener("close", cleanUp);
  server.addEventListener("error", cleanUp);

  return new Response(null, {
    status: 101,
    webSocket: client,
  } as ResponseInit & { webSocket: WebSocket });
}


