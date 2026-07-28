"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  X,
  Star,
  Image as ImageIcon,
  Smile,
  User,
  Sparkles,
  Utensils,
  Trophy,
  Globe,
  Hash,
  Flag,
} from "lucide-react";
import { apiFetch } from "../lib/client";

interface EmojiItem {
  id?: string;
  name: string;
  symbol?: string;
  url?: string;
  category: string;
}

interface EmojiPickerProps {
  serverId: string | null;
  onPickEmoji: (codeOrUrl: string, isCustom?: boolean) => void;
  onClose: () => void;
  canManageEmojis?: boolean;
  onRequestUploadEmoji?: () => void;
}

const CATEGORIES = [
  { id: "favorites", icon: <Star size={16} />, label: "Favorites" },
  { id: "server", icon: <ImageIcon size={16} />, label: "Server Emojis" },
  { id: "smileys", icon: <Smile size={16} />, label: "Smileys & Emotion" },
  { id: "people", icon: <User size={16} />, label: "People & Body" },
  { id: "animals", icon: <Sparkles size={16} />, label: "Animals & Nature" },
  { id: "food", icon: <Utensils size={16} />, label: "Food & Drink" },
  { id: "activities", icon: <Trophy size={16} />, label: "Activities" },
  { id: "travel", icon: <Globe size={16} />, label: "Travel & Places" },
  { id: "symbols", icon: <Hash size={16} />, label: "Symbols" },
  { id: "flags", icon: <Flag size={16} />, label: "Flags" },
];

