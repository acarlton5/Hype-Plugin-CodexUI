import QtQuick
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Widgets
import qs.Modules.Plugins

PluginComponent {
    id: root

    property string activityState: "idle"
    property string completedThreadId: ""
    property bool launchPending: false
    readonly property string launcherPath: Qt.resolvedUrl("scripts/launch-codex-ui").toString().replace("file://", "")
    readonly property string watcherPath: Qt.resolvedUrl("scripts/watch-codex-activity.js").toString().replace("file://", "")
    readonly property string taskQueuePath: Qt.resolvedUrl("scripts/watch-task-queue.js").toString().replace("file://", "")
    readonly property url idleIconPath: Qt.resolvedUrl("assets/codexui-icon.svg")

    function launchCodex() {
        if (launchPending)
            return;
        launchPending = true;
        launchDebounce.restart();
        const args = [launcherPath];
        if (activityState === "complete" && completedThreadId.length > 0)
            args.push(completedThreadId);
        Quickshell.execDetached(args);
        activityState = "idle";
        completedThreadId = "";
    }

    function updateActivity(message) {
        const parts = message.split("\t");
        const state = parts[0];
        if (state === "idle" || state === "working" || state === "complete") {
            activityState = state;
            completedThreadId = state === "complete" ? parts.slice(1).join("\t") : "";
        }
    }

    pillClickAction: function() {
        root.launchCodex();
    }
    Timer {
        id: launchDebounce
        interval: 1500
        repeat: false
        onTriggered: root.launchPending = false
    }


    Process {
        id: activityWatcher
        running: true
        command: ["node", root.watcherPath]

        stdout: SplitParser {
            onRead: data => root.updateActivity(data.trim())
        }

        stderr: SplitParser {
            onRead: data => console.warn("Codex activity watcher:", data.trim())
        }
    }

    Process {
        id: taskQueueWatcher
        running: true
        command: ["node", root.taskQueuePath]

        stdout: SplitParser {
            onRead: data => root.updateActivity(data.trim())
        }

        stderr: SplitParser {
            onRead: data => console.warn("Codex task queue:", data.trim())
        }
    }

    component StatusIcon: Item {
        implicitWidth: Theme.iconSize + 2
        implicitHeight: Theme.iconSize + 2

        Image {
            anchors.centerIn: parent
            width: Theme.iconSize + 2
            height: Theme.iconSize + 2
            source: root.idleIconPath
            fillMode: Image.PreserveAspectFit
            smooth: true
            visible: root.activityState === "idle"
        }

        HypeIcon {
            anchors.centerIn: parent
            name: root.activityState === "complete" ? "check_circle" : "progress_activity"
            color: root.activityState === "complete" ? Theme.success : Theme.warning
            size: Theme.iconSize
            visible: root.activityState !== "idle"

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
