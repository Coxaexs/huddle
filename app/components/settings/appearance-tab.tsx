"use client";

import { useState } from "react";
import { Sparkles, Fish, Plus, Download, Share2, Trash2, Edit3, Globe, Copy, Layers } from "lucide-react";
import { FEATURE_MODULES, FEATURE_MODULE_KEYS, normalizeDisabledModules, type FeatureModuleKey } from "@/lib/features";
import { apiFetch } from "../../lib/client";
import { BUILTIN_THEMES, type Theme, getStoredThemes, saveCustomTheme } from "@/lib/themes";
import { setRetroSoundThemeEnabled, playRetroSound } from "../../lib/msn-sounds";
import { isParticlesEnabled, setParticlesEnabled, setThemeFxEnabled } from "../../lib/theme-fx";
import { Tab, PrideTheme, Density, Backdrop, type AppearanceSubtab } from "./types";
import { LayoutPicker } from "../widgets/layout-picker";

export function AppearanceTab({
  tab,
  handleOpenCreateTheme,
  setImportCodeInput,
  setImportError,
  setImportParsedTheme,
  setIsImportingTheme,
  themeActionNotice,
  appearanceSubtab,
  setAppearanceSubtab,
  customThemes,
  activeThemeId,
  theme,
  themeShareMenuId,
  setThemeShareMenuId,
  handleShareThemeCode,
  themeCopiedId,
  onShareThemeToChat,
  handleShareThemeChat,
  handlePublishTheme,
  handleDeleteCustomTheme,
  handleSelectTheme,
  themeSearchQuery,
  setThemeSearchQuery,
  loadCommunityThemes,
  communityLoading,
  communityThemes,
  setCustomThemes,
  setThemeActionNotice,
  accent,
  setAccent,
  prideTheme,
  setPrideTheme,
  density,
  setDensity,
  backdrop,
  setBackdrop,
  corners,
  setCorners,
  cute,
  setCute,
  blahaj,
  setBlahaj,
  clickParticles,
  setClickParticles,
  retroSounds,
  setRetroSounds,
}: {
  tab: Tab;
  handleOpenCreateTheme: (existing?: Theme) => void;
  setImportCodeInput: React.Dispatch<React.SetStateAction<string>>;
  setImportError: React.Dispatch<React.SetStateAction<string>>;
  setImportParsedTheme: React.Dispatch<React.SetStateAction<Theme | null>>;
  setIsImportingTheme: React.Dispatch<React.SetStateAction<boolean>>;
  themeActionNotice: string;
  appearanceSubtab: AppearanceSubtab;
  setAppearanceSubtab: React.Dispatch<React.SetStateAction<AppearanceSubtab>>;
  customThemes: Theme[];
  activeThemeId: string;
  theme: "cozy" | "legacy" | "light";
  themeShareMenuId: string | null;
  setThemeShareMenuId: React.Dispatch<React.SetStateAction<string | null>>;
  handleShareThemeCode: (th: Theme) => Promise<void>;
  themeCopiedId: string | null;
  onShareThemeToChat: ((theme: Theme) => void) | undefined;
  handleShareThemeChat: (th: Theme) => void;
  handlePublishTheme: (th: Theme) => Promise<void>;
  handleDeleteCustomTheme: (id: string) => void;
  handleSelectTheme: (th: Theme) => void;
  themeSearchQuery: string;
  setThemeSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  loadCommunityThemes: (query?: string) => Promise<void>;
  communityLoading: boolean;
  communityThemes: Theme[];
  setCustomThemes: React.Dispatch<React.SetStateAction<Theme[]>>;
  setThemeActionNotice: React.Dispatch<React.SetStateAction<string>>;
  accent: string;
  setAccent: React.Dispatch<React.SetStateAction<string>>;
  prideTheme: PrideTheme;
  setPrideTheme: React.Dispatch<React.SetStateAction<PrideTheme>>;
  density: Density;
  setDensity: React.Dispatch<React.SetStateAction<Density>>;
  backdrop: Backdrop;
  setBackdrop: React.Dispatch<React.SetStateAction<Backdrop>>;
  corners: number;
  setCorners: React.Dispatch<React.SetStateAction<number>>;
  cute: boolean;
  setCute: React.Dispatch<React.SetStateAction<boolean>>;
  blahaj: boolean;
  setBlahaj: React.Dispatch<React.SetStateAction<boolean>>;
  clickParticles: boolean;
  setClickParticles: React.Dispatch<React.SetStateAction<boolean>>;
  retroSounds: boolean;
  setRetroSounds: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [ambientParticles, setAmbientParticles] = useState<boolean>(() => isParticlesEnabled());
  const [disabledModules, setDisabledModules] = useState<FeatureModuleKey[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("huddle-disabled-modules");
      return raw ? normalizeDisabledModules(JSON.parse(raw)) : [];
    } catch {
      return [];
    }
  });

  const toggleUserModule = (key: FeatureModuleKey, enabled: boolean) => {
    const next = enabled
      ? disabledModules.filter((k) => k !== key)
      : Array.from(new Set([...disabledModules, key]));
    setDisabledModules(next);
    try {
      window.localStorage.setItem("huddle-disabled-modules", JSON.stringify(next));
      if (typeof document !== "undefined") {
        document.documentElement.dataset.cosmetics = next.includes("cosmetics") ? "off" : "on";
      }
      window.dispatchEvent(new CustomEvent("huddle-modules-change", { detail: next }));
    } catch {}
    void apiFetch("/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({ disabledModules: next }),
    }).catch(() => undefined);
  };

  return (
    <>
      {tab === "appearance" && (
            <>
              <LayoutPicker />
              <div className="appearance-choice-row vs-mode-row appearance-sections" role="tablist" aria-label="Appearance sections">
                {([
                  ["installed", "Themes"],
                  ["community", "Community"],
                  ["look", "Customize"],
                  ["extras", "Extras"],
                ] as const).map(([id, label]) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={appearanceSubtab === id}
                    key={id}
                    className={appearanceSubtab === id ? "active" : ""}
                    onClick={() => setAppearanceSubtab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {themeActionNotice && (
                <div className="mb-3 p-2.5 bg-indigo-950/60 border border-indigo-500/40 rounded-lg text-xs text-indigo-200 flex items-center gap-2">
                  <Sparkles size={14} className="text-indigo-400 flex-shrink-0" />
                  <span>{themeActionNotice}</span>
                </div>
              )}

              {appearanceSubtab === "installed" && (
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="modal-hint" style={{ margin: 0 }}>
                    Pick a theme. Fine-tune it under Customize.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="discord-btn primary-indigo text-xs py-1 px-2.5 flex items-center gap-1.5"
                      onClick={() => handleOpenCreateTheme()}
                    >
                      <Plus size={14} /> Create
                    </button>
                    <button
                      type="button"
                      className="discord-btn secondary-gray text-xs py-1 px-2.5 flex items-center gap-1.5"
                      onClick={() => {
                        setImportCodeInput("");
                        setImportError("");
                        setImportParsedTheme(null);
                        setIsImportingTheme(true);
                      }}
                    >
                      <Download size={14} /> Import
                    </button>
                  </div>
                </div>
              )}

              {appearanceSubtab === "installed" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-5">
                  {[...BUILTIN_THEMES, ...customThemes].map((th) => {
                    const isActive = activeThemeId ? activeThemeId === th.id : theme === th.id;
                    const colors = th.colors || {};
                    const isShareOpen = themeShareMenuId === th.id;

                    return (
                      <div
                        key={th.id}
                        className={`p-3 rounded-xl border transition-all ${isActive ? "bg-purple-950/20 border-purple-500 shadow-md ring-1 ring-purple-500/40" : "bg-black/30 border-white/10 hover:border-white/20"}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-white">{th.name}</span>
                              {th.isBuiltin && (
                                <span className="text-[9px] uppercase px-1.5 py-0.2 bg-white/10 text-gray-300 rounded">
                                  Default
                                </span>
                              )}
                              {th.customCss && (
                                <span className="text-[9px] px-1.5 py-0.2 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded font-mono">
                                  CSS
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">
                              {th.description || `Base: ${th.baseTheme}`}
                            </div>
                          </div>

                          <div className="relative">
                            <button
                              type="button"
                              title="Share Theme"
                              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                              onClick={() => setThemeShareMenuId(isShareOpen ? null : th.id)}
                            >
                              <Share2 size={13} />
                            </button>

                            {isShareOpen && (
                              <div
                                className="absolute right-0 top-6 z-50 w-44 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 text-xs text-gray-200"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-1.5 hover:bg-indigo-600 hover:text-white flex items-center gap-2"
                                  onClick={() => {
                                    void handleShareThemeCode(th);
                                    setThemeShareMenuId(null);
                                  }}
                                >
                                  <Copy size={13} />
                                  {themeCopiedId === th.id ? "Copied Code!" : "Copy Share Code"}
                                </button>
                                {onShareThemeToChat && (
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-600 hover:text-white flex items-center gap-2"
                                    onClick={() => {
                                      handleShareThemeChat(th);
                                      setThemeShareMenuId(null);
                                    }}
                                  >
                                    <Sparkles size={13} /> Share to Chat
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-1.5 hover:bg-indigo-600 hover:text-white flex items-center gap-2"
                                  onClick={() => {
                                    void handlePublishTheme(th);
                                    setThemeShareMenuId(null);
                                  }}
                                >
                                  <Globe size={13} /> Publish to Library
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Palette swatches */}
                        <div className="flex items-center gap-1.5 my-2">
                          {[colors.paper, colors.panel, colors.chatBg, colors.lavender, colors.coral, colors.mint].filter(Boolean).map((col, idx) => (
                            <span
                              key={idx}
                              className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                              style={{ background: col }}
                            />
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-white/5">
                          <div className="flex items-center gap-1.5">
                            {!th.isBuiltin && (
                              <>
                                <button
                                  type="button"
                                  className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5"
                                  onClick={() => handleOpenCreateTheme(th)}
                                  title="Edit Theme"
                                >
                                  <Edit3 size={11} /> Edit
                                </button>
                                <button
                                  type="button"
                                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red-950/30"
                                  onClick={() => handleDeleteCustomTheme(th.id)}
                                  title="Delete Theme"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            className={`text-xs px-2.5 py-1 rounded font-medium transition-all ${isActive ? "bg-purple-600 text-white shadow" : "bg-white/10 hover:bg-white/20 text-gray-200"}`}
                            onClick={() => handleSelectTheme(th)}
                          >
                            {isActive ? "✓ Active" : "Apply"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {appearanceSubtab === "community" && (
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      className="discord-text-input text-xs flex-1"
                      placeholder="Search community themes..."
                      value={themeSearchQuery}
                      onChange={(e) => setThemeSearchQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      className="discord-btn secondary-gray text-xs whitespace-nowrap"
                      onClick={() => void loadCommunityThemes(themeSearchQuery)}
                    >
                      Search
                    </button>
                  </div>

                  {communityLoading ? (
                    <div className="text-center py-6 text-xs text-gray-400">Loading community themes…</div>
                  ) : communityThemes.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-400 bg-black/20 rounded-lg border border-white/5">
                      No community themes found yet. Be the first to share one!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {communityThemes.map((th) => {
                        const colors = th.colors || {};

                        return (
                          <div
                            key={th.id}
                            className="p-3 rounded-xl border bg-black/30 border-white/10 hover:border-white/20 transition-all flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs text-white">{th.name}</span>
                                <span className="text-[10px] text-gray-400">
                                  by {th.author?.displayName || "Member"}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-400 line-clamp-1 mt-1">
                                {th.description || `Base: ${th.baseTheme}`}
                              </p>

                              <div className="flex items-center gap-1.5 my-2">
                                {[colors.paper, colors.panel, colors.chatBg, colors.lavender, colors.coral, colors.mint].filter(Boolean).map((col, idx) => (
                                  <span
                                    key={idx}
                                    className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                                    style={{ background: col }}
                                  />
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                              <button
                                type="button"
                                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                                onClick={() => void handleShareThemeCode(th)}
                              >
                                <Copy size={12} /> Copy Code
                              </button>

                              <button
                                type="button"
                                className="discord-btn primary-indigo text-xs py-1 px-2.5 flex items-center gap-1"
                                onClick={() => {
                                  saveCustomTheme(th);
                                  setCustomThemes(getStoredThemes());
                                  handleSelectTheme(th);
                                  setThemeActionNotice(`Installed & applied "${th.name}"!`);
                                  setTimeout(() => setThemeActionNotice(""), 3500);
                                }}
                              >
                                <Download size={12} /> Install & Apply
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {appearanceSubtab === "look" && (
                <>
              <span className="field-label">Accent colour</span>
              <div className="accent-picker-row">
                {["#9d8cf5", "#e0a56a", "#68a8ff", "#49c99a", "#ff8b72", "#f3bd5d", "#e57bd8"].map(
                  (option) => (
                    <button
                      type="button"
                      key={option}
                      aria-label={`Use accent ${option}`}
                      className={accent === option ? "active" : ""}
                      style={{ background: option }}
                      onClick={() => setAccent(option)}
                    />
                  ),
                )}
                <input
                  type="color"
                  value={accent}
                  aria-label="Custom accent colour"
                  onChange={(event) => setAccent(event.target.value)}
                />
              </div>

              <span className="field-label">Pride palette</span>
              <div className="pride-theme-row">
                {([
                  ["off", "Classic"],
                  ["trans", "Trans"],
                  ["pride", "Pride"],
                  ["nonbinary", "Nonbinary"],
                ] as const).map(([option, label]) => (
                  <button
                    type="button"
                    key={option}
                    className={`${option} ${prideTheme === option ? "active" : ""}`}
                    onClick={() => setPrideTheme(option)}
                  >
                    <span className="pride-theme-swatch" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>

              <span className="field-label">Message spacing</span>
              <div className="appearance-choice-row vs-mode-row">
                {(["compact", "cozy", "roomy"] as const).map((option) => (
                  <button
                    type="button"
                    className={density === option ? "active" : ""}
                    key={option}
                    onClick={() => setDensity(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <span className="field-label">Chat backdrop</span>
              <div className="appearance-choice-row vs-mode-row">
                {(["plain", "aurora", "dots"] as const).map((option) => (
                  <button
                    type="button"
                    className={backdrop === option ? "active" : ""}
                    key={option}
                    onClick={() => setBackdrop(option)}
                  >
                    {option === "aurora" ? "Purple + green" : option}
                  </button>
                ))}
              </div>

              <label className="appearance-range">
                <span>Corner roundness <b>{corners}px</b></span>
                <input
                  type="range"
                  min={4}
                  max={28}
                  value={corners}
                  onChange={(event) => setCorners(Number(event.target.value))}
                />
              </label>

              <p className="modal-hint">Animation and motion settings are under Accessibility.</p>
                </>
              )}

              {appearanceSubtab === "extras" && (
                <>
              <label className="appearance-switch cute-appearance-switch">
                <span>
                  <strong className="inline-flex items-center gap-1.5">Cozy Hoffle <Sparkles size={14} /></strong>
                  <small>Room pet, sparkles, tiny charms, and celebrations</small>
                </span>
                <input
                  type="checkbox"
                  checked={cute}
                  onChange={(event) => setCute(event.target.checked)}
                />
              </label>

              <label className="appearance-switch blahaj-appearance-switch">
                <span>
                  <strong className="inline-flex items-center gap-1.5">Desktop buddy <Fish size={14} /></strong>
                  <small>A little companion that matches your theme, with desk tools and break timers</small>
                </span>
                <input
                  type="checkbox"
                  checked={blahaj}
                  onChange={(event) => setBlahaj(event.target.checked)}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong className="inline-flex items-center gap-1.5">Button click particles <Sparkles size={14} /></strong>
                  <small>Themed sparks when you click buttons</small>
                </span>
                <input
                  type="checkbox"
                  checked={clickParticles}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setClickParticles(next);
                    setThemeFxEnabled(next);
                  }}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong className="inline-flex items-center gap-1.5">Profile &amp; background particles <Sparkles size={14} /></strong>
                  <small>Animated scenes on profile cards and backgrounds</small>
                </span>
                <input
                  type="checkbox"
                  checked={ambientParticles}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setAmbientParticles(next);
                    setParticlesEnabled(next);
                  }}
                />
              </label>

              <label className="appearance-switch">
                <span>
                  <strong>Retro 2000s sound effects</strong>
                  <small>MSN-style chimes, nudges and old Windows sounds</small>
                </span>
                <input
                  type="checkbox"
                  checked={retroSounds}
                  onChange={(event) => {
                    const on = event.target.checked;
                    setRetroSounds(on);
                    setRetroSoundThemeEnabled(on);
                    if (on) {
                      playRetroSound("message");
                    }
                  }}
                />
              </label>

              <div className="mt-4 pt-3 border-t border-white/10">
                <span className="settings-label inline-flex items-center gap-1.5">
                  <Layers size={14} /> Features
                </span>
                <p className="text-xs opacity-70 mb-2">
                  Hide what you don&apos;t use to keep chat and slash commands tidy.
                </p>
                {FEATURE_MODULE_KEYS.map((modKey) => {
                  const mod = FEATURE_MODULES[modKey];
                  const isOn = !disabledModules.includes(modKey);
                  return (
                    <label key={modKey} className="appearance-switch">
                      <span>
                        <strong>{mod.label}</strong>
                        <small>{mod.description}</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={(e) => toggleUserModule(modKey, e.target.checked)}
                      />
                    </label>
                  );
                })}
              </div>
                </>
              )}
            </>
          )}
    </>
  );
}
