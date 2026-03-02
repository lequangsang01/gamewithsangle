const randomWordsA_VI = ["Sáng", "Đêm", "Lửa", "Gió", "Biển", "Trăng", "Mây"];
const randomWordsB_VI = ["Mã", "Hậu", "Tượng", "Xe", "Tốt", "Vua"];

const randomWordsA_EN = ["Bright", "Night", "Fire", "Wind", "Sea", "Moon", "Cloud"];
const randomWordsB_EN = ["Knight", "Queen", "Bishop", "Rook", "Pawn", "King"];

export function generateRandomName(locale: string = 'vi') {
  const randomWordsA = locale === 'vi' ? randomWordsA_VI : randomWordsA_EN;
  const randomWordsB = locale === 'vi' ? randomWordsB_VI : randomWordsB_EN;
  
  const a = randomWordsA[Math.floor(Math.random() * randomWordsA.length)];
  const b = randomWordsB[Math.floor(Math.random() * randomWordsB.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `${a}${b}${num}`;
}

