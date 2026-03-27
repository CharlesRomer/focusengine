# Compass — Claude Code Local Config

## Usage

```bash
# Normal — respects your permission settings
claude

# Yolo mode — bypasses all permission prompts (this repo only)
./cc-yolo
```

`./cc-yolo` only affects this repo. It does not touch global Claude settings or your shell profile.

## What's in this directory

- `settings.local.json` — repo-local permissions + hook config (gitignored)
- `hooks/validate.sh` — runs TypeScript/Python checks after file edits
- `hooks/README.md` — explains what hooks do and how to disable them
- `README.md` — this file
