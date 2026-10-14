#!/usr/bin/env python3
"""
Hoffle D&D Companion & SRD 5e Bot Service
Provides 5e SRD compendium lookup and search for spells, monsters, conditions,
items, feats, races, and classes, plus health checks and docs. Lookups take
?edition=2014 (the default) or ?edition=2024; an entry the 2024 books did not
change answers for both.
Runs standalone on port 8732.
"""

import http.server
import json
import socketserver
import urllib.parse
import re

PORT = 8732

SPELLS = [
    {
        "name": "Fireball",
        "level": 3,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "150 feet",
        "components": "V, S, M (a tiny ball of bat guano and sulfur)",
        "duration": "Instantaneous",
        "description": "A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#fireball_phb",
    },
    {
        "name": "Magic Missile",
        "level": 1,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "120 feet",
        "components": "V, S",
        "duration": "Instantaneous",
        "description": "You create three glowing darts of magical force. Each dart hits a creature of your choice that you can see within range. A dart deals 1d4 + 1 force damage to its target. The darts all strike simultaneously.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#magic%20missile_phb",
    },
    {
        "name": "Cure Wounds",
        "level": 1,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "Touch",
        "components": "V, S",
        "duration": "Instantaneous",
        "description": "A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#cure%20wounds_phb",
    },
    {
        "name": "Healing Word",
        "level": 1,
        "school": "evocation",
        "casting_time": "1 bonus action",
        "range": "60 feet",
        "components": "V",
        "duration": "Instantaneous",
        "description": "A creature of your choice that you can see within range regains hit points equal to 1d4 + your spellcasting ability modifier. This spell has no effect on undead or constructs.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#healing%20word_phb",
    },
    {
        "name": "Eldritch Blast",
        "level": 0,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "120 feet",
        "components": "V, S",
        "duration": "Instantaneous",
        "description": "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#eldritch%20blast_phb",
    },
    {
        "name": "Shield",
        "level": 1,
        "school": "abjuration",
        "casting_time": "1 reaction",
        "range": "Self",
        "components": "V, S",
        "duration": "1 round",
        "description": "An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from magic missile.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#shield_phb",
    },
    {
        "name": "Counterspell",
        "level": 3,
        "school": "abjuration",
        "casting_time": "1 reaction",
        "range": "60 feet",
        "components": "S",
        "duration": "Instantaneous",
        "description": "You attempt to interrupt a creature in the process of casting a spell. If the creature is casting a spell of 3rd level or lower, its spell fails and has no effect.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#counterspell_phb",
    },
    {
        "name": "Haste",
        "level": 3,
        "school": "transmutation",
        "concentration": True,
        "casting_time": "1 action",
        "range": "30 feet",
        "components": "V, S, M",
        "duration": "Concentration, up to 1 minute",
        "description": "Choose a willing creature that you can see within range. Until the spell ends, the target's speed is doubled, it gains a +2 bonus to AC, it has advantage on Dexterity saving throws, and it gains an additional action on each of its turns.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#haste_phb",
    },
    {
        "name": "Fly",
        "level": 3,
        "school": "transmutation",
        "concentration": True,
        "casting_time": "1 action",
        "range": "Touch",
        "components": "V, S, M",
        "duration": "Concentration, up to 10 minutes",
        "description": "You touch a willing creature. The target gains a flying speed of 60 feet for the duration. When the spell ends, the target falls if it is still aloft, unless it can stop the fall.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#fly_phb",
    },
    {
        "name": "Revivify",
        "level": 3,
        "school": "necromancy",
        "casting_time": "1 action",
        "range": "Touch",
        "components": "V, S, M (diamonds worth 300 gp, which the spell consumes)",
        "duration": "Instantaneous",
        "description": "You touch a creature that has died within the last minute. That creature returns to life with 1 hit point. This spell can't return to life a creature that has died of old age, nor can it restore any missing body parts.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#revivify_phb",
    },
    {
        "name": "Wish",
        "level": 9,
        "school": "conjuration",
        "casting_time": "1 action",
        "range": "Self",
        "components": "V",
        "duration": "Instantaneous",
        "description": "Wish is the mightiest spell a mortal creature can cast. By simply speaking aloud, you can alter the very foundations of reality in accord with your desires. The basic use of this spell is to duplicate any other spell of 8th level or lower.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#wish_phb",
    },
]

