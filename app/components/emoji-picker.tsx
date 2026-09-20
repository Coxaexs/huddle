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
  Package,
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
  className?: string;
}

interface CategoryDef {
  id: string;
  icon: React.ReactNode;
  label: string;
  categoryName?: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: "favorites", icon: <Star size={16} />, label: "Favorites" },
  { id: "server", icon: <ImageIcon size={16} />, label: "Server Emojis" },
  { id: "smileys", icon: <Smile size={16} />, label: "Smileys & Emotion", categoryName: "Smileys & Emotion" },
  { id: "people", icon: <User size={16} />, label: "People & Body", categoryName: "People & Body" },
  { id: "animals", icon: <Sparkles size={16} />, label: "Animals & Nature", categoryName: "Animals & Nature" },
  { id: "food", icon: <Utensils size={16} />, label: "Food & Drink", categoryName: "Food & Drink" },
  { id: "activities", icon: <Trophy size={16} />, label: "Activities", categoryName: "Activities" },
  { id: "travel", icon: <Globe size={16} />, label: "Travel & Places", categoryName: "Travel & Places" },
  { id: "objects", icon: <Package size={16} />, label: "Objects", categoryName: "Objects" },
  { id: "symbols", icon: <Hash size={16} />, label: "Symbols", categoryName: "Symbols" },
  { id: "flags", icon: <Flag size={16} />, label: "Flags", categoryName: "Flags" },
];

