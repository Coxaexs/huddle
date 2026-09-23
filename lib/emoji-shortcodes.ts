/**
 * Comprehensive Emoji Shortcode Registry, Lookup, Text Replacement, and Quick-Reaction Parser.
 * Supports Discord-style :shortcode: syntax (e.g. :tada:, :smiley:, :thumbsup:)
 * and quick-reaction commands like :+tada: to react to the last message in the channel.
 */

export interface EmojiDefinition {
  name: string;
  symbol: string;
  category: string;
}

// Full offline emoji shortcode dataset with Discord & Unicode standard names
export const EMOJI_DATASET: EmojiDefinition[] = [
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
  { name: "yawn", symbol: "🥱", category: "Smileys & Emotion" },
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
  { name: "heart", symbol: "❤️", category: "Smileys & Emotion" },
  { name: "orange_heart", symbol: "🧡", category: "Smileys & Emotion" },
  { name: "yellow_heart", symbol: "💛", category: "Smileys & Emotion" },
  { name: "green_heart", symbol: "💚", category: "Smileys & Emotion" },
  { name: "blue_heart", symbol: "💙", category: "Smileys & Emotion" },
  { name: "purple_heart", symbol: "💜", category: "Smileys & Emotion" },
  { name: "brown_heart", symbol: "🤎", category: "Smileys & Emotion" },
  { name: "black_heart", symbol: "🖤", category: "Smileys & Emotion" },
  { name: "white_heart", symbol: "🤍", category: "Smileys & Emotion" },
  { name: "broken_heart", symbol: "💔", category: "Smileys & Emotion" },
  { name: "heart_on_fire", symbol: "❤️‍🔥", category: "Smileys & Emotion" },
  { name: "sparkling_heart", symbol: "💖", category: "Smileys & Emotion" },
  { name: "growing_heart", symbol: "💗", category: "Smileys & Emotion" },
  { name: "heartbeat", symbol: "💓", category: "Smileys & Emotion" },
  { name: "revolving_hearts", symbol: "💞", category: "Smileys & Emotion" },
  { name: "two_hearts", symbol: "💕", category: "Smileys & Emotion" },
  { name: "fire", symbol: "🔥", category: "Smileys & Emotion" },
  { name: "sparkles", symbol: "✨", category: "Smileys & Emotion" },
  { name: "star", symbol: "⭐", category: "Smileys & Emotion" },
  { name: "star2", symbol: "🌟", category: "Smileys & Emotion" },
  { name: "boom", symbol: "💥", category: "Smileys & Emotion" },
  { name: "collision", symbol: "💥", category: "Smileys & Emotion" },
  { name: "100", symbol: "💯", category: "Smileys & Emotion" },

  // --- People & Body ---
  { name: "wave", symbol: "👋", category: "People & Body" },
  { name: "raised_back_of_hand", symbol: "🤚", category: "People & Body" },
  { name: "hand", symbol: "✋", category: "People & Body" },
  { name: "raised_hand", symbol: "✋", category: "People & Body" },
  { name: "vulcan_salute", symbol: "🖖", category: "People & Body" },
  { name: "rightwards_hand", symbol: "🫱", category: "People & Body" },
  { name: "leftwards_hand", symbol: "🫲", category: "People & Body" },
  { name: "ok_hand", symbol: "👌", category: "People & Body" },
  { name: "pinched_fingers", symbol: "🤌", category: "People & Body" },
  { name: "pinching_hand", symbol: "🤏", category: "People & Body" },
  { name: "v", symbol: "✌️", category: "People & Body" },
  { name: "crossed_fingers", symbol: "🤞", category: "People & Body" },
  { name: "love_you_gesture", symbol: "🤟", category: "People & Body" },
  { name: "metal", symbol: "🤘", category: "People & Body" },
  { name: "call_me_hand", symbol: "🤙", category: "People & Body" },
  { name: "point_left", symbol: "👈", category: "People & Body" },
  { name: "point_right", symbol: "👉", category: "People & Body" },
  { name: "point_up_2", symbol: "👆", category: "People & Body" },
  { name: "middle_finger", symbol: "🖕", category: "People & Body" },
  { name: "point_down", symbol: "👇", category: "People & Body" },
  { name: "point_up", symbol: "☝️", category: "People & Body" },
  { name: "thumbsup", symbol: "👍", category: "People & Body" },
  { name: "thumbsdown", symbol: "👎", category: "People & Body" },
  { name: "fist", symbol: "✊", category: "People & Body" },
  { name: "fist_raised", symbol: "✊", category: "People & Body" },
  { name: "punch", symbol: "👊", category: "People & Body" },
  { name: "fist_oncoming", symbol: "👊", category: "People & Body" },
  { name: "clap", symbol: "👏", category: "People & Body" },
  { name: "raised_hands", symbol: "🙌", category: "People & Body" },
  { name: "heart_hands", symbol: "🫶", category: "People & Body" },
  { name: "open_hands", symbol: "👐", category: "People & Body" },
  { name: "palms_up_together", symbol: "🤲", category: "People & Body" },
  { name: "handshake", symbol: "🤝", category: "People & Body" },
  { name: "pray", symbol: "🙏", category: "People & Body" },
  { name: "writing_hand", symbol: "✍️", category: "People & Body" },
  { name: "muscle", symbol: "💪", category: "People & Body" },
  { name: "eyes", symbol: "👀", category: "People & Body" },
  { name: "eye", symbol: "👁️", category: "People & Body" },
  { name: "tongue", symbol: "👅", category: "People & Body" },
  { name: "brain", symbol: "🧠", category: "People & Body" },
  { name: "baby", symbol: "👶", category: "People & Body" },
  { name: "child", symbol: "🧒", category: "People & Body" },
  { name: "boy", symbol: "👦", category: "People & Body" },
  { name: "girl", symbol: "👧", category: "People & Body" },
  { name: "man", symbol: "👨", category: "People & Body" },
  { name: "woman", symbol: "👩", category: "People & Body" },
  { name: "older_man", symbol: "👴", category: "People & Body" },
  { name: "older_woman", symbol: "👵", category: "People & Body" },
  { name: "police_officer", symbol: "👮", category: "People & Body" },
  { name: "detective", symbol: "🕵️", category: "People & Body" },
  { name: "guard", symbol: "💂", category: "People & Body" },
  { name: "ninja", symbol: "🥷", category: "People & Body" },
  { name: "superhero", symbol: "🦸", category: "People & Body" },
  { name: "supervillain", symbol: "🦹", category: "People & Body" },
  { name: "mage", symbol: "🧙", category: "People & Body" },
  { name: "fairy", symbol: "🧚", category: "People & Body" },
  { name: "vampire", symbol: "🧛", category: "People & Body" },
  { name: "merperson", symbol: "🧜", category: "People & Body" },
  { name: "elf", symbol: "🧝", category: "People & Body" },
  { name: "genie", symbol: "🧞", category: "People & Body" },
  { name: "zombie", symbol: "🧟", category: "People & Body" },

  // --- Animals & Nature ---
  { name: "dog", symbol: "🐶", category: "Animals & Nature" },
  { name: "cat", symbol: "🐱", category: "Animals & Nature" },
  { name: "mouse", symbol: "🐭", category: "Animals & Nature" },
  { name: "hamster", symbol: "🐹", category: "Animals & Nature" },
  { name: "rabbit", symbol: "🐰", category: "Animals & Nature" },
  { name: "fox", symbol: "🦊", category: "Animals & Nature" },
  { name: "bear", symbol: "🐻", category: "Animals & Nature" },
  { name: "panda_face", symbol: "🐼", category: "Animals & Nature" },
  { name: "polar_bear", symbol: "🐻‍❄️", category: "Animals & Nature" },
  { name: "koala", symbol: "🐨", category: "Animals & Nature" },
  { name: "tiger", symbol: "🐯", category: "Animals & Nature" },
  { name: "lion", symbol: "🦁", category: "Animals & Nature" },
  { name: "cow", symbol: "🐮", category: "Animals & Nature" },
  { name: "pig", symbol: "🐷", category: "Animals & Nature" },
  { name: "frog", symbol: "🐸", category: "Animals & Nature" },
  { name: "monkey_face", symbol: "🐵", category: "Animals & Nature" },
  { name: "chicken", symbol: "🐔", category: "Animals & Nature" },
  { name: "penguin", symbol: "🐧", category: "Animals & Nature" },
  { name: "bird", symbol: "🐦", category: "Animals & Nature" },
  { name: "duck", symbol: "🦆", category: "Animals & Nature" },
  { name: "eagle", symbol: "🦅", category: "Animals & Nature" },
  { name: "owl", symbol: "🦉", category: "Animals & Nature" },
  { name: "bat", symbol: "🦇", category: "Animals & Nature" },
  { name: "wolf", symbol: "🐺", category: "Animals & Nature" },
  { name: "unicorn", symbol: "🦄", category: "Animals & Nature" },
  { name: "bee", symbol: "🐝", category: "Animals & Nature" },
  { name: "butterfly", symbol: "🦋", category: "Animals & Nature" },
  { name: "snail", symbol: "🐌", category: "Animals & Nature" },
  { name: "spider", symbol: "🕷️", category: "Animals & Nature" },
  { name: "turtle", symbol: "🐢", category: "Animals & Nature" },
  { name: "snake", symbol: "🐍", category: "Animals & Nature" },
  { name: "octopus", symbol: "🐙", category: "Animals & Nature" },
  { name: "squid", symbol: "🦑", category: "Animals & Nature" },
  { name: "fish", symbol: "🐟", category: "Animals & Nature" },
  { name: "dolphin", symbol: "🐬", category: "Animals & Nature" },
  { name: "whale", symbol: "🐳", category: "Animals & Nature" },
  { name: "shark", symbol: "🦈", category: "Animals & Nature" },
  { name: "seedling", symbol: "🌱", category: "Animals & Nature" },
  { name: "evergreen_tree", symbol: "🌲", category: "Animals & Nature" },
  { name: "deciduous_tree", symbol: "🌳", category: "Animals & Nature" },
  { name: "palm_tree", symbol: "🌴", category: "Animals & Nature" },
  { name: "cactus", symbol: "🌵", category: "Animals & Nature" },
  { name: "tulip", symbol: "🌷", category: "Animals & Nature" },
  { name: "cherry_blossom", symbol: "🌸", category: "Animals & Nature" },
  { name: "rose", symbol: "🌹", category: "Animals & Nature" },
  { name: "sunflower", symbol: "🌻", category: "Animals & Nature" },
  { name: "maple_leaf", symbol: "🍁", category: "Animals & Nature" },

  // --- Food & Drink ---
  { name: "apple", symbol: "🍎", category: "Food & Drink" },
  { name: "banana", symbol: "🍌", category: "Food & Drink" },
  { name: "watermelon", symbol: "🍉", category: "Food & Drink" },
  { name: "grapes", symbol: "🍇", category: "Food & Drink" },
  { name: "strawberry", symbol: "🍓", category: "Food & Drink" },
  { name: "cherries", symbol: "🍒", category: "Food & Drink" },
  { name: "peach", symbol: "🍑", category: "Food & Drink" },
  { name: "pineapple", symbol: "🍍", category: "Food & Drink" },
  { name: "avocado", symbol: "🥑", category: "Food & Drink" },
  { name: "pizza", symbol: "🍕", category: "Food & Drink" },
  { name: "hamburger", symbol: "🍔", category: "Food & Drink" },
  { name: "fries", symbol: "🍟", category: "Food & Drink" },
  { name: "hotdog", symbol: "🌭", category: "Food & Drink" },
  { name: "taco", symbol: "🌮", category: "Food & Drink" },
  { name: "burrito", symbol: "🌯", category: "Food & Drink" },
  { name: "ramen", symbol: "🍜", category: "Food & Drink" },
  { name: "sushi", symbol: "🍣", category: "Food & Drink" },
  { name: "cookie", symbol: "🍪", category: "Food & Drink" },
  { name: "doughnut", symbol: "🍩", category: "Food & Drink" },
  { name: "birthday", symbol: "🎂", category: "Food & Drink" },
  { name: "cake", symbol: "🍰", category: "Food & Drink" },
  { name: "cupcake", symbol: "🧁", category: "Food & Drink" },
  { name: "coffee", symbol: "☕", category: "Food & Drink" },
  { name: "tea", symbol: "🍵", category: "Food & Drink" },
  { name: "beer", symbol: "🍺", category: "Food & Drink" },
  { name: "beers", symbol: "🍻", category: "Food & Drink" },
  { name: "wine_glass", symbol: "🍷", category: "Food & Drink" },
  { name: "cocktail", symbol: "🍸", category: "Food & Drink" },
  { name: "boba", symbol: "🧋", category: "Food & Drink" },

  // --- Activities ---
  { name: "soccer", symbol: "⚽", category: "Activities" },
  { name: "basketball", symbol: "🏀", category: "Activities" },
  { name: "football", symbol: "🏈", category: "Activities" },
  { name: "baseball", symbol: "⚾", category: "Activities" },
  { name: "tennis", symbol: "🎾", category: "Activities" },
  { name: "trophy", symbol: "🏆", category: "Activities" },
  { name: "medal_sports", symbol: "🏅", category: "Activities" },
  { name: "first_place_medal", symbol: "🥇", category: "Activities" },
  { name: "second_place_medal", symbol: "🥈", category: "Activities" },
  { name: "third_place_medal", symbol: "🥉", category: "Activities" },
  { name: "video_game", symbol: "🎮", category: "Activities" },
  { name: "joystick", symbol: "🕹️", category: "Activities" },
  { name: "dice", symbol: "🎲", category: "Activities" },
  { name: "art", symbol: "🎨", category: "Activities" },
  { name: "guitar", symbol: "🎸", category: "Activities" },
  { name: "musical_keyboard", symbol: "🎹", category: "Activities" },
  { name: "drum", symbol: "🥁", category: "Activities" },

  // --- Travel & Places ---
  { name: "car", symbol: "🚗", category: "Travel & Places" },
  { name: "taxi", symbol: "🚕", category: "Travel & Places" },
  { name: "bus", symbol: "🚌", category: "Travel & Places" },
  { name: "police_car", symbol: "🚓", category: "Travel & Places" },
  { name: "ambulance", symbol: "🚑", category: "Travel & Places" },
  { name: "fire_engine", symbol: "🚒", category: "Travel & Places" },
  { name: "bike", symbol: "🚲", category: "Travel & Places" },
  { name: "scooter", symbol: "🛴", category: "Travel & Places" },
  { name: "motorcycle", symbol: "🏍️", category: "Travel & Places" },
  { name: "airplane", symbol: "✈️", category: "Travel & Places" },
  { name: "rocket", symbol: "🚀", category: "Travel & Places" },
  { name: "flying_saucer", symbol: "🛸", category: "Travel & Places" },
  { name: "ship", symbol: "🚢", category: "Travel & Places" },
  { name: "earth_americas", symbol: "🌎", category: "Travel & Places" },
  { name: "earth_africa", symbol: "🌍", category: "Travel & Places" },
  { name: "earth_asia", symbol: "🌏", category: "Travel & Places" },
  { name: "sunny", symbol: "☀️", category: "Travel & Places" },
  { name: "moon", symbol: "🌙", category: "Travel & Places" },
  { name: "rainbow", symbol: "🌈", category: "Travel & Places" },
  { name: "cloud", symbol: "☁️", category: "Travel & Places" },
  { name: "cloud_with_rain", symbol: "🌧️", category: "Travel & Places" },
  { name: "zap", symbol: "⚡", category: "Travel & Places" },
  { name: "snowflake", symbol: "❄️", category: "Travel & Places" },

  // --- Objects ---
  { name: "tada", symbol: "🎉", category: "Objects" },
  { name: "balloon", symbol: "🎈", category: "Objects" },
  { name: "gift", symbol: "🎁", category: "Objects" },
  { name: "crown", symbol: "👑", category: "Objects" },
  { name: "gem", symbol: "💎", category: "Objects" },
  { name: "bell", symbol: "🔔", category: "Objects" },
  { name: "loudspeaker", symbol: "📢", category: "Objects" },
  { name: "mega", symbol: "📣", category: "Objects" },
  { name: "bulb", symbol: "💡", category: "Objects" },
  { name: "flashlight", symbol: "🔦", category: "Objects" },
  { name: "book", symbol: "📖", category: "Objects" },
  { name: "moneybag", symbol: "💰", category: "Objects" },
  { name: "credit_card", symbol: "💳", category: "Objects" },
  { name: "crystal_ball", symbol: "🔮", category: "Objects" },
  { name: "computer", symbol: "💻", category: "Objects" },
  { name: "keyboard", symbol: "⌨️", category: "Objects" },
  { name: "iphone", symbol: "📱", category: "Objects" },
  { name: "camera", symbol: "📷", category: "Objects" },
  { name: "pin", symbol: "📌", category: "Objects" },
  { name: "paperclip", symbol: "📎", category: "Objects" },
  { name: "scissors", symbol: "✂️", category: "Objects" },
  { name: "lock", symbol: "🔒", category: "Objects" },
  { name: "key", symbol: "🔑", category: "Objects" },
  { name: "hammer", symbol: "🔨", category: "Objects" },
  { name: "gear", symbol: "⚙️", category: "Objects" },
  { name: "bomb", symbol: "💣", category: "Objects" },
  { name: "magic_wand", symbol: "🪄", category: "Objects" },

  // --- Symbols ---
  { name: "check", symbol: "✅", category: "Symbols" },
  { name: "white_check_mark", symbol: "✅", category: "Symbols" },
  { name: "x", symbol: "❌", category: "Symbols" },
  { name: "cross_mark", symbol: "❌", category: "Symbols" },
  { name: "warning", symbol: "⚠️", category: "Symbols" },
  { name: "no_entry", symbol: "⛔", category: "Symbols" },
  { name: "radioactive", symbol: "☢️", category: "Symbols" },
  { name: "biohazard", symbol: "☣️", category: "Symbols" },
  { name: "question", symbol: "❓", category: "Symbols" },
  { name: "exclamation", symbol: "❗", category: "Symbols" },
  { name: "plus", symbol: "➕", category: "Symbols" },
  { name: "minus", symbol: "➖", category: "Symbols" },
  { name: "recycle", symbol: "♻️", category: "Symbols" },
  { name: "musical_note", symbol: "🎵", category: "Symbols" },
  { name: "notes", symbol: "🎶", category: "Symbols" },
];

