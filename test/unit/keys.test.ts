import { describe, expect, it } from "vitest";

import { keyToBytes } from "../../src/util/keys.js";

describe("keyToBytes", () => {
  describe("named special keys", () => {
    it.each<[string, string]>([
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
      ["Shift-Tab", "\x1b[Z"],
    ])("%s -> documented sequence", (name, expected) => {
      expect(keyToBytes(name)).toBe(expected);
    });
  });

  describe("function keys", () => {
    it.each<[string, string]>([
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
    ])("%s -> %s", (name, expected) => {
      expect(keyToBytes(name)).toBe(expected);
    });
  });

  describe("Ctrl-<char>", () => {
    it("maps Ctrl-A through Ctrl-Z to 0x01..0x1a", () => {
      for (let i = 0; i < 26; i++) {
        const letter = String.fromCharCode(0x41 + i);
        expect(keyToBytes(`Ctrl-${letter}`)).toBe(String.fromCharCode(i + 1));
      }
    });

    it("treats lowercase the same as uppercase", () => {
      expect(keyToBytes("Ctrl-c")).toBe("\x03");
      expect(keyToBytes("Ctrl-C")).toBe("\x03");
    });

    it("maps Ctrl-[ to ESC and Ctrl-] to GS", () => {
      expect(keyToBytes("Ctrl-[")).toBe("\x1b");
      expect(keyToBytes("Ctrl-]")).toBe("\x1d");
    });

    it("maps Ctrl-? to DEL and Ctrl-Space to NUL", () => {
      expect(keyToBytes("Ctrl-?")).toBe("\x7f");
      expect(keyToBytes("Ctrl- ")).toBe("\x00");
    });
  });

  describe("Alt-<char>", () => {
    it("prefixes the char with ESC", () => {
      expect(keyToBytes("Alt-a")).toBe("\x1ba");
      expect(keyToBytes("Alt-Z")).toBe("\x1bZ");
      expect(keyToBytes("Alt-/")).toBe("\x1b/");
    });
  });

  describe("unknown keys", () => {
    it("throws for an unrecognized name", () => {
      expect(() => keyToBytes("Meta-x")).toThrow(/unknown key/);
    });

    it("throws when Ctrl- has no character", () => {
      expect(() => keyToBytes("Ctrl-")).toThrow(/unknown key/);
    });

    it("throws when Ctrl- is multi-character", () => {
      expect(() => keyToBytes("Ctrl-AB")).toThrow(/unknown key/);
    });

    it("throws when Alt- is empty", () => {
      expect(() => keyToBytes("Alt-")).toThrow(/unknown key/);
    });
  });
});
