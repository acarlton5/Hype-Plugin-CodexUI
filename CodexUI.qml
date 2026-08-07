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
        ToastService.showInfo("Codex UI", "Opening local development workspace…");
    }

    pillClickAction: function() {
        root.launchCodex();
    }

    horizontalBarPill: Component {
        Row {
            spacing: Theme.spacingXS

            HypeIcon {
                anchors.verticalCenter: parent.verticalCenter
                name: "code"
                color: Theme.primary
                size: Theme.iconSize - 3
            }

            StyledText {
                anchors.verticalCenter: parent.verticalCenter
                text: "CODEX"
                color: Theme.primary
                font.pixelSize: Theme.fontSizeMedium
                font.weight: Font.Bold
            }
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
