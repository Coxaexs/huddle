"use client";

import { useEffect, useState } from "react";
import { Coins, Package, ScrollText, Trash2, X } from "lucide-react";
import {
  emptyPartyStash,
  splitCurrency,
  totalGpValue,
  type PartyCurrency,
  type PartyQuest,
  type PartyStashState,
} from "@/lib/party-stash";
import { apiFetch } from "../lib/client";
import { useI18n } from "../lib/i18n-context";

const COINS: Array<keyof PartyCurrency> = ["pp", "gp", "ep", "sp", "cp"];

function formatCoins(c: PartyCurrency): string {
  const parts = COINS.filter((k) => c[k] > 0).map((k) => `${c[k]} ${k}`);
  return parts.length ? parts.join(", ") : "0 cp";
}

export function PartyStashPanel({
  serverId,
  channelId,
  onClose,
}: {
  serverId: string;
  channelId?: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"coins" | "loot" | "quests">("coins");
  const [state, setState] = useState<PartyStashState>(() => emptyPartyStash());
  const [coinDraft, setCoinDraft] = useState<PartyCurrency>(() => emptyPartyStash().currency);
  const [splitCount, setSplitCount] = useState(4);
  const [splitNotice, setSplitNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Loot form
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [itemHolder, setItemHolder] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const [itemAttune, setItemAttune] = useState(false);

  // Quest form
  const [questTitle, setQuestTitle] = useState("");
  const [questGiver, setQuestGiver] = useState("");
  const [questNotes, setQuestNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ state: PartyStashState }>(
      `/api/integrations/dnd/stash?serverId=${encodeURIComponent(serverId)}`,
    )
      .then((res) => {
        if (cancelled) return;
        setState(res.state);
        setCoinDraft(res.state.currency);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  useEffect(() => {
    const onSocket = (event: Event) => {
      const detail = (event as CustomEvent<{ serverId?: string; state?: PartyStashState }>).detail;
      if (detail?.serverId === serverId && detail.state) {
        setState(detail.state);
        setCoinDraft(detail.state.currency);
      }
    };
    window.addEventListener("hoffle:dnd-stash", onSocket);
    return () => window.removeEventListener("hoffle:dnd-stash", onSocket);
  }, [serverId]);

  async function postAction(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await apiFetch<{
        state: PartyStashState;
        split?: { perPlayer: PartyCurrency; remainder: PartyCurrency };
      }>("/api/integrations/dnd/stash", {
        method: "POST",
        body: JSON.stringify({ serverId, channelId, ...payload }),
      });
      setState(res.state);
      setCoinDraft(res.state.currency);
      return res;
    } finally {
      setSaving(false);
    }
  }

  const previewSplit = splitCurrency(coinDraft, splitCount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("stash.title")}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-[var(--line)] bg-[var(--panel,var(--paper))] text-[var(--ink)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Coins size={16} className="text-amber-400" />
            <span>{t("stash.title")}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dialog.close")}
            className="p-1 rounded hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-2 border-b border-[var(--line)] text-xs">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-t-md font-semibold flex items-center gap-1.5 ${
              tab === "coins" ? "bg-[var(--lavender)] text-black" : "opacity-75 hover:opacity-100"
            }`}
            onClick={() => setTab("coins")}
          >
            <Coins size={13} />
            {t("stash.tab.coins")}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-t-md font-semibold flex items-center gap-1.5 ${
              tab === "loot" ? "bg-[var(--lavender)] text-black" : "opacity-75 hover:opacity-100"
            }`}
            onClick={() => setTab("loot")}
          >
            <Package size={13} />
            {t("stash.tab.loot")} ({state.items.length})
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-t-md font-semibold flex items-center gap-1.5 ${
              tab === "quests" ? "bg-[var(--lavender)] text-black" : "opacity-75 hover:opacity-100"
            }`}
            onClick={() => setTab("quests")}
          >
            <ScrollText size={13} />
            {t("stash.tab.quests")} ({state.quests.filter((q) => q.status === "active").length})
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {tab === "coins" && (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2">
                {COINS.map((coin) => (
                  <label key={coin} className="flex flex-col gap-1">
                    <span className="uppercase font-bold opacity-75">{coin}</span>
                    <input
                      type="number"
                      min={0}
                      value={coinDraft[coin]}
                      onChange={(e) =>
                        setCoinDraft((prev) => ({
                          ...prev,
                          [coin]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        }))
                      }
                      className="rounded border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm font-semibold"
                    />
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-400">
                  {t("stash.totalValue", { gp: totalGpValue(coinDraft) })}
                </span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void postAction({ action: "update-currency", currency: coinDraft })}
                  className="px-3 py-1.5 rounded bg-[var(--lavender)] text-black font-bold"
                >
                  {t("stash.saveCoins")}
                </button>
              </div>

              <div className="rounded-lg border border-[var(--line)] p-3 space-y-2 bg-black/15">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 font-semibold">
                    <span>{t("stash.splitAcross")}</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={splitCount}
                      onChange={(e) => setSplitCount(Math.max(1, Math.min(20, Math.floor(Number(e.target.value) || 1))))}
                      className="w-14 rounded border border-[var(--line)] bg-transparent px-2 py-1 text-center"
                    />
                    <span>{t("stash.playersUnit")}</span>
                  </label>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      await postAction({ action: "update-currency", currency: coinDraft });
                      const res = await postAction({ action: "split-currency", count: splitCount });
                      if (res.split) {
                        setSplitNotice(
                          t("stash.splitApplied", { share: formatCoins(res.split.perPlayer) }),
                        );
                      }
                    }}
                    className="px-3 py-1.5 rounded border border-amber-400/50 bg-amber-500/20 font-bold hover:bg-amber-500/30"
                  >
                    {t("stash.splitNow")}
                  </button>
                </div>
                <p className="opacity-80 m-0">
                  {t("stash.splitPreview", {
                    share: formatCoins(previewSplit.perPlayer),
                    rem: formatCoins(previewSplit.remainder),
                  })}
                </p>
                {splitNotice && <p className="text-emerald-400 font-semibold m-0">{splitNotice}</p>}
              </div>
            </div>
          )}

          {tab === "loot" && (
            <div className="space-y-3">
              <form
                className="grid grid-cols-2 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!itemName.trim()) return;
                  void postAction({
                    action: "add-item",
                    item: {
                      name: itemName.trim(),
                      qty: itemQty,
                      holder: itemHolder.trim() || undefined,
                      notes: itemNotes.trim() || undefined,
                      attunement: itemAttune,
                    },
                  }).then(() => {
                    setItemName("");
                    setItemQty(1);
                    setItemHolder("");
                    setItemNotes("");
                    setItemAttune(false);
                  });
                }}
              >
                <input
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder={t("stash.itemName")}
                  className="col-span-2 rounded border border-[var(--line)] bg-transparent px-2.5 py-1.5"
                />
                <input
                  type="number"
                  min={1}
                  value={itemQty}
                  onChange={(e) => setItemQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  aria-label={t("stash.qty")}
                  className="rounded border border-[var(--line)] bg-transparent px-2.5 py-1.5"
                />
                <input
                  value={itemHolder}
                  onChange={(e) => setItemHolder(e.target.value)}
                  placeholder={t("stash.holder")}
                  className="rounded border border-[var(--line)] bg-transparent px-2.5 py-1.5"
                />
                <input
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder={t("stash.notes")}
                  className="col-span-2 rounded border border-[var(--line)] bg-transparent px-2.5 py-1.5"
                />
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={itemAttune}
                    onChange={(e) => setItemAttune(e.target.checked)}
                  />
                  <span>{t("stash.attunement")}</span>
                </label>
                <button
                  type="submit"
                  disabled={saving || !itemName.trim()}
                  className="justify-self-end px-3 py-1.5 rounded bg-[var(--lavender)] text-black font-bold"
                >
                  {t("stash.addItem")}
                </button>
              </form>

              {state.items.length === 0 ? (
                <p className="opacity-60 text-center py-4">{t("stash.emptyLoot")}</p>
              ) : (
                <div className="space-y-1.5">
                  {state.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-2 rounded border border-[var(--line)] p-2"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {item.qty > 1 ? `${item.qty}× ` : ""}
                          {item.name}
                          {item.attunement && (
                            <span className="ml-1.5 text-[10px] px-1 rounded bg-purple-500/20 text-purple-300">
                              {t("stash.attunement")}
                            </span>
                          )}
                        </div>
                        {(item.holder || item.notes) && (
                          <div className="opacity-70 text-[11px]">
                            {[item.holder, item.notes].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void postAction({ action: "remove-item", itemId: item.id })}
                        className="p-1 opacity-60 hover:opacity-100 hover:text-rose-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "quests" && (
            <div className="space-y-3">
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!questTitle.trim()) return;
                  void postAction({
                    action: "add-quest",
                    quest: {
                      title: questTitle.trim(),
                      giver: questGiver.trim() || undefined,
                      notes: questNotes.trim() || undefined,
                      status: "active",
                    },
                  }).then(() => {
                    setQuestTitle("");
                    setQuestGiver("");
                    setQuestNotes("");
                  });
                }}
              >
                <input
                  value={questTitle}
                  onChange={(e) => setQuestTitle(e.target.value)}
                  placeholder={t("stash.questTitle")}
                  className="w-full rounded border border-[var(--line)] bg-transparent px-2.5 py-1.5"
                />
                <div className="flex gap-2">
                  <input
                    value={questGiver}
                    onChange={(e) => setQuestGiver(e.target.value)}
                    placeholder={t("stash.questGiver")}
                    className="flex-1 rounded border border-[var(--line)] bg-transparent px-2.5 py-1.5"
                  />
                  <button
                    type="submit"
                    disabled={saving || !questTitle.trim()}
                    className="px-3 py-1.5 rounded bg-[var(--lavender)] text-black font-bold"
                  >
                    {t("stash.addQuest")}
                  </button>
                </div>
                <input
                  value={questNotes}
                  onChange={(e) => setQuestNotes(e.target.value)}
                  placeholder={t("stash.notes")}
                  className="w-full rounded border border-[var(--line)] bg-transparent px-2.5 py-1.5"
                />
              </form>

              {state.quests.length === 0 ? (
                <p className="opacity-60 text-center py-4">{t("stash.emptyQuests")}</p>
              ) : (
                <div className="space-y-1.5">
                  {state.quests.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-start justify-between gap-2 rounded border border-[var(--line)] p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold flex items-center gap-2">
                          <span className={q.status === "completed" ? "line-through opacity-70" : ""}>
                            {q.title}
                          </span>
                          <select
                            value={q.status}
                            onChange={(e) =>
                              void postAction({
                                action: "update-quest",
                                questId: q.id,
                                quest: { status: e.target.value as PartyQuest["status"] },
                              })
                            }
                            className="rounded border border-[var(--line)] bg-[var(--paper)] px-1.5 py-0.5 text-[10px]"
                          >
                            <option value="active">{t("stash.status.active")}</option>
                            <option value="completed">{t("stash.status.completed")}</option>
                            <option value="failed">{t("stash.status.failed")}</option>
                          </select>
                        </div>
                        {(q.giver || q.notes) && (
                          <div className="opacity-70 text-[11px]">
                            {[q.giver, q.notes].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void postAction({ action: "remove-quest", questId: q.id })}
                        className="p-1 opacity-60 hover:opacity-100 hover:text-rose-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
