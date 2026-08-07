import QtQuick
import Quickshell
import qs.Common
import qs.Services
import qs.Widgets
import qs.Modules.Plugins

PluginComponent {
    id: root

    readonly property string launcherPath: Qt.resolvedUrl("scripts/launch-codex-ui").toString().replace("file://", "")

    function launchCodex() {
        Quickshell.execDetached([launcherPath]);
    }

    pillClickAction: function() {
        root.launchCodex();
    }

    horizontalBarPill: Component {
        HypeIcon {
            name: "code"
            color: Theme.primary
            size: Theme.iconSize
        }
    }

    verticalBarPill: Component {
        HypeIcon {
            name: "code"
            color: Theme.primary
            size: Theme.iconSize
        }
    }
}