const EMOJI_DATASET: Array<{ name: string; symbol: string; category: string }> = [
  // Smileys & Emotion
  { name: "grinning", symbol: "😀", category: "Smileys & Emotion" },
  { name: "smiley", symbol: "😃", category: "Smileys & Emotion" },
  { name: "smile", symbol: "😄", category: "Smileys & Emotion" },
  { name: "grin", symbol: "😁", category: "Smileys & Emotion" },
  { name: "laughing", symbol: "😆", category: "Smileys & Emotion" },
  { name: "sweat_smile", symbol: "😅", category: "Smileys & Emotion" },
  { name: "rofl", symbol: "🤣", category: "Smileys & Emotion" },
  { name: "joy", symbol: "😂", category: "Smileys & Emotion" },
  { name: "slightly_smiling_face", symbol: "🙂", category: "Smileys & Emotion" },
  { name: "upside_down_face", symbol: "🙃", category: "Smileys & Emotion" },
  { name: "wink", symbol: "😉", category: "Smileys & Emotion" },
  { name: "blush", symbol: "😊", category: "Smileys & Emotion" },
  { name: "innocent", symbol: "😇", category: "Smileys & Emotion" },
  { name: "heart_eyes", symbol: "😍", category: "Smileys & Emotion" },
  { name: "star_struck", symbol: "🤩", category: "Smileys & Emotion" },
  { name: "kissing_heart", symbol: "😘", category: "Smileys & Emotion" },
  { name: "kissing", symbol: "😗", category: "Smileys & Emotion" },
  { name: "relaxed", symbol: "☺️", category: "Smileys & Emotion" },
  { name: "yum", symbol: "😋", category: "Smileys & Emotion" },
  { name: "stuck_out_tongue", symbol: "😛", category: "Smileys & Emotion" },
  { name: "stuck_out_tongue_winking_eye", symbol: "😜", category: "Smileys & Emotion" },
  { name: "zany_face", symbol: "🤪", category: "Smileys & Emotion" },
  { name: "stuck_out_tongue_closed_eyes", symbol: "😝", category: "Smileys & Emotion" },
  { name: "money_mouth_face", symbol: "🤑", category: "Smileys & Emotion" },
  { name: "hugging", symbol: "🤗", category: "Smileys & Emotion" },
  { name: "hand_over_mouth", symbol: "🤭", category: "Smileys & Emotion" },
  { name: "shushing_face", symbol: "🤫", category: "Smileys & Emotion" },
  { name: "thinking", symbol: "🤔", category: "Smileys & Emotion" },
  { name: "zipper_mouth_face", symbol: "🤐", category: "Smileys & Emotion" },
  { name: "raised_eyebrow", symbol: "🤨", category: "Smileys & Emotion" },
  { name: "neutral_face", symbol: "😐", category: "Smileys & Emotion" },
  { name: "expressionless", symbol: "😑", category: "Smileys & Emotion" },
  { name: "no_mouth", symbol: "😶", category: "Smileys & Emotion" },
  { name: "smirk", symbol: "😏", category: "Smileys & Emotion" },
  { name: "unamused", symbol: "😒", category: "Smileys & Emotion" },
  { name: "roll_eyes", symbol: "🙄", category: "Smileys & Emotion" },
  { name: "grimacing", symbol: "😬", category: "Smileys & Emotion" },
  { name: "lying_face", symbol: "🤥", category: "Smileys & Emotion" },
  { name: "relieved", symbol: "😌", category: "Smileys & Emotion" },
  { name: "pensive", symbol: "😔", category: "Smileys & Emotion" },
  { name: "sleepy", symbol: "😪", category: "Smileys & Emotion" },
  { name: "drooling_face", symbol: "🤤", category: "Smileys & Emotion" },
  { name: "sleeping", symbol: "😴", category: "Smileys & Emotion" },
  { name: "mask", symbol: "😷", category: "Smileys & Emotion" },
  { name: "face_with_thermometer", symbol: "🤒", category: "Smileys & Emotion" },
  { name: "head_bandage", symbol: "🤕", category: "Smileys & Emotion" },
  { name: "nauseated_face", symbol: "🤢", category: "Smileys & Emotion" },
  { name: "vomiting", symbol: "🤮", category: "Smileys & Emotion" },
  { name: "sneezing_face", symbol: "🤧", category: "Smileys & Emotion" },
  { name: "hot_face", symbol: "🥵", category: "Smileys & Emotion" },
  { name: "cold_face", symbol: "🥶", category: "Smileys & Emotion" },
  { name: "woozy_face", symbol: "🥴", category: "Smileys & Emotion" },
  { name: "dizzy_face", symbol: "😵", category: "Smileys & Emotion" },
  { name: "exploding_head", symbol: "🤯", category: "Smileys & Emotion" },
  { name: "cowboy_hat_face", symbol: "🤠", category: "Smileys & Emotion" },
  { name: "partying_face", symbol: "🥳", category: "Smileys & Emotion" },
  { name: "sunglasses", symbol: "😎", category: "Smileys & Emotion" },
  { name: "nerd_face", symbol: "🤓", category: "Smileys & Emotion" },
  { name: "monocle_face", symbol: "🧐", category: "Smileys & Emotion" },
  { name: "confused", symbol: "😕", category: "Smileys & Emotion" },
  { name: "worried", symbol: "😟", category: "Smileys & Emotion" },
  { name: "slightly_frowning_face", symbol: "🙁", category: "Smileys & Emotion" },
  { name: "frowning_face", symbol: "☹️", category: "Smileys & Emotion" },
  { name: "open_mouth", symbol: "😮", category: "Smileys & Emotion" },
  { name: "hushed", symbol: "😯", category: "Smileys & Emotion" },
  { name: "astonished", symbol: "😲", category: "Smileys & Emotion" },
  { name: "flushed", symbol: "😳", category: "Smileys & Emotion" },
  { name: "pleading_face", symbol: "🥺", category: "Smileys & Emotion" },
  { name: "frowning", symbol: "😦", category: "Smileys & Emotion" },
  { name: "anguished", symbol: "😧", category: "Smileys & Emotion" },
  { name: "fearful", symbol: "😨", category: "Smileys & Emotion" },
  { name: "cold_sweat", symbol: "😰", category: "Smileys & Emotion" },
  { name: "disappointed_relieved", symbol: "😥", category: "Smileys & Emotion" },
  { name: "cry", symbol: "😢", category: "Smileys & Emotion" },
  { name: "sob", symbol: "😭", category: "Smileys & Emotion" },
  { name: "scream", symbol: "😱", category: "Smileys & Emotion" },
  { name: "confounded", symbol: "😖", category: "Smileys & Emotion" },
  { name: "persevere", symbol: "😣", category: "Smileys & Emotion" },
  { name: "disappointed", symbol: "😞", category: "Smileys & Emotion" },
  { name: "sweat", symbol: "😓", category: "Smileys & Emotion" },
  { name: "weary", symbol: "😩", category: "Smileys & Emotion" },
  { name: "tired_face", symbol: "😫", category: "Smileys & Emotion" },
  { name: "yawning_face", symbol: "🥱", category: "Smileys & Emotion" },
  { name: "triumph", symbol: "😤", category: "Smileys & Emotion" },
  { name: "rage", symbol: "😡", category: "Smileys & Emotion" },
  { name: "angry", symbol: "😠", category: "Smileys & Emotion" },
  { name: "cursing_face", symbol: "🤬", category: "Smileys & Emotion" },
  { name: "skull", symbol: "💀", category: "Smileys & Emotion" },
  { name: "poop", symbol: "💩", category: "Smileys & Emotion" },
  { name: "clown_face", symbol: "🤡", category: "Smileys & Emotion" },
  { name: "ghost", symbol: "👻", category: "Smileys & Emotion" },
  { name: "alien", symbol: "👽", category: "Smileys & Emotion" },
  { name: "robot", symbol: "🤖", category: "Smileys & Emotion" },
  { name: "heart", symbol: "❤️", category: "Smileys & Emotion" },
  { name: "orange_heart", symbol: "🧡", category: "Smileys & Emotion" },
  { name: "yellow_heart", symbol: "💛", category: "Smileys & Emotion" },
  { name: "green_heart", symbol: "💚", category: "Smileys & Emotion" },
  { name: "blue_heart", symbol: "💙", category: "Smileys & Emotion" },
  { name: "purple_heart", symbol: "💜", category: "Smileys & Emotion" },
  { name: "black_heart", symbol: "🖤", category: "Smileys & Emotion" },
  { name: "white_heart", symbol: "🤍", category: "Smileys & Emotion" },
  { name: "brown_heart", symbol: "🤎", category: "Smileys & Emotion" },
  { name: "broken_heart", symbol: "💔", category: "Smileys & Emotion" },
  { name: "fire", symbol: "🔥", category: "Smileys & Emotion" },
  { name: "sparkles", symbol: "✨", category: "Smileys & Emotion" },

  // People & Body
  { name: "wave", symbol: "👋", category: "People & Body" },
  { name: "raised_back_of_hand", symbol: "🤚", category: "People & Body" },
  { name: "hand", symbol: "✋", category: "People & Body" },
  { name: "v", symbol: "✌️", category: "People & Body" },
  { name: "cross_fingers", symbol: "🤞", category: "People & Body" },
  { name: "love_you_gesture", symbol: "🤟", category: "People & Body" },
  { name: "rock", symbol: "🤘", category: "People & Body" },
  { name: "ok_hand", symbol: "👌", category: "People & Body" },
  { name: "pinched_fingers", symbol: "🤌", category: "People & Body" },
  { name: "pinching_hand", symbol: "🤏", category: "People & Body" },
  { name: "thumbsup", symbol: "👍", category: "People & Body" },
  { name: "thumbsdown", symbol: "👎", category: "People & Body" },
  { name: "fist", symbol: "✊", category: "People & Body" },
  { name: "punch", symbol: "👊", category: "People & Body" },
  { name: "left_facing_fist", symbol: "🤛", category: "People & Body" },
  { name: "right_facing_fist", symbol: "🤜", category: "People & Body" },
  { name: "clapping", symbol: "👏", category: "People & Body" },
  { name: "raised_hands", symbol: "🙌", category: "People & Body" },
  { name: "open_hands", symbol: "👐", category: "People & Body" },
  { name: "palms_up_together", symbol: "🤲", category: "People & Body" },
  { name: "handshake", symbol: "🤝", category: "People & Body" },
  { name: "pray", symbol: "🙏", category: "People & Body" },
  { name: "writing_hand", symbol: "✍️", category: "People & Body" },
  { name: "nail_care", symbol: "💅", category: "People & Body" },
  { name: "selfie", symbol: "🤳", category: "People & Body" },
  { name: "muscle", symbol: "💪", category: "People & Body" },
  { name: "eyes", symbol: "👀", category: "People & Body" },
  { name: "brain", symbol: "🧠", category: "People & Body" },

  // Animals & Nature
  { name: "dog", symbol: "🐶", category: "Animals & Nature" },
  { name: "cat", symbol: "🐱", category: "Animals & Nature" },
  { name: "mouse", symbol: "🐭", category: "Animals & Nature" },
  { name: "hamster", symbol: "🐹", category: "Animals & Nature" },
  { name: "rabbit", symbol: "🐰", category: "Animals & Nature" },
  { name: "fox_face", symbol: "🦊", category: "Animals & Nature" },
  { name: "bear", symbol: "🐻", category: "Animals & Nature" },
  { name: "panda_face", symbol: "🐼", category: "Animals & Nature" },
  { name: "koala", symbol: "🐨", category: "Animals & Nature" },
  { name: "tiger", symbol: "🐯", category: "Animals & Nature" },
  { name: "lion", symbol: "🦁", category: "Animals & Nature" },
  { name: "cow", symbol: "🐮", category: "Animals & Nature" },
  { name: "pig", symbol: "🐷", category: "Animals & Nature" },
  { name: "frog", symbol: "🐸", category: "Animals & Nature" },
  { name: "monkey_face", symbol: "🐵", category: "Animals & Nature" },
  { name: "see_no_evil", symbol: "🙈", category: "Animals & Nature" },
  { name: "hear_no_evil", symbol: "🙉", category: "Animals & Nature" },
  { name: "speak_no_evil", symbol: "🙊", category: "Animals & Nature" },
  { name: "chicken", symbol: "🐔", category: "Animals & Nature" },
  { name: "penguin", symbol: "🐧", category: "Animals & Nature" },
  { name: "bird", symbol: "🐦", category: "Animals & Nature" },
  { name: "eagle", symbol: "🦅", category: "Animals & Nature" },
  { name: "duck", symbol: "🦆", category: "Animals & Nature" },
  { name: "owl", symbol: "🦉", category: "Animals & Nature" },
  { name: "unicorn", symbol: "🦄", category: "Animals & Nature" },
  { name: "bee", symbol: "🐝", category: "Animals & Nature" },
  { name: "bug", symbol: "🐛", category: "Animals & Nature" },
  { name: "butterfly", symbol: "🦋", category: "Animals & Nature" },
  { name: "sunflower", symbol: "🌻", category: "Animals & Nature" },
  { name: "blossom", symbol: "🌼", category: "Animals & Nature" },
  { name: "rose", symbol: "🌹", category: "Animals & Nature" },
  { name: "rainbow", symbol: "🌈", category: "Animals & Nature" },

  // Food & Drink
  { name: "apple", symbol: "🍎", category: "Food & Drink" },
  { name: "banana", symbol: "🍌", category: "Food & Drink" },
  { name: "watermelon", symbol: "🍉", category: "Food & Drink" },
  { name: "grapes", symbol: "🍇", category: "Food & Drink" },
  { name: "strawberry", symbol: "🍓", category: "Food & Drink" },
  { name: "cherries", symbol: "🍒", category: "Food & Drink" },
  { name: "peach", symbol: "🍑", category: "Food & Drink" },
  { name: "pizza", symbol: "🍕", category: "Food & Drink" },
  { name: "hamburger", symbol: "🍔", category: "Food & Drink" },
  { name: "fries", symbol: "🍟", category: "Food & Drink" },
  { name: "hotdog", symbol: "🌭", category: "Food & Drink" },
  { name: "popcorn", symbol: "🍿", category: "Food & Drink" },
  { name: "bacon", symbol: "🥓", category: "Food & Drink" },
  { name: "donut", symbol: "🍩", category: "Food & Drink" },
  { name: "cookie", symbol: "🍪", category: "Food & Drink" },
  { name: "birthday", symbol: "🎂", category: "Food & Drink" },
  { name: "shortcake", symbol: "🍰", category: "Food & Drink" },
  { name: "cupcake", symbol: "🧁", category: "Food & Drink" },
  { name: "coffee", symbol: "☕", category: "Food & Drink" },
  { name: "tea", symbol: "🍵", category: "Food & Drink" },
  { name: "beer", symbol: "🍺", category: "Food & Drink" },
  { name: "beers", symbol: "🍻", category: "Food & Drink" },
  { name: "wine_glass", symbol: "🍷", category: "Food & Drink" },
  { name: "cocktail", symbol: "🍸", category: "Food & Drink" },

  // Activities & Objects
  { name: "soccer", symbol: "⚽", category: "Activities" },
  { name: "basketball", symbol: "🏀", category: "Activities" },
  { name: "football", symbol: "🏈", category: "Activities" },
  { name: "baseball", symbol: "⚾", category: "Activities" },
  { name: "tennis", symbol: "🎾", category: "Activities" },
  { name: "trophy", symbol: "🏆", category: "Activities" },
  { name: "game_die", symbol: "🎲", category: "Activities" },
  { name: "video_game", symbol: "🎮", category: "Activities" },
  { name: "dart", symbol: "🎯", category: "Activities" },
  { name: "guitar", symbol: "🎸", category: "Activities" },
  { name: "headphones", symbol: "🎧", category: "Activities" },
  { name: "microphone", symbol: "🎤", category: "Activities" },
  { name: "clapper", symbol: "🎬", category: "Activities" },

  // Travel & Places
  { name: "car", symbol: "🚗", category: "Travel & Places" },
  { name: "taxi", symbol: "🚕", category: "Travel & Places" },
  { name: "bus", symbol: "🚌", category: "Travel & Places" },
  { name: "police_car", symbol: "🚓", category: "Travel & Places" },
  { name: "airplane", symbol: "✈️", category: "Travel & Places" },
  { name: "rocket", symbol: "🚀", category: "Travel & Places" },
  { name: "house", symbol: "🏠", category: "Travel & Places" },
  { name: "cityscape", symbol: "🏙️", category: "Travel & Places" },
  { name: "camping", symbol: "🏕️", category: "Travel & Places" },

  // Symbols & Flags
  { name: "heart", symbol: "❤️", category: "Symbols" },
  { name: "star", symbol: "⭐", category: "Symbols" },
  { name: "glowing_star", symbol: "🌟", category: "Symbols" },
  { name: "sparkler", symbol: "❇️", category: "Symbols" },
  { name: "check", symbol: "✅", category: "Symbols" },
  { name: "cross", symbol: "❌", category: "Symbols" },
  { name: "question", symbol: "❓", category: "Symbols" },
  { name: "exclamation", symbol: "❗", category: "Symbols" },
  { name: "warning", symbol: "⚠️", category: "Symbols" },
  { name: "transgender_flag", symbol: "🏳️‍⚧️", category: "Flags" },
  { name: "rainbow_flag", symbol: "🏳️‍🌈", category: "Flags" },
  { name: "flag_us", symbol: "🇺🇸", category: "Flags" },
  { name: "flag_gb", symbol: "🇬🇧", category: "Flags" },
  { name: "flag_tr", symbol: "🇹🇷", category: "Flags" },
  { name: "flag_ca", symbol: "🇨🇦", category: "Flags" },
  { name: "flag_de", symbol: "🇩🇪", category: "Flags" },
  { name: "flag_fr", symbol: "🇫🇷", category: "Flags" },
  { name: "flag_jp", symbol: "🇯🇵", category: "Flags" },
];

