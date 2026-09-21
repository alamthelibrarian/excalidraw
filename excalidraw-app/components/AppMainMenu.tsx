import { eyeIcon, save } from "@excalidraw/excalidraw/components/icons";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

import { isDevEnv } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";

import { saveDebugState } from "./DebugCanvas";

export const AppMainMenu: React.FC<{
  onCollabDialogOpen: () => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
  isReadonly: boolean;
  theme: Theme | "system";
  refresh: () => void;
  onCloudProjectsOpen: () => void;
}> = React.memo((props) => {
  return (
    <MainMenu>
      {!props.isReadonly && <MainMenu.DefaultItems.LoadScene />}
      {!props.isReadonly && <MainMenu.DefaultItems.SaveToActiveFile />}
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />

      {!props.isReadonly && (
        <MainMenu.Item icon={save} onSelect={props.onCloudProjectsOpen}>
          My Projects
        </MainMenu.Item>
      )}

      {!props.isReadonly && props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.onCollabDialogOpen()}
        />
      )}

      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />

      {!props.isReadonly && <MainMenu.DefaultItems.ClearCanvas />}

      {isDevEnv() && !props.isReadonly && (
        <MainMenu.Item
          icon={eyeIcon}
          onSelect={() => {
            if (window.visualDebug) {
              delete window.visualDebug;
              saveDebugState({ enabled: false });
            } else {
              window.visualDebug = { data: [] };
              saveDebugState({ enabled: true });
            }
            props.refresh();
          }}
        >
          Visual Debug
        </MainMenu.Item>
      )}

      <MainMenu.Separator />
      {!props.isReadonly && <MainMenu.DefaultItems.Preferences />}
      <MainMenu.DefaultItems.ToggleTheme
        allowSystemTheme
        theme={props.theme}
      />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      {!props.isReadonly && (
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      )}
    </MainMenu>
  );
});