// Additional popular aliases and Discord-flavoured shortcuts
export const EMOJI_ALIASES: Record<string, string> = {
  // Thumbs up and down
  thumbsup: "👍",
  "+1": "👍",
  thumbup: "👍",
  thumbsdown: "👎",
  "-1": "👎",
  thumbdown: "👎",

  // Party and celebrations
  tada: "🎉",
  party: "🎉",
  confetti: "🎊",

  // Smiles and laughs
  smiley: "😃",
  smile: "😄",
  grin: "😁",
  laughing: "😆",
  joy: "😂",
  lol: "😂",
  rofl: "🤣",
  sweat_smile: "😅",
  sob: "😭",
  cry: "😢",

  // Love and hearts
  heart: "❤️",
  red_heart: "❤️",
  love: "❤️",
  fire: "🔥",
  lit: "🔥",
  sparkles: "✨",
  magic: "✨",
  star: "⭐",
  eyes: "👀",
  clap: "👏",
  pray: "🙏",
  ok: "👌",
  ok_hand: "👌",
  muscle: "💪",
  flex: "💪",
  salute: "🫡",
  melt: "🫠",
  skull: "💀",
  poop: "💩",
  nerd: "🤓",
  cool: "😎",
  sunglasses: "😎",
  thinking: "🤔",
  "100": "💯",
  check: "✅",
  done: "✅",
  x: "❌",
  nope: "❌",
  rocket: "🚀",
  wave: "👋",
  shrug: "🤷",
  coffee: "☕",
  beer: "🍺",
  pizza: "🍕",
  burger: "🍔",
  cat: "🐱",
  dog: "🐶",
  warning: "⚠️",
  bulb: "💡",
  idea: "💡",
  music: "🎵",
  notes: "🎶",
  crown: "👑",
  gem: "💎",
  diamond: "💎",
  pin: "📌",
};

