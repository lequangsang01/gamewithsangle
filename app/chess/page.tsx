"use client";

import { useEffect, useMemo, useState } from "react";

type Color = "white" | "black";
type PieceType = "p" | "r" | "n" | "b" | "q" | "k";

type Piece = {
  id: string;
  type: PieceType;
  color: Color;
};

type Square = Piece | null;

type BoardState = Square[][];

type RoomState = {
  _id?: string;
  roomId: string;
  players: { name: string; color: Color }[];
  moves?: string[]; // ví dụ: "e2e4"
};

const BOARD_SIZE = 8;
const randomWordsA = ["Sáng", "Đêm", "Lửa", "Gió", "Biển", "Trăng", "Mây"];
const randomWordsB = ["Mã", "Hậu", "Tượng", "Xe", "Tốt", "Vua"];

function createInitialBoard(): BoardState {
  const emptyRow: Square[] = Array(BOARD_SIZE).fill(null);
  const board: BoardState = [];

  const backRank: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

  // black back rank
  board.push(
    backRank.map((type, idx) => ({
      id: `b-${type}-${idx}`,
      type,
      color: "black" as const,
    }))
  );
  // black pawns
  board.push(
    Array(BOARD_SIZE)
      .fill(null)
      .map((_, idx) => ({
        id: `b-p-${idx}`,
        type: "p" as const,
        color: "black" as const,
      }))
  );

  // empty middle
  for (let i = 0; i < 4; i++) {
    board.push([...emptyRow]);
  }

  // white pawns
  board.push(
    Array(BOARD_SIZE)
      .fill(null)
      .map((_, idx) => ({
        id: `w-p-${idx}`,
        type: "p" as const,
        color: "white" as const,
      }))
  );
  // white back rank
  board.push(
    backRank.map((type, idx) => ({
      id: `w-${type}-${idx}`,
      type,
      color: "white" as const,
    }))
  );

  return board;
}

function pieceToSymbol(piece: Piece | null): string {
  if (!piece) return "";
  const map: Record<PieceType, string> = {
    p: "♟",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "♛",
    k: "♚",
  };
  const sym = map[piece.type];
  return piece.color === "white" ? sym.toUpperCase() : sym;
}

function coordToAlgebraic(row: number, col: number): string {
  const file = String.fromCharCode("a".charCodeAt(0) + col);
  const rank = BOARD_SIZE - row;
  return `${file}${rank}`;
}

