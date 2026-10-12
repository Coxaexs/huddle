"use client";

import { Tab } from "./types";

export function AccessibilityTab({
  tab,
  avatar,
  chatFontSize,
  displayName,
  alwaysUnderlineLinks,
  setChatFontSize,
  setAlwaysUnderlineLinks,
  displayNameStyles,
  setDisplayNameStyles,
  motion,
  setMotion,
}: {
  tab: Tab;
  avatar: string;
  chatFontSize: number;
  displayName: string;
  alwaysUnderlineLinks: boolean;
  setChatFontSize: React.Dispatch<React.SetStateAction<number>>;
  setAlwaysUnderlineLinks: React.Dispatch<React.SetStateAction<boolean>>;
  displayNameStyles: boolean;
  setDisplayNameStyles: React.Dispatch<React.SetStateAction<boolean>>;
  motion: boolean;
  setMotion: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <>
      {tab === "accessibility" && (
            <div className="space-y-6">
              {/* Live Chat Preview Card matching Screenshot 5 */}
              <div className="settings-preview-box">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Preview</div>
                <div className="bg-[#1e1f22] border border-white/10 rounded-xl p-4 space-y-3">
                  {/* Message 1 */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shrink-0">
                      {avatar || "K"}
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-pink-400" style={{ fontSize: `${chatFontSize}px` }}>{displayName || "kivu"}</span>
                        <span className="text-[10px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded-full border border-pink-500/30 flex items-center gap-1">
                          ❤️ LGBT
                        </span>
                        <span className="text-[11px] text-gray-400">14:48</span>
                      </div>
                      <p className="text-gray-200" style={{ fontSize: `${chatFontSize}px` }}>
                        what happened to all the beans
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="inline-flex items-center gap-1 text-xs bg-indigo-950/60 border border-indigo-500/40 rounded px-2 py-0.5 text-indigo-300">
                          🫐 3
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs bg-white/5 border border-white/10 rounded px-2 py-0.5 text-gray-300">
                          🧱 1
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Message 2 */}
                  <div className="flex items-start gap-3 pt-1">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shrink-0">
                      {avatar || "K"}
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-pink-400" style={{ fontSize: `${chatFontSize}px` }}>{displayName || "kivu"}</span>
                        <span className="text-[10px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded-full border border-pink-500/30 flex items-center gap-1">
                          ❤️ LGBT
                        </span>
                        <span className="text-[11px] text-gray-400">14:48</span>
                      </div>
                      <div className="text-gray-200 flex items-center justify-between" style={{ fontSize: `${chatFontSize}px` }}>
                        <span>
                          here's a link{" "}
                          <a
                            href="#preview"
                            className={`text-indigo-400 hover:text-indigo-300 ${alwaysUnderlineLinks ? "underline" : "hover:underline"}`}
                            onClick={(e) => e.preventDefault()}
                          >
                            https://hoffle.online/accessibility
                          </a>
                        </span>
                        <button
                          type="button"
                          className="primary text-xs px-3 py-1.5 rounded-lg shrink-0 ml-4 font-semibold"
                          onClick={(e) => e.preventDefault()}
                        >
                          Example Button
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Text Readability Section */}
              <div className="space-y-4 pt-2">
                <h3 className="text-base font-bold text-white">Text Readability</h3>

                <div>
                  <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                    <span>Text size in chat</span>
                    <span className="font-bold text-indigo-400" data-testid="chat-font-size-value">{chatFontSize}px</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">Adjust the size of the chat font.</p>

                  {/* Labeled tick slider matching Discord Screenshot 5 */}
                  <div className="relative pt-1 pb-4">
                    <input
                      type="range"
                      min={12}
                      max={24}
                      step={1}
                      value={chatFontSize}
                      aria-label="Chat font size"
                      onChange={(e) => setChatFontSize(Number(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <div className="flex justify-between text-[11px] text-gray-400 mt-2 px-1">
                      {[12, 14, 15, 16, 18, 20, 24].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setChatFontSize(size)}
                          className={`hover:text-white transition-colors cursor-pointer bg-transparent border-0 p-0 text-[11px] ${
                            chatFontSize === size ? "text-indigo-400 font-bold" : "text-gray-400"
                          }`}
                        >
                          {size}px
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between py-3 border-t border-white/10">
                  <div>
                    <div className="text-sm font-semibold text-white">Always underline links</div>
                    <div className="text-xs text-gray-400">Make links stand out more across messages.</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      aria-label="Always underline links"
                      checked={alwaysUnderlineLinks}
                      onChange={(e) => setAlwaysUnderlineLinks(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="flex items-center justify-between py-3 border-t border-white/10">
                  <div>
                    <div className="text-sm font-semibold text-white">Display Name Styles</div>
                    <div className="text-xs text-gray-400">Enable display name styles — including font, effect, and color — across Huddle.</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      aria-label="Display Name Styles"
                      checked={displayNameStyles}
                      onChange={(e) => setDisplayNameStyles(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div className="flex items-center justify-between py-3 border-t border-white/10">
                  <div>
                    <div className="text-sm font-semibold text-white">Interface motion</div>
                    <div className="text-xs text-gray-400">Smooth scrolling and interface micro-animations.</div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      aria-label="Interface motion"
                      checked={motion}
                      onChange={(e) => setMotion(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>
          )}
    </>
  );
}