MONSTERS = [
    {
        "name": "Goblin",
        "type": "humanoid (goblinoid)",
        "size": "Small",
        "alignment": "neutral evil",
        "armor_class": "15 (leather armor, shield)",
        "hit_points": "7 (2d6)",
        "speed": "30 ft.",
        "challenge_rating": "1/4",
        "description": "Nimble Escape. The goblin can take the Disengage or Hide action as a bonus action on each of its turns. Attacks with Scimitar (+4 to hit, 1d6+2 slashing) or Shortbow (+4 to hit, 1d6+2 piercing).",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#goblin_mm",
    },
    {
        "name": "Adult Red Dragon",
        "type": "dragon",
        "size": "Huge",
        "alignment": "chaotic evil",
        "armor_class": "19 (natural armor)",
        "hit_points": "256 (19d12 + 133)",
        "speed": "40 ft., climb 40 ft., fly 80 ft.",
        "challenge_rating": "17",
        "description": "Legendary Resistance (3/Day). Fire Breath (Recharge 5-6): The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much on a successful one.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#adult%20red%20dragon_mm",
    },
    {
        "name": "Beholder",
        "type": "aberration",
        "size": "Large",
        "alignment": "lawful evil",
        "armor_class": "18 (natural armor)",
        "hit_points": "180 (19d10 + 76)",
        "speed": "0 ft., fly 20 ft. (hover)",
        "challenge_rating": "13",
        "description": "Antimagic Cone. The beholder's central eye creates an area of antimagic, as in the antimagic field spell, in a 150-foot cone. Eye Rays: Shoots 3 random eye rays per turn at targets within 120 ft.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#beholder_mm",
    },
    {
        "name": "Mimic",
        "type": "monstrosity (shapechanger)",
        "size": "Medium",
        "alignment": "neutral",
        "armor_class": "12",
        "hit_points": "58 (9d8 + 18)",
        "speed": "15 ft.",
        "challenge_rating": "2",
        "description": "Shapechanger. The mimic can use its action to polymorph into an object or back into its true, amorphous form. Adhesive (Object Form Only): The mimic adheres to anything that touches it. False Appearance: While remaining motionless, it is indistinguishable from an ordinary object.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#mimic_mm",
    },
    {
        "name": "Gelatinous Cube",
        "type": "ooze",
        "size": "Large",
        "alignment": "unaligned",
        "armor_class": "6",
        "hit_points": "84 (8d10 + 40)",
        "speed": "15 ft.",
        "challenge_rating": "2",
        "description": "Ooze Cube. Transparent: Even when in plain sight, it takes a successful DC 15 Perception check to spot a motionless cube. Engulf: Moves up to its speed and engulfs creatures in its space, subjecting them to 3d6 acid damage and paralysis.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#gelatinous%20cube_mm",
    },
]

# --- 2024 (5.5e) revisions ---------------------------------------------------