// Fast lookup cache mapping lowercase code -> emoji character
const SHORTCODE_MAP = new Map<string, string>();

function initShortcodeMap() {
  if (SHORTCODE_MAP.size > 0) return;

  // Add dataset entries
  for (const entry of EMOJI_DATASET) {
    const key = entry.name.toLowerCase();
    SHORTCODE_MAP.set(key, entry.symbol);
    // Also add underscore-less variant (e.g. thumbs_up -> thumbsup)
    const stripped = key.replace(/_/g, "");
    if (!SHORTCODE_MAP.has(stripped)) {
      SHORTCODE_MAP.set(stripped, entry.symbol);
    }
  }

  // Add aliases
  for (const [alias, symbol] of Object.entries(EMOJI_ALIASES)) {
    SHORTCODE_MAP.set(alias.toLowerCase(), symbol);
    const stripped = alias.toLowerCase().replace(/_/g, "");
    if (!SHORTCODE_MAP.has(stripped)) {
      SHORTCODE_MAP.set(stripped, symbol);
    }
  }
}

initShortcodeMap();

/**
 * Resolves a shortcode string (with or without colons, e.g. "tada", ":tada:", "+1", ":thumbsup:")
 * to its Unicode emoji character, or null if unknown.
 */
export function resolveEmojiShortcode(code: string): string | null {
  initShortcodeMap();
  if (!code) return null;
  const clean = code.trim().replace(/^:+|:+$/g, "").toLowerCase();
  return SHORTCODE_MAP.get(clean) ?? null;
}