export function EmojiPicker({
  serverId,
  onPickEmoji,
  onClose,
  canManageEmojis = false,
  onRequestUploadEmoji,
}: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("smileys");
  const [customEmojis, setCustomEmojis] = useState<
    Array<{ id: string; name: string; url: string }>
  >([]);
  const [hoveredEmoji, setHoveredEmoji] = useState<EmojiItem | null>(EMOJI_DATASET[0]);
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === "undefined") return ["transgender_flag", "heart", "sparkles"];
    try {
      return JSON.parse(
        window.localStorage.getItem("huddle-fav-emojis") ||
          '["transgender_flag", "heart", "sparkles"]',
      );
    } catch {
      return ["transgender_flag", "heart", "sparkles"];
    }
  });

  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (serverId) {
      apiFetch<{ emojis: Array<{ id: string; name: string; url: string }> }>(
        `/api/emojis?serverId=${encodeURIComponent(serverId)}`,
      )
        .then((res) => setCustomEmojis(res.emojis || []))
        .catch(() => undefined);
    }
  }, [serverId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const toggleFavorite = (name: string, e: React.MouseEvent) => {
    if (e.altKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      setFavorites((prev) => {
        const next = prev.includes(name)
          ? prev.filter((n) => n !== name)
          : [...prev, name];
        window.localStorage.setItem("huddle-fav-emojis", JSON.stringify(next));
        return next;
      });
    }
  };

  const filteredUnicode = EMOJI_DATASET.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.symbol.includes(search),
  );

  const filteredCustom = customEmojis.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  );

  const favoriteItems: EmojiItem[] = EMOJI_DATASET.filter((e) =>
    favorites.includes(e.name),
  );

  return (
    <div
      ref={pickerRef}
      className="discord-emoji-picker popover-picker"
      role="dialog"
      aria-label="Emoji Picker"
    >
      <div className="emoji-picker-search-bar">
        <div className="search-input-wrap">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emojis..."
            autoFocus
          />
          <button
            type="button"
            className="picker-close-x"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="emoji-picker-body">
        {/* Left Category Navigation Rail */}
        <nav className="emoji-category-rail">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`cat-rail-btn ${activeCategory === cat.id ? "active" : ""}`}
              onClick={() => setActiveCategory(cat.id)}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </nav>

        {/* Grid Content Scroll Area */}
        <div className="emoji-grid-scroll">
          {/* Custom Server Emojis */}
          {(activeCategory === "server" || search || customEmojis.length > 0) && (
            <div className="emoji-section">
              <div className="emoji-section-header">
                <span className="flex items-center gap-1">
                  <ImageIcon size={14} /> Server Emojis
                </span>
                {canManageEmojis && onRequestUploadEmoji && (
                  <button
                    type="button"
                    className="add-server-emoji-btn"
                    onClick={onRequestUploadEmoji}
                  >
                    + Upload
                  </button>
                )}
              </div>
              <div className="emoji-grid">
                {filteredCustom.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="emoji-btn custom-emoji-btn"
                    onMouseEnter={() =>
                      setHoveredEmoji({
                        id: item.id,
                        name: item.name,
                        url: item.url,
                        category: "Server Emojis",
                      })
                    }
                    onClick={(e) => {
                      toggleFavorite(item.name, e);
                      onPickEmoji(`:${item.name}:`, true);
                    }}
                    title={`:${item.name}:`}
                  >
                    <img src={item.url} alt={item.name} />
                  </button>
                ))}
                {!filteredCustom.length && (
                  <p className="no-emoji-hint">No custom server emojis yet.</p>
                )}
              </div>
            </div>
          )}

          {/* Favorites */}
          {!search && activeCategory === "favorites" && (
            <div className="emoji-section">
              <div className="emoji-section-header">
                <span className="flex items-center gap-1">
                  <Star size={14} /> Favorites
                </span>
              </div>
              <div className="emoji-grid">
                {favoriteItems.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className="emoji-btn"
                    onMouseEnter={() => setHoveredEmoji(item)}
                    onClick={(e) => {
                      toggleFavorite(item.name, e);
                      onPickEmoji(item.symbol || `:${item.name}:`);
                    }}
                    title={`:${item.name}:`}
                  >
                    {item.symbol}
                  </button>
                ))}
                {!favoriteItems.length && (
                  <p className="no-emoji-hint">Alt+click any emoji to favorite it.</p>
                )}
              </div>
            </div>
          )}

          {/* All Unicode Emojis */}
          <div className="emoji-section">
            <div className="emoji-section-header">
              <span className="flex items-center gap-1">
                <Smile size={14} /> All Emojis ({filteredUnicode.length})
              </span>
            </div>
            <div className="emoji-grid">
              {filteredUnicode.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="emoji-btn"
                  onMouseEnter={() => setHoveredEmoji(item)}
                  onClick={(e) => {
                    toggleFavorite(item.name, e);
                    onPickEmoji(item.symbol || `:${item.name}:`);
                  }}
                  title={`:${item.name}:`}
                >
                  {item.symbol}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Preview Bar */}
      <footer className="emoji-picker-footer">
        {hoveredEmoji ? (
          <div className="emoji-preview-row">
            <div className="preview-icon">
              {hoveredEmoji.url ? (
                <img src={hoveredEmoji.url} alt={hoveredEmoji.name} />
              ) : (
                <span>{hoveredEmoji.symbol}</span>
              )}
            </div>
            <div className="preview-details">
              <span className="preview-name">:{hoveredEmoji.name}:</span>
              <span className="preview-tip">Hold Alt to favorite</span>
            </div>
          </div>
        ) : (
          <span className="preview-placeholder">Select an emoji</span>
        )}
      </footer>
    </div>
  );
}