const EMOJI_DATASET: Array<{ name: string; symbol: string; category: string }> = [
  // --- Smileys & Emotion ---
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
  { name: "melting_face", symbol: "🫠", category: "Smileys & Emotion" },
  { name: "wink", symbol: "😉", category: "Smileys & Emotion" },
  { name: "blush", symbol: "😊", category: "Smileys & Emotion" },
  { name: "innocent", symbol: "😇", category: "Smileys & Emotion" },
  { name: "smiling_face_with_3_hearts", symbol: "🥰", category: "Smileys & Emotion" },
  { name: "heart_eyes", symbol: "😍", category: "Smileys & Emotion" },
  { name: "star_struck", symbol: "🤩", category: "Smileys & Emotion" },
  { name: "kissing_heart", symbol: "😘", category: "Smileys & Emotion" },
  { name: "kissing", symbol: "😗", category: "Smileys & Emotion" },
  { name: "kissing_smiling_eyes", symbol: "😙", category: "Smileys & Emotion" },
  { name: "kissing_closed_eyes", symbol: "😚", category: "Smileys & Emotion" },
  { name: "relaxed", symbol: "☺️", category: "Smileys & Emotion" },
  { name: "yum", symbol: "😋", category: "Smileys & Emotion" },
  { name: "stuck_out_tongue", symbol: "😛", category: "Smileys & Emotion" },
  { name: "stuck_out_tongue_winking_eye", symbol: "😜", category: "Smileys & Emotion" },
  { name: "zany_face", symbol: "🤪", category: "Smileys & Emotion" },
  { name: "stuck_out_tongue_closed_eyes", symbol: "😝", category: "Smileys & Emotion" },
  { name: "money_mouth_face", symbol: "🤑", category: "Smileys & Emotion" },
  { name: "hugging", symbol: "🤗", category: "Smileys & Emotion" },
  { name: "hand_over_mouth", symbol: "🤭", category: "Smileys & Emotion" },
  { name: "face_with_peeking_eye", symbol: "🫣", category: "Smileys & Emotion" },
  { name: "shushing_face", symbol: "🤫", category: "Smileys & Emotion" },
  { name: "thinking", symbol: "🤔", category: "Smileys & Emotion" },
  { name: "saluting_face", symbol: "🫡", category: "Smileys & Emotion" },
  { name: "zipper_mouth_face", symbol: "🤐", category: "Smileys & Emotion" },
  { name: "raised_eyebrow", symbol: "🤨", category: "Smileys & Emotion" },
  { name: "neutral_face", symbol: "😐", category: "Smileys & Emotion" },
  { name: "expressionless", symbol: "😑", category: "Smileys & Emotion" },
  { name: "no_mouth", symbol: "😶", category: "Smileys & Emotion" },
  { name: "dotted_line_face", symbol: "🫥", category: "Smileys & Emotion" },
  { name: "face_in_clouds", symbol: "😶‍🌫️", category: "Smileys & Emotion" },
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
  { name: "face_with_spiral_eyes", symbol: "😵‍💫", category: "Smileys & Emotion" },
  { name: "exploding_head", symbol: "🤯", category: "Smileys & Emotion" },
  { name: "cowboy_hat_face", symbol: "🤠", category: "Smileys & Emotion" },
  { name: "partying_face", symbol: "🥳", category: "Smileys & Emotion" },
  { name: "disguised_face", symbol: "🥸", category: "Smileys & Emotion" },
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
  { name: "face_holding_back_tears", symbol: "🥹", category: "Smileys & Emotion" },
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
  { name: "smiling_imp", symbol: "😈", category: "Smileys & Emotion" },
  { name: "imp", symbol: "👿", category: "Smileys & Emotion" },
  { name: "skull", symbol: "💀", category: "Smileys & Emotion" },
  { name: "skull_and_crossbones", symbol: "☠️", category: "Smileys & Emotion" },
  { name: "poop", symbol: "💩", category: "Smileys & Emotion" },
  { name: "clown_face", symbol: "🤡", category: "Smileys & Emotion" },
  { name: "ghost", symbol: "👻", category: "Smileys & Emotion" },
  { name: "alien", symbol: "👽", category: "Smileys & Emotion" },
  { name: "space_invader", symbol: "👾", category: "Smileys & Emotion" },
  { name: "robot", symbol: "🤖", category: "Smileys & Emotion" },
  { name: "smiley_cat", symbol: "😺", category: "Smileys & Emotion" },
  { name: "smile_cat", symbol: "😸", category: "Smileys & Emotion" },
  { name: "joy_cat", symbol: "😹", category: "Smileys & Emotion" },
  { name: "heart_eyes_cat", symbol: "😻", category: "Smileys & Emotion" },
  { name: "smirk_cat", symbol: "😼", category: "Smileys & Emotion" },
  { name: "kissing_cat", symbol: "😽", category: "Smileys & Emotion" },
  { name: "scream_cat", symbol: "🙀", category: "Smileys & Emotion" },
  { name: "crying_cat_face", symbol: "😿", category: "Smileys & Emotion" },
  { name: "pouting_cat", symbol: "😾", category: "Smileys & Emotion" },
  { name: "see_no_evil", symbol: "🙈", category: "Smileys & Emotion" },
  { name: "hear_no_evil", symbol: "🙉", category: "Smileys & Emotion" },
  { name: "speak_no_evil", symbol: "🙊", category: "Smileys & Emotion" },
  { name: "kiss", symbol: "💋", category: "Smileys & Emotion" },
  { name: "love_letter", symbol: "💌", category: "Smileys & Emotion" },
  { name: "heart", symbol: "❤️", category: "Smileys & Emotion" },
  { name: "orange_heart", symbol: "🧡", category: "Smileys & Emotion" },
  { name: "yellow_heart", symbol: "💛", category: "Smileys & Emotion" },
  { name: "green_heart", symbol: "💚", category: "Smileys & Emotion" },
  { name: "blue_heart", symbol: "💙", category: "Smileys & Emotion" },
  { name: "purple_heart", symbol: "💜", category: "Smileys & Emotion" },
  { name: "black_heart", symbol: "🖤", category: "Smileys & Emotion" },
  { name: "white_heart", symbol: "🤍", category: "Smileys & Emotion" },
  { name: "brown_heart", symbol: "🤎", category: "Smileys & Emotion" },
  { name: "pink_heart", symbol: "🩷", category: "Smileys & Emotion" },
  { name: "broken_heart", symbol: "💔", category: "Smileys & Emotion" },
  { name: "heart_on_fire", symbol: "❤️‍🔥", category: "Smileys & Emotion" },
  { name: "mending_heart", symbol: "❤️‍🩹", category: "Smileys & Emotion" },
  { name: "two_hearts", symbol: "💕", category: "Smileys & Emotion" },
  { name: "sparkling_heart", symbol: "💖", category: "Smileys & Emotion" },
  { name: "growing_heart", symbol: "💗", category: "Smileys & Emotion" },
  { name: "heartbeat", symbol: "💓", category: "Smileys & Emotion" },
  { name: "revolving_hearts", symbol: "💞", category: "Smileys & Emotion" },
  { name: "cupid", symbol: "💘", category: "Smileys & Emotion" },
  { name: "fire", symbol: "🔥", category: "Smileys & Emotion" },
  { name: "sparkles", symbol: "✨", category: "Smileys & Emotion" },
  { name: "star", symbol: "⭐", category: "Smileys & Emotion" },
  { name: "glowing_star", symbol: "🌟", category: "Smileys & Emotion" },
  { name: "dizzy", symbol: "💫", category: "Smileys & Emotion" },
  { name: "boom", symbol: "💥", category: "Smileys & Emotion" },
  { name: "anger", symbol: "💢", category: "Smileys & Emotion" },
  { name: "sweat_drops", symbol: "💦", category: "Smileys & Emotion" },
  { name: "dash", symbol: "💨", category: "Smileys & Emotion" },
  { name: "100", symbol: "💯", category: "Smileys & Emotion" },
  { name: "speech_balloon", symbol: "💬", category: "Smileys & Emotion" },
  { name: "thought_balloon", symbol: "💭", category: "Smileys & Emotion" },
  { name: "zzz", symbol: "💤", category: "Smileys & Emotion" },

  // --- People & Body ---
  { name: "wave", symbol: "👋", category: "People & Body" },
  { name: "raised_back_of_hand", symbol: "🤚", category: "People & Body" },
  { name: "hand", symbol: "✋", category: "People & Body" },
  { name: "vulcan_salute", symbol: "🖖", category: "People & Body" },
  { name: "rightwards_hand", symbol: "🫱", category: "People & Body" },
  { name: "leftwards_hand", symbol: "🫲", category: "People & Body" },
  { name: "ok_hand", symbol: "👌", category: "People & Body" },
  { name: "pinched_fingers", symbol: "🤌", category: "People & Body" },
  { name: "pinching_hand", symbol: "🤏", category: "People & Body" },
  { name: "v", symbol: "✌️", category: "People & Body" },
  { name: "cross_fingers", symbol: "🤞", category: "People & Body" },
  { name: "love_you_gesture", symbol: "🤟", category: "People & Body" },
  { name: "rock", symbol: "🤘", category: "People & Body" },
  { name: "call_me_hand", symbol: "🤙", category: "People & Body" },
  { name: "point_left", symbol: "👈", category: "People & Body" },
  { name: "point_right", symbol: "👉", category: "People & Body" },
  { name: "point_up_2", symbol: "👆", category: "People & Body" },
  { name: "middle_finger", symbol: "🖕", category: "People & Body" },
  { name: "point_down", symbol: "👇", category: "People & Body" },
  { name: "point_up", symbol: "☝️", category: "People & Body" },
  { name: "index_pointing_at_the_viewer", symbol: "🫵", category: "People & Body" },
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
  { name: "mechanical_arm", symbol: "🦾", category: "People & Body" },
  { name: "leg", symbol: "🦵", category: "People & Body" },
  { name: "foot", symbol: "🦶", category: "People & Body" },
  { name: "ear", symbol: "👂", category: "People & Body" },
  { name: "nose", symbol: "👃", category: "People & Body" },
  { name: "brain", symbol: "🧠", category: "People & Body" },
  { name: "eye", symbol: "👁️", category: "People & Body" },
  { name: "eyes", symbol: "👀", category: "People & Body" },
  { name: "tongue", symbol: "👅", category: "People & Body" },
  { name: "mouth", symbol: "👄", category: "People & Body" },
  { name: "baby", symbol: "👶", category: "People & Body" },
  { name: "boy", symbol: "👦", category: "People & Body" },
  { name: "girl", symbol: "👧", category: "People & Body" },
  { name: "man", symbol: "👨", category: "People & Body" },
  { name: "woman", symbol: "👩", category: "People & Body" },
  { name: "older_man", symbol: "👴", category: "People & Body" },
  { name: "older_woman", symbol: "👵", category: "People & Body" },
  { name: "person_frowning", symbol: "🙍", category: "People & Body" },
  { name: "person_pouting", symbol: "🙎", category: "People & Body" },
  { name: "no_good", symbol: "🙅", category: "People & Body" },
  { name: "ok_woman", symbol: "🙆", category: "People & Body" },
  { name: "tipping_hand_person", symbol: "💁", category: "People & Body" },
  { name: "raising_hand", symbol: "🙋", category: "People & Body" },
  { name: "deaf_person", symbol: "🧏", category: "People & Body" },
  { name: "bowing", symbol: "🙇", category: "People & Body" },
  { name: "facepalm", symbol: "🤦", category: "People & Body" },
  { name: "shrug", symbol: "🤷", category: "People & Body" },
  { name: "ninja", symbol: "🥷", category: "People & Body" },
  { name: "dancer", symbol: "💃", category: "People & Body" },
  { name: "man_dancing", symbol: "🕺", category: "People & Body" },
  { name: "walking", symbol: "🚶", category: "People & Body" },
  { name: "running", symbol: "🏃", category: "People & Body" },

  // --- Animals & Nature ---
  { name: "dog", symbol: "🐶", category: "Animals & Nature" },
  { name: "cat", symbol: "🐱", category: "Animals & Nature" },
  { name: "mouse", symbol: "🐭", category: "Animals & Nature" },
  { name: "hamster", symbol: "🐹", category: "Animals & Nature" },
  { name: "rabbit", symbol: "🐰", category: "Animals & Nature" },
  { name: "fox_face", symbol: "🦊", category: "Animals & Nature" },
  { name: "bear", symbol: "🐻", category: "Animals & Nature" },
  { name: "panda_face", symbol: "🐼", category: "Animals & Nature" },
  { name: "polar_bear", symbol: "🐻‍❄️", category: "Animals & Nature" },
  { name: "koala", symbol: "🐨", category: "Animals & Nature" },
  { name: "tiger", symbol: "🐯", category: "Animals & Nature" },
  { name: "lion", symbol: "🦁", category: "Animals & Nature" },
  { name: "cow", symbol: "🐮", category: "Animals & Nature" },
  { name: "pig", symbol: "🐷", category: "Animals & Nature" },
  { name: "pig_nose", symbol: "🐽", category: "Animals & Nature" },
  { name: "frog", symbol: "🐸", category: "Animals & Nature" },
  { name: "monkey_face", symbol: "🐵", category: "Animals & Nature" },
  { name: "monkey", symbol: "🐒", category: "Animals & Nature" },
  { name: "gorilla", symbol: "🦍", category: "Animals & Nature" },
  { name: "chicken", symbol: "🐔", category: "Animals & Nature" },
  { name: "penguin", symbol: "🐧", category: "Animals & Nature" },
  { name: "bird", symbol: "🐦", category: "Animals & Nature" },
  { name: "baby_chick", symbol: "🐤", category: "Animals & Nature" },
  { name: "hatching_chick", symbol: "🐣", category: "Animals & Nature" },
  { name: "eagle", symbol: "🦅", category: "Animals & Nature" },
  { name: "duck", symbol: "🦆", category: "Animals & Nature" },
  { name: "swan", symbol: "🦢", category: "Animals & Nature" },
  { name: "owl", symbol: "🦉", category: "Animals & Nature" },
  { name: "flamingo", symbol: "🦩", category: "Animals & Nature" },
  { name: "peacock", symbol: "🦚", category: "Animals & Nature" },
  { name: "parrot", symbol: "🦜", category: "Animals & Nature" },
  { name: "wolf", symbol: "🐺", category: "Animals & Nature" },
  { name: "boar", symbol: "🐗", category: "Animals & Nature" },
  { name: "horse", symbol: "🐴", category: "Animals & Nature" },
  { name: "unicorn", symbol: "🦄", category: "Animals & Nature" },
  { name: "bee", symbol: "🐝", category: "Animals & Nature" },
  { name: "bug", symbol: "🐛", category: "Animals & Nature" },
  { name: "butterfly", symbol: "🦋", category: "Animals & Nature" },
  { name: "snail", symbol: "🐌", category: "Animals & Nature" },
  { name: "beetle", symbol: "🐞", category: "Animals & Nature" },
  { name: "ant", symbol: "🐜", category: "Animals & Nature" },
  { name: "spider", symbol: "🕷️", category: "Animals & Nature" },
  { name: "scorpion", symbol: "🦂", category: "Animals & Nature" },
  { name: "crab", symbol: "🦀", category: "Animals & Nature" },
  { name: "lobster", symbol: "🦞", category: "Animals & Nature" },
  { name: "squid", symbol: "🦑", category: "Animals & Nature" },
  { name: "octopus", symbol: "🐙", category: "Animals & Nature" },
  { name: "shrimp", symbol: "🦐", category: "Animals & Nature" },
  { name: "fish", symbol: "🐟", category: "Animals & Nature" },
  { name: "tropical_fish", symbol: "🐠", category: "Animals & Nature" },
  { name: "blowfish", symbol: "🐡", category: "Animals & Nature" },
  { name: "shark", symbol: "🦈", category: "Animals & Nature" },
  { name: "whale", symbol: "🐳", category: "Animals & Nature" },
  { name: "dolphin", symbol: "🐬", category: "Animals & Nature" },
  { name: "crocodile", symbol: "🐊", category: "Animals & Nature" },
  { name: "turtle", symbol: "🐢", category: "Animals & Nature" },
  { name: "lizard", symbol: "🦎", category: "Animals & Nature" },
  { name: "snake", symbol: "🐍", category: "Animals & Nature" },
  { name: "dragon_face", symbol: "🐲", category: "Animals & Nature" },
  { name: "sauropod", symbol: "🦕", category: "Animals & Nature" },
  { name: "t_rex", symbol: "🦖", category: "Animals & Nature" },
  { name: "bouquet", symbol: "💐", category: "Animals & Nature" },
  { name: "cherry_blossom", symbol: "🌸", category: "Animals & Nature" },
  { name: "rose", symbol: "🌹", category: "Animals & Nature" },
  { name: "hibiscus", symbol: "🌺", category: "Animals & Nature" },
  { name: "sunflower", symbol: "🌻", category: "Animals & Nature" },
  { name: "blossom", symbol: "🌼", category: "Animals & Nature" },
  { name: "tulip", symbol: "🌷", category: "Animals & Nature" },
  { name: "seedling", symbol: "🌱", category: "Animals & Nature" },
  { name: "evergreen_tree", symbol: "🌲", category: "Animals & Nature" },
  { name: "deciduous_tree", symbol: "🌳", category: "Animals & Nature" },
  { name: "palm_tree", symbol: "🌴", category: "Animals & Nature" },
  { name: "cactus", symbol: "🌵", category: "Animals & Nature" },
  { name: "four_leaf_clover", symbol: "🍀", category: "Animals & Nature" },
  { name: "maple_leaf", symbol: "🍁", category: "Animals & Nature" },
  { name: "fallen_leaf", symbol: "🍂", category: "Animals & Nature" },
  { name: "mushroom", symbol: "🍄", category: "Animals & Nature" },
  { name: "rainbow", symbol: "🌈", category: "Animals & Nature" },
  { name: "sunny", symbol: "☀️", category: "Animals & Nature" },
  { name: "cloud", symbol: "☁️", category: "Animals & Nature" },
  { name: "cloud_with_rain", symbol: "🌧️", category: "Animals & Nature" },
  { name: "thunder_cloud_and_rain", symbol: "⛈️", category: "Animals & Nature" },
  { name: "snowflake", symbol: "❄️", category: "Animals & Nature" },
  { name: "ocean", symbol: "🌊", category: "Animals & Nature" },

  // --- Food & Drink ---
  { name: "apple", symbol: "🍎", category: "Food & Drink" },
  { name: "green_apple", symbol: "🍏", category: "Food & Drink" },
  { name: "pear", symbol: "🍐", category: "Food & Drink" },
  { name: "orange", symbol: "🍊", category: "Food & Drink" },
  { name: "lemon", symbol: "🍋", category: "Food & Drink" },
  { name: "banana", symbol: "🍌", category: "Food & Drink" },
  { name: "watermelon", symbol: "🍉", category: "Food & Drink" },
  { name: "grapes", symbol: "🍇", category: "Food & Drink" },
  { name: "strawberry", symbol: "🍓", category: "Food & Drink" },
  { name: "blueberries", symbol: "🫐", category: "Food & Drink" },
  { name: "melon", symbol: "🍈", category: "Food & Drink" },
  { name: "cherries", symbol: "🍒", category: "Food & Drink" },
  { name: "peach", symbol: "🍑", category: "Food & Drink" },
  { name: "mango", symbol: "🥭", category: "Food & Drink" },
  { name: "pineapple", symbol: "🍍", category: "Food & Drink" },
  { name: "coconut", symbol: "🥥", category: "Food & Drink" },
  { name: "kiwi", symbol: "🥝", category: "Food & Drink" },
  { name: "tomato", symbol: "🍅", category: "Food & Drink" },
  { name: "avocado", symbol: "🥑", category: "Food & Drink" },
  { name: "eggplant", symbol: "🍆", category: "Food & Drink" },
  { name: "potato", symbol: "🥔", category: "Food & Drink" },
  { name: "carrot", symbol: "🥕", category: "Food & Drink" },
  { name: "corn", symbol: "🌽", category: "Food & Drink" },
  { name: "hot_pepper", symbol: "🌶️", category: "Food & Drink" },
  { name: "cucumber", symbol: "🥒", category: "Food & Drink" },
  { name: "broccoli", symbol: "🥦", category: "Food & Drink" },
  { name: "garlic", symbol: "🧄", category: "Food & Drink" },
  { name: "croissant", symbol: "🥐", category: "Food & Drink" },
  { name: "bread", symbol: "🍞", category: "Food & Drink" },
  { name: "baguette_bread", symbol: "🥖", category: "Food & Drink" },
  { name: "pretzel", symbol: "🥨", category: "Food & Drink" },
  { name: "bagel", symbol: "🥯", category: "Food & Drink" },
  { name: "pancakes", symbol: "🥞", category: "Food & Drink" },
  { name: "waffle", symbol: "🧇", category: "Food & Drink" },
  { name: "cheese_wedge", symbol: "🧀", category: "Food & Drink" },
  { name: "bacon", symbol: "🥓", category: "Food & Drink" },
  { name: "hamburger", symbol: "🍔", category: "Food & Drink" },
  { name: "fries", symbol: "🍟", category: "Food & Drink" },
  { name: "pizza", symbol: "🍕", category: "Food & Drink" },
  { name: "hotdog", symbol: "🌭", category: "Food & Drink" },
  { name: "sandwich", symbol: "🥪", category: "Food & Drink" },
  { name: "taco", symbol: "🌮", category: "Food & Drink" },
  { name: "burrito", symbol: "🌯", category: "Food & Drink" },
  { name: "fried_egg", symbol: "🍳", category: "Food & Drink" },
  { name: "popcorn", symbol: "🍿", category: "Food & Drink" },
  { name: "bento", symbol: "🍱", category: "Food & Drink" },
  { name: "rice_ball", symbol: "🍙", category: "Food & Drink" },
  { name: "rice", symbol: "🍚", category: "Food & Drink" },
  { name: "curry", symbol: "🍛", category: "Food & Drink" },
  { name: "ramen", symbol: "🍜", category: "Food & Drink" },
  { name: "spaghetti", symbol: "🍝", category: "Food & Drink" },
  { name: "sushi", symbol: "🍣", category: "Food & Drink" },
  { name: "dumpling", symbol: "🥟", category: "Food & Drink" },
  { name: "ice_cream", symbol: "🍨", category: "Food & Drink" },
  { name: "doughnut", symbol: "🍩", category: "Food & Drink" },
  { name: "cookie", symbol: "🍪", category: "Food & Drink" },
  { name: "birthday", symbol: "🎂", category: "Food & Drink" },
  { name: "shortcake", symbol: "🍰", category: "Food & Drink" },
  { name: "cupcake", symbol: "🧁", category: "Food & Drink" },
  { name: "chocolate_bar", symbol: "🍫", category: "Food & Drink" },
  { name: "candy", symbol: "🍬", category: "Food & Drink" },
  { name: "lollipop", symbol: "🍭", category: "Food & Drink" },
  { name: "coffee", symbol: "☕", category: "Food & Drink" },
  { name: "tea", symbol: "🍵", category: "Food & Drink" },
  { name: "boba", symbol: "🧋", category: "Food & Drink" },
  { name: "beer", symbol: "🍺", category: "Food & Drink" },
  { name: "beers", symbol: "🍻", category: "Food & Drink" },
  { name: "wine_glass", symbol: "🍷", category: "Food & Drink" },
  { name: "cocktail", symbol: "🍸", category: "Food & Drink" },
  { name: "tropical_drink", symbol: "🍹", category: "Food & Drink" },
  { name: "champagne", symbol: "🍾", category: "Food & Drink" },

  // --- Activities ---
  { name: "soccer", symbol: "⚽", category: "Activities" },
  { name: "basketball", symbol: "🏀", category: "Activities" },
  { name: "football", symbol: "🏈", category: "Activities" },
  { name: "baseball", symbol: "⚾", category: "Activities" },
  { name: "softball", symbol: "🥎", category: "Activities" },
  { name: "tennis", symbol: "🎾", category: "Activities" },
  { name: "volleyball", symbol: "🏐", category: "Activities" },
  { name: "rugby_football", symbol: "🏉", category: "Activities" },
  { name: "flying_disc", symbol: "🥏", category: "Activities" },
  { name: "8ball", symbol: "🎱", category: "Activities" },
  { name: "ping_pong", symbol: "🏓", category: "Activities" },
  { name: "badminton", symbol: "🏸", category: "Activities" },
  { name: "boxing_glove", symbol: "🥊", category: "Activities" },
  { name: "martial_arts_uniform", symbol: "🥋", category: "Activities" },
  { name: "golf", symbol: "⛳", category: "Activities" },
  { name: "ice_skate", symbol: "⛸️", category: "Activities" },
  { name: "fishing_pole_and_fish", symbol: "🎣", category: "Activities" },
  { name: "bow_and_arrow", symbol: "🏹", category: "Activities" },
  { name: "skate", symbol: "🛼", category: "Activities" },
  { name: "sled", symbol: "🛷", category: "Activities" },
  { name: "trophy", symbol: "🏆", category: "Activities" },
  { name: "medal_sports", symbol: "🏅", category: "Activities" },
  { name: "medal_military", symbol: "🎖️", category: "Activities" },
  { name: "first_place_medal", symbol: "🥇", category: "Activities" },
  { name: "second_place_medal", symbol: "🥈", category: "Activities" },
  { name: "third_place_medal", symbol: "🥉", category: "Activities" },
  { name: "ticket", symbol: "🎫", category: "Activities" },
  { name: "circus_tent", symbol: "🎪", category: "Activities" },
  { name: "performing_arts", symbol: "🎭", category: "Activities" },
  { name: "art", symbol: "🎨", category: "Activities" },
  { name: "clapper", symbol: "🎬", category: "Activities" },
  { name: "microphone", symbol: "🎤", category: "Activities" },
  { name: "headphones", symbol: "🎧", category: "Activities" },
  { name: "musical_score", symbol: "🎼", category: "Activities" },
  { name: "musical_keyboard", symbol: "🎹", category: "Activities" },
  { name: "drum", symbol: "🥁", category: "Activities" },
  { name: "saxophone", symbol: "🎷", category: "Activities" },
  { name: "trumpet", symbol: "🎺", category: "Activities" },
  { name: "guitar", symbol: "🎸", category: "Activities" },
  { name: "violin", symbol: "🎻", category: "Activities" },
  { name: "game_die", symbol: "🎲", category: "Activities" },
  { name: "dart", symbol: "🎯", category: "Activities" },
  { name: "bowling", symbol: "🎳", category: "Activities" },
  { name: "video_game", symbol: "🎮", category: "Activities" },
  { name: "slot_machine", symbol: "🎰", category: "Activities" },
  { name: "jigsaw", symbol: "🧩", category: "Activities" },

  // --- Travel & Places ---
  { name: "car", symbol: "🚗", category: "Travel & Places" },
  { name: "taxi", symbol: "🚕", category: "Travel & Places" },
  { name: "blue_car", symbol: "🚙", category: "Travel & Places" },
  { name: "bus", symbol: "🚌", category: "Travel & Places" },
  { name: "police_car", symbol: "🚓", category: "Travel & Places" },
  { name: "ambulance", symbol: "🚑", category: "Travel & Places" },
  { name: "fire_engine", symbol: "🚒", category: "Travel & Places" },
  { name: "truck", symbol: "🚚", category: "Travel & Places" },
  { name: "tractor", symbol: "🚜", category: "Travel & Places" },
  { name: "racing_car", symbol: "🏎️", category: "Travel & Places" },
  { name: "motorcycle", symbol: "🏍️", category: "Travel & Places" },
  { name: "motor_scooter", symbol: "🛵", category: "Travel & Places" },
  { name: "bike", symbol: "🚲", category: "Travel & Places" },
  { name: "kick_scooter", symbol: "🛴", category: "Travel & Places" },
  { name: "skateboard", symbol: "🛹", category: "Travel & Places" },
  { name: "train", symbol: "🚆", category: "Travel & Places" },
  { name: "metro", symbol: "🚇", category: "Travel & Places" },
  { name: "bullettrain_side", symbol: "🚄", category: "Travel & Places" },
  { name: "airplane", symbol: "✈️", category: "Travel & Places" },
  { name: "small_airplane", symbol: "🛩️", category: "Travel & Places" },
  { name: "flight_departure", symbol: "🛫", category: "Travel & Places" },
  { name: "flight_arrival", symbol: "🛬", category: "Travel & Places" },
  { name: "parachute", symbol: "🪂", category: "Travel & Places" },
  { name: "rocket", symbol: "🚀", category: "Travel & Places" },
  { name: "flying_saucer", symbol: "🛸", category: "Travel & Places" },
  { name: "helicopter", symbol: "🚁", category: "Travel & Places" },
  { name: "canoe", symbol: "🛶", category: "Travel & Places" },
  { name: "sailboat", symbol: "⛵", category: "Travel & Places" },
  { name: "speedboat", symbol: "🚤", category: "Travel & Places" },
  { name: "ferry", symbol: "⛴️", category: "Travel & Places" },
  { name: "cruise_ship", symbol: "🚢", category: "Travel & Places" },
  { name: "anchor", symbol: "⚓", category: "Travel & Places" },
  { name: "fuelpump", symbol: "⛽", category: "Travel & Places" },
  { name: "traffic_light", symbol: "🚦", category: "Travel & Places" },
  { name: "construction", symbol: "🚧", category: "Travel & Places" },
  { name: "house", symbol: "🏠", category: "Travel & Places" },
  { name: "house_with_garden", symbol: "🏡", category: "Travel & Places" },
  { name: "office", symbol: "🏢", category: "Travel & Places" },
  { name: "hospital", symbol: "🏥", category: "Travel & Places" },
  { name: "bank", symbol: "🏦", category: "Travel & Places" },
  { name: "hotel", symbol: "🏨", category: "Travel & Places" },
  { name: "school", symbol: "🏫", category: "Travel & Places" },
  { name: "factory", symbol: "🏭", category: "Travel & Places" },
  { name: "castle", symbol: "🏰", category: "Travel & Places" },
  { name: "stadium", symbol: "🏟️", category: "Travel & Places" },
  { name: "statue_of_liberty", symbol: "🗽", category: "Travel & Places" },
  { name: "ferris_wheel", symbol: "🎡", category: "Travel & Places" },
  { name: "roller_coaster", symbol: "🎢", category: "Travel & Places" },
  { name: "beach_with_umbrella", symbol: "🏖️", category: "Travel & Places" },
  { name: "camping", symbol: "🏕️", category: "Travel & Places" },
  { name: "volcano", symbol: "🌋", category: "Travel & Places" },
  { name: "mountain", symbol: "⛰️", category: "Travel & Places" },
  { name: "cityscape", symbol: "🏙️", category: "Travel & Places" },
  { name: "city_sunset", symbol: "🌆", category: "Travel & Places" },
  { name: "night_with_stars", symbol: "🌃", category: "Travel & Places" },

  // --- Objects ---
  { name: "laptop", symbol: "💻", category: "Objects" },
  { name: "desktop_computer", symbol: "🖥️", category: "Objects" },
  { name: "keyboard", symbol: "⌨️", category: "Objects" },
  { name: "mouse_three_button", symbol: "🖱️", category: "Objects" },
  { name: "printer", symbol: "🖨️", category: "Objects" },
  { name: "iphone", symbol: "📱", category: "Objects" },
  { name: "telephone_receiver", symbol: "📞", category: "Objects" },
  { name: "pager", symbol: "📟", category: "Objects" },
  { name: "battery", symbol: "🔋", category: "Objects" },
  { name: "electric_plug", symbol: "🔌", category: "Objects" },
  { name: "bulb", symbol: "💡", category: "Objects" },
  { name: "flashlight", symbol: "🔦", category: "Objects" },
  { name: "candle", symbol: "🕯️", category: "Objects" },
  { name: "moneybag", symbol: "💰", category: "Objects" },
  { name: "coin", symbol: "🪙", category: "Objects" },
  { name: "dollar", symbol: "💵", category: "Objects" },
  { name: "credit_card", symbol: "💳", category: "Objects" },
  { name: "gem", symbol: "💎", category: "Objects" },
  { name: "wrench", symbol: "🔧", category: "Objects" },
  { name: "hammer", symbol: "🔨", category: "Objects" },
  { name: "hammer_and_wrench", symbol: "🛠️", category: "Objects" },
  { name: "screwdriver", symbol: "🪛", category: "Objects" },
  { name: "nut_and_bolt", symbol: "🔩", category: "Objects" },
  { name: "gear", symbol: "⚙️", category: "Objects" },
  { name: "scales", symbol: "⚖️", category: "Objects" },
  { name: "link", symbol: "🔗", category: "Objects" },
  { name: "chains", symbol: "⛓️", category: "Objects" },
  { name: "toolbox", symbol: "🧰", category: "Objects" },
  { name: "magnet", symbol: "🧲", category: "Objects" },
  { name: "ladder", symbol: "🪜", category: "Objects" },
  { name: "test_tube", symbol: "🧪", category: "Objects" },
  { name: "microscope", symbol: "🔬", category: "Objects" },
  { name: "telescope", symbol: "🔭", category: "Objects" },
  { name: "satellite_antenna", symbol: "📡", category: "Objects" },
  { name: "syringe", symbol: "💉", category: "Objects" },
  { name: "pill", symbol: "💊", category: "Objects" },
  { name: "adhesive_bandage", symbol: "🩹", category: "Objects" },
  { name: "stethoscope", symbol: "🩺", category: "Objects" },
  { name: "door", symbol: "🚪", category: "Objects" },
  { name: "key", symbol: "🔑", category: "Objects" },
  { name: "lock", symbol: "🔒", category: "Objects" },
  { name: "unlock", symbol: "🔓", category: "Objects" },
  { name: "bell", symbol: "🔔", category: "Objects" },
  { name: "gift", symbol: "🎁", category: "Objects" },
  { name: "balloon", symbol: "🎈", category: "Objects" },
  { name: "tada", symbol: "🎉", category: "Objects" },
  { name: "confetti_ball", symbol: "🎊", category: "Objects" },
  { name: "package", symbol: "📦", category: "Objects" },
  { name: "email", symbol: "✉️", category: "Objects" },
  { name: "inbox_tray", symbol: "📥", category: "Objects" },
  { name: "outbox_tray", symbol: "📤", category: "Objects" },
  { name: "scroll", symbol: "📜", category: "Objects" },
  { name: "bookmark_tabs", symbol: "📑", category: "Objects" },
  { name: "book", symbol: "📖", category: "Objects" },
  { name: "books", symbol: "📚", category: "Objects" },
  { name: "notebook", symbol: "📓", category: "Objects" },
  { name: "pencil", symbol: "📝", category: "Objects" },
  { name: "calendar", symbol: "📅", category: "Objects" },
  { name: "scissors", symbol: "✂️", category: "Objects" },
  { name: "wastebasket", symbol: "🗑️", category: "Objects" },
  { name: "hourglass", symbol: "⌛", category: "Objects" },
  { name: "watch", symbol: "⌚", category: "Objects" },
  { name: "alarm_clock", symbol: "⏰", category: "Objects" },
  { name: "camera", symbol: "📷", category: "Objects" },
  { name: "tv", symbol: "📺", category: "Objects" },
  { name: "radio", symbol: "📻", category: "Objects" },
  { name: "crown", symbol: "👑", category: "Objects" },

  // --- Symbols ---
  { name: "check", symbol: "✅", category: "Symbols" },
  { name: "heavy_check_mark", symbol: "✔️", category: "Symbols" },
  { name: "cross", symbol: "❌", category: "Symbols" },
  { name: "x", symbol: "❎", category: "Symbols" },
  { name: "plus", symbol: "➕", category: "Symbols" },
  { name: "minus", symbol: "➖", category: "Symbols" },
  { name: "heavy_division_sign", symbol: "➗", category: "Symbols" },
  { name: "heavy_multiplication_x", symbol: "✖️", category: "Symbols" },
  { name: "question", symbol: "❓", category: "Symbols" },
  { name: "grey_question", symbol: "❔", category: "Symbols" },
  { name: "exclamation", symbol: "❗", category: "Symbols" },
  { name: "grey_exclamation", symbol: "❕", category: "Symbols" },
  { name: "bangbang", symbol: "‼️", category: "Symbols" },
  { name: "interrobang", symbol: "⁉️", category: "Symbols" },
  { name: "warning", symbol: "⚠️", category: "Symbols" },
  { name: "no_entry", symbol: "⛔", category: "Symbols" },
  { name: "no_entry_sign", symbol: "🚫", category: "Symbols" },
  { name: "stop_sign", symbol: "🛑", category: "Symbols" },
  { name: "radioactive", symbol: "☢️", category: "Symbols" },
  { name: "biohazard", symbol: "☣️", category: "Symbols" },
  { name: "arrow_up", symbol: "⬆️", category: "Symbols" },
  { name: "arrow_down", symbol: "⬇️", category: "Symbols" },
  { name: "arrow_left", symbol: "⬅️", category: "Symbols" },
  { name: "arrow_right", symbol: "➡️", category: "Symbols" },
  { name: "arrow_forward", symbol: "▶️", category: "Symbols" },
  { name: "arrow_backward", symbol: "◀️", category: "Symbols" },
  { name: "pause_button", symbol: "⏸️", category: "Symbols" },
  { name: "stop_button", symbol: "⏹️", category: "Symbols" },
  { name: "record_button", symbol: "⏺️", category: "Symbols" },
  { name: "repeat", symbol: "🔁", category: "Symbols" },
  { name: "shuffle", symbol: "🔀", category: "Symbols" },
  { name: "signal_strength", symbol: "📶", category: "Symbols" },
  { name: "cinema", symbol: "🎦", category: "Symbols" },
  { name: "recycle", symbol: "♻️", category: "Symbols" },
  { name: "trident", symbol: "🔱", category: "Symbols" },
  { name: "fleur_de_lis", symbol: "⚜️", category: "Symbols" },
  { name: "beginner", symbol: "🔰", category: "Symbols" },
  { name: "infinity", symbol: "♾️", category: "Symbols" },
  { name: "zap", symbol: "⚡", category: "Symbols" },
  { name: "peace_symbol", symbol: "☮️", category: "Symbols" },
  { name: "yin_yang", symbol: "☯️", category: "Symbols" },
  { name: "om", symbol: "🕉️", category: "Symbols" },
  { name: "wheel_of_dharma", symbol: "☸️", category: "Symbols" },
  { name: "orthodox_cross", symbol: "☦️", category: "Symbols" },
  { name: "star_of_david", symbol: "✡️", category: "Symbols" },
  { name: "star_and_crescent", symbol: "☪️", category: "Symbols" },
  { name: "menorah", symbol: "🕎", category: "Symbols" },
  { name: "red_circle", symbol: "🔴", category: "Symbols" },
  { name: "orange_circle", symbol: "🟠", category: "Symbols" },
  { name: "yellow_circle", symbol: "🟡", category: "Symbols" },
  { name: "green_circle", symbol: "🟢", category: "Symbols" },
  { name: "blue_circle", symbol: "🔵", category: "Symbols" },
  { name: "purple_circle", symbol: "🟣", category: "Symbols" },
  { name: "brown_circle", symbol: "🟤", category: "Symbols" },
  { name: "black_circle", symbol: "⚫", category: "Symbols" },
  { name: "white_circle", symbol: "⚪", category: "Symbols" },
  { name: "red_square", symbol: "🟥", category: "Symbols" },
  { name: "blue_square", symbol: "🟦", category: "Symbols" },
  { name: "black_large_square", symbol: "⬛", category: "Symbols" },
  { name: "white_large_square", symbol: "⬜", category: "Symbols" },

  // --- Flags ---
  { name: "transgender_flag", symbol: "🏳️‍⚧️", category: "Flags" },
  { name: "rainbow_flag", symbol: "🏳️‍🌈", category: "Flags" },
  { name: "pirate_flag", symbol: "🏴‍☠️", category: "Flags" },
  { name: "checkered_flag", symbol: "🏁", category: "Flags" },
  { name: "triangular_flag_on_post", symbol: "🚩", category: "Flags" },
  { name: "crossed_flags", symbol: "🎌", category: "Flags" },
  { name: "black_flag", symbol: "🏴", category: "Flags" },
  { name: "white_flag", symbol: "🏳️", category: "Flags" },
  { name: "flag_us", symbol: "🇺🇸", category: "Flags" },
  { name: "flag_gb", symbol: "🇬🇧", category: "Flags" },
  { name: "flag_ca", symbol: "🇨🇦", category: "Flags" },
  { name: "flag_au", symbol: "🇦🇺", category: "Flags" },
  { name: "flag_de", symbol: "🇩🇪", category: "Flags" },
  { name: "flag_fr", symbol: "🇫🇷", category: "Flags" },
  { name: "flag_it", symbol: "🇮🇹", category: "Flags" },
  { name: "flag_es", symbol: "🇪🇸", category: "Flags" },
  { name: "flag_jp", symbol: "🇯🇵", category: "Flags" },
  { name: "flag_kr", symbol: "🇰🇷", category: "Flags" },
  { name: "flag_cn", symbol: "🇨🇳", category: "Flags" },
  { name: "flag_in", symbol: "🇮🇳", category: "Flags" },
  { name: "flag_br", symbol: "🇧🇷", category: "Flags" },
  { name: "flag_mx", symbol: "🇲🇽", category: "Flags" },
  { name: "flag_tr", symbol: "🇹🇷", category: "Flags" },
  { name: "flag_ru", symbol: "🇷🇺", category: "Flags" },
  { name: "flag_nl", symbol: "🇳🇱", category: "Flags" },
  { name: "flag_se", symbol: "🇸🇪", category: "Flags" },
  { name: "flag_no", symbol: "🇳🇴", category: "Flags" },
  { name: "flag_dk", symbol: "🇩🇰", category: "Flags" },
  { name: "flag_fi", symbol: "🇫🇮", category: "Flags" },
  { name: "flag_pl", symbol: "🇵🇱", category: "Flags" },
  { name: "flag_ua", symbol: "🇺🇦", category: "Flags" },
  { name: "flag_gr", symbol: "🇬🇷", category: "Flags" },
  { name: "flag_pt", symbol: "🇵🇹", category: "Flags" },
  { name: "flag_ch", symbol: "🇨🇭", category: "Flags" },
  { name: "flag_at", symbol: "🇦🇹", category: "Flags" },
  { name: "flag_be", symbol: "🇧🇪", category: "Flags" },
  { name: "flag_ie", symbol: "🇮🇪", category: "Flags" },
  { name: "flag_nz", symbol: "🇳🇿", category: "Flags" },
  { name: "flag_za", symbol: "🇿🇦", category: "Flags" },
  { name: "flag_sg", symbol: "🇸🇬", category: "Flags" },
  { name: "flag_ae", symbol: "🇦🇪", category: "Flags" },
  { name: "flag_sa", symbol: "🇸🇦", category: "Flags" },
  { name: "flag_eg", symbol: "🇪🇬", category: "Flags" },
  { name: "flag_ar", symbol: "🇦🇷", category: "Flags" },
  { name: "flag_cl", symbol: "🇨🇱", category: "Flags" },
  { name: "flag_co", symbol: "🇨🇴", category: "Flags" },
  { name: "flag_ph", symbol: "🇵🇭", category: "Flags" },
  { name: "flag_vn", symbol: "🇻🇳", category: "Flags" },
  { name: "flag_th", symbol: "🇹🇭", category: "Flags" },
  { name: "flag_id", symbol: "🇮🇩", category: "Flags" }
];