/**
 * Replaces all standard :shortcode: sequences in a string with their Unicode equivalents,
 * skipping any names that exist in customEmojis (which should stay as custom images).
 */
export function replaceEmojiShortcodes(
  text: string,
  customEmojis?: Record<string, string>,
): string {
  if (!text || !text.includes(":")) return text;
  initShortcodeMap();

  return text.replace(/:([a-zA-Z0-9_+-]{1,32}):/g, (match, name) => {
    const lowerName = name.toLowerCase();
    // Do not replace if it is a server custom emoji
    if (customEmojis && customEmojis[lowerName]) {
      return match;
    }
    const emoji = SHORTCODE_MAP.get(lowerName) ?? SHORTCODE_MAP.get(lowerName.replace(/_/g, ""));
    return emoji || match;
  });
}

export interface QuickReactionMatch {
  emoji: string;
  isCustom: boolean;
  shortcode: string;
}

/**
 * Detects if a message text is a quick reaction shortcut command to react to the last message.
 * Supported patterns:
 * - :+tada: or :+smiley: or :+thumbsup: or :+1:
 * - :+tada (without trailing colon)
 * - +:tada: or +:smiley
 * - +tada: or +tada (if it matches a valid emoji shortcode)
 * - :+🎉: or :+🎉 or +🎉 (direct unicode emoji with plus)
 */
