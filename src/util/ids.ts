import { randomBytes } from "node:crypto";

export function newSessionId(): string {
  return `s_${randomBytes(3).toString("hex")}`;
}
