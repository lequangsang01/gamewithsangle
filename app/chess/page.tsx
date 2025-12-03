"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";

type Color = "white" | "black";
type PieceType = "p" | "r" | "n" | "b" | "q" | "k";

type Piece = {
  id: string;
  type: PieceType;
  color: Color;
};

type BoardState = (Piece | null)[][];

type Player = { name: string; color: Color };

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

  const [playerName, setPlayerName] = useState(() => generateRandomName());
  const [storedNameLoaded, setStoredNameLoaded] = useState(false);
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
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "closed">("closed");

  const socketRef = useRef<WebSocket | null>(null);
  const autoCreateRef = useRef(false);
  const clientIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client_${Math.random().toString(36).slice(2)}`
  );

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

  const canPlay = Boolean(playerName && currentRoomId);

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
        const res = await fetch("/api/chess/room", {
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
        chessRef.current.reset();
        refreshFromChess();
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
    socketRef.current.send(
      JSON.stringify({ ...payload, clientId: clientIdRef.current })
    );
  }

  function handleSocketMessage(raw: string) {
    try {
      const message = JSON.parse(raw) as SocketPayload & { clientId?: string };
      if (message.clientId && message.clientId === clientIdRef.current) return;

      if (message.type === "move" && "fen" in message) {
        chessRef.current.load(message.fen);
        refreshFromChess();
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

  function refreshFromChess(status?: string) {
    setRefreshTick((tick) => tick + 1);
    setTurn(chessRef.current.turn() === "w" ? "white" : "black");
    setGameStatus(status ?? describeGame(chessRef.current));
  }

  function syncRoomState(room: RoomState | null) {
    if (!room) return;
    setRoomState(room);
    setCurrentRoomId(room.roomId);
    setInputRoomId(room.roomId);
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
      const res = await fetch("/api/chess/room", {
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

    const moves = chessRef.current.moves({ square, verbose: true });
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
      emitSocketMessage({
        type: "move",
        fen: payload.fen,
        move: { from, to },
        turn: payload.turn,
        room: data?.room ?? null,
        playerName,
      });
    } catch {
      // ignore
    }
  }

  async function handleEndGame() {
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
      emitSocketMessage({ type: "reset", room: data?.room ?? null });
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

  const isLocked = (roomState?.players?.length ?? 0) >= 2;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center px-4">
      <main className="w-full max-w-6xl py-10 flex flex-col gap-8 md:flex-row">
        <section className="w-full md:w-2/3 space-y-4">
          <header className="mb-2">
            <h1 className="text-2xl font-bold tracking-tight mb-1">Cờ vua realtime (beta)</h1>
            <p className="text-xs text-zinc-400">
              Trang tự sinh tên và mã phòng. Chia sẻ mã cho bạn bè để chơi 1vs1, nước đi sẽ được
              đồng bộ qua MongoDB + WebSocket. Luật sử dụng chess.js nên đảm bảo quốc tế.
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
              Kết thúc ván / đổi màu
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
                  Lượt đi: {" "}
                  <span className={turn === "white" ? "text-zinc-100" : "text-zinc-400"}>
                    {turn === "white" ? "Trắng" : "Đen"}
                  </span>
                </span>
                <span>
                  Bạn cầm: <span className="text-emerald-400 font-semibold">{playerColor === "white" ? "Trắng" : "Đen"}</span>
                </span>
              </div>
            </div>
          </div>

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
                        className={`relative flex items-center justify-center text-2xl md:text-3xl font-semibold border border-zinc-900/10 aspect-square ${
                          isDark ? "bg-zinc-700" : "bg-zinc-200"
                        } ${isSelected ? "ring-2 ring-emerald-400" : ""} ${
                          isCheck ? "ring-2 ring-red-500" : ""
                        }`}
                      >
                        {isLegal && <span className="absolute w-3 h-3 rounded-full bg-emerald-400/80" />}
                        {piece && (
                          <span className={piece.color === "white" ? "text-zinc-50 drop-shadow" : "text-zinc-900"}>
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