export function EmojiPicker({
  serverId,
  onPickEmoji,
  onClose,
  canManageEmojis = false,
  onRequestUploadEmoji,
  className,
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
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const scrollToCategory = (catId: string) => {
    setActiveCategory(catId);
    if (search) setSearch("");
    const target = categoryRefs.current[catId];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
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
      className={className || "discord-emoji-picker popover-picker"}
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
              onClick={() => scrollToCategory(cat.id)}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </nav>

        {/* Grid Content Scroll Area */}
        <div className="emoji-grid-scroll">
          {search ? (
            /* Search Results */
            <div className="emoji-section">
              <div className="emoji-section-header">
                <span className="flex items-center gap-1">
                  <Search size={14} /> Search Results ({filteredCustom.length + filteredUnicode.length})
                </span>
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
                {!filteredCustom.length && !filteredUnicode.length && (
                  <p className="no-emoji-hint">No emojis found matching "{search}"</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Favorites */}
              {favoriteItems.length > 0 && (
                <div
                  ref={(el) => {
                    categoryRefs.current["favorites"] = el;
                  }}
                  className="emoji-section"
                >
                  <div className="emoji-section-header">
                    <span className="flex items-center gap-1">
                      <Star size={14} /> Favorites ({favoriteItems.length})
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
                  </div>
                </div>
              )}

              {/* Custom Server Emojis */}
              <div
                ref={(el) => {
                  categoryRefs.current["server"] = el;
                }}
                className="emoji-section"
              >
                <div className="emoji-section-header">
                  <span className="flex items-center gap-1">
                    <ImageIcon size={14} /> Server Emojis ({customEmojis.length})
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
                  {customEmojis.map((item) => (
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
                  {!customEmojis.length && (
                    <p className="no-emoji-hint">No custom server emojis yet.</p>
                  )}
                </div>
              </div>

              {/* Categorized Unicode Emojis */}
              {CATEGORIES.filter((c) => c.categoryName).map((cat) => {
                const items = EMOJI_DATASET.filter(
                  (e) => e.category === cat.categoryName,
                );
                if (!items.length) return null;
                return (
                  <div
                    key={cat.id}
                    ref={(el) => {
                      categoryRefs.current[cat.id] = el;
                    }}
                    className="emoji-section"
                  >
                    <div className="emoji-section-header">
                      <span className="flex items-center gap-1">
                        {cat.icon} {cat.label} ({items.length})
                      </span>
                    </div>
                    <div className="emoji-grid">
                      {items.map((item) => (
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
                );
              })}
            </>
          )}
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