function generateRandomName() {
  const a = randomWordsA[Math.floor(Math.random() * randomWordsA.length)];
  const b = randomWordsB[Math.floor(Math.random() * randomWordsB.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `${a}${b}${num}`;
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function formatMovesFromRoom(room?: RoomState | null) {
  if (!room?.moves) return [];
  return [...room.moves].reverse();
}

export default function ChessPage() {
  const [playerName, setPlayerName] = useState(() => generateRandomName());
  const [storedNameLoaded, setStoredNameLoaded] = useState(false);

  const [currentRoomId, setCurrentRoomId] = useState("");
  const [inputRoomId, setInputRoomId] = useState(() => generateRoomCode());

  const [board, setBoard] = useState<BoardState>(() => createInitialBoard());
  const [turn, setTurn] = useState<Color>("white");
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(
    null
  );
  const [moves, setMoves] = useState<string[]>([]);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [capturedByWhite, setCapturedByWhite] = useState<Piece[]>([]);
  const [capturedByBlack, setCapturedByBlack] = useState<Piece[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState(false);

  function resetLocalGame() {
    setBoard(createInitialBoard());
    setTurn("white");
    setSelected(null);
    setMoves([]);
    setCapturedByWhite([]);
    setCapturedByBlack([]);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("gws_player_name");
    if (stored) {
      setPlayerName(stored);
    } else {
      window.localStorage.setItem("gws_player_name", playerName);
    }
    setStoredNameLoaded(true);
  }, []);

  useEffect(() => {
    if (!storedNameLoaded) return;
    if (!playerName) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem("gws_player_name", playerName);
  }, [playerName, storedNameLoaded]);

  const canPlay = useMemo(() => {
    return !!playerName && !!currentRoomId;
  }, [playerName, currentRoomId]);

  const isLocked = useMemo(() => {
    return (roomState?.players?.length ?? 0) >= 2;
  }, [roomState]);

  useEffect(() => {
    if (!currentRoomId) return;
    let cancelled = false;

    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/chess/room?roomId=${currentRoomId}`);
        if (!res.ok) return;
        const data: { room?: RoomState | null } = await res.json();
        if (!cancelled) {
          setRoomState(data.room ?? null);
        }
      } catch {
        // polling lỗi tạm bỏ qua
      }
    };

    fetchRoom();
    const id = window.setInterval(fetchRoom, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [currentRoomId]);

  function handleCopyRoomId() {
    if (!currentRoomId || typeof window === "undefined") return;
    navigator.clipboard
      .writeText(currentRoomId)
      .then(() => {
        setCopiedRoomId(true);
        window.setTimeout(() => setCopiedRoomId(false), 1500);
      })
      .catch(() => {
        alert("Không thể sao chép, vui lòng copy thủ công.");
      });
  }

  function handleNameChange(value: string) {
    if (isLocked) return;
    setPlayerName(value);
  }

  function handleRoomInputChange(value: string) {
    if (isLocked) return;
    setInputRoomId(value.toUpperCase());
  }

  function handleCreateRoom() {
    if (!playerName) {
      alert("Nhập tên người chơi trước khi tạo phòng.");
      return;
    }
    if (isLocked) {
      alert("Phòng đã đủ 2 người, không thể tạo phòng mới lúc này.");
      return;
    }
    const id = generateRoomCode();

    setIsSyncing(true);
    fetch("/api/chess/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", playerName, roomId: id }),
    })
      .then((res) => res.json())
      .then((data: { roomId: string; room?: RoomState }) => {
        setCurrentRoomId(data.roomId);
        setInputRoomId(data.roomId);
        resetLocalGame();
        setMoves(formatMovesFromRoom(data.room));
        setRoomState(data.room ?? null);
      })
      .catch(() => {
        // nếu lỗi backend, vẫn cho chơi local
        setCurrentRoomId(id);
        setInputRoomId(id);
        resetLocalGame();
        setRoomState(null);
      })
      .finally(() => setIsSyncing(false));
  }

  function handleJoinRoom() {
    if (!playerName) {
      alert("Nhập tên người chơi trước khi vào phòng.");
      return;
    }
    if (isLocked) {
      alert("Phòng đã đủ 2 người, không thể đổi thông tin.");
      return;
    }
    const raw = inputRoomId.trim();
    if (!raw) {
      alert("Nhập mã phòng để vào.");
      return;
    }
    const roomId = raw.toUpperCase();

    setIsSyncing(true);
    fetch("/api/chess/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", playerName, roomId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Không vào được phòng");
        }
        return res.json();
      })
      .then((data: { roomId: string; room?: RoomState }) => {
        setCurrentRoomId(data.roomId);
        setInputRoomId(data.roomId);
        resetLocalGame();
        setMoves(formatMovesFromRoom(data.room));
        setRoomState(data.room ?? null);
      })
      .catch((err) => {
        alert(err.message || "Không vào được phòng, thử lại sau.");
      })
      .finally(() => setIsSyncing(false));
  }

  function handleSquareClick(row: number, col: number) {
    if (!canPlay) {
      alert("Hãy đặt tên và tạo/vào phòng trước khi chơi.");
      return;
    }

    const piece = board[row][col];

    if (selected && (selected.row !== row || selected.col !== col)) {
      const from = selected;
      const to = { row, col };
      const fromPiece = board[from.row][from.col];

      if (!fromPiece) {
        setSelected(null);
        return;
      }

      if (fromPiece.color !== turn) {
        setSelected(null);
        return;
      }

      if (piece && piece.color === fromPiece.color) {
        setSelected({ row, col });
        return;
      }

      const targetPiece = board[to.row][to.col];
      const nextBoard = board.map((r) => r.slice());
      nextBoard[to.row][to.col] = fromPiece;
      nextBoard[from.row][from.col] = null;
      setBoard(nextBoard);
      setTurn((prev) => (prev === "white" ? "black" : "white"));
      setSelected(null);

      const fromAlg = coordToAlgebraic(from.row, from.col);
      const toAlg = coordToAlgebraic(to.row, to.col);
      const algebraic = `${fromAlg}${toAlg}`;
      setMoves((prev) => [algebraic, ...prev]);

      if (targetPiece) {
        if (targetPiece.color === "white") {
          setCapturedByBlack((prev) => [...prev, targetPiece]);
        } else {
          setCapturedByWhite((prev) => [...prev, targetPiece]);
        }
      }

      // lưu nước đi lên backend (nếu có phòng)
      if (currentRoomId) {
        fetch("/api/chess/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move",
            roomId: currentRoomId,
            move: algebraic,
          }),
        })
          .then((res) => res.json())
          .then((data: { room?: RoomState }) => {
            setRoomState(data.room ?? null);
          })
          .catch(() => {
            // ignore lỗi, vẫn cho chơi local
          });
      }
      return;
    }

    if (piece && piece.color === turn) {
      setSelected({ row, col });
    } else {
      setSelected(null);
    }
  }

  function handleEndGame() {
    if (!currentRoomId) {
      resetLocalGame();
      setRoomState(null);
      setCurrentRoomId("");
      setInputRoomId(generateRoomCode());
      return;
    }

    const agreed = window.confirm(
      "Kết thúc ván và xóa dữ liệu phòng này? Không thể hoàn tác."
    );
    if (!agreed) return;

    setIsSyncing(true);
    fetch("/api/chess/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish", roomId: currentRoomId }),
    })
      .catch(() => {
        // ignore lỗi, vẫn reset local
      })
      .finally(() => {
        resetLocalGame();
        setRoomState(null);
        setCurrentRoomId("");
        setInputRoomId(generateRoomCode());
        setIsSyncing(false);
      });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center px-4">
      <main className="w-full max-w-6xl py-10 flex flex-col gap-8 md:flex-row">
        <section className="w-full md:w-2/3 space-y-4">
          <header className="mb-2">
            <h1 className="text-2xl font-bold tracking-tight mb-1">
              Cờ vua nhiều người chơi (beta)
            </h1>
            <p className="text-xs text-zinc-400">
              Mỗi người mở web, đặt tên, tạo hoặc nhập mã phòng giống nhau để
              chơi cùng. Bản này mới đồng bộ logic trên 1 máy; bước tiếp theo sẽ
              dùng MongoDB / realtime để chia sẻ nước đi.
            </p>
          </header>

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">
                Tên người chơi (lưu trong trình duyệt)
              </label>
              <input
                value={playerName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ví dụ: Sangle"
                disabled={isLocked}
                className={`w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${
                  isLocked ? "opacity-60 cursor-not-allowed" : ""
                }`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">
                Mã phòng (2 người cùng nhập giống nhau)
              </label>
              <div className="flex gap-2">
                <input
                  value={inputRoomId}
                  onChange={(e) => handleRoomInputChange(e.target.value)}
                  placeholder="VD: ABC123"
                  disabled={isLocked}
                  className={`flex-1 rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-emerald-500 ${
                    isLocked ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                />
              </div>
            </div>

            <div className="flex gap-2 col-span-2">
              <button
                onClick={handleCreateRoom}
                disabled={isLocked || isSyncing}
                className={`flex-1 rounded-md text-sm font-medium py-2 transition-colors ${
                  isLocked || isSyncing
                    ? "bg-emerald-900 cursor-not-allowed"
                    : "bg-emerald-500 hover:bg-emerald-400"
                }`}
              >
                Tạo phòng mới
              </button>
              <button
                onClick={handleJoinRoom}
                disabled={isLocked || isSyncing}
                className={`flex-1 rounded-md border border-zinc-700 text-sm font-medium py-2 transition-colors ${
                  isLocked || isSyncing
                    ? "text-zinc-500 cursor-not-allowed"
                    : "hover:bg-zinc-800"
                }`}
              >
                Vào phòng bằng mã
              </button>
            </div>
            <button
              onClick={handleEndGame}
              disabled={isSyncing}
              className={`col-span-2 rounded-md text-sm font-medium py-2 border transition-colors ${
                isSyncing
                  ? "border-zinc-800 text-zinc-500 cursor-wait"
                  : "border-red-500 text-red-400 hover:bg-red-500/10"
              }`}
            >
              Kết thúc ván và xóa dữ liệu phòng
            </button>

            <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <span>Phòng hiện tại:</span>
                {currentRoomId ? (
                  <>
                    <span className="font-semibold text-emerald-400">
                      {currentRoomId}
                    </span>
                    <button
                      onClick={handleCopyRoomId}
                      className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-wide hover:border-emerald-500 transition-colors flex items-center gap-1"
                    >
                      <span aria-hidden>📋</span>
                      Sao chép
                    </button>
                    {copiedRoomId && (
                      <span className="text-emerald-400 text-[10px]">
                        Đã sao chép
                      </span>
                    )}
                  </>
                ) : (
                  <span>Chưa có</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isLocked && (
                  <span className="text-emerald-400">
                    Chế độ chơi (2/2 người)
                  </span>
                )}
                {isSyncing && (
                  <span className="text-emerald-400">Đang đồng bộ...</span>
                )}
                <span>
                  Lượt đi:{" "}
                  <span
                    className={
                      turn === "white" ? "text-zinc-100" : "text-zinc-400"
                    }
                  >
                    {turn === "white" ? "Trắng" : "Đen"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="aspect-square max-w-xl border-4 border-zinc-800 rounded-xl overflow-hidden mx-auto">
            <div className="w-full h-full grid grid-cols-8">
              {board.map((row, rIdx) =>
                row.map((sq, cIdx) => {
                  const isDark = (rIdx + cIdx) % 2 === 1;
                  const isSelected =
                    selected?.row === rIdx && selected?.col === cIdx;
                  return (
                    <button
                      key={`${rIdx}-${cIdx}`}
                      onClick={() => handleSquareClick(rIdx, cIdx)}
                      className={[
                        "flex items-center justify-center text-2xl md:text-3xl font-semibold transition-colors",
                        isDark ? "bg-zinc-700" : "bg-zinc-200",
                        isSelected && "ring-2 ring-emerald-400 z-10 relative",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span
                        className={
                          sq?.color === "white" ? "text-zinc-50" : "text-zinc-900"
                        }
                      >
                        {pieceToSymbol(sq)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <aside className="w-full md:w-1/3 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="text-sm font-semibold mb-2">Hướng dẫn chơi chung</h2>
            <ol className="list-decimal list-inside space-y-1 text-xs text-zinc-300">
              <li>Cả hai người cùng mở website này.</li>
              <li>
                Mỗi người nhập <span className="font-semibold">tên</span> của
                mình. Tên này sẽ được lưu trên trình duyệt.
              </li>
              <li>
                Một người bấm <span className="font-semibold">“Tạo phòng”</span>{" "}
                và gửi mã phòng (ví dụ: ABC123) cho người kia.
              </li>
              <li>
                Người còn lại nhập đúng mã phòng đó và bấm{" "}
                <span className="font-semibold">“Vào phòng bằng mã”</span>.
              </li>
              <li>
                Khi phòng đã đủ 2 người, thông tin tên và mã sẽ khóa để tránh
                đổi trong lúc chơi.
              </li>
              <li>
                Bản này đang lưu phòng & lịch sử vào MongoDB; bước tiếp theo sẽ
                bổ sung realtime để 2 máy cùng thấy nước đi ngay lập tức.
              </li>
              <li>
                Khi ván kết thúc, bấm “Kết thúc ván và xóa dữ liệu phòng” để
                xóa bản ghi trong MongoDB và bắt đầu ván mới sạch sẽ.
              </li>
            </ol>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="text-sm font-semibold mb-3">
              Quân đã bị ăn (theo từng bên)
            </h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-zinc-400 mb-1">Trắng đã ăn</p>
                <div className="min-h-[48px] rounded-md border border-zinc-800 bg-zinc-950/40 p-2 flex flex-wrap gap-1 text-lg">
                  {capturedByWhite.length === 0 && (
                    <span className="text-zinc-600 text-xs">Chưa có</span>
                  )}
                  {capturedByWhite.map((piece) => (
                    <span key={piece.id}>{pieceToSymbol(piece)}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-zinc-400 mb-1">Đen đã ăn</p>
                <div className="min-h-[48px] rounded-md border border-zinc-800 bg-zinc-950/40 p-2 flex flex-wrap gap-1 text-lg">
                  {capturedByBlack.length === 0 && (
                    <span className="text-zinc-600 text-xs">Chưa có</span>
                  )}
                  {capturedByBlack.map((piece) => (
                    <span key={piece.id}>{pieceToSymbol(piece)}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 max-h-[320px] flex flex-col">
            <h2 className="text-sm font-semibold mb-2">Lịch sử nước đi</h2>
            <div className="flex-1 overflow-y-auto text-xs text-zinc-200 space-y-1">
              {moves.length === 0 && (
                <p className="text-zinc-500">Chưa có nước đi nào.</p>
              )}
              {moves.map((m, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-zinc-400">#{moves.length - idx}</span>
                  <span>
                    {m.slice(0, 2)} → {m.slice(2)}
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


