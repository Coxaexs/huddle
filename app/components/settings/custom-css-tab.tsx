"use client";

import { setClientUiCss, CLIENT_UI_CSS_PRESETS } from "@/lib/themes";
import { Tab } from "./types";

export function CustomCssTab({
  tab,
  clientUiCssEnabled,
  handleSaveClientUiCss,
  clientUiCss,
  clientUiNotice,
  setClientUiNotice,
  setLocalClientUiCss,
}: {
  tab: Tab;
  clientUiCssEnabled: boolean;
  handleSaveClientUiCss: (css: string, enabled: boolean) => void;
  clientUiCss: string;
  clientUiNotice: string;
  setClientUiNotice: React.Dispatch<React.SetStateAction<string>>;
  setLocalClientUiCss: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <>
      {tab === "custom_ui_css" && (
            <div className="space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div>
                    <h3 className="text-base font-bold text-white">Enable Client UI Custom CSS</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Injects your personal custom CSS rules across your entire client interface (client-side only).
                    </p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={clientUiCssEnabled}
                      onChange={(e) => {
                        handleSaveClientUiCss(clientUiCss, e.target.checked);
                      }}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-300">Quick Presets:</span>
                    {clientUiNotice && (
                      <span className="text-xs text-emerald-400 font-medium animate-pulse">{clientUiNotice}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {CLIENT_UI_CSS_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all group"
                        onClick={() => {
                          handleSaveClientUiCss(preset.css, true);
                        }}
                      >
                        <div className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">
                          ✨ {preset.name}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1 line-clamp-2">
                          {preset.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-300">CSS Code Editor:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-xs text-gray-300 hover:text-white px-2.5 py-1 rounded bg-white/5 border border-white/10"
                        onClick={() => {
                          void navigator.clipboard.writeText(clientUiCss);
                          setClientUiNotice("CSS copied to clipboard!");
                          setTimeout(() => setClientUiNotice(""), 2000);
                        }}
                      >
                        Copy CSS
                      </button>
                      <button
                        type="button"
                        className="text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20"
                        onClick={() => handleSaveClientUiCss("", false)}
                      >
                        Clear CSS
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={clientUiCss}
                    onChange={(e) => {
                      const next = e.target.value;
                      setLocalClientUiCss(next);
                      setClientUiCss(next, clientUiCssEnabled);
                    }}
                    placeholder={`/* Write custom CSS to style the Huddle interface (personal to this client) */\n:root {\n  --lavender: #a78bfa !important;\n}\n.sidebar {\n  backdrop-filter: blur(14px) !important;\n}`}
                    className="w-full font-mono text-xs p-3 rounded-lg bg-black/40 border border-white/10 text-gray-200 focus:outline-none focus:border-indigo-500"
                    style={{ resize: "vertical", minHeight: 220 }}
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[11px] text-gray-400">
                      Target selectors: <code className="text-indigo-300">.sidebar</code>, <code className="text-indigo-300">.chat-panel</code>, <code className="text-indigo-300">.message</code>, <code className="text-indigo-300">.composer</code>, <code className="text-indigo-300">.member-panel</code>
                    </p>
                    <button
                      type="button"
                      className="primary px-4 py-1.5 rounded-lg text-xs font-semibold"
                      onClick={() => handleSaveClientUiCss(clientUiCss, true)}
                    >
                      Save & Apply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </>
  );
}