export function parseQuickReaction(
  input: string,
  customEmojis?: Record<string, string>,
): QuickReactionMatch | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  initShortcodeMap();

  // Pattern 1: :+name: or :+name (e.g. :+tada:, :+smiley:, :+thumbsup:, :+1:)
  const colonPlusMatch = trimmed.match(/^:\+([a-zA-Z0-9_+-]+):?$/);
  if (colonPlusMatch) {
    const rawName = colonPlusMatch[1];
    const lower = rawName.toLowerCase();
    if (customEmojis && customEmojis[lower]) {
      return { emoji: lower, isCustom: true, shortcode: lower };
    }
    const resolved = resolveEmojiShortcode(lower);
    if (resolved) {
      return { emoji: resolved, isCustom: false, shortcode: lower };
    }
    // If not in standard dataset, return the raw name as fallback
    return { emoji: rawName, isCustom: false, shortcode: lower };
  }

  // Pattern 2: +:name: or +:name
  const plusColonMatch = trimmed.match(/^\+:([a-zA-Z0-9_+-]+):?$/);
  if (plusColonMatch) {
    const rawName = plusColonMatch[1];
    const lower = rawName.toLowerCase();
    if (customEmojis && customEmojis[lower]) {
      return { emoji: lower, isCustom: true, shortcode: lower };
    }
    const resolved = resolveEmojiShortcode(lower);
    if (resolved) {
      return { emoji: resolved, isCustom: false, shortcode: lower };
    }
    return { emoji: rawName, isCustom: false, shortcode: lower };
  }

  // Pattern 3: +name (e.g. +tada or +thumbsup - only if matches a known emoji)
  const plusWordMatch = trimmed.match(/^\+([a-zA-Z0-9_+-]+):?$/);
  if (plusWordMatch) {
    const lower = plusWordMatch[1].toLowerCase();
    if (customEmojis && customEmojis[lower]) {
      return { emoji: lower, isCustom: true, shortcode: lower };
    }
    const resolved = resolveEmojiShortcode(lower);
    if (resolved) {
      return { emoji: resolved, isCustom: false, shortcode: lower };
    }
  }

  // Pattern 4: :+<emoji> or +<emoji> or + <emoji> (direct Unicode emoji character)
  const plusUnicodeMatch = trimmed.match(/^(?::\+|\+\s*|\+:)(.+?):?$/u);
  if (plusUnicodeMatch) {
    const candidate = plusUnicodeMatch[1].trim();
    // Test if candidate is or contains an emoji
    if (/\p{Extended_Pictographic}/u.test(candidate)) {
      return { emoji: candidate, isCustom: false, shortcode: candidate };
    }
  }

  return null;
}

