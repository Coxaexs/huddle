"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Lightbulb,
  Bug,
  Zap,
  MessageSquare,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Inbox,
  User as UserIcon,
  Search,
  MessageCircle,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "../lib/client";
import { Avatar } from "./avatar";
import type { RequestCategory, RequestStatus, UserRequest } from "@/lib/requests";

interface RequestsTabProps {
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    avatarUrl?: string | null;
    color: string;
    is_admin?: number;
  };
  onOpenDm?: (userId: string) => void;
  onCloseSettings?: () => void;
}

const KIWI_USER_ID = "b4203f0e-38a7-43f1-b1b5-374116afb49d";
const FLO_USER_ID = "ac9e8e27-6cd9-4df1-af7a-afd85a59caa0";

const CATEGORIES: Array<{
  id: RequestCategory;
  label: string;
  icon: typeof Lightbulb;
  description: string;
  color: string;
}> = [
  {
    id: "feature",
    label: "Feature Request",
    icon: Lightbulb,
    description: "Suggest a brand new idea or feature",
    color: "#38bdf8",
  },
  {
    id: "bug",
    label: "Bug Report",
    icon: Bug,
    description: "Report an issue, glitch, or unexpected behavior",
    color: "#f87171",
  },
  {
    id: "improvement",
    label: "Improvement",
    icon: Zap,
    description: "Enhance or polish an existing part of Huddle",
    color: "#fbbf24",
  },
  {
    id: "other",
    label: "General Request",
    icon: MessageSquare,
    description: "Feedback, questions, or general suggestions",
    color: "#a78bfa",
  },
];

const STATUS_CONFIG: Record<
  RequestStatus,
  { label: string; icon: typeof Clock; badgeClass: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    badgeClass: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  },
  in_progress: {
    label: "In Progress",
    icon: Zap,
    badgeClass: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    badgeClass: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  },
  declined: {
    label: "Declined",
    icon: XCircle,
    badgeClass: "bg-rose-500/15 text-rose-300 border border-rose-500/30",
  },
};

