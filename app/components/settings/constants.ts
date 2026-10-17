"use client";



export const BANNER_PRESETS = [
  { id: "synthwave", name: "Synthwave Sunset", css: "linear-gradient(135deg, #ff007f, #7928ca, #ff0080)" },
  { id: "nebula", name: "Cosmic Nebula", css: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" },
  { id: "cyberpunk", name: "Cyber Matrix", css: "linear-gradient(135deg, #001100, #003b00, #00ff66)" },
  { id: "aurora", name: "Northern Aurora", css: "linear-gradient(135deg, #0575e6, #00f260)" },
  { id: "sakura", name: "Sakura Blossom", css: "linear-gradient(135deg, #fbc2eb, #a6c1ee)" },
  { id: "midnight", name: "Midnight Velvet", css: "linear-gradient(135deg, #180b2c, #3a1c71, #d76d77)" },
  { id: "ocean", name: "Deep Ocean", css: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)" },
  { id: "carbon", name: "Dark Carbon", css: "linear-gradient(135deg, #141517, #23272a, #111214)" },
];
/** A cosmetic in a picker; `group` is the shelf it sits on. */
export interface CosmeticItem {
  id: string;
  name: string;
  desc: string;
  group?: string;
}

export const AVATAR_FRAMES: CosmeticItem[] = [
  { id: "none", name: "None", desc: "No decoration" },
  { id: "vampire", name: "Count's Collar", desc: "A high cape collar, fangs and a pet bat", group: "Vampire" },
  { id: "bat-wings", name: "Bat Wings", desc: "Leathery wings that flap behind you", group: "Vampire" },
  { id: "blood-crown", name: "Blood Crown", desc: "A black thorned crown with a ruby", group: "Vampire" },
  { id: "cat-ears", name: "Tabby Ears", desc: "Orange cat ears and a little bell", group: "Critters" },
  { id: "bunny-ears", name: "Bunny Ears", desc: "Soft ears with a pink bow", group: "Critters" },
  { id: "fox-ears", name: "Fox Spirit", desc: "Pointed ears and a fluffy tail", group: "Critters" },
  { id: "bow", name: "Big Bow", desc: "A pink ribbon, slightly tilted", group: "Critters" },
  { id: "frog-hat", name: "Frog Hat", desc: "A little frog napping on your head", group: "Critters" },
  { id: "angel-wings", name: "Angel Wings", desc: "Soft white wings", group: "Celestial" },
  { id: "halo", name: "Halo", desc: "A glowing golden halo that floats", group: "Celestial" },
  { id: "stardust", name: "Stardust", desc: "Twinkling stars on a slow orbit", group: "Celestial" },
  { id: "crown", name: "Crown", desc: "A jeweled crown worn at an angle", group: "Celestial" },
  { id: "horns", name: "Lil Devil", desc: "Red horns and a pointy tail", group: "Celestial" },
  { id: "headphones", name: "Kitty Headphones", desc: "Pink headphones with ears", group: "Cozy" },
  { id: "flower-crown", name: "Flower Crown", desc: "A ring of spring flowers", group: "Cozy" },
  { id: "sprout", name: "Sprout", desc: "A tiny plant that sways", group: "Cozy" },
  { id: "witch-hat", name: "Witch Hat", desc: "Starry hat with a crescent moon", group: "Cozy" },
  { id: "neon", name: "Neon Pulse", desc: "Cyan glow that breathes", group: "Glow Rings" },
  { id: "rainbow", name: "Rainbow Halo", desc: "Ring that cycles through colors", group: "Glow Rings" },
  { id: "cyber", name: "Cyber", desc: "Squared terminal-green frame", group: "Glow Rings" },
  { id: "gold", name: "Royal Gold", desc: "Shimmering gold ring", group: "Glow Rings" },
  { id: "sakura", name: "Sakura", desc: "Soft pink glow", group: "Glow Rings" },
  { id: "diamond", name: "Diamond Cut", desc: "Rounded-square ice border", group: "Glow Rings" },
  { id: "flame-crown", name: "Flame Crown", desc: "A ring of fire licking up around you", group: "Elements" },
  { id: "lightning", name: "Storm Halo", desc: "Crackling arcs and a stray bolt", group: "Elements" },
  { id: "orbit", name: "Tiny Planets", desc: "A ringed planet and moons on a tilted orbit", group: "Celestial" },
  { id: "bubbles", name: "Bubble Pop", desc: "Iridescent bubbles drifting up past you", group: "Celestial" },
  { id: "sakura-wreath", name: "Sakura Wreath", desc: "A blossoming branch with petals falling", group: "Cozy" },
  { id: "beanie", name: "Knit Beanie", desc: "A chunky beanie with a bouncy pompom", group: "Cozy" },
  { id: "mushroom", name: "Toadstool", desc: "A spotted mushroom cap and little sprouts", group: "Cozy" },
  { id: "cat-loaf", name: "Cat Nap", desc: "A loaf of a cat dozing on your head", group: "Critters" },
  { id: "butterflies", name: "Butterflies", desc: "Two butterflies fluttering around you", group: "Critters" },
  { id: "pumpkin", name: "Jack-o'-Lantern", desc: "A glowing pumpkin and a little bat", group: "Spooky" },
  { id: "ghost-buddy", name: "Ghost Buddy", desc: "A shy ghost floating at your shoulder", group: "Spooky" },
  { id: "gamer", name: "RGB Headset", desc: "A gaming headset with colour-cycling lights", group: "Tech" },
  { id: "live", name: "Live!", desc: "A pulsing red ring and a LIVE badge", group: "Tech" },
  { id: "pixel-hearts", name: "Pixel Hearts", desc: "8-bit hearts beating as they orbit", group: "Tech" },
  { id: "creeper-peek", name: "Creeper Peek", desc: "A creeper peeking over your shoulder. It hisses and flashes", group: "Minecraft" },
  { id: "block-head", name: "Block Head", desc: "A grass block worn as a hat, with a poppy on top", group: "Minecraft" },
  { id: "enchanted-blade", name: "Enchanted Blade", desc: "A glinting diamond sword with XP orbs circling you", group: "Minecraft" },
  { id: "zombie-hands", name: "Grabbed", desc: "Rotting hands clawing up at you from below", group: "Zombie" },
  { id: "infected", name: "Infected", desc: "Toxic slime dripping off your ring and a biohazard badge", group: "Zombie" },
];
export const PROFILE_EFFECTS: CosmeticItem[] = [
  { id: "none", name: "None", desc: "No effect" },

  // Discord-inspired Anime & Dark marquee effects
  { id: "always-watching", name: "Always Watching", desc: "Blinking demon eyes peering from shadows and a sinister grin", group: "Anime & Dark" },
  { id: "manga-hand", name: "Cursed Grasp", desc: "A giant manga ink hand clutching your card with cursed spirit aura", group: "Anime & Dark" },
  { id: "symbiote", name: "Venom", desc: "A glossy black symbiote rises from the goo, roars with a lashing tongue and lunges to bite", group: "Anime & Dark" },
  { id: "carnage", name: "Carnage", desc: "The blood-red symbiote: veined, grinning and hungry", group: "Anime & Dark" },
  { id: "bloodfall", name: "Bloodfall", desc: "Glossy blood seeps over your card, drips down and splashes into a pool", group: "Anime & Dark" },
  { id: "nightwing", name: "Nightwing", desc: "Bats swarm a blood moon, sweep your card and gather where a vampire's red eyes open", group: "Anime & Dark" },
  { id: "anti-venom", name: "Anti-Venom", desc: "A pearl-white symbiote with black markings and void eyes", group: "Anime & Dark" },
  { id: "oni-mask", name: "Oni Spirit", desc: "A fierce Japanese demon mask with flaming horns and spirit smoke", group: "Anime & Dark" },
  { id: "soul-flame", name: "Soul Inferno", desc: "Roaring violet and cyan demonic flames with rising embers", group: "Anime & Dark" },

  // Dense canvas particle scenes
  { id: "crimson-ronin", name: "Crimson Ronin", desc: "A hooded swordsman of streaming red embers holds his guard, then cuts across your card", group: "Particle Scenes" },
  { id: "soul-reaper", name: "Soul Reaper", desc: "A spectral reaper of ghost-green embers sweeps its scythe across your card", group: "Particle Scenes" },
  { id: "warp-disc", name: "Warp Disc", desc: "A disc of light streaks tilts toward you, bursts past and collapses into a line", group: "Particle Scenes" },
  { id: "crimson-blade", name: "Crimson Blade", desc: "A cloaked swordsman of red embers who winds up and cuts across your card", group: "Particle Scenes" },
  { id: "hyperdrive", name: "Hyperdrive", desc: "A disc of white light streaks rushing toward you and bursting past", group: "Particle Scenes" },
  { id: "astral-vortex", name: "Astral Vortex", desc: "Thousands of violet motes spiralling into a glowing core", group: "Particle Scenes" },
  { id: "kraken", name: "Release the Kraken", desc: "Sucker-lined tentacles curl up from the deep as a giant eye rises to stare", group: "Particle Scenes" },
  { id: "storm-serpent", name: "Storm Serpent", desc: "A glowing lightning dragon slithers around your card, crackling with electricity", group: "Particle Scenes" },

  // Celestial & Arcane
  { id: "starfall-rings", name: "Starfall Rings", desc: "Concentric rotating golden astrolabe rings and celestial stardust", group: "Celestial & Arcane" },
  { id: "arcane-vortex", name: "Fae Trickery", desc: "Swirling luminous arcane portal with rotating rune circles", group: "Celestial & Arcane" },
  { id: "black-hole", name: "Singularity", desc: "Gravitational lensing event horizon with a swirling cosmic accretion disk", group: "Celestial & Arcane" },
  { id: "nebula", name: "Cosmic Nebula", desc: "Deep space spiral galaxy with star clusters and orbiting stardust", group: "Celestial & Arcane" },

  // Atmospheric Scenes
  { id: "cloud-nine", name: "Cloud Nine", desc: "Forest canopy overhead with volumetric god rays and falling leaves", group: "Atmospheric" },
  { id: "nevermore", name: "Nevermore", desc: "Midnight ravens swooping across a misty sky with tumbling black feathers", group: "Atmospheric" },
  { id: "blood-moon", name: "Blood Moon", desc: "Textured crimson eclipse, rolling nocturnal fog and vampire bats", group: "Atmospheric" },
  { id: "candles", name: "Candlelight Crypt", desc: "Gothic dripping candles, warm flickering halos and rising embers", group: "Atmospheric" },
  { id: "koi", name: "Koi Pond", desc: "Graceful koi swimming under lily pads with ripple rings", group: "Atmospheric" },
  { id: "ghosts", name: "Friendly Ghosts", desc: "Cute spectral spirits floating with eerie luminescence", group: "Atmospheric" },
  { id: "jellyfish", name: "Abyssal Jellyfish", desc: "Bioluminescent deep sea jellyfish drifting through the dark", group: "Atmospheric" },
  { id: "paws", name: "Paw Pats", desc: "Playful cat paws batting from below", group: "Atmospheric" },

  // Cyber & Retro
  { id: "cyber-hud", name: "Cyber Overdrive", desc: "Holographic targeting reticle, radar scanner sweep and glitch grid", group: "Cyber & Retro" },
  { id: "pixel-arcade", name: "Let's Play", desc: "Retro 8-bit CRT scanlines, pixel hearts, golden coins and star bursts", group: "Cyber & Retro" },
  { id: "matrix", name: "Digital Rain", desc: "Cascading green cyber glyphs and phosphor terminal glow", group: "Cyber & Retro" },

  // Nature & Weather
  { id: "sakura-storm", name: "Sakura Whirlwind", desc: "Blossoming cherry branch with a tempest of swirling pink petals", group: "Nature & Weather" },
  { id: "thunderstorm", name: "Thunderstorm", desc: "Rolling dark clouds, branching lightning strikes and driving rain", group: "Nature & Weather" },
  { id: "aurora", name: "Northern Aurora", desc: "Shimmering emerald and violet curtains of polar light", group: "Nature & Weather" },
  { id: "rain", name: "Rainy Day", desc: "Steady rain streaming down with mist", group: "Nature & Weather" },
  { id: "snow", name: "Snowfall", desc: "Delicate snowflakes drifting softly", group: "Nature & Weather" },
  { id: "leaves", name: "Autumn Leaves", desc: "Tumbling red and gold autumn leaves", group: "Nature & Weather" },
  { id: "sunbeams", name: "Sunbeams", desc: "Golden light rays turning through warm dust", group: "Nature & Weather" },

  // Vampire Classics
  { id: "bat-swarm", name: "Bat Colony", desc: "A swarm of vampire bats swooping past through the fog", group: "Vampire" },
  { id: "goo-blood", name: "Bleeding", desc: "Glossy viscous blood dripping down your card", group: "Vampire" },
  { id: "rose-petals", name: "Crimson Petals", desc: "Dark velvety rose petals falling in the dark", group: "Vampire" },
  { id: "bats", name: "Night Flight", desc: "Bats gliding across a full moon", group: "Vampire" },

  // Magic & Celebration
  { id: "sparkles", name: "Sparkles", desc: "Radiant starlight twinkling in and out", group: "Magic" },
  { id: "fireflies", name: "Fireflies", desc: "Bioluminescent glowing dots drifting at dusk", group: "Magic" },
  { id: "shooting", name: "Shooting Stars", desc: "Cosmic meteor streaks across the night", group: "Magic" },
  { id: "butterflies", name: "Butterflies", desc: "Iridescent wings fluttering upward", group: "Magic" },
  { id: "fireworks", name: "Fireworks", desc: "Multi-ring firework explosions overhead", group: "Celebration" },
  { id: "confetti", name: "Confetti", desc: "Colorful party confetti celebration", group: "Celebration" },
  { id: "hearts", name: "Hearts", desc: "Luminous glowing hearts floating up", group: "Celebration" },
  { id: "bubbles", name: "Bubbles", desc: "Iridescent soap bubbles drifting and wobbling", group: "Celebration" },
  { id: "goo", name: "Ink Goo", desc: "Viscous black ink dripping from the top", group: "Celebration" },
  { id: "goo-pink", name: "Bubblegum Slime", desc: "Hot pink slime oozing down", group: "Celebration" },
  { id: "goo-toxic", name: "Toxic Ooze", desc: "Glowing radioactive slime dripping", group: "Celebration" },
  { id: "sakura", name: "Sakura Drift", desc: "Cherry petals gently falling", group: "Celebration" },
  { id: "embers", name: "Embers", desc: "Fiery sparks rising from the hearth", group: "Celebration" },
  { id: "lightning", name: "Storm Flash", desc: "Flashes of lightning illuminating the sky", group: "Celebration" },
  { id: "lanterns", name: "Sky Lanterns", desc: "Paper lanterns glowing as they float up", group: "Magic" },
  { id: "dandelions", name: "Dandelion Wishes", desc: "Fluffy seeds drifting up on the breeze", group: "Nature & Weather" },
  { id: "rain-window", name: "Rainy Window", desc: "Droplets sliding down glass, city lights blurred behind", group: "Atmospheric" },
  { id: "aquarium", name: "Aquarium", desc: "Rippling caustics, light rays, fish and bubbles", group: "Atmospheric" },
  { id: "comet", name: "Comet", desc: "A blazing comet streaking past twinkling stars", group: "Celestial & Arcane" },
  { id: "neon-rain", name: "Neon Rain", desc: "Pink and cyan rain glowing like a synthwave night", group: "Cyber & Retro" },
  { id: "signal-lost", name: "Signal Lost", desc: "Scanlines and bursts of RGB glitch", group: "Cyber & Retro" },

  // Minecraft
  { id: "creeper", name: "Aw Man", desc: "A creeper wanders onto your card, hisses, flashes and blows up", group: "Minecraft" },
  { id: "enchanted", name: "Enchanted", desc: "The purple enchantment glint rolling over your card, with table glyphs drifting up", group: "Minecraft" },
  { id: "xp-orbs", name: "XP Orbs", desc: "Glowing experience orbs bobbing around", group: "Minecraft" },

  // Zombie
  { id: "horde", name: "The Horde", desc: "Shamblers drift past a sick moon while hands claw out of the dirt", group: "Zombie" },
  { id: "outbreak", name: "Outbreak", desc: "A spinning quarantine alarm, red pulses and toxic spores", group: "Zombie" },
];
export const PROFILE_FRAMES: CosmeticItem[] = [
  { id: "none", name: "None", desc: "No frame" },
  { id: "vampire", name: "Nosferatu", desc: "Bat wings, a blood moon and dripping blood", group: "Vampire" },
  { id: "vampire-roses", name: "Black Roses", desc: "Blood-red roses spilling over the corners", group: "Vampire" },
  { id: "candlelit", name: "Candlelit Crypt", desc: "A gothic arch and dripping candles", group: "Vampire" },
  { id: "bat-swarm", name: "Bat Colony", desc: "Bats flapping all over the top", group: "Vampire" },
  { id: "string-lights", name: "Fairy Lights", desc: "Twinkling string lights along the top", group: "Cozy" },
  { id: "clouds", name: "Cloud Nine", desc: "Fluffy clouds on the corners", group: "Cozy" },
  { id: "kitty", name: "Midnight Cat", desc: "A black cat curled around your card", group: "Cats" },
  { id: "kitty-snow", name: "Snow Cat", desc: "A fluffy white cat curled around your card", group: "Cats" },
  { id: "kitty-ginger", name: "Ginger Cat", desc: "An orange cat curled around your card", group: "Cats" },
  { id: "bunny", name: "Bunny Peek", desc: "Bunny ears poking over the top", group: "Cats" },
  { id: "roses", name: "Nightshade Roses", desc: "Violet roses spilling over the corners", group: "Blooms" },
  { id: "roses-red", name: "Red Roses", desc: "Crimson roses spilling over the corners", group: "Blooms" },
  { id: "sakura", name: "Cherry Branch", desc: "A blossoming branch across the top", group: "Blooms" },
  { id: "vine", name: "Overgrowth", desc: "Leafy vines wrapping the card", group: "Blooms" },
  { id: "flame", name: "Inferno", desc: "Flames roaring off the top", group: "Elements" },
  { id: "blaze-blue", name: "Blue Blaze", desc: "Cold blue fire off the top", group: "Elements" },
  { id: "blaze-pink", name: "Pink Blaze", desc: "Hot pink fire off the top", group: "Elements" },
  { id: "crystal", name: "Amethyst", desc: "Purple crystals growing on top", group: "Elements" },
  { id: "crystal-ice", name: "Ice Crystals", desc: "Blue crystals growing on top", group: "Elements" },
  { id: "frost", name: "Snowcap", desc: "Snow and icicles on the edges", group: "Elements" },
  { id: "gold", name: "Gilded", desc: "Gold scrollwork with a crown", group: "Regal" },
  { id: "royal", name: "Crowned", desc: "A jeweled crown on top", group: "Regal" },
  { id: "starlit", name: "Moonlit", desc: "A crescent moon and stars", group: "Regal" },
  { id: "neon", name: "Neon", desc: "Pulsing cyan glow", group: "Glow" },
  { id: "rainbow", name: "Prism", desc: "Flowing rainbow edge", group: "Glow" },
  { id: "cyber", name: "Circuit", desc: "Magenta and cyan brackets", group: "Glow" },
  { id: "dragon", name: "Dragon's Hoard", desc: "A dragon coiled over your card, guarding its gold", group: "Fantasy" },
  { id: "holo-card", name: "Trading Card", desc: "Gilded corners, a gem and a shifting holo edge", group: "Fantasy" },
  { id: "arcade", name: "Arcade Cabinet", desc: "A chasing-light marquee and a working joystick", group: "Retro" },
  { id: "storm", name: "Storm Front", desc: "Thunderclouds, rain and lightning that lights the card", group: "Elements" },
  { id: "tide", name: "Tide Pool", desc: "Rolling waves, a shell, a starfish and gulls", group: "Elements" },
  { id: "autumn", name: "Autumn Leaves", desc: "Maple leaves on the branch, a few drifting down", group: "Blooms" },
  { id: "mushrooms", name: "Mushroom Grove", desc: "Toadstools, glowing caps and fireflies on the moss", group: "Blooms" },
  { id: "grass-block", name: "Grass Block", desc: "Grass and flowers on top, stone and ores along the bottom", group: "Minecraft" },
  { id: "tnt", name: "TNT", desc: "A lit stack of TNT and a creeper waiting below", group: "Minecraft" },
  { id: "zombie-hands", name: "Dead Hands", desc: "Hands gripping the top of your card and a grave below", group: "Zombie" },
  { id: "quarantine", name: "Quarantine", desc: "Caution tape across the corners and a biohazard sign", group: "Zombie" },
  { id: "cobwebs", name: "Cobwebs", desc: "Webs in the corners and a little spider dangling", group: "Spooky" },
  { id: "pumpkins", name: "Pumpkin Patch", desc: "Jack-o'-lanterns on the vine under a crescent moon", group: "Spooky" },
];
export const NAMEPLATES: CosmeticItem[] = [
  { id: "none", name: "None", desc: "No nameplate" },
  { id: "vampire", name: "Castle Dracula", desc: "A castle under the blood moon", group: "Vampire" },
  { id: "coffin", name: "Crypt", desc: "A coffin by candlelight", group: "Vampire" },
  { id: "bat-swarm", name: "Bat Swarm", desc: "Bats on a blood red sky", group: "Vampire" },
  { id: "aurora", name: "Aurora", desc: "Northern lights over the night", group: "Night" },
  { id: "candy", name: "Candy Shop", desc: "Lollipops and sweets", group: "Cute" },
  { id: "sunset", name: "Synth Sunset", desc: "A striped sun over the hills", group: "Scenic" },
  { id: "ocean", name: "Ocean", desc: "Rolling teal waves", group: "Scenic" },
  { id: "forest", name: "Pine Forest", desc: "Pines under a pale moon", group: "Scenic" },
  { id: "lava", name: "Volcano", desc: "A glowing crater", group: "Scenic" },
  { id: "galaxy", name: "Galaxy", desc: "A ringed planet among stars", group: "Night" },
  { id: "void", name: "Void", desc: "Crescent moon in the dark", group: "Night" },
  { id: "grid", name: "Neon Grid", desc: "Synthwave horizon", group: "Night" },
  { id: "cat-beans", name: "Cat Beans", desc: "A paw full of toe beans", group: "Cute" },
  { id: "blossom", name: "Blossom", desc: "Cherry branch in bloom", group: "Cute" },
  { id: "koi", name: "Koi Pond", desc: "Two koi circling", group: "Cute" },
  { id: "gold", name: "Gilded", desc: "Shimmering gold plate", group: "Shiny" },
  { id: "frost", name: "Frost", desc: "Icy blue with snowflakes", group: "Shiny" },
  { id: "rainy-night", name: "Rainy Night", desc: "City lights blurring through the rain", group: "Cozy" },
  { id: "campfire", name: "Campfire", desc: "A crackling fire by the tent under the stars", group: "Cozy" },
  { id: "winter-cabin", name: "Winter Cabin", desc: "A lit window, chimney smoke and falling snow", group: "Cozy" },
  { id: "lofi", name: "Lo-fi Desk", desc: "Moon in the window, a lamp and a steaming mug", group: "Cozy" },
  { id: "sakura-night", name: "Sakura Night", desc: "Blossoms and drifting petals under a full moon", group: "Night" },
  { id: "cyber-city", name: "Cyber City", desc: "Flickering windows and a hover car passing by", group: "Night" },
  { id: "storm", name: "Thunderhead", desc: "Rolling clouds, rain and the odd lightning strike", group: "Night" },
  { id: "deep-sea", name: "Deep Sea", desc: "Light rays, swaying kelp and a curious fish", group: "Scenic" },
  { id: "dunes", name: "Desert Dunes", desc: "A soft sun over sand and cacti", group: "Scenic" },
  { id: "meadow", name: "Firefly Meadow", desc: "Fireflies drifting over the grass at dusk", group: "Scenic" },
  { id: "lava-lamp", name: "Lava Lamp", desc: "Warm blobs rising and sinking", group: "Retro" },
  { id: "arcade", name: "Arcade", desc: "Marching invaders and a plucky little ship", group: "Retro" },
  { id: "mainframe", name: "Mainframe", desc: "Green code raining down the screen", group: "Retro" },
  { id: "boba", name: "Boba Shop", desc: "Pastel polka dots and a big bubble tea", group: "Cute" },
  { id: "strawberry", name: "Strawberry Milk", desc: "Gingham and bobbing strawberries", group: "Cute" },
  { id: "holo", name: "Holo Foil", desc: "Iridescent foil that shifts colour", group: "Shiny" },
  { id: "embers", name: "Ember Storm", desc: "Glowing embers rising from below", group: "Shiny" },
  { id: "pride", name: "Pride", desc: "A rainbow flag waving in the breeze", group: "Pride" },
  { id: "trans-pride", name: "Trans Pride", desc: "The trans flag waving in the breeze", group: "Pride" },
  { id: "bi-pride", name: "Bi Pride", desc: "The bi flag waving in the breeze", group: "Pride" },
  { id: "overworld", name: "Overworld", desc: "Blocky clouds, an oak tree and a creeper on the grass", group: "Minecraft" },
  { id: "diamond-mine", name: "Diamond Mine", desc: "A torchlit stone wall glinting with ores", group: "Minecraft" },
  { id: "nether", name: "The Nether", desc: "Lavafalls, netherrack and a drifting ghast", group: "Minecraft" },
  { id: "dead-city", name: "Dead City", desc: "A ruined skyline, a sick moon and shamblers in the fog", group: "Zombie" },
  { id: "quarantine", name: "Quarantine", desc: "Caution tape and a biohazard sign under a red beacon", group: "Zombie" },
];
export const COLOR_SWATCHES = [
  "#5865F2", // Discord Blurple
  "#57F287", // Green
  "#FEE75C", // Yellow
  "#EB459E", // Fuchsia
  "#ED4245", // Red
  "#9d8cf5", // Lavender
  "#38bdf8", // Sky Blue
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f97316", // Orange
  "#ec4899", // Pink
  "#a855f7", // Purple
  "#6366f1", // Indigo
  "#e11d48", // Crimson
  "#14b8a6", // Teal
  "#e2e8f0", // Silver White
];
export const STATUS_EMOJIS = [
  "💬", "🎮", "🎧", "💻", "☕", "✨", "🌙", "🔥", "🚀", "🐱", "🎨", "🎵", "💤", "🍕", "🌸", "⚡"
];
export const PROFILE_CSS_SNIPPETS = [
  {
    name: "✨ Glow Aura",
    snippet: "\n.profile-card {\n  box-shadow: 0 0 25px rgba(168, 85, 247, 0.45) !important;\n  border: 1px solid rgba(168, 85, 247, 0.5) !important;\n}\n",
  },
  {
    name: "🌈 Gradient Name",
    snippet: "\n.profile-display-name {\n  background: linear-gradient(90deg, #ff007f, #00f2fe) !important;\n  -webkit-background-clip: text !important;\n  -webkit-text-fill-color: transparent !important;\n}\n",
  },
  {
    name: "📺 CRT Scanlines",
    snippet: "\n.profile-card::after {\n  content: '' !important;\n  position: absolute !important;\n  inset: 0 !important;\n  background: repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 2px) !important;\n  pointer-events: none !important;\n}\n",
  },
  {
    name: "🧊 Glass Card",
    snippet: "\n.profile-card {\n  background: rgba(18, 19, 26, 0.7) !important;\n  backdrop-filter: blur(16px) !important;\n  border: 1px solid rgba(255, 255, 255, 0.12) !important;\n}\n",
  },
  {
    name: "💫 Float Motion",
    snippet: "\n@keyframes floatAnim {\n  0%, 100% { transform: translateY(0); }\n  50% { transform: translateY(-6px); }\n}\n.profile-card-avatar-wrap {\n  animation: floatAnim 3.5s ease-in-out infinite !important;\n}\n",
  },
];