SPELLS_2024 = [
    {
        "name": "Cure Wounds",
        "level": 1,
        "school": "abjuration",
        "casting_time": "1 action",
        "range": "Touch",
        "components": "V, S",
        "duration": "Instantaneous",
        "description": "A creature you touch regains Hit Points equal to 2d8 + your spellcasting ability modifier. (2024 Revised: healing doubled to 2d8 from 1d8!). At Higher Levels: Each slot level above 1st increases healing by 2d8.",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
        "source_url": "https://5e.tools/spells.html#cure%20wounds_xphb",
    },
    {
        "name": "Healing Word",
        "level": 1,
        "school": "abjuration",
        "casting_time": "1 bonus action",
        "range": "60 feet",
        "components": "V",
        "duration": "Instantaneous",
        "description": "A creature of your choice within range regains Hit Points equal to 2d4 + your spellcasting ability modifier. (2024 Revised: healing increased to 2d4 from 1d4!). At Higher Levels: Each slot level above 1st increases healing by 2d4.",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
        "source_url": "https://5e.tools/spells.html#healing%20word_xphb",
    },
    {
        "name": "Divine Smite",
        "level": 1,
        "school": "evocation",
        "casting_time": "1 bonus action (immediately after hitting with a melee weapon or Unarmed Strike)",
        "range": "Self",
        "components": "V",
        "duration": "Instantaneous",
        "description": "As you strike, your weapon or unarmed strike bursts with holy radiance. The target takes an extra 2d8 Radiant damage, plus 1d8 for each slot level above 1st (up to 5d8 max). If the target is Fiend or Undead, damage increases by 1d8. (2024 Revised: now a spell cast with a Bonus Action!).",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
        "source_url": "https://5e.tools/spells.html#divine%20smite_xphb",
    },
    {
        "name": "Counterspell",
        "level": 3,
        "school": "abjuration",
        "casting_time": "1 reaction",
        "range": "60 feet",
        "components": "S",
        "duration": "Instantaneous",
        "description": "You attempt to interrupt a creature in the process of casting a spell. The target must make a Constitution saving throw against your spell save DC. On a failed save, the spell fails and is wasted. (2024 Revised: Target makes Constitution save instead of ability check contest!).",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
        "source_url": "https://5e.tools/spells.html#counterspell_xphb",
    },
    {
        "name": "True Strike",
        "level": 0,
        "school": "divination",
        "casting_time": "1 action",
        "range": "Self",
        "components": "S, M (a weapon with which you have proficiency)",
        "duration": "Instantaneous",
        "description": "Guided by a flash of magical insight, you make one attack with the weapon used in the casting. You can use your spellcasting ability instead of Strength or Dexterity for the attack and damage rolls, and the damage is Radiant damage instead of bludgeoning, piercing, or slashing. Increases by 1d6 at level 5, 11, and 17. (2024 Complete Rework!)",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
        "source_url": "https://5e.tools/spells.html#true%20strike_xphb",
    },
    {
        "name": "Fireball",
        "level": 3,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "150 feet",
        "components": "V, S, M (a tiny ball of bat guano and sulfur)",
        "duration": "Instantaneous",
        "description": "A bright streak flashes from your pointing finger to a point you choose within range and blossoms into an explosion of flame. Each creature in a 20-foot-radius sphere must make a Dexterity saving throw, taking 8d6 Fire damage on a failed save, or half as much on a successful one. At Higher Levels: +1d6 per slot level above 3rd.",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
        "source_url": "https://5e.tools/spells.html#fireball_xphb",
    },
]

MONSTERS_2024 = [
    {
        "name": "Goblin",
        "type": "Humanoid (Goblinoid)",
        "size": "Small",
        "alignment": "Neutral Evil",
        "armor_class": "15 (Leather Armor, Shield)",
        "hit_points": "7 (2d6)",
        "speed": "30 ft.",
        "challenge_rating": "1/4",
        "description": "Nimble Escape: Bonus Action to Disengage or Hide. Scimitar: +4 to hit, reach 5 ft., 5 (1d6 + 2) Slashing. Shortbow: +4 to hit, range 80/320 ft., 5 (1d6 + 2) Piercing damage. (2024 Monster Manual Revised)",
        "source": "2024 Monster Manual (5.5e)",
        "edition": "2024",
        "source_url": "https://5e.tools/bestiary.html#goblin%20warrior_xmm",
    },
    {
        "name": "Adult Red Dragon",
        "type": "Dragon",
        "size": "Huge",
        "alignment": "Chaotic Evil",
        "armor_class": "19",
        "hit_points": "256 (19d12 + 133)",
        "speed": "40 ft., climb 40 ft., fly 80 ft.",
        "challenge_rating": "17",
        "description": "Legendary Resistance (3/Day). Multiattack. Fire Breath (Recharge 5-6): 60-foot cone, DC 21 Dex save, 63 (18d6) Fire damage. Legendary Actions: Wing Attack, Tail Strike. (2024 Monster Manual Revised)",
        "source": "2024 Monster Manual (5.5e)",
        "edition": "2024",
        "source_url": "https://5e.tools/bestiary.html#adult%20red%20dragon_xmm",
    },
]

