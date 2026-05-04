const SPECIAL_KEYS = new Map<string, string>([
  ["Enter", "\r"],
  ["Tab", "\t"],
  ["Esc", "\x1b"],
  ["Backspace", "\x7f"],
  ["Delete", "\x1b[3~"],
  ["Up", "\x1b[A"],
  ["Down", "\x1b[B"],
  ["Right", "\x1b[C"],
  ["Left", "\x1b[D"],
  ["Home", "\x1b[H"],
  ["End", "\x1b[F"],
  ["PageUp", "\x1b[5~"],
  ["PageDown", "\x1b[6~"],
  ["F1", "\x1bOP"],
  ["F2", "\x1bOQ"],
  ["F3", "\x1bOR"],
  ["F4", "\x1bOS"],
  ["F5", "\x1b[15~"],
  ["F6", "\x1b[17~"],
  ["F7", "\x1b[18~"],
  ["F8", "\x1b[19~"],
  ["F9", "\x1b[20~"],
  ["F10", "\x1b[21~"],
  ["F11", "\x1b[23~"],
  ["F12", "\x1b[24~"],
  ["Shift-Tab", "\x1b[Z"],
]);

export function keyToBytes(name: string): string {
  const literal = SPECIAL_KEYS.get(name);
  if (literal !== undefined) return literal;

  if (name.startsWith("Ctrl-")) {
    return ctrlBytes(name.slice(5), name);
  }

  if (name.startsWith("Alt-")) {
    return altBytes(name.slice(4), name);
  }

  throw unknownKey(name);
}

function ctrlBytes(suffix: string, original: string): string {
  if (suffix.length === 1) {
    const ch = suffix;
    const upper = ch.toUpperCase().charCodeAt(0);
    // Ctrl-A through Ctrl-Z map to 0x01..0x1a; Ctrl-@ to NUL; Ctrl-[ to ESC,
    // Ctrl-\\ to FS, Ctrl-] to GS, Ctrl-^ to RS, Ctrl-_ to US.
    if (upper >= 0x40 && upper <= 0x5f) {
      return String.fromCharCode(upper - 0x40);
    }
    if (ch === "?") return "\x7f";
    if (ch === " ") return "\x00";
  }
  throw unknownKey(original);
}

function altBytes(suffix: string, original: string): string {
  if (suffix.length === 1) {
    return `\x1b${suffix}`;
  }
  throw unknownKey(original);
}

function unknownKey(name: string): Error {
  const known = [...SPECIAL_KEYS.keys(), "Ctrl-<char>", "Alt-<char>"].join(", ");
  return new Error(`unknown key: ${name}. Known: ${known}`);
}
