import { z } from "zod";

import {
  isScreenshotAvailable,
  renderScreenshot,
  screenshotUnavailableReason,
} from "../../render/screenshot.js";
import type { Tool, ToolDeps } from "../registry.js";
import { getSessionOrThrow, imageResponse, jsonSchemaFor } from "./helpers.js";

const InputSchema = z.object({
  session_id: z.string(),
  font_size: z.number().int().positive().optional(),
  font_family: z.string().optional(),
  theme: z.enum(["dark", "light"]).optional(),
});

export function makeScreenshotTool(deps: ToolDeps): Tool {
  return {
    name: "terminal_screenshot",
    description:
      "Render the current screen state as a PNG. Use this for TUI verification (vim, htop, ncurses installers, lazygit) where visual layout matters more than text. Returns image content the client can pass back as vision context.",
    inputSchema: jsonSchemaFor(InputSchema),
    handler: async (input) => {
      const parsed = InputSchema.parse(input);
      const session = getSessionOrThrow(deps.manager, parsed.session_id);
      if (!isScreenshotAvailable()) {
        throw new Error(`screenshots unavailable: ${screenshotUnavailableReason()}`);
      }
      const png = renderScreenshot(session, {
        fontSize: parsed.font_size,
        fontFamily: parsed.font_family,
        theme: parsed.theme,
      });
      return imageResponse(png.toString("base64"), "image/png");
    },
  };
}