# --- Conditions ----------------------------------------------------------------

CONDITIONS_2014 = [
    {
        "name": "Grappled",
        "type": "Condition",
        "description": "• A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed.\n• The condition ends if the grappler is incapacitated.\n• The condition also ends if an effect removes the grappled creature from the reach of the grappler or grappling effect.",
        "source": "2014 SRD 5.1",
        "edition": "2014",
    },
    {
        "name": "Exhaustion",
        "type": "Condition",
        "description": "Level 1: Disadvantage on ability checks\nLevel 2: Speed halved\nLevel 3: Disadvantage on attack rolls and saving throws\nLevel 4: Hit point maximum halved\nLevel 5: Speed reduced to 0\nLevel 6: Death. A long rest decreases exhaustion level by 1.",
        "source": "2014 SRD 5.1",
        "edition": "2014",
    },
    {
        "name": "Invisible",
        "type": "Condition",
        "description": "• An invisible creature is impossible to see without the aid of magic or a special sense.\n• Attack rolls against the creature have disadvantage, and the creature's attack rolls have advantage.",
        "source": "2014 SRD 5.1",
        "edition": "2014",
    },
    {
        "name": "Paralyzed",
        "type": "Condition",
        "description": "• A paralyzed creature is incapacitated and can't move or speak.\n• The creature automatically fails Strength and Dexterity saving throws.\n• Attack rolls against the creature have advantage, and any attack that hits the creature is a critical hit if the attacker is within 5 feet.",
        "source": "2014 SRD 5.1",
        "edition": "2014",
    },
    {
        "name": "Poisoned",
        "type": "Condition",
        "description": "A poisoned creature has disadvantage on attack rolls and ability checks.",
        "source": "2014 SRD 5.1",
        "edition": "2014",
    },
    {
        "name": "Prone",
        "type": "Condition",
        "description": "• A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition.\n• The creature has disadvantage on attack rolls.\n• An attack roll against the creature has advantage if the attacker is within 5 feet; otherwise, the attack roll has disadvantage.",
        "source": "2014 SRD 5.1",
        "edition": "2014",
    },
    {
        "name": "Stunned",
        "type": "Condition",
        "description": "• A stunned creature is incapacitated, can't move, and can speak only falteringly.\n• The creature automatically fails Strength and Dexterity saving throws.\n• Attack rolls against the creature have advantage.",
        "source": "2014 SRD 5.1",
        "edition": "2014",
    },
]

