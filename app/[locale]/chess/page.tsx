"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { MQTTClient, type MQTTStatus } from "@/lib/mqtt-client";
import { getBotMove } from "@/lib/chess-bot";

type Color = "white" | "black";
type PieceType = "p" | "r" | "n" | "b" | "q" | "k";

type Piece = {
  id: string;
  type: PieceType;
  color: Color;
};

type BoardState = (Piece | null)[][];

type Player = { name: string; color: Color; avatar?: string };

type RoomState = {
  roomId: string;
  players: Player[];
  moves?: string[];
  fen?: string;
  turn?: Color;
  roundIndex?: number;
  updatedAt?: string;
};

type SocketPayload =
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

const BOARD_SIZE = 8;
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const randomWordsA = ["Sáng", "Đêm", "Lửa", "Gió", "Biển", "Trăng", "Mây"];
const randomWordsB = ["Mã", "Hậu", "Tượng", "Xe", "Tốt", "Vua"];

const AVATARS = ["🐱", "🐶", "🐼", "🐯", "🐵", "🐸", "🐧", "🐰", "🐻", "🦊"];

const normalize = (value: string) => value.trim().toLowerCase();

function generateRandomName() {
  const a = randomWordsA[Math.floor(Math.random() * randomWordsA.length)];
  const b = randomWordsB[Math.floor(Math.random() * randomWordsB.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `${a}${b}${num}`;
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function pieceToSymbol(piece: Piece | null) {
  if (!piece) return "";
  const symbols: Record<PieceType, string> = {
    p: "♟",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "♛",
    k: "♚",
  };
  return piece.color === "white" ? symbols[piece.type].toUpperCase() : symbols[piece.type];
}

function describeGame(chess: Chess) {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) {
      return `Chiếu hết! ${chess.turn() === "w" ? "Đen" : "Trắng"} giành chiến thắng.`;
    }
    if (chess.isDraw()) return "Ván đấu hoà.";
  }
  if (chess.inCheck()) {
    return `${chess.turn() === "w" ? "Trắng" : "Đen"} đang bị chiếu, cần xử lý!`;
  }
  return chess.turn() === "w" ? "Tới lượt quân trắng." : "Tới lượt quân đen.";
}

function coordsToSquare(row: number, col: number) {
  const file = files[col];
  const rank = BOARD_SIZE - row;
  return `${file}${rank}`;
}

function convertBoard(boardData: ReturnType<Chess["board"]>): BoardState {
  return boardData.map((row, rIdx) =>
    row.map((sq, cIdx) => {
      if (!sq) return null;
      return {
        id: `${sq.type}-${sq.color}-${rIdx}-${cIdx}`,
        type: sq.type as PieceType,
        color: sq.color === "w" ? "white" : "black",
      };
    })
  );
}

export default function ChessPage() {
  const chessRef = useRef(new Chess());
  const [refreshTick, setRefreshTick] = useState(0);

  const [gameMode, setGameMode] = useState<"online" | "bot">("online");
  const [isBotThinking, setIsBotThinking] = useState(false);

  const [playerName, setPlayerName] = useState(() => generateRandomName());
  const [storedNameLoaded, setStoredNameLoaded] = useState(false);
  const [avatar, setAvatar] = useState<string>(() => {
    const idx = Math.floor(Math.random() * AVATARS.length);
    return AVATARS[idx]!;
  });
  const [storedAvatarLoaded, setStoredAvatarLoaded] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState("");
  const [inputRoomId, setInputRoomId] = useState(() => generateRoomCode());

  const [playerColor, setPlayerColor] = useState<Color>("white");
  const [orientation, setOrientation] = useState<Color>("white");
  const [turn, setTurn] = useState<Color>("white");
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<Set<string>>(new Set());
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameStatus, setGameStatus] = useState("Đang chờ tạo phòng...");
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [mqttStatus, setMqttStatus] = useState<MQTTStatus>("closed");
  const [onlineClients, setOnlineClients] = useState<Set<string>>(new Set());

  const mqttClientRef = useRef<MQTTClient | null>(null);
  const autoCreateRef = useRef(false);
  const clientIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client_${Math.random().toString(36).slice(2)}`
  );
  const autoJoinRef = useRef(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copiedInviteUrl, setCopiedInviteUrl] = useState(false);
  const [activeRooms, setActiveRooms] = useState<
    { roomId: string; players: Player[]; updatedAt?: string | null }[]
  >([]);

  const boardState = useMemo(() => convertBoard(chessRef.current.board()), [refreshTick]);
  const movesHistory = useMemo(
    () => chessRef.current.history({ verbose: true }).slice().reverse(),
    [refreshTick]
  );

  const capturedPieces = useMemo(() => {
    const history = chessRef.current.history({ verbose: true });
    const white: Piece[] = [];
    const black: Piece[] = [];

    history.forEach((move, idx) => {
      if (!move.captured) return;
      const capturedColor: Color = move.color === "w" ? "black" : "white";
      const entry: Piece = {
        id: `capture-${idx}-${move.captured}`,
        type: move.captured as PieceType,
        color: capturedColor,
      };
      if (move.color === "w") white.push(entry);
      else black.push(entry);
    });

    return { white, black };
  }, [refreshTick]);

  const checkSquare = useMemo(() => {
    if (!chessRef.current.inCheck()) return null;
    const target = chessRef.current.turn() === "w" ? "w" : "b";
    const board = chessRef.current.board();
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const sq = board[r][c];
        if (sq && sq.type === "k" && sq.color === target) {
          return coordsToSquare(r, c);
        }
      }
    }
    return null;
  }, [refreshTick]);

  const canPlay = gameMode === "bot" ? true : Boolean(playerName && currentRoomId);
  // Lock dựa trên số clients MQTT đang online, không phải players trong DB
  const isLocked = gameMode === "bot" ? false : onlineClients.size >= 2;

  const opponentName = useMemo(() => {
    if (gameMode === "bot") return "Sangle Bot 🤖";
    if (!roomState?.players?.length) return null;
    const others = roomState.players.filter(
      (p) => normalize(p.name) !== normalize(playerName)
    );
    return others[0]?.name ?? null;
  }, [roomState, playerName, gameMode]);

  const opponentAvatar = useMemo(() => {
    if (gameMode === "bot") return "🤖";
    if (!roomState?.players?.length) return null;
    const others = roomState.players.filter(
      (p) => normalize(p.name) !== normalize(playerName)
    );
    return others[0]?.avatar ?? null;
  }, [roomState, playerName, gameMode]);

  // Handle Bot Turn
  useEffect(() => {
    if (gameMode !== "bot" || isBotThinking) return;
    const botColor = playerColor === "white" ? "b" : "w";
    if (chessRef.current.turn() === botColor && !chessRef.current.isGameOver()) {
      setIsBotThinking(true);
      setTimeout(() => {
        const move = getBotMove(chessRef.current);
        if (move) {
          chessRef.current.move(move);
          refreshFromChess();
        }
        setIsBotThinking(false);
      }, 500); // Thêm độ trễ để tự nhiên hơn
    }
  }, [turn, gameMode, isBotThinking, playerColor, refreshTick]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("gws_player_name");
    if (stored) {
      setPlayerName(stored);
    } else {
      window.localStorage.setItem("gws_player_name", playerName);
    }
    setStoredNameLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load / persist avatar to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("gws_player_avatar");
    if (stored) {
      setAvatar(stored);
    } else {
      window.localStorage.setItem("gws_player_avatar", avatar);
    }
    setStoredAvatarLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storedAvatarLoaded || !avatar) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gws_player_avatar", avatar);
  }, [avatar, storedAvatarLoaded]);

  useEffect(() => {
    if (!storedNameLoaded || !playerName) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gws_player_name", playerName);
  }, [playerName, storedNameLoaded]);

  // Khi MQTT đã connected và có roomState, broadcast room info
  // để các client khác (đối thủ) cập nhật danh sách người chơi ngay lập tức
  useEffect(() => {
    if (!currentRoomId || !roomState) return;
    if (mqttStatus !== "connected") return;
    emitMQTTMessage("room", { room: roomState });
  }, [currentRoomId, roomState, mqttStatus]);

  const handleCreateRoom = useCallback(
    async (options?: { auto?: boolean }) => {
      if (!playerName) {
        if (!options?.auto) alert("Nhập tên người chơi trước khi tạo phòng.");
        return;
      }
      const roomId = generateRoomCode();
      setIsSyncing(true);
      try {
        const res = await fetch("/api/chess/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", playerName, roomId, avatar }),
        });
        const data: { roomId: string; room?: RoomState | null } = await res.json();
        setCurrentRoomId(data.roomId);
        setInputRoomId(data.roomId);
        hydrateFromRoom(data.room ?? null);
        emitMQTTMessage("room", { room: data.room ?? null });
      } catch (err) {
        if (!options?.auto) {
          console.error(err);
          alert("Không tạo được phòng, thử lại nhé.");
        }
        chessRef.current.reset();
        refreshFromChess();
      } finally {
        setIsSyncing(false);
      }
    },
    [playerName, avatar]
  );

  useEffect(() => {
    if (!storedNameLoaded || autoCreateRef.current) return;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const roomIdFromUrl = url.searchParams.get("roomId");
      // Nếu vào bằng link có sẵn roomId thì KHÔNG auto create phòng mới
      if (roomIdFromUrl) return;
    }
    autoCreateRef.current = true;
    handleCreateRoom({ auto: true });
  }, [storedNameLoaded, handleCreateRoom]);

  // Nếu URL có sẵn ?roomId=... thì auto join phòng đó (mời bằng link)
  useEffect(() => {
    if (typeof window === "undefined" || autoJoinRef.current) return;
    const url = new URL(window.location.href);
    const roomIdFromUrl = url.searchParams.get("roomId");
    if (!roomIdFromUrl) return;
    autoJoinRef.current = true;
    setInputRoomId(roomIdFromUrl.toUpperCase());
    // auto join, không cần người dùng bấm nút
    handleJoinRoom(roomIdFromUrl.toUpperCase());
  }, []);

  // MQTT connection
  useEffect(() => {
    if (typeof window === "undefined" || !currentRoomId || !playerName) return;

    if (!mqttClientRef.current) {
      mqttClientRef.current = new MQTTClient(clientIdRef.current);
      mqttClientRef.current.setOnStatusChange((status) => {
        setMqttStatus(status);
        // Khi connected, publish presence và thêm mình vào online clients
        if (status === "connected" && mqttClientRef.current) {
          setOnlineClients((prev) => new Set([...prev, clientIdRef.current]));
          // Publish presence để các clients khác biết
          mqttClientRef.current.publish("presence", {
            playerName,
            clientId: clientIdRef.current,
            action: "connect",
          });
        } else if (status === "closed" || status === "error") {
          // Remove self khi disconnect
          setOnlineClients((prev) => {
            const next = new Set(prev);
            next.delete(clientIdRef.current);
            return next;
          });
        }
      });
      mqttClientRef.current.setOnMessage((message) => {
        handleMQTTMessage(message);
      });
    }

    mqttClientRef.current.connect(currentRoomId, playerName);

    return () => {
      if (mqttClientRef.current && mqttStatus === "connected") {
        // Publish disconnect message trước khi disconnect
        mqttClientRef.current.publish("presence", {
          playerName,
          clientId: clientIdRef.current,
          action: "disconnect",
        });
        mqttClientRef.current.disconnect();
      }
      setOnlineClients(new Set());
    };
  }, [currentRoomId, playerName]);

  // Polling fallback: chỉ khi MQTT disconnected, hoặc để verify state mỗi 60s
  useEffect(() => {
    if (!currentRoomId) return;
    let cancelled = false;

    const poll = async () => {
      // Nếu MQTT đang connected, không cần polling (real-time qua MQTT)
      if (mqttStatus === "connected") return;

      try {
        const res = await fetch(`/api/chess/room?roomId=${currentRoomId}`);
        if (!res.ok) return;
        const data: { room?: RoomState | null } = await res.json();
        if (cancelled || !data.room) return;
        hydrateFromRoom(data.room);
      } catch {
        // ignore, sẽ thử lại sau
      }
    };

    // Poll ngay lập tức nếu MQTT disconnected
    if (mqttStatus !== "connected") {
      poll();
    }

    // Poll mỗi 60s để verify state (backup, không cần thiết nếu MQTT hoạt động tốt)
    const id = window.setInterval(poll, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [currentRoomId, mqttStatus]);

  // Lấy danh sách phòng đang có người chơi (poll ít hơn, không cần real-time)
  useEffect(() => {
    let cancelled = false;

    const fetchRooms = async () => {
      try {
        const res = await fetch("/api/chess/rooms");
        if (!res.ok) return;
        const data: {
          rooms?: { roomId: string; players: Player[]; updatedAt?: string | null }[];
        } = await res.json();
        if (cancelled || !data.rooms) return;
        setActiveRooms(data.rooms);
      } catch {
        // ignore
      }
    };

    fetchRooms();
    // Poll mỗi 30s thay vì 5s (không cần real-time cho rooms list)
    const id = window.setInterval(fetchRooms, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Tạo link mời (share URL) khi có roomId
  useEffect(() => {
    if (typeof window === "undefined" || !currentRoomId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("roomId", currentRoomId);
    setInviteUrl(url.toString());
  }, [currentRoomId, mqttStatus]);

  function emitMQTTMessage(type: string, payload: Record<string, unknown>) {
    if (!mqttClientRef.current || mqttStatus !== "connected") return;
    mqttClientRef.current.publish(type, payload);
  }

  function handleMQTTMessage(message: Record<string, unknown> & { type?: string; clientId?: string }) {
    if (message.clientId && message.clientId === clientIdRef.current) return;
    if (!message.type) {
      console.warn("MQTT message missing type:", message);
      return;
    }
    console.log("Received MQTT message:", message.type, message);

    // Handle presence tracking
    if (message.type === "presence" && message.clientId) {
      const action = message.action as string;
      if (action === "connect") {
        setOnlineClients((prev) => new Set([...prev, message.clientId as string]));
        emitMQTTMessage("presence", {
          playerName,
          action: "iamhere",
        });
      } else if (action === "iamhere") {
        setOnlineClients((prev) => new Set([...prev, message.clientId as string]));
      } else if (action === "disconnect") {
        setOnlineClients((prev) => {
          const next = new Set(prev);
          next.delete(message.clientId as string);
          return next;
        });
      }
      return;
    }

    // Handle disconnect từ last will (khi client disconnect đột ngột)
    if (message.type === "disconnect" && message.clientId) {
      setOnlineClients((prev) => {
        const next = new Set(prev);
        next.delete(message.clientId as string);
        return next;
      });
      return;
    }

    const typedMessage = message as SocketPayload & { clientId?: string };

    if (typedMessage.type === "move" && "fen" in typedMessage) {
      console.log("Processing move message:", typedMessage.fen);
      try {
        chessRef.current.load(typedMessage.fen);
        refreshFromChess();
        if (typedMessage.room) syncRoomState(typedMessage.room);
        console.log("Move loaded successfully");
      } catch (err) {
        console.error("Error loading move from MQTT:", err, typedMessage);
      }
    }

    if (typedMessage.type === "room" && "room" in typedMessage) {
      syncRoomState(typedMessage.room ?? null);
    }

    if (typedMessage.type === "reset" && "room" in typedMessage) {
      hydrateFromRoom(typedMessage.room ?? null);
    }
  }

  function refreshFromChess(status?: string) {
    setRefreshTick((tick) => tick + 1);
    setTurn(chessRef.current.turn() === "w" ? "white" : "black");
    setGameStatus(status ?? describeGame(chessRef.current));
  }

  function syncRoomState(room: RoomState | null) {
    if (!room) return;
    setRoomState(room);
    setCurrentRoomId(room.roomId);
    const me = room.players?.find((p) => normalize(p.name) === normalize(playerName));
    if (me) {
      setPlayerColor(me.color);
      setOrientation(me.color);
    }
  }

  function hydrateFromRoom(room: RoomState | null) {
    if (room?.fen) {
      try {
        chessRef.current.load(room.fen);
      } catch {
        chessRef.current.reset();
      }
    } else {
      chessRef.current.reset();
    }
    setSelectedSquare(null);
    setLegalTargets(new Set());
    syncRoomState(room ?? null);
    refreshFromChess();
  }

  async function handleJoinRoom(explicitRoomId?: string) {
    if (!playerName) {
      alert("Nhập tên người chơi trước khi vào phòng.");
      return;
    }
    const raw = (explicitRoomId ?? inputRoomId).trim();
    if (!raw) {
      alert("Nhập mã phòng để vào.");
      return;
    }

    const roomId = raw.toUpperCase();
    setIsSyncing(true);
    try {
      const res = await fetch("/api/chess/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", playerName, roomId, avatar }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Không vào được phòng");
      }
      const data: { roomId: string; room?: RoomState | null } = await res.json();
      setCurrentRoomId(data.roomId);
      setInputRoomId(data.roomId);
      hydrateFromRoom(data.room ?? null);
      emitMQTTMessage("room", { room: data.room ?? null });
    } catch (err: any) {
      alert(err?.message || "Không vào được phòng, thử lại sau.");
    } finally {
      setIsSyncing(false);
    }
  }

  function getDisplaySquare(row: number, col: number) {
    const actualRow = orientation === "white" ? row : 7 - row;
    const actualCol = orientation === "white" ? col : 7 - col;
    const square = coordsToSquare(actualRow, actualCol);
    const piece = boardState[actualRow]?.[actualCol] ?? null;
    return { square, piece };
  }

  function handleSquareClick(row: number, col: number) {
    if (!canPlay) {
      alert("Hãy tạo hoặc vào phòng trước khi chơi.");
      return;
    }

    const { square, piece } = getDisplaySquare(row, col);

    if (selectedSquare && square === selectedSquare) {
      setSelectedSquare(null);
      setLegalTargets(new Set());
      return;
    }

    if (selectedSquare && legalTargets.has(square)) {
      executeMove(selectedSquare, square);
      return;
    }

    if (!piece) {
      setSelectedSquare(null);
      setLegalTargets(new Set());
      return;
    }

    if (piece.color !== playerColor) {
      setGameStatus("Bạn chỉ được di chuyển quân của mình.");
      return;
    }

    const turnColor = chessRef.current.turn() === "w" ? "white" : "black";
    if (turnColor !== piece.color) {
      setGameStatus("Chưa tới lượt của bạn.");
      return;
    }

    const moves = chessRef.current.moves({
      // chess.js typings mong muốn kiểu Square riêng, cast để phù hợp TS
      square: square as any,
      verbose: true,
    });
    setSelectedSquare(square);
    setLegalTargets(new Set(moves.map((m) => m.to)));
  }

  async function executeMove(from: string, to: string) {
    const move = chessRef.current.move({ from, to, promotion: "q" });
    if (!move) {
      setSelectedSquare(null);
      setLegalTargets(new Set());
      return;
    }

    setSelectedSquare(null);
    setLegalTargets(new Set());
    refreshFromChess();

    if (gameMode === "bot") {
      return;
    }

    if (!currentRoomId) return;

    const payload = {
      action: "move",
      roomId: currentRoomId,
      move: `${from}${to}`,
      fen: chessRef.current.fen(),
      turn: chessRef.current.turn() === "w" ? "white" : "black",
      playerName,
    };

    try {
      const res = await fetch("/api/chess/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.room) syncRoomState(data.room);
      console.log("Publishing move via MQTT:", { from, to, fen: payload.fen });
      emitMQTTMessage("move", {
        fen: payload.fen,
        move: { from, to },
        turn: payload.turn as Color,
        room: data?.room ?? null,
        playerName,
      });
    } catch {
      // ignore
    }
  }

  async function handleEndGame() {
    if (gameMode === "bot") {
      const confirmReset = window.confirm("Bắt đầu ván mới với Bot, bạn muốn đổi màu không?");
      if (!confirmReset) return;
      chessRef.current.reset();
      setPlayerColor((prev) => {
        const next = prev === "white" ? "black" : "white";
        setOrientation(next);
        return next;
      });
      refreshFromChess("Đã làm mới bàn cờ.");
      return;
    }

    if (!currentRoomId) {
      chessRef.current.reset();
      refreshFromChess("Đã làm mới bàn cờ.");
      return;
    }

    const confirmReset = window.confirm(
      "Kết thúc ván, xoá lịch sử và đổi màu cho ván tiếp?"
    );
    if (!confirmReset) return;

    setIsSyncing(true);
    try {
      const res = await fetch("/api/chess/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", roomId: currentRoomId }),
      });
      const data = await res.json();
      hydrateFromRoom(data?.room ?? null);
      emitMQTTMessage("reset", { room: data?.room ?? null });
    } catch {
      chessRef.current.reset();
      refreshFromChess();
    } finally {
      setIsSyncing(false);
    }
  }

  function handleCopyRoomId() {
    if (!currentRoomId || typeof navigator === "undefined") return;
    navigator.clipboard
      .writeText(currentRoomId)
      .then(() => {
        setCopiedRoomId(true);
        window.setTimeout(() => setCopiedRoomId(false), 1500);
      })
      .catch(() => alert("Không thể sao chép, hãy copy thủ công."));
  }

  function handleCopyInviteUrl() {
    if (!inviteUrl || typeof navigator === "undefined") return;
    navigator.clipboard
      .writeText(inviteUrl)
      .then(() => {
        setCopiedInviteUrl(true);
        window.setTimeout(() => setCopiedInviteUrl(false), 1500);
      })
      .catch(() => alert("Không thể sao chép link, hãy copy thủ công."));
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center px-4">
      <main className="w-full max-w-6xl py-10 flex flex-col gap-8 md:flex-row">
        <section className="w-full md:w-2/3 space-y-4">
          <header className="mb-4">
            <h1 className="text-2xl font-bold tracking-tight mb-2">Cờ vua</h1>
            <p className="text-xs text-zinc-400 mb-4">
              Chơi cờ vua online cùng bạn bè hoặc đánh với Bot. Trải nghiệm tức thì, chuẩn quốc tế.
            </p>

            <div className="flex gap-2 p-1 bg-zinc-900/60 border border-zinc-800 rounded-lg w-fit">
              <button
                onClick={() => {
                  setGameMode("online");
                  chessRef.current.reset();
                  setPlayerColor("white");
                  setOrientation("white");
                  refreshFromChess();
                }}
                className={`px-4 py-1.5 text-sm rounded-md transition-all ${gameMode === "online" ? "bg-emerald-500 text-emerald-950 font-semibold shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  }`}
              >
                Chơi Online
              </button>
              <button
                onClick={() => {
                  setGameMode("bot");
                  chessRef.current.reset();
                  setPlayerColor("white");
                  setOrientation("white");
                  refreshFromChess("Bắt đầu ván mới với Bot.");
                }}
                className={`px-4 py-1.5 text-sm rounded-md transition-all ${gameMode === "bot" ? "bg-emerald-500 text-emerald-950 font-semibold shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  }`}
              >
                Chơi với Máy
              </button>
            </div>
          </header>

          {gameMode === "online" && (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Tên người chơi (lưu local)</label>
                  <input
                    value={playerName}
                    onChange={(e) => !isLocked && setPlayerName(e.target.value)}
                    placeholder="Ví dụ: Sangle"
                    disabled={isLocked}
                    className={`w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${isLocked ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Avatar</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const idx = Math.floor(Math.random() * AVATARS.length);
                        setAvatar(AVATARS[idx]!);
                      }}
                      className="px-2 py-1 text-[10px] rounded-md border border-zinc-700 hover:border-emerald-500"
                    >
                      Random
                    </button>
                    <div className="flex flex-wrap gap-1">
                      {AVATARS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setAvatar(icon)}
                          className={`w-7 h-7 flex items-center justify-center rounded-full border text-base ${avatar === icon
                            ? "border-emerald-500 bg-emerald-500/10"
                            : "border-zinc-700 hover:border-emerald-500"
                            }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400">Mã phòng (auto tạo)</label>
                  <input
                    value={inputRoomId}
                    onChange={(e) => !isLocked && setInputRoomId(e.target.value.toUpperCase())}
                    placeholder="VD: ABC123"
                    disabled={isLocked}
                    className={`w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-emerald-500 ${isLocked ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                  />
                </div>

                <div className="flex gap-2 col-span-2">
                  <button
                    onClick={() => handleCreateRoom()}
                    disabled={isSyncing}
                    className={`flex-1 rounded-md text-sm font-medium py-2 transition-colors ${isSyncing ? "bg-emerald-900 cursor-not-allowed" : "bg-emerald-500 hover:bg-emerald-400"
                      }`}
                  >
                    Tạo phòng mới
                  </button>
                  <button
                    onClick={() => handleJoinRoom()}
                    disabled={isSyncing}
                    className={`flex-1 rounded-md border border-zinc-700 text-sm font-medium py-2 transition-colors ${isSyncing ? "text-zinc-500 cursor-not-allowed" : "hover:bg-zinc-800"
                      }`}
                  >
                    Vào phòng bằng mã
                  </button>
                </div>

                <button
                  onClick={handleEndGame}
                  disabled={isSyncing}
                  className={`col-span-2 rounded-md text-sm font-medium py-2 border transition-colors ${isSyncing ? "border-zinc-800 text-zinc-500 cursor-wait" : "border-red-500 text-red-400 hover:bg-red-500/10"
                    }`}
                >
                  Kết thúc ván / đổi màu
                </button>

                <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span>Phòng:</span>
                      {currentRoomId ? (
                        <>
                          <span className="font-semibold text-emerald-400">{currentRoomId}</span>
                          <button
                            onClick={handleCopyRoomId}
                            className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-wide hover:border-emerald-500"
                          >
                            Copy
                          </button>
                          {copiedRoomId && <span className="text-emerald-400 text-[10px]">Đã copy</span>}
                        </>
                      ) : (
                        <span>Chưa có</span>
                      )}
                    </div>
                    {opponentName && (
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-1">
                        {opponentAvatar && (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700">
                            {opponentAvatar}
                          </span>
                        )}
                        <span>
                          Đối thủ:{" "}
                          <span className="text-zinc-100 font-medium">{opponentName}</span>
                        </span>
                        <div className="flex items-center gap-1 ml-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${onlineClients.size >= 2 ? 'bg-emerald-500' : 'bg-red-500/80'}`} />
                          <span className="text-[10px] text-zinc-500">{onlineClients.size >= 2 ? 'Online' : 'Offline'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-3">
                      <span className={mqttStatus === "connected" ? "text-emerald-400" : "text-zinc-500"}>
                        MQTT: {mqttStatus}
                      </span>
                      <span>
                        Lượt đi:{" "}
                        <span className={turn === "white" ? "text-zinc-100" : "text-zinc-400"}>
                          {turn === "white" ? "Trắng" : "Đen"}
                        </span>
                      </span>
                    </div>
                    <span>
                      Bạn cầm:{" "}
                      <span className="text-emerald-400 font-semibold">
                        {playerColor === "white" ? "Trắng" : "Đen"}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {gameMode === "bot" && (
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700">🤖</span>
                  Sangle Bot
                </span>
                <button
                  onClick={handleEndGame}
                  disabled={isBotThinking}
                  className="px-4 py-1.5 rounded-md text-xs border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                >
                  Ván mới / Đổi màu
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  Lượt đi:{" "}
                  <span className={turn === "white" ? "text-zinc-100" : "text-zinc-400"}>
                    {turn === "white" ? "Trắng" : "Đen"}
                  </span>
                </span>
                <span>
                  Bạn cầm:{" "}
                  <span className="text-emerald-400 font-semibold">
                    {playerColor === "white" ? "Trắng" : "Đen"}
                  </span>
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-400">
              <span>Hướng nhìn: {orientation === "white" ? "Trắng" : "Đen"}</span>
              <span className="text-emerald-400">{gameStatus}</span>
            </div>
            <div className="aspect-square max-w-xl border-4 border-zinc-800 rounded-xl overflow-hidden mx-auto bg-zinc-900">
              <div className="w-full h-full grid grid-cols-8">
                {Array.from({ length: BOARD_SIZE }).map((_, row) =>
                  Array.from({ length: BOARD_SIZE }).map((__, col) => {
                    const isDark = (row + col) % 2 === 1;
                    const { square, piece } = getDisplaySquare(row, col);
                    const isSelected = selectedSquare === square;
                    const isLegal = legalTargets.has(square);
                    const isCheck = checkSquare === square;

                    return (
                      <button
                        key={`${row}-${col}`}
                        onClick={() => handleSquareClick(row, col)}
                        className={`relative flex items-center justify-center text-3xl md:text-4xl font-semibold border border-zinc-900/10 aspect-square transition-all duration-200 cursor-pointer ${isDark ? "bg-[#779556] hover:bg-[#86a661]" : "bg-[#ebecd0] hover:bg-[#f5f6dd]"
                          } ${isSelected ? "ring-4 ring-inset ring-yellow-400/80 bg-opacity-90" : ""} ${isCheck ? "ring-4 ring-inset ring-red-500/80" : ""
                          }`}
                      >
                        {isLegal && <span className="absolute w-3.5 h-3.5 rounded-full bg-black/20" />}
                        {piece && (
                          <span className={`transition-transform duration-200 ${isSelected ? 'scale-110 drop-shadow-md' : 'drop-shadow-sm'} ${piece.color === 'white' ? 'text-white' : 'text-black opacity-90'}`}>
                            {pieceToSymbol(piece)}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="w-full md:w-1/3 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-xs text-zinc-300 space-y-2">
            <h2 className="text-sm font-semibold mb-1">Phòng đang có người chơi</h2>
            {activeRooms.length === 0 && (
              <p className="text-zinc-500 text-[11px]">Chưa có phòng công khai nào.</p>
            )}
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {activeRooms.map((room) => (
                <div
                  key={room.roomId}
                  className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1">
                      {room.players.slice(0, 2).map((p) => (
                        <div
                          key={p.name}
                          className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[13px] border border-zinc-900"
                        >
                          {p.avatar || "👤"}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-zinc-400">
                        {room.players.map((p) => p.name).join(" vs ")}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono">
                        {room.roomId}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInputRoomId(room.roomId);
                      handleJoinRoom(room.roomId);
                    }}
                    className="px-2 py-1 text-[10px] rounded-md border border-emerald-500 text-emerald-400 hover:bg-emerald-500/10"
                  >
                    Vào
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-xs text-zinc-300 space-y-2">
            <h2 className="text-sm font-semibold mb-1">Mời bạn bè bằng link / QR</h2>
            <p className="text-zinc-400">
              Gửi link này cho đối thủ, họ chỉ cần mở là sẽ tự vào đúng phòng cờ vua của bạn.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteUrl || "Chưa có phòng"}
                  className="flex-1 rounded-md bg-zinc-950 border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 truncate"
                />
                <button
                  onClick={handleCopyInviteUrl}
                  disabled={!inviteUrl}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-wide hover:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Copy
                </button>
              </div>
              {copiedInviteUrl && (
                <div className="text-[11px] text-emerald-400">Đã sao chép đường dẫn mời.</div>
              )}
              {inviteUrl && (
                <div className="flex flex-col items-center gap-1 pt-2">
                  <span className="text-[11px] text-zinc-500">Quét QR để vào phòng:</span>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                      inviteUrl
                    )}`}
                    alt="QR vào phòng cờ vua"
                    className="w-28 h-28 rounded-md border border-zinc-800 bg-zinc-950"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-xs text-zinc-300 space-y-1">
            <h2 className="text-sm font-semibold mb-1">Luồng chơi</h2>
            <ol className="list-decimal list-inside space-y-1">
              <li>Trang tự tạo phòng và tên ngẫu nhiên khi bạn mở.</li>
              <li>Chia sẻ mã phòng cho người thứ hai, người đó sẽ cầm đen và bàn xoay phù hợp.</li>
              <li>Socket realtime giúp nước đi hiển thị tức thì trên hai máy.</li>
              <li>Bấm "Kết thúc ván" để xoá lịch sử, reset bàn và đổi màu ở ván tiếp theo.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="text-sm font-semibold mb-3">Quân đã bị ăn</h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-zinc-400 mb-1">Trắng đã ăn</p>
                <div className="min-h-[48px] rounded-md border border-zinc-800 bg-zinc-950/40 p-2 flex flex-wrap gap-1 text-lg">
                  {capturedPieces.white.length === 0 && <span className="text-zinc-600 text-xs">Chưa có</span>}
                  {capturedPieces.white.map((piece) => (
                    <span key={piece.id}>{pieceToSymbol(piece)}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-zinc-400 mb-1">Đen đã ăn</p>
                <div className="min-h-[48px] rounded-md border border-zinc-800 bg-zinc-950/40 p-2 flex flex-wrap gap-1 text-lg">
                  {capturedPieces.black.length === 0 && <span className="text-zinc-600 text-xs">Chưa có</span>}
                  {capturedPieces.black.map((piece) => (
                    <span key={piece.id}>{pieceToSymbol(piece)}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 max-h-[320px] flex flex-col">
            <h2 className="text-sm font-semibold mb-2">Lịch sử nước đi</h2>
            <div className="flex-1 overflow-y-auto text-xs text-zinc-200 space-y-1">
              {movesHistory.length === 0 && <p className="text-zinc-500">Chưa có nước đi nào.</p>}
              {movesHistory.map((move, idx) => (
                <div key={`${move.san}-${idx}`} className="flex justify-between">
                  <span className="text-zinc-500">#{movesHistory.length - idx}</span>
                  <span>
                    {move.color === "w" ? "♙" : "♟"} {move.san}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
