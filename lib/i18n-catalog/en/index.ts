/**
 * English source strings, one file per area of the app. lib/i18n.ts spreads
 * them into the English catalog, so every key here is a `MessageKey`; each
 * Turkish file (../tr/) is typed against its English twin, so a missing
 * Turkish string is a compile error.
 */
import { auth } from "./auth";
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

export const EN_APP = {
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
} as const;