CONDITIONS_2024 = [
    {
        "name": "Dazed",
        "type": "Condition",
        "description": "While Dazed, you experience the following effects:\n• Limited Activity: You can either move or take one action on your turn; you can't do both, and you can't take a Bonus Action.\n• No Reactions: You can't take reactions. (Brand new 2024 condition!)",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
    },
    {
        "name": "Grappled",
        "type": "Condition",
        "description": "While Grappled, you experience the following effects:\n• Speed 0: Your Speed is 0 and can't increase.\n• Disadvantage on Attacks: You have Disadvantage on attack rolls against any target other than the grappler.\n• Movable: The grappler can drag or carry you when it moves, but its Speed is halved unless you are Tiny or two sizes smaller.\n• Escape: At the end of each of your turns, you can make a Strength or Dexterity saving throw against the grapple DC.",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
    },
    {
        "name": "Exhaustion",
        "type": "Condition",
        "description": "While you have Exhaustion, you experience the following effects:\n• Exhaustion Levels: This condition is cumulative, with each level representing a stage of fatigue, up to Level 10. Death occurs at Level 10.\n• D20 Test Penalty: Whenever you make a D20 Test, subtract twice your Exhaustion level from the roll.\n• Speed Reduction: Subtract 5 feet times your Exhaustion level from your Speed.\n• Removing Levels: Finishing a Long Rest removes 1 level of Exhaustion.",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
    },
    {
        "name": "Invisible",
        "type": "Condition",
        "description": "While Invisible, you experience the following effects:\n• Surprise: You have Advantage on initiative rolls.\n• Concealed: You aren't affected by any effect that requires its target to be seen.\n• Attacks Affected: Attack rolls against you have Disadvantage, and your attack rolls have Advantage against creatures that cannot see invisible objects/creatures.",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
    },
    {
        "name": "Poisoned",
        "type": "Condition",
        "description": "While Poisoned, you have Disadvantage on attack rolls and ability checks.",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
    },
    {
        "name": "Prone",
        "type": "Condition",
        "description": "While Prone, your only movement option is to crawl. Attack rolls against you have Advantage if attacker is within 5 feet; otherwise, Disadvantage. You have Disadvantage on attack rolls.",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
    },
    {
        "name": "Stunned",
        "type": "Condition",
        "description": "While Stunned, you are Incapacitated, can't move, and speak only falteringly. You fail Strength and Dexterity saving throws, and attack rolls against you have Advantage.",
        "source": "2024 Player's Handbook (5.5e)",
        "edition": "2024",
    },
]

ITEMS = [
    {
        "name": "Bag of Holding",
        "type": "Wondrous item",
        "rarity": "Uncommon",
        "weight": "15 lbs.",
        "description": "This bag has an interior space considerably larger than its outside dimensions, roughly 2 feet in diameter at the mouth and 4 feet deep. The bag can hold up to 500 pounds, not exceeding a volume of 64 cubic feet. The bag weighs 15 pounds, regardless of its contents.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/items.html#bag%20of%20holding_dmg",
    },
    {
        "name": "Vorpal Sword",
        "type": "Weapon (any sword that deals slashing damage)",
        "rarity": "Legendary (requires attunement)",
        "description": "You gain a +3 bonus to attack and damage rolls made with this magic weapon. In addition, the weapon ignores resistance to slashing damage. When you roll a 20 on an attack roll made with this weapon against a creature that has at least one head, you cut off one of its heads.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/items.html#vorpal%20sword_dmg",
    },
    {
        "name": "Potion of Healing",
        "type": "Potion",
        "rarity": "Common",
        "description": "You regain 2d4 + 2 hit points when you drink this potion. The potion's red liquid glimmers when agitated.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/items.html#potion%20of%20healing_dmg",
    },
]

FEATS = [
    {
        "name": "Alert",
        "type": "Feat",
        "description": "Always on the lookout for danger, you gain the following benefits: +5 bonus to initiative, you can't be surprised while you are conscious, and other creatures don't gain advantage on attack rolls against you as a result of being unseen by you.",
        "source": "SRD 5.1",
    },
    {
        "name": "War Caster",
        "type": "Feat",
        "description": "You have advantage on Constitution saving throws to maintain your concentration on a spell when you take damage. You can perform somatic components with weapons or shields in hand. When a hostile creature's movement provokes an opportunity attack, you can use your reaction to cast a spell.",
        "source": "SRD 5.1",
    },
]

RACES = [
    {
        "name": "Elf",
        "type": "Race",
        "speed": "30 ft.",
        "traits": "Darkvision (60 ft.), Keen Senses (Perception proficiency), Fey Ancestry (advantage vs charmed, immune to sleep), Trance (4 hours meditation instead of sleep). Ability Score Increase: Dexterity +2.",
        "description": "Elves are a magical people of otherworldly grace, living in the world but not entirely part of it.",
        "source": "SRD 5.1",
    },
    {
        "name": "Dwarf",
        "type": "Race",
        "speed": "25 ft. (not reduced by heavy armor)",
        "traits": "Darkvision (60 ft.), Dwarven Resilience (advantage vs poison, resistance to poison damage), Dwarven Combat Training, Stonecunning. Ability Score Increase: Constitution +2.",
        "description": "Bold and hardy, dwarves are known as skilled warriors, miners, and workers of stone and metal.",
        "source": "SRD 5.1",
    },
]

