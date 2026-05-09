# pi-image-paste

Image paste preview extension for [pi](https://github.com/earendil-works/pi-coding-agent).

Detects images pasted from the clipboard (Ctrl+V) and shows:
- A notification with image name and size
- An inline preview widget above the editor (if your terminal supports it)

## Install

```bash
# From local path
pi install /path/to/pi-image-paste

# Or symlink into extensions
ln -s /path/to/pi-image-paste/extensions/image-paste.ts ~/.pi/agent/extensions/
```

## Requirements

- `wl-clipboard` (Wayland) or `xclip` (X11) for clipboard image reading

## How it works

When you paste an image into pi, the clipboard handler writes the image to a temporary file and inserts the file path as text. This extension intercepts the input, reads the image file, converts it to base64, and attaches it as a proper `ImageContent` so the LLM can see it directly. It also shows a preview widget and notification.

## Commands

- `/image-info` — Show info about the last pasted image
