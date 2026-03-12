export function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateBoard() {
  const nums = Array.from({ length: 25 }, (_, i) => i + 1);
  return shuffle(nums);
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(existing) {
  // 4-char room code, avoids ambiguous chars (0,1,I,O).
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

export function otherRole(role) {
  return role === "A" ? "B" : "A";
}