export function RequestsTab({ user, onOpenDm, onCloseSettings }: RequestsTabProps) {
  const [subtab, setSubtab] = useState<"submit" | "mine" | "inbox">("submit");
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [isHandler, setIsHandler] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [category, setCategory] = useState<RequestCategory>("feature");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Inbox filters
  const [inboxStatusFilter, setInboxStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadRequests = useCallback(
    async (showInbox = false) => {
      setLoading(true);
      try {
        const query = showInbox ? "?all=true" : "";
        const data = await apiFetch<{
          requests: UserRequest[];
          isHandler: boolean;
        }>(`/api/requests${query}`);
        setRequests(data.requests || []);
        setIsHandler(data.isHandler || false);
      } catch (err) {
        console.error("Failed to fetch requests:", err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadRequests(subtab === "inbox");
  }, [subtab, loadRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setSubmitError("Please provide a title for your request.");
      return;
    }
    if (!details.trim()) {
      setSubmitError("Please include some details describing your request.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const data = await apiFetch<{
        request: UserRequest;
        deliveredTo: string[];
      }>("/api/requests", {
        method: "POST",
        body: JSON.stringify({ category, title, details }),
      });

      const recipientText =
        data.deliveredTo && data.deliveredTo.length > 0
          ? `Delivered directly to ${data.deliveredTo.join(" and ")} via DM!`
          : "Delivered to kiwi and flo via DM!";

      setSubmitSuccess(
        `Your request was sent successfully! ${recipientText}`,
      );
      setTitle("");
      setDetails("");
      // Refresh requests list
      void loadRequests(subtab === "inbox");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to send request.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (requestId: string, nextStatus: RequestStatus) => {
    setUpdatingId(requestId);
    try {
      const res = await apiFetch<{ request: UserRequest }>(
        `/api/requests/${requestId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, ...res.request } : r)),
      );
    } catch (err) {
      console.error("Failed to update request status:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveNote = async (requestId: string) => {
    setUpdatingId(requestId);
    try {
      const res = await apiFetch<{ request: UserRequest }>(
        `/api/requests/${requestId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ responseNote: noteDraft.trim() || null }),
        },
      );
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, ...res.request } : r)),
      );
      setEditingNoteId(null);
      setNoteDraft("");
    } catch (err) {
      console.error("Failed to save note:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm("Are you sure you want to delete this request?")) return;
    try {
      await apiFetch(`/api/requests/${requestId}`, { method: "DELETE" });
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      console.error("Failed to delete request:", err);
    }
  };

  const openDmWith = (targetId: string) => {
    if (onOpenDm) {
      onOpenDm(targetId);
      if (onCloseSettings) onCloseSettings();
    }
  };

  const filteredInboxRequests = useMemo(() => {
    return requests.filter((r) => {
      if (inboxStatusFilter !== "all" && r.status !== inboxStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = r.title.toLowerCase().includes(q);
        const matchDetails = r.details.toLowerCase().includes(q);
        const matchUser =
          r.user?.username.toLowerCase().includes(q) ||
          r.user?.displayName.toLowerCase().includes(q);
        return matchTitle || matchDetails || matchUser;
      }
      return true;
    });
  }, [requests, inboxStatusFilter, searchQuery]);

  const pendingCount = useMemo(() => {
    return requests.filter((r) => r.status === "pending").length;
  }, [requests]);

  const formatDate = (iso: string) => {
    try {
      const date = new Date(iso);
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year:
          date.getFullYear() !== new Date().getFullYear()
            ? "numeric"
            : undefined,
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col gap-5 text-gray-100 max-w-3xl pb-10">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-r from-emerald-950/40 via-purple-950/30 to-blue-950/40 p-5 shadow-lg backdrop-blur-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sparkles size={18} />
              </span>
              <h3 className="text-xl font-bold tracking-tight text-white">
                Make a Request
              </h3>
            </div>
            <p className="mt-1.5 text-xs text-gray-300 max-w-xl leading-relaxed">
              Have an idea, found a bug, or want a feature added? Submit it here.
              Every request is automatically delivered straight to{" "}
              <strong className="text-emerald-400">kiwi</strong> and{" "}
              <strong className="text-purple-400">flo</strong> (@..) in their direct
              messages!
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openDmWith(KIWI_USER_ID)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-gray-200 transition-colors flex items-center gap-1.5"
              title="Open direct message with kiwi"
            >
              <span>🥝</span>
              <span>DM Kiwi</span>
            </button>
            <button
              type="button"
              onClick={() => openDmWith(FLO_USER_ID)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-gray-200 transition-colors flex items-center gap-1.5"
              title="Open direct message with flo"
            >
              <span>Flo (@..)</span>
              <MessageCircle size={13} className="text-purple-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Subtab Navigation */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setSubtab("submit")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            subtab === "submit"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Send size={14} />
          <span>New Request</span>
        </button>

        <button
          type="button"
          onClick={() => setSubtab("mine")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            subtab === "mine"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Clock size={14} />
          <span>My Requests</span>
        </button>

        {isHandler && (
          <button
            type="button"
            onClick={() => setSubtab("inbox")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ml-auto ${
              subtab === "inbox"
                ? "bg-purple-600 text-white shadow-md shadow-purple-900/30"
                : "text-purple-300 hover:text-white hover:bg-purple-900/20 border border-purple-500/20"
            }`}
          >
            <Inbox size={14} />
            <span>Staff Inbox</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-black">
                {pendingCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Tab 1: Submit Form */}
      {subtab === "submit" && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {submitSuccess && (
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{submitSuccess}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSubtab("mine")}
                    className="underline hover:text-white"
                  >
                    View in My Requests →
                  </button>
                </div>
              </div>
            </div>
          )}

          {submitError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs">
              <AlertCircle size={15} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Category Cards */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2">
              Request Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "bg-white/10 border-emerald-500/60 shadow-sm shadow-emerald-500/10 ring-1 ring-emerald-500/40"
                        : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20"
                    }`}
                  >
                    <span
                      className="p-1.5 rounded-lg mb-2"
                      style={{
                        backgroundColor: `${cat.color}20`,
                        color: cat.color,
                      }}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="text-xs font-semibold text-white">
                      {cat.label}
                    </span>
                    <span className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">
                      {cat.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="req-title" className="text-xs font-semibold text-gray-300">
                Title / Summary
              </label>
              <span className="text-[10px] text-gray-500">{title.length}/150</span>
            </div>
            <input
              id="req-title"
              type="text"
              value={title}
              maxLength={150}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Add custom soundboard, Discord server sync, Fix mic gate..."
              className="w-full px-3.5 py-2.5 rounded-lg bg-black/30 border border-white/15 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/80 transition-colors"
            />
          </div>

          {/* Details Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="req-details" className="text-xs font-semibold text-gray-300">
                Description & Details
              </label>
              <span className="text-[10px] text-gray-500">{details.length}/4000</span>
            </div>
            <textarea
              id="req-details"
              rows={5}
              value={details}
              maxLength={4000}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Explain your idea, what you'd like it to do, or any helpful context. The more details you share, the better!"
              className="w-full px-3.5 py-2.5 rounded-lg bg-black/30 border border-white/15 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/80 transition-colors resize-y min-h-[120px]"
            />
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-gray-400">
              Directly notified: <strong>kiwi</strong> & <strong>flo</strong>
            </span>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !details.trim()}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs text-white shadow-md transition-all flex items-center gap-2"
            >
              <Send size={14} className={submitting ? "animate-pulse" : ""} />
              <span>{submitting ? "Sending..." : "Submit Request"}</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: My Requests */}
      {subtab === "mine" && (
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="py-12 text-center text-xs text-gray-400">
              Loading requests...
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
              <Lightbulb size={32} className="mx-auto text-gray-500 mb-2" />
              <p className="text-sm font-semibold text-gray-300">
                No requests submitted yet
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                Got a suggestion or found an issue? Use the New Request tab to
                send a direct note to kiwi and flo.
              </p>
              <button
                type="button"
                onClick={() => setSubtab("submit")}
                className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
              >
                Create Request
              </button>
            </div>
          ) : (
            requests.map((req) => {
              const statusInfo = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusInfo.icon;
              const catInfo =
                CATEGORIES.find((c) => c.id === req.category) || CATEGORIES[0];
              const CatIcon = catInfo.icon;

              return (
                <div
                  key={req.id}
                  className="p-4 rounded-xl border border-white/10 bg-white/[0.03] flex flex-col gap-3 transition-colors hover:border-white/15"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{
                          backgroundColor: `${catInfo.color}15`,
                          color: catInfo.color,
                          border: `1px solid ${catInfo.color}30`,
                        }}
                      >
                        <CatIcon size={12} />
                        <span>{catInfo.label}</span>
                      </span>

                      <span
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${statusInfo.badgeClass}`}
                      >
                        <StatusIcon size={12} />
                        <span>{statusInfo.label}</span>
                      </span>

                      <span className="text-[11px] text-gray-500">
                        {formatDate(req.createdAt)}
                      </span>
                    </div>

                    {req.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(req.id)}
                        className="text-gray-500 hover:text-rose-400 transition-colors p-1"
                        title="Delete this request"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-white">{req.title}</h4>
                    <p className="mt-1 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {req.details}
                    </p>
                  </div>

                  {req.responseNote && (
                    <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200">
                      <div className="flex items-center gap-1.5 font-semibold text-purple-300 mb-1">
                        <MessageSquare size={12} />
                        <span>Note from Kiwi & Flo:</span>
                      </div>
                      <p className="whitespace-pre-wrap">{req.responseNote}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: Staff Inbox (Kiwi & Flo) */}
      {subtab === "inbox" && isHandler && (
        <div className="flex flex-col gap-4">
          {/* Controls: Search & Status Filters */}
          <div className="flex flex-col sm:flex-row gap-2.5 justify-between items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search requests by title, text, or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/30 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {(["all", "pending", "in_progress", "completed", "declined"] as const).map(
                (st) => {
                  const label =
                    st === "all"
                      ? "All"
                      : st === "in_progress"
                      ? "In Progress"
                      : st.charAt(0).toUpperCase() + st.slice(1);
                  const isCurrent = inboxStatusFilter === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setInboxStatusFilter(st)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        isCurrent
                          ? "bg-purple-600 text-white"
                          : "text-gray-400 hover:text-white bg-white/5"
                      }`}
                    >
                      {label}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* Request Cards */}
          {loading ? (
            <div className="py-12 text-center text-xs text-gray-400">
              Loading requests...
            </div>
          ) : filteredInboxRequests.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500 rounded-xl border border-dashed border-white/10">
              No matching requests found.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredInboxRequests.map((req) => {
                const statusInfo =
                  STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                const StatusIcon = statusInfo.icon;
                const catInfo =
                  CATEGORIES.find((c) => c.id === req.category) || CATEGORIES[0];
                const CatIcon = catInfo.icon;
                const author = req.user;
                const isEditingThisNote = editingNoteId === req.id;

                return (
                  <div
                    key={req.id}
                    className="p-4 rounded-xl border border-white/10 bg-white/[0.03] flex flex-col gap-3.5 transition-colors hover:border-white/20"
                  >
                    {/* Top Row: Author & Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {author ? (
                          <Avatar
                            avatar={author.avatar}
                            avatarUrl={author.avatarUrl}
                            color={author.color}
                            size={32}
                            className="rounded-full shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs">
                            👤
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              {author?.displayName || author?.username || "Unknown"}
                            </span>
                            {author?.username && (
                              <span className="text-[11px] text-gray-400">
                                @{author.username}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-gray-500">
                            {formatDate(req.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {author && (
                          <button
                            type="button"
                            onClick={() => openDmWith(author.id)}
                            className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/15 text-xs text-gray-200 transition-colors flex items-center gap-1.5"
                            title="Chat with user in DM"
                          >
                            <MessageCircle size={12} />
                            <span>DM Author</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteRequest(req.id)}
                          className="text-gray-500 hover:text-rose-400 p-1"
                          title="Delete request"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Request Info */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{
                          backgroundColor: `${catInfo.color}15`,
                          color: catInfo.color,
                          border: `1px solid ${catInfo.color}30`,
                        }}
                      >
                        <CatIcon size={12} />
                        <span>{catInfo.label}</span>
                      </span>

                      <span
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${statusInfo.badgeClass}`}
                      >
                        <StatusIcon size={12} />
                        <span>{statusInfo.label}</span>
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-white">{req.title}</h4>
                      <p className="mt-1 text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {req.details}
                      </p>
                    </div>

                    {/* Status Toggle & Note Actions */}
                    <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-gray-400 mr-1 font-medium">
                          Set status:
                        </span>
                        {(
                          [
                            "pending",
                            "in_progress",
                            "completed",
                            "declined",
                          ] as RequestStatus[]
                        ).map((st) => {
                          const isCur = req.status === st;
                          return (
                            <button
                              key={st}
                              type="button"
                              disabled={updatingId === req.id}
                              onClick={() => handleStatusChange(req.id, st)}
                              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                                isCur
                                  ? STATUS_CONFIG[st].badgeClass
                                  : "text-gray-400 hover:text-white bg-white/5"
                              }`}
                            >
                              {STATUS_CONFIG[st].label}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (isEditingThisNote) {
                            setEditingNoteId(null);
                          } else {
                            setEditingNoteId(req.id);
                            setNoteDraft(req.responseNote || "");
                          }
                        }}
                        className="text-xs text-purple-300 hover:text-purple-200 underline"
                      >
                        {req.responseNote ? "Edit Note" : "+ Add Note for Author"}
                      </button>
                    </div>

                    {/* Response Note Display / Edit Box */}
                    {isEditingThisNote ? (
                      <div className="p-3 rounded-lg bg-black/40 border border-purple-500/40 flex flex-col gap-2">
                        <label className="text-[11px] font-semibold text-purple-300">
                          Response Note (sent to author via DM when updated):
                        </label>
                        <textarea
                          rows={2}
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="e.g. Added in current release! / Working on this right now."
                          className="w-full px-3 py-1.5 rounded bg-black/50 border border-white/10 text-xs text-white focus:outline-none focus:border-purple-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingNoteId(null)}
                            className="px-2.5 py-1 rounded text-xs text-gray-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={updatingId === req.id}
                            onClick={() => handleSaveNote(req.id)}
                            className="px-3 py-1 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white"
                          >
                            Save Note
                          </button>
                        </div>
                      </div>
                    ) : (
                      req.responseNote && (
                        <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/20 text-xs text-purple-200">
                          <span className="font-semibold text-purple-300">Note: </span>
                          <span>{req.responseNote}</span>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
