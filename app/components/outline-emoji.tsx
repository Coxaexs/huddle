"use client";

import type { ReactNode } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Heart,
  Smile,
  Flame,
  PartyPopper,
  Sparkles,
  Star,
  Eye,
  Rocket,
  Lightbulb,
  Zap,
  Coffee,
  Gamepad2,
  MessageSquare,
  Pizza,
  Utensils,
  Frown,
  Check,
  X,
} from "lucide-react";

interface OutlineEmojiProps {
  emoji: string;
  className?: string;
  size?: number;
  fallbackText?: boolean;
}

/**
 * Maps standard reaction emojis to modern Lucide outline icons
 * matching the Hoffle preview mockup aesthetic (e.g. green ThumbsUp, rose Heart).
 */
export function OutlineEmoji({
  emoji,
  className = "h-3.5 w-3.5",
  size = 14,
  fallbackText = true,
}: OutlineEmojiProps): ReactNode {
  const clean = emoji.trim().toLowerCase().replace(/^:|:$/g, "");

  switch (clean) {
    case "👍":
    case "+1":
    case "thumbsup":
    case "like":
      return <ThumbsUp size={size} className={`${className} text-emerald-400`} />;

    case "👎":
    case "-1":
    case "thumbsdown":
    case "dislike":
      return <ThumbsDown size={size} className={`${className} text-rose-400`} />;

    case "❤️":
    case "💖":
    case "💕":
    case "heart":
    case "love":
      return <Heart size={size} className={`${className} text-rose-400`} />;

    case "😂":
    case "🤣":
    case "joy":
    case "laugh":
    case "lol":
      return <Smile size={size} className={`${className} text-amber-400`} />;

    case "🔥":
    case "fire":
    case "lit":
      return <Flame size={size} className={`${className} text-orange-400`} />;

    case "🎉":
    case "tada":
    case "party":
    case "celebrate":
      return <PartyPopper size={size} className={`${className} text-purple-400`} />;

    case "😮":
    case "😲":
    case "open_mouth":
    case "wow":
      return <Sparkles size={size} className={`${className} text-sky-400`} />;

    case "⭐":
    case "🌟":
    case "star":
      return <Star size={size} className={`${className} text-yellow-400`} />;

    case "👀":
    case "eyes":
    case "look":
      return <Eye size={size} className={`${className} text-cyan-400`} />;

    case "🚀":
    case "rocket":
      return <Rocket size={size} className={`${className} text-indigo-400`} />;

    case "💡":
    case "bulb":
    case "idea":
      return <Lightbulb size={size} className={`${className} text-amber-300`} />;

    case "⚡":
    case "zap":
    case "lightning":
      return <Zap size={size} className={`${className} text-yellow-400`} />;

    case "☕":
    case "coffee":
      return <Coffee size={size} className={`${className} text-amber-500`} />;

    case "🎮":
    case "gamepad":
    case "game":
      return <Gamepad2 size={size} className={`${className} text-violet-400`} />;

    case "💬":
    case "speech_balloon":
    case "chat":
      return <MessageSquare size={size} className={`${className} text-blue-400`} />;

    case "🍕":
    case "pizza":
      return <Pizza size={size} className={`${className} text-amber-400`} />;

    case "🌮":
    case "taco":
      return <Utensils size={size} className={`${className} text-amber-400`} />;

    case "😢":
    case "sob":
    case "cry":
    case "sad":
      return <Frown size={size} className={`${className} text-blue-400`} />;

    case "✅":
    case "check":
    case "white_check_mark":
      return <Check size={size} className={`${className} text-emerald-400`} />;

    case "❌":
    case "x":
    case "cross":
      return <X size={size} className={`${className} text-rose-400`} />;

    default:
      return fallbackText ? <span>{emoji}</span> : null;
  }
}
