# Codex UI for HypeShell

A HypeBar plugin that opens the open-source `codexapp` frontend as a local,
chromeless development app. Codex continues to work against local projects and
can edit files, run commands, show diffs, and request approvals without requiring
the terminal UI.

## Features

- Compact HypeBar icon that hides and restores a single Codex app window
- Live agent status: AI icon while idle, animated amber while working, and green confirmation when complete
- Clicking a completion opens that exact chat and immediately resets the HypeBar icon
- Dedicated AI icon for the app launcher, task switcher, and dock
- Chromium app window without tabs or an address bar
- Local Codex projects and existing ChatGPT/Codex authentication
- `workspace-write` sandbox with `on-request` approvals
- Localhost-only server with tunnels disabled
- First-launch bootstrap on Linux ARM64 and x86-64
- Browser detection with automatic Ungoogled Chromium installation through Flatpak when needed

## Requirements

- HypeShell 1.5.0 or newer
- Codex CLI, already signed in
- Node.js 18 or newer, npm, and curl
- Ungoogled Chromium, Chromium, Brave, or Google Chrome; when none is installed,
  the launcher installs Ungoogled Chromium from Flathub automatically
- Flatpak is required only for that automatic browser fallback

## Install

Clone the plugin into HypeShell's plugin directory:

```bash
git clone https://github.com/acarlton5/Hype-Plugin-CodexUI \
  ~/.config/HypeShell/plugins/hypeCodexUI
hype ipc plugins enable hypeCodexUI
```

Click **CODEX** on HypeBar. On first launch, the plugin installs the pinned MIT
frontend into `~/.local/share/hype-codex-ui`. Later launches reuse that local
installation. It also installs a local desktop entry and AI icon, so Codex UI
can be launched and pinned like a normal desktop application.

Runtime logs are written to:

```text
~/.local/state/hype-codex-ui/server.log
```

## Security

The launcher patches the frontend listener to `127.0.0.1`, disables Cloudflare
tunneling, and disables automatic browser opening. The local browser app then
connects to `http://127.0.0.1:5900`.

Anyone who can operate the frontend can operate Codex with the permissions of
your user account. Keep the service local and retain Codex approval prompts.

## License

This plugin is MIT licensed. `codexapp` and Codex are separate projects governed
by their respective licenses and terms.


## Optional agent task queue

The task-queue integration is disabled by default. A normal plugin installation
does not create queue folders, start a persistent queue helper, or assume any
company workflow or filesystem layout.

Users who want filesystem-triggered Codex work can opt in by creating any queue
root with this structure:

```text
<queue-root>/
  inbox/
  in-progress/
  completed/
  failed/
```

Then create `~/.config/hype-codex-ui/task-queue.json` with explicit absolute
paths:

```json
{
  "enabled": true,
  "queueRoot": "/absolute/path/to/queue-root",
  "workspaceRoot": "/absolute/path/to/projects",
  "intervalSeconds": 30,
  "sandbox": "workspace-write"
}
```

Restart HypeShell after enabling or disabling the queue. Only `.md` files in
`inbox/` count as tasks. Each task needs YAML frontmatter with a `workspace`
path relative to the configured `workspaceRoot`:

```markdown
---
workspace: MyProject
---

# Goal

Describe the bounded development task and its acceptance checks.
```

The helper performs a local filesystem check first. An empty inbox never starts
Codex and uses no model quota. When a task exists, it is atomically moved to
`in-progress/`; `codex exec --sandbox workspace-write` runs only after that
claim succeeds. The task and its JSONL run record then move to `completed/` or
`failed/`.
