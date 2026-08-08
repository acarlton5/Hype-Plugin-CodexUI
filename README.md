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

## Agent task queue

The plugin checks for queued work without calling a model. It looks for the
first existing queue at `~/DevBox/Projects/.agent-tasks` or
`~/Projects/.agent-tasks` and creates these directories:

```text
.agent-tasks/
  inbox/
  in-progress/
  completed/
  failed/
```

Only `.md` files in `inbox/` count as tasks. Each task needs YAML frontmatter
with a `workspace` path relative to the directory containing `.agent-tasks`:

```markdown
---
workspace: MyProject
---

# Goal

Describe the bounded development task and its acceptance checks.
```

The watcher polls locally every 30 seconds. An empty inbox performs no Codex
request and uses no model quota. When a task exists, the watcher atomically
moves it to `in-progress/`, runs `codex exec --sandbox workspace-write`, then
moves the task and its JSONL run record to `completed/` or `failed/`.

Override paths or disable the worker with
`~/.config/hype-codex-ui/task-queue.json`:

```json
{
  "enabled": true,
  "queueRoot": "/absolute/path/to/.agent-tasks",
  "workspaceRoot": "/absolute/path/to/projects",
  "intervalSeconds": 30,
  "sandbox": "workspace-write"
}
```
