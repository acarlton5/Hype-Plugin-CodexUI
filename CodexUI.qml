import QtQuick
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Widgets
import qs.Modules.Plugins

PluginComponent {
    id: root

    property string activityState: "idle"
    readonly property string launcherPath: Qt.resolvedUrl("scripts/launch-codex-ui").toString().replace("file://", "")
    readonly property string watcherCode: `
const fs = require("fs");
const path = require("path");
const home = process.env.HOME || "";
const roots = [
  path.join(process.env.XDG_DATA_HOME || path.join(home, ".local/share"), "hype-codex-ui"),
  path.join(process.env.XDG_DATA_HOME || path.join(home, ".local/share"), "codex-ui")
];
let WebSocketImpl = null;
for (const root of roots) {
  const candidate = path.join(root, "node_modules/ws");
  if (fs.existsSync(candidate)) { WebSocketImpl = require(candidate); break; }
}
if (!WebSocketImpl) process.exit(0);
const active = new Set();
let completionTimer = null;
let retryTimer = null;
function emit(state) { process.stdout.write(state + "\n"); }
function turnId(params) {
  const turn = params && typeof params.turn === "object" ? params.turn : {};
  return String(turn.id || params.turnId || params.turn_id || "unknown");
}
function connect() {
  const ws = new WebSocketImpl("ws://127.0.0.1:5900/codex-api/ws");
  ws.on("open", () => { if (active.size === 0) emit("idle"); });
  ws.on("message", data => {
    let event;
    try { event = JSON.parse(String(data)); } catch { return; }
    if (event.method === "turn/started") {
      clearTimeout(completionTimer);
      active.add(turnId(event.params || {}));
      emit("working");
    } else if (event.method === "turn/completed") {
      active.delete(turnId(event.params || {}));
      if (active.size > 0) { emit("working"); return; }
      emit("complete");
      clearTimeout(completionTimer);
      completionTimer = setTimeout(() => emit("idle"), 8000);
    }
  });
  ws.on("close", () => { clearTimeout(retryTimer); retryTimer = setTimeout(connect, 2000); });
  ws.on("error", () => ws.close());
}
emit("idle");
connect();
`

    function launchCodex() {
        Quickshell.execDetached([launcherPath]);
    }

    function updateActivity(state) {
        if (state === "idle" || state === "working" || state === "complete")
            activityState = state;
    }

    pillClickAction: function() {
        root.launchCodex();
    }

    Process {
        id: activityWatcher
        running: true
        command: ["node", "-e", root.watcherCode]

        stdout: SplitParser {
            onRead: data => root.updateActivity(data.trim())
        }
    }

    component StatusIcon: Item {
        implicitWidth: Theme.iconSize + 2
        implicitHeight: Theme.iconSize + 2

        HypeIcon {
            id: icon
            anchors.centerIn: parent
            name: root.activityState === "working" ? "progress_activity"
                : root.activityState === "complete" ? "check_circle" : "code"
            color: root.activityState === "working" ? Theme.warning
                : root.activityState === "complete" ? Theme.success : Theme.primary
            size: Theme.iconSize

            RotationAnimation on rotation {
                running: root.activityState === "working"
                from: 0
                to: 360
                duration: 1100
                loops: Animation.Infinite
            }
        }
    }

    horizontalBarPill: Component {
        StatusIcon {}
    }

    verticalBarPill: Component {
        StatusIcon {}
    }
}