/**
 * Searches emoji shortcodes for autocomplete suggestions.
 */
export function findMatchingEmojiShortcodes(
  query: string,
  customEmojis?: Record<string, string>,
  limit = 8,
): Array<{ name: string; symbol: string; isCustom?: boolean; url?: string }> {
  initShortcodeMap();
  const cleanQuery = query.toLowerCase().replace(/^:+|^\+:+|^\+:|^\+/, "");
  if (!cleanQuery) return [];

  const results: Array<{ name: string; symbol: string; isCustom?: boolean; url?: string }> = [];
  const seen = new Set<string>();

  // Custom emojis first
  if (customEmojis) {
    for (const [name, url] of Object.entries(customEmojis)) {
      if (name.toLowerCase().includes(cleanQuery)) {
        results.push({ name, symbol: `:${name}:`, isCustom: true, url });
        seen.add(name.toLowerCase());
        if (results.length >= limit) return results;
      }
    }
  }

  // Exact match first
  for (const entry of EMOJI_DATASET) {
    if (seen.has(entry.name)) continue;
    if (entry.name.toLowerCase() === cleanQuery) {
      results.push({ name: entry.name, symbol: entry.symbol });
      seen.add(entry.name);
    }
  }

  // Prefix match
  for (const entry of EMOJI_DATASET) {
    if (results.length >= limit) break;
    if (seen.has(entry.name)) continue;
    if (entry.name.toLowerCase().startsWith(cleanQuery)) {
      results.push({ name: entry.name, symbol: entry.symbol });
      seen.add(entry.name);
    }
  }

  // Substring match
  for (const entry of EMOJI_DATASET) {
    if (results.length >= limit) break;
    if (seen.has(entry.name)) continue;
    if (entry.name.toLowerCase().includes(cleanQuery)) {
      results.push({ name: entry.name, symbol: entry.symbol });
      seen.add(entry.name);
    }
  }

  return results;
}
