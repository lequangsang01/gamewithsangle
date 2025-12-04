"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Symbol = "X" | "O";

type Player = { name: string; symbol: Symbol; avatar?: string };

type RoomState = {
  roomId: string;
  players: Player[];
  board?: (string | null)[][];
  turn?: Symbol;
  roundIndex?: number;
  winner?: Symbol | "draw" | null;
  updatedAt?: string;
};

type SocketPayload =
  | {
      type: "move";
      row: number;
      col: number;
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

const randomWordsA = ["Sáng", "Đêm", "Lửa", "Gió", "Biển", "Trăng", "Mây"];
const randomWordsB = ["X", "O", "Tic", "Tac", "Toe", "Game"];

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

const INITIAL_BOARD: (string | null)[][] = [
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

export default function XOPage() {
  const [playerName, setPlayerName] = useState(() => generateRandomName());
  const [storedNameLoaded, setStoredNameLoaded] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState("");
  const [inputRoomId, setInputRoomId] = useState(() => generateRoomCode());

  const [playerSymbol, setPlayerSymbol] = useState<Symbol>("X");
  const [turn, setTurn] = useState<Symbol>("X");
  const [board, setBoard] = useState<(string | null)[][]>(() =>
    INITIAL_BOARD.map((row) => [...row])
  );
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameStatus, setGameStatus] = useState("Đang chờ tạo phòng...");
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "closed">("closed");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copiedInviteUrl, setCopiedInviteUrl] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const autoCreateRef = useRef(false);
  const autoJoinRef = useRef(false);
  const clientIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client_${Math.random().toString(36).slice(2)}`
  );

  const canPlay = Boolean(playerName && currentRoomId);
  const isLocked = (roomState?.players?.length ?? 0) >= 2;

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

  useEffect(() => {
    if (!storedNameLoaded || !playerName) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gws_player_name", playerName);
  }, [playerName, storedNameLoaded]);

  const handleCreateRoom = useCallback(
    async (options?: { auto?: boolean }) => {
      if (!playerName) {
        if (!options?.auto) alert("Nhập tên người chơi trước khi tạo phòng.");
        return;
      }
      const roomId = generateRoomCode();
      setIsSyncing(true);
      try {
        const res = await fetch("/api/xo/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", playerName, roomId }),
        });
        const data: { roomId: string; room?: RoomState | null } = await res.json();
        setCurrentRoomId(data.roomId);
        setInputRoomId(data.roomId);
        hydrateFromRoom(data.room ?? null);
        emitSocketMessage({ type: "room", room: data.room ?? null });
      } catch (err) {
        if (!options?.auto) {
          console.error(err);
          alert("Không tạo được phòng, thử lại nhé.");
        }
        setBoard(INITIAL_BOARD.map((row) => [...row]));
        setTurn("X");
        setGameStatus("Đã reset bàn chơi.");
      } finally {
        setIsSyncing(false);
      }
    },
    [playerName]
  );

  useEffect(() => {
    if (!storedNameLoaded || autoCreateRef.current) return;
    autoCreateRef.current = true;
    handleCreateRoom({ auto: true });
  }, [storedNameLoaded, handleCreateRoom]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentRoomId) return;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${protocol}://${window.location.host}/api/socket?roomId=${currentRoomId}&player=${encodeURIComponent(
        playerName || "unknown"
      )}`
    );
    socketRef.current = ws;
    setSocketStatus("connecting");
    ws.onopen = () => setSocketStatus("connected");
    ws.onclose = () => setSocketStatus("closed");
    ws.onerror = () => setSocketStatus("closed");
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      handleSocketMessage(event.data);
    };
    return () => ws.close();
  }, [currentRoomId, playerName]);

  function emitSocketMessage(payload: Omit<SocketPayload, "clientId">) {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ ...payload, clientId: clientIdRef.current }));
  }

  function handleSocketMessage(raw: string) {
    try {
      const message = JSON.parse(raw) as SocketPayload & { clientId?: string };
      if (message.clientId && message.clientId === clientIdRef.current) return;

      if (message.type === "move" && "row" in message) {
        if (message.room) syncRoomState(message.room);
      }

      if (message.type === "room" && "room" in message) {
        syncRoomState(message.room ?? null);
      }

      if (message.type === "reset" && "room" in message) {
        hydrateFromRoom(message.room ?? null);
      }
    } catch {
      // ignore malformed payloads
    }
  }

  function syncRoomState(room: RoomState | null) {
    if (!room) return;
    setRoomState(room);
    setCurrentRoomId(room.roomId);
    setInputRoomId(room.roomId);
    const me = room.players?.find((p) => normalize(p.name) === normalize(playerName));
    if (me) {
      setPlayerSymbol(me.symbol);
    }
    if (room.board) {
      setBoard(room.board.map((row) => [...row]));
    }
    if (room.turn) {
      setTurn(room.turn);
    }
    updateGameStatus(room);
  }

  function hydrateFromRoom(room: RoomState | null) {
    if (room?.board) {
      setBoard(room.board.map((row) => [...row]));
    } else {
      setBoard(INITIAL_BOARD.map((row) => [...row]));
    }
    if (room?.turn) {
      setTurn(room.turn);
    } else {
      setTurn("X");
    }
    syncRoomState(room ?? null);
  }

  function updateGameStatus(room: RoomState) {
    if (room.winner === "draw") {
      setGameStatus("Ván đấu hoà!");
    } else if (room.winner) {
      setGameStatus(`${room.winner} giành chiến thắng!`);
    } else if (room.turn) {
      setGameStatus(`Tới lượt ${room.turn}`);
    } else {
      setGameStatus("Đang chờ người chơi...");
    }
  }

  async function handleJoinRoom() {
    if (!playerName) {
      alert("Nhập tên người chơi trước khi vào phòng.");
      return;
    }
    const raw = inputRoomId.trim();
    if (!raw) {
      alert("Nhập mã phòng để vào.");
      return;
    }

    const roomId = raw.toUpperCase();
    setIsSyncing(true);
    try {
      const res = await fetch("/api/xo/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", playerName, roomId }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Không vào được phòng");
      }
      const data: { roomId: string; room?: RoomState | null } = await res.json();
      setCurrentRoomId(data.roomId);
      hydrateFromRoom(data.room ?? null);
      emitSocketMessage({ type: "room", room: data.room ?? null });
    } catch (err: any) {
      alert(err?.message || "Không vào được phòng, thử lại sau.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleCellClick(row: number, col: number) {
    if (!canPlay) {
      alert("Hãy tạo hoặc vào phòng trước khi chơi.");
      return;
    }

    if (board[row][col] !== null) {
      setGameStatus("Ô này đã được đánh!");
      return;
    }

    if (turn !== playerSymbol) {
      setGameStatus("Chưa tới lượt của bạn!");
      return;
    }

    if (roomState?.winner) {
      setGameStatus("Ván đấu đã kết thúc!");
      return;
    }

    setIsSyncing(true);
    try {
      const res = await fetch("/api/xo/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          roomId: currentRoomId,
          row,
          col,
          playerName,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Không thể thực hiện nước đi");
      }
      const data = await res.json();
      if (data?.room) {
        syncRoomState(data.room);
        emitSocketMessage({
          type: "move",
          row,
          col,
          room: data.room,
          playerName,
        } as Omit<SocketPayload, "clientId">);
      }
    } catch (err: any) {
      alert(err?.message || "Không thể thực hiện nước đi");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleEndGame() {
    if (!currentRoomId) {
      setBoard(INITIAL_BOARD.map((row) => [...row]));
      setTurn("X");
      setGameStatus("Đã làm mới bàn chơi.");
      return;
    }

    const confirmReset = window.confirm("Kết thúc ván, xoá lịch sử và đổi ký hiệu cho ván tiếp?");
    if (!confirmReset) return;

    setIsSyncing(true);
    try {
      const res = await fetch("/api/xo/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", roomId: currentRoomId }),
      });
      const data = await res.json();
      hydrateFromRoom(data?.room ?? null);
      emitSocketMessage({ type: "reset", room: data?.room ?? null });
    } catch {
      setBoard(INITIAL_BOARD.map((row) => [...row]));
      setTurn("X");
      setGameStatus("Đã reset bàn chơi.");
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
      .catch(() => alert("Không thể sao chép, hãy copy thủ công."));
  }

  useEffect(() => {
    if (typeof window === "undefined" || !currentRoomId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("roomId", currentRoomId);
    setInviteUrl(url.toString());
  }, [currentRoomId]);

  useEffect(() => {
    if (typeof window === "undefined" || autoJoinRef.current) return;
    const url = new URL(window.location.href);
    const roomIdFromUrl = url.searchParams.get("roomId");
    if (!roomIdFromUrl) return;
    autoJoinRef.current = true;
    setInputRoomId(roomIdFromUrl.toUpperCase());
    handleJoinRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (roomState) {
      updateGameStatus(roomState);
    }
  }, [roomState]);

  const opponent = roomState?.players?.find((p) => normalize(p.name) !== normalize(playerName));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center px-4">
      <main className="w-full max-w-4xl py-10 flex flex-col gap-8">
        <header className="mb-2">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Tic-Tac-Toe (XO) realtime</h1>
          <p className="text-xs text-zinc-400">
            Trang tự sinh tên và mã phòng. Chia sẻ mã cho bạn bè để chơi 1vs1, nước đi sẽ được
            đồng bộ qua MongoDB + WebSocket.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Tên người chơi (lưu local)</label>
            <input
              value={playerName}
              onChange={(e) => !isLocked && setPlayerName(e.target.value)}
              placeholder="Ví dụ: Sangle"
              disabled={isLocked}
              className={`w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${
                isLocked ? "opacity-60 cursor-not-allowed" : ""
              }`}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-zinc-400">Mã phòng (auto tạo)</label>
            <input
              value={inputRoomId}
              onChange={(e) => !isLocked && setInputRoomId(e.target.value.toUpperCase())}
              placeholder="VD: ABC123"
              disabled={isLocked}
              className={`w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-emerald-500 ${
                isLocked ? "opacity-60 cursor-not-allowed" : ""
              }`}
            />
          </div>

          <div className="flex gap-2 col-span-2">
            <button
              onClick={() => handleCreateRoom()}
              disabled={isSyncing}
              className={`flex-1 rounded-md text-sm font-medium py-2 transition-colors ${
                isSyncing ? "bg-emerald-900 cursor-not-allowed" : "bg-emerald-500 hover:bg-emerald-400"
              }`}
            >
              Tạo phòng mới
            </button>
            <button
              onClick={handleJoinRoom}
              disabled={isSyncing}
              className={`flex-1 rounded-md border border-zinc-700 text-sm font-medium py-2 transition-colors ${
                isSyncing ? "text-zinc-500 cursor-not-allowed" : "hover:bg-zinc-800"
              }`}
            >
              Vào phòng bằng mã
            </button>
          </div>

          <button
            onClick={handleEndGame}
            disabled={isSyncing}
            className={`col-span-2 rounded-md text-sm font-medium py-2 border transition-colors ${
              isSyncing ? "border-zinc-800 text-zinc-500 cursor-wait" : "border-red-500 text-red-400 hover:bg-red-500/10"
            }`}
          >
            Kết thúc ván / đổi ký hiệu
          </button>

          <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
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
            <div className="flex items-center gap-4">
              <span className={socketStatus === "connected" ? "text-emerald-400" : "text-zinc-500"}>
                Socket: {socketStatus}
              </span>
              <span>
                Lượt đi: <span className="text-emerald-400 font-semibold">{turn}</span>
              </span>
              <span>
                Bạn cầm: <span className="text-emerald-400 font-semibold">{playerSymbol}</span>
              </span>
            </div>
          </div>

          {isLocked && opponent && (
            <div className="col-span-2 text-xs text-zinc-300">
              <span>Đối thủ: </span>
              <span className="font-semibold text-emerald-400">{opponent.name}</span>
              <span className="text-zinc-500 ml-2">({opponent.symbol})</span>
            </div>
          )}

          {inviteUrl && (
            <div className="col-span-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Link mời:</span>
                <input
                  value={inviteUrl}
                  readOnly
                  className="flex-1 rounded-md bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-xs outline-none"
                />
                <button
                  onClick={handleCopyInviteUrl}
                  className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-wide hover:border-emerald-500"
                >
                  {copiedInviteUrl ? "Đã copy" : "Copy"}
                </button>
              </div>
              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(inviteUrl)}`}
                  alt="QR Code"
                  className="border border-zinc-700 rounded-md"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-400">
            <span>Trạng thái: {gameStatus}</span>
          </div>
          <div className="flex justify-center">
            <div className="grid grid-cols-3 gap-2 border-4 border-zinc-800 rounded-xl p-2 bg-zinc-900">
              {Array.from({ length: 3 }).map((_, row) =>
                Array.from({ length: 3 }).map((__, col) => {
                  const cell = board[row][col];
                  const isWinning = roomState?.winner && cell === roomState.winner;

                  return (
                    <button
                      key={`${row}-${col}`}
                      onClick={() => handleCellClick(row, col)}
                      disabled={isSyncing || cell !== null || turn !== playerSymbol || !!roomState?.winner}
                      className={`aspect-square w-20 md:w-24 lg:w-28 flex items-center justify-center text-4xl md:text-5xl lg:text-6xl font-bold rounded-md border-2 transition-colors ${
                        cell === "X"
                          ? "bg-blue-500/20 border-blue-500 text-blue-400"
                          : cell === "O"
                          ? "bg-red-500/20 border-red-500 text-red-400"
                          : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
                      } ${
                        isWinning ? "ring-4 ring-emerald-400" : ""
                      } ${
                        isSyncing || cell !== null || turn !== playerSymbol || !!roomState?.winner
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer"
                      }`}
                    >
                      {cell}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

