/**
 * Image Paste Extension
 *
 * Enhances the built-in Ctrl+V image paste with:
 * - Visual notification showing image details (size, dimensions)
 * - Inline preview widget above the editor (auto-dismisses after sending)
 * - Works with both paste (Ctrl+V) and drag-and-drop
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Image, Container, Text, Spacer } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";

// MIME type detection from file extension
function getMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
  };
  return mimeMap[ext] || null;
}

// Detect image file paths in text (both clipboard temp files and regular image paths)
function findImagePaths(text: string): string[] {
  const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".tiff", ".tif"];
  const results: string[] = [];
  // Split on whitespace and punctuation to find candidate paths
  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    const cleaned = token.replace(/[",)\]]+$/, ""); // strip trailing punctuation
    for (const ext of imageExts) {
      if (cleaned.toLowerCase().endsWith(ext) && fs.existsSync(cleaned)) {
        results.push(cleaned);
        break;
      }
    }
  }
  return results;
}

export default function (pi: ExtensionAPI) {
  let lastImageInfo: { name: string; size: string; mime: string } | null = null;

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function showPreview(filePath: string, ctx: ExtensionContext) {
    const name = path.basename(filePath);
    const mime = getMimeType(filePath);
    if (!mime) return;

    let size = "unknown";
    let base64Data: string | null = null;

    try {
      const stats = fs.statSync(filePath);
      size = formatSize(stats.size);
      const buffer = fs.readFileSync(filePath);
      base64Data = buffer.toString("base64");
    } catch {
      return;
    }

    lastImageInfo = { name, size, mime };

    // Show a small preview widget above the editor
    ctx.ui.setWidget("image-preview", (_tui, theme) => {
      let imageComponent: Image | null = null;

      try {
        imageComponent = new Image(
          base64Data,
          mime,
          { fallbackColor: (s: string) => theme.fg("muted", s) },
          { maxWidthCells: 40, maxHeightCells: 12 },
        );
      } catch {
        // Terminal doesn't support inline images
      }

      const label = theme.fg("accent", theme.bold(`📷 ${name}`));
      const meta = theme.fg("muted", `${lastImageInfo.mime} • ${lastImageInfo.size}`);

      return {
        render(width: number): string[] {
          if (imageComponent) {
            const container = new Container();
            container.addChild(new Text(label, 1, 0));
            container.addChild(new Text(meta, 1, 0));
            container.addChild(new Spacer(1));
            imageComponent.render(width - 2);
            container.addChild(new Text("", 1, 0));
            return container.render(width);
          }
          return [
            theme.bg("customMessageBg", `  ${label}  ${meta}  `),
          ];
        },
        invalidate(): void {},
      };
    });

    ctx.ui.notify(`Image pasted: ${name} (${lastImageInfo.size})`, "info");
  }

  function clearPreview(ctx: ExtensionContext) {
    ctx.ui.setWidget("image-preview", undefined);
    lastImageInfo = null;
  }

  // Intercept input to detect pasted images
  pi.on("input", async (event, ctx) => {
    // Check for images passed as ImageContent objects (RPC, programmatic)
    if (event.images && event.images.length > 0) {
      for (const image of event.images) {
        const name = "image";
        const mime = image.mimeType || "image/png";
        const data = image.data || null;
        lastImageInfo = {
          name,
          size: data ? formatSize(Buffer.from(data, "base64").length) : "unknown",
          mime,
        };
        ctx.ui.setWidget("image-preview", (_tui, theme) => {
          return {
            render(width: number): string[] {
              const label = theme.fg("accent", theme.bold(`📷 ${name}`));
              const meta = theme.fg("muted", `${lastImageInfo.mime} • ${lastImageInfo.size}`);
              return [theme.bg("customMessageBg", `  ${label}  ${meta}  `)];
            },
            invalidate(): void {},
          };
        });
        ctx.ui.notify(`Image pasted: ${name} (${lastImageInfo.size})`, "info");
      }
      return { action: "continue" };
    }

    // Check for image file paths in text (clipboard paste inserts file paths)
    const imagePaths = findImagePaths(event.text);
    if (imagePaths.length > 0) {
      let remainingText = event.text;
      const attachedImages: Array<{ type: "image"; data: string; mimeType: string }> = [];

      for (const filePath of imagePaths) {
        const mime = getMimeType(filePath);
        if (!mime) continue;

        const name = path.basename(filePath);

        let base64Data: string | null = null;

        try {
          const buffer = fs.readFileSync(filePath);
          base64Data = buffer.toString("base64");
        } catch {
          continue;
        }

        // ImageContent type: { type: "image", data: string, mimeType: string }
        attachedImages.push({
          type: "image",
          data: base64Data,
          mimeType: mime,
        });

        // Remove the file path from the text
        remainingText = remainingText.replace(filePath, "").replace(/\s{2,}/g, " ").trim();

        // Show preview
        lastImageInfo = { name, size: formatSize(Buffer.from(base64Data, "base64").length), mime };
        showPreview(filePath, ctx);
      }

      if (attachedImages.length > 0) {
        // If the message is image-only, add descriptive text so it shows in the fork selector
        // and chat history (pi's UserMessageComponent only renders text, not images).
        if (!remainingText) {
          const imageLabels = lastImageInfo
            ? [`${lastImageInfo.name} (${lastImageInfo.size})`]
            : attachedImages.map((_, i) => `image${i > 0 ? i + 1 : ''}`);
          remainingText = `📷 ${imageLabels.join(", ")}`;
        }
        return {
          action: "transform",
          text: remainingText,
          images: attachedImages,
        };
      }
      return { action: "continue" };
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    clearPreview(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearPreview(ctx);
  });

  pi.registerCommand("image-info", {
    description: "Show info about the last pasted image",
    handler: async (_args, ctx) => {
      if (!lastImageInfo) {
        ctx.ui.notify("No image has been pasted yet", "warning");
        return;
      }
      ctx.ui.notify(
        `Last image: ${lastImageInfo.name} (${lastImageInfo.mime}, ${lastImageInfo.size})`,
        "info",
      );
    },
  });
}
