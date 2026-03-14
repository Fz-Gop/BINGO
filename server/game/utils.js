export const PLAYABLE_PLAYER_COUNTS = [2, 3];
export const COMING_SOON_PLAYER_COUNTS = [4];
export const PLAYABLE_BOARD_SIZES = [5];
export const COMING_SOON_BOARD_SIZES = [6, 7];
export const PRECONFIG_JOIN_LIMIT = Math.max(...PLAYABLE_PLAYER_COUNTS);
export const DISCONNECT_GRACE_MS = 60_000;
export const REMATCH_VOTE_MS = 60_000;

export function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateBoard(boardSize) {
  const nums = Array.from({ length: boardSize * boardSize }, (_, i) => i + 1);
  return shuffle(nums);
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(existing) {
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 4; i += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (existing.has(code));
  return code;
}

export function now() {
  return Date.now();
}

export function clampPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}