CLASSES = [
    {
        "name": "Wizard",
        "type": "Class",
        "hit_die": "d6",
        "primary_ability": "Intelligence",
        "saving_throws": "Intelligence, Wisdom",
        "description": "A scholarly magic-user capable of manipulating the structures of reality. Wizards cast spells through rigorous study and record their knowledge in spellbooks.",
        "source": "SRD 5.1",
    },
    {
        "name": "Fighter",
        "type": "Class",
        "hit_die": "d10",
        "primary_ability": "Strength or Dexterity",
        "saving_throws": "Strength, Constitution",
        "description": "A master of martial combat, skilled with a variety of weapons and armor. Features include Second Wind, Action Surge, and martial archetype specializations.",
        "source": "SRD 5.1",
    },
]

COLLECTIONS = {
    "spells": SPELLS,
    "monsters": MONSTERS,
    "conditions": CONDITIONS_2014,
    "items": ITEMS,
    "feats": FEATS,
    "races": RACES,
    "classes": CLASSES,
}

REVISED_2024 = {
    "spells": SPELLS_2024,
    "monsters": MONSTERS_2024,
    "conditions": CONDITIONS_2024,
}


def get_collection(kind, edition="2014"):
    """The entries for one kind: with 2024, its revisions first, then every
    2014 entry it did not replace."""
    base = COLLECTIONS.get(kind, [])
    if edition != "2024" or kind not in REVISED_2024:
        return base
    revised = REVISED_2024[kind]
    names = {item["name"].lower() for item in revised}
    return revised + [item for item in base if item["name"].lower() not in names]


class DndHandler(http.server.BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        # Health probe endpoint
        if self.path in ("/docs", "/health", "/"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.strip("/")
        params = urllib.parse.parse_qs(parsed.query)
        edition = "2024" if params.get("edition", ["2014"])[0].strip() in ("2024", "5.5e") else "2014"

        # Health / docs probe
        if path in ("docs", "health", ""):
            if "json" in parsed.query or path == "health":
                return self.send_json({"status": "ok", "service": "hoffle-dnd-bot", "version": "1.1", "editions": ["2014", "2024"]})
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Hoffle D&D Companion Service</h1><p>SRD 5e API active.</p>")
            return

        # /api/lookups/{kind}/search?q={query}
        search_match = re.match(r"^api/lookups/([^/]+)/search$", path)
        if search_match:
            kind = search_match.group(1).lower()
            query = params.get("q", [""])[0].strip().lower()
            items = get_collection(kind, edition)
            results = [
                item["name"]
                for item in items
                if query in item["name"].lower()
            ]
            return self.send_json(results)

        # /api/lookups/{kind}/{query}
        lookup_match = re.match(r"^api/lookups/([^/]+)/(.+)$", path)
        if lookup_match:
            kind = lookup_match.group(1).lower()
            query_raw = urllib.parse.unquote(lookup_match.group(2)).strip().lower()
            items = get_collection(kind, edition)

            # 1. Exact match
            for item in items:
                if item["name"].lower() == query_raw:
                    return self.send_json(item)

            # 2. Prefix / partial match
            for item in items:
                if query_raw in item["name"].lower():
                    return self.send_json(item)

            return self.send_json({"error": f"Nothing found in {kind} matching '{query_raw}'"}, status=404)

        return self.send_json({"error": "Endpoint not found"}, status=404)

    def log_message(self, format, *args):
        # Quiet server
        pass


def main():
    print(f"=== Starting Hoffle D&D Companion Service on :{PORT} ===")
    with socketserver.TCPServer(("", PORT), DndHandler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
