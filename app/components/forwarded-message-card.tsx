"use client";

import { Forward } from "lucide-react";
import { Avatar } from "./avatar";
import { MessageBody } from "./message-body";

export interface ForwardedFromData {
  id?: string;
  author: string;
  userId?: string | null;
  username?: string;
  avatar: string;
  avatarUrl?: string | null;
  color: string;
  text?: string;
  image?: string;
  images?: string[];
  file?: { url: string; name: string; type: "pdf" };
  channelName?: string;
  serverName?: string;
  createdAt?: string;
}

interface ForwardedMessageCardProps {
  data: ForwardedFromData;
  comment?: string;
  selfHandle?: string;
  emojis?: Record<string, string>;
  onMention?: (handle: string) => void;
  onImage?: (url: string) => void;
  onPdf?: (file: { url: string; name: string }) => void;
  formatTime?: (isoString?: string) => string;
}

export function ForwardedMessageCard({
  data,
  comment,
  selfHandle,
  emojis,
  onMention,
  onImage,
  onPdf,
  formatTime,
}: ForwardedMessageCardProps) {
  const showComment = comment && comment.trim().length > 0 && comment !== "Forwarded a message";

  return (
    <div className="forwarded-container">
      {showComment && (
        <div className="forwarded-user-comment">
          <MessageBody
            text={comment}
            selfHandle={selfHandle}
            onMention={onMention}
            onImage={onImage}
            emojis={emojis}
          />
        </div>
      )}

      <div className="forwarded-card">
        <div className="forwarded-card-header">
          <Forward size={13} className="forwarded-badge-icon" />
          <span className="forwarded-badge-title">Forwarded</span>
          {(data.serverName || data.channelName) && (
            <span className="forwarded-origin">
              from {data.serverName ? `${data.serverName} · ` : ""}
              #{data.channelName || "chat"}
            </span>
          )}
        </div>

        <div className="forwarded-card-body">
          <div className="forwarded-card-meta">
            <Avatar
              avatar={data.avatar}
              avatarUrl={data.avatarUrl}
              color={data.color}
              size={20}
              className="flex-shrink-0"
            />
            <strong className="forwarded-author-name">{data.author}</strong>
            {data.createdAt && (
              <time className="forwarded-timestamp">
                {formatTime ? formatTime(data.createdAt) : new Date(data.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </time>
            )}
          </div>

          {data.text && (
            <div className="forwarded-text">
              <MessageBody
                text={data.text}
                selfHandle={selfHandle}
                onMention={onMention}
                onImage={onImage}
                emojis={emojis}
              />
            </div>
          )}

          {data.image && (
            <img
              className="message-image forwarded-attachment"
              src={data.image}
              alt="Attachment"
              onClick={() => onImage?.(data.image!)}
            />
          )}

          {data.images && data.images.length > 0 && (
            <div className={`attachment-grid forwarded-attachment-grid count-${Math.min(data.images.length, 4)}`}>
              {data.images.map((url) => (
                <img
                  key={url}
                  className="message-image"
                  src={url}
                  alt="Attachment"
                  onClick={() => onImage?.(url)}
                />
              ))}
            </div>
          )}

          {data.file?.type === "pdf" && (
            <button
              type="button"
              className="message-file-card forwarded-file-card"
              onClick={() => onPdf?.({ url: data.file!.url, name: data.file!.name })}
            >
              <span className="message-file-icon">PDF</span>
              <span>
                <strong>{data.file.name}</strong>
                <small>PDF document · view and fill in Huddle</small>
              </span>
              <b aria-hidden="true">Open</b>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
