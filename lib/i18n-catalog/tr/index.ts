/** Turkish (tr): complete, one file per area mirroring ../en/. */
import { auth } from "./auth";
import { core } from "./core";
import { security } from "./security";
import { settings } from "./settings";
import { account } from "./account";
import { presence } from "./presence";
import { shortcuts } from "./shortcuts";
import { tutorial } from "./tutorial";
import { sidebar } from "./sidebar";
import { chat } from "./chat";
import { menus } from "./menus";
import { friends } from "./friends";
import { dialogs } from "./dialogs";
import { userSettings } from "./userSettings";
import { serverSettings } from "./serverSettings";
import { voice } from "./voice";
import { features } from "./features";
import { admin } from "./admin";
import { landing } from "./landing";
import { commands } from "./commands";
import { safety } from "./safety";
import { mascot } from "./mascot";
import { channelPerms } from "./channelPerms";
import { discordMove } from "./discordMove";

export const TR = {
  ...core,
  ...auth,
  ...security,
  ...settings,
  ...account,
  ...presence,
  ...shortcuts,
  ...tutorial,
  ...sidebar,
  ...chat,
  ...menus,
  ...friends,
  ...dialogs,
  ...userSettings,
  ...serverSettings,
  ...voice,
  ...features,
  ...admin,
  ...landing,
  ...commands,
  ...safety,
  ...mascot,
  ...channelPerms,
  ...discordMove,
};
