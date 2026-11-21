#!/usr/bin/env python3
"""
Hoffle D&D Companion & SRD 5e Bot Service
Provides 5e SRD compendium lookup and search for spells, monsters, conditions,
items, feats, races, classes, and subclasses, plus health checks and docs.
Lookups take ?edition=2014 (the default) or ?edition=2024; an entry the 2024
books did not change answers for both.
Runs standalone on port 8732.
"""

import http.server
import json
import re
import socketserver
import urllib.parse

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
        "save": "Dexterity",
        "damage_type": "Fire",
        "dice": "8d6",
        "higher_levels": "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.",
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
        "damage_type": "Force",
        "dice": "1d4+1",
        "higher_levels": "When you cast this spell using a spell slot of 2nd level or higher, the spell creates one more dart for each slot level above 1st.",
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
        "dice": "1d8",
        "higher_levels": "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st.",
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
        "dice": "1d4",
        "higher_levels": "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d4 for each slot level above 1st.",
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
        "damage_type": "Force",
        "dice": "1d10",
        "description": "A beam of crackling energy streaks toward a creature within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 force damage. The spell creates more than one beam when you reach higher levels: two beams at 5th level, three beams at 11th level, and four beams at 17th level.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#eldritch%20blast_phb",
    },
    {
        "name": "Fire Bolt",
        "level": 0,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "120 feet",
        "components": "V, S",
        "duration": "Instantaneous",
        "damage_type": "Fire",
        "dice": "1d10",
        "description": "You hurl a mote of fire at a creature or object within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage. This spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10).",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#fire%20bolt_phb",
    },
    {
        "name": "Sacred Flame",
        "level": 0,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "60 feet",
        "components": "V, S",
        "duration": "Instantaneous",
        "save": "Dexterity",
        "damage_type": "Radiant",
        "dice": "1d8",
        "description": "Flame-like radiance descends on a creature that you can see within range. The target must succeed on a Dexterity saving throw or take 1d8 radiant damage. The target gains no benefit from cover for this saving throw. The spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8).",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#sacred%20flame_phb",
    },
    {
        "name": "Mage Hand",
        "level": 0,
        "school": "conjuration",
        "casting_time": "1 action",
        "range": "30 feet",
        "components": "V, S",
        "duration": "1 minute",
        "description": "A spectral, floating hand appears at a point you choose within range. The hand lasts for the duration or until you dismiss it as an action.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#mage%20hand_phb",
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
        "name": "Guiding Bolt",
        "level": 1,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "120 feet",
        "components": "V, S",
        "duration": "1 round",
        "damage_type": "Radiant",
        "dice": "4d6",
        "higher_levels": "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.",
        "description": "A flash of light streaks toward a creature of your choice within range. Make a ranged spell attack against the target. On a hit, the target takes 4d6 radiant damage, and the next attack roll made against this target before the end of your next turn has advantage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#guiding%20bolt_phb",
    },
    {
        "name": "Burning Hands",
        "level": 1,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "Self (15-foot cone)",
        "components": "V, S",
        "duration": "Instantaneous",
        "save": "Dexterity",
        "damage_type": "Fire",
        "dice": "3d6",
        "higher_levels": "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.",
        "description": "As you hold your hands with thumbs touching and fingers spread, a thin sheet of flames shoots forth from your outstretched fingertips. Each creature in a 15-foot cone must make a Dexterity saving throw. A creature takes 3d6 fire damage on a failed save, or half as much damage on a successful one.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#burning%20hands_phb",
    },
    {
        "name": "Thunderwave",
        "level": 1,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "Self (15-foot cube)",
        "components": "V, S",
        "duration": "Instantaneous",
        "save": "Constitution",
        "damage_type": "Thunder",
        "dice": "2d8",
        "higher_levels": "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d8 for each slot level above 1st.",
        "description": "A wave of thunderous force sweeps out from you. Each creature in a 15-foot cube originating from you must make a Constitution saving throw. On a failed save, a creature takes 2d8 thunder damage and is pushed 10 feet away from you.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#thunderwave_phb",
    },
    {
        "name": "Bless",
        "level": 1,
        "school": "enchantment",
        "concentration": True,
        "casting_time": "1 action",
        "range": "30 feet",
        "components": "V, S, M (a sprinkling of holy water)",
        "duration": "Concentration, up to 1 minute",
        "description": "You bless up to three creatures of your choice within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target can roll a d4 and add the number rolled to the attack roll or saving throw.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#bless_phb",
    },
    {
        "name": "Sleep",
        "level": 1,
        "school": "enchantment",
        "casting_time": "1 action",
        "range": "90 feet",
        "components": "V, S, M",
        "duration": "1 minute",
        "dice": "5d8",
        "higher_levels": "When you cast this spell using a spell slot of 2nd level or higher, roll an additional 2d8 for each slot level above 1st.",
        "description": "This spell sends creatures into a magical slumber. Roll 5d8; the total is how many hit points of creatures this spell can affect. Creatures within 20 feet of a point you choose within range are affected in ascending order of their current hit points (a 20-foot-radius sphere).",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#sleep_phb",
    },
    {
        "name": "Misty Step",
        "level": 2,
        "school": "conjuration",
        "casting_time": "1 bonus action",
        "range": "Self",
        "components": "V",
        "duration": "Instantaneous",
        "description": "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space that you can see.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#misty%20step_phb",
    },
    {
        "name": "Hold Person",
        "level": 2,
        "school": "enchantment",
        "concentration": True,
        "casting_time": "1 action",
        "range": "60 feet",
        "components": "V, S, M",
        "duration": "Concentration, up to 1 minute",
        "save": "Wisdom",
        "description": "Choose a humanoid that you can see within range. The target must succeed on a Wisdom saving throw or be paralyzed for the duration.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#hold%20person_phb",
    },
    {
        "name": "Shatter",
        "level": 2,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "60 feet",
        "components": "V, S, M",
        "duration": "Instantaneous",
        "save": "Constitution",
        "damage_type": "Thunder",
        "dice": "3d8",
        "higher_levels": "When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d8 for each slot level above 2nd.",
        "description": "A sudden loud ringing noise, painfully intense, erupts from a point of your choice within range. Each creature in a 10-foot-radius sphere centered on that point must make a Constitution saving throw. A creature takes 3d8 thunder damage on a failed save, or half as much damage on a successful one.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#shatter_phb",
    },
    {
        "name": "Web",
        "level": 2,
        "school": "conjuration",
        "concentration": True,
        "casting_time": "1 action",
        "range": "60 feet",
        "components": "V, S, M",
        "duration": "Concentration, up to 1 hour",
        "save": "Dexterity",
        "description": "You conjure a mass of thick, sticky webbing at a point of your choice within range. The webs fill a 20-foot cube from that point for the duration.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#web_phb",
    },
    {
        "name": "Hunter's Mark",
        "level": 1,
        "school": "divination",
        "concentration": True,
        "casting_time": "1 bonus action",
        "range": "90 feet",
        "components": "V",
        "duration": "Concentration, up to 1 hour",
        "dice": "1d6",
        "description": "You choose a creature you can see within range and mystically mark it as your quarry. Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#hunter's%20mark_phb",
    },
    {
        "name": "Lightning Bolt",
        "level": 3,
        "school": "evocation",
        "casting_time": "1 action",
        "range": "Self (100-foot line)",
        "components": "V, S, M",
        "duration": "Instantaneous",
        "save": "Dexterity",
        "damage_type": "Lightning",
        "dice": "8d6",
        "higher_levels": "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.",
        "description": "A stroke of lightning forming a line 100 feet long and 5 feet wide blasts out from you in a direction you choose. Each creature in the line must make a Dexterity saving throw. A creature takes 8d6 lightning damage on a failed save, or half as much damage on a successful one.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/spells.html#lightning%20bolt_phb",
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
        "scores": [8, 14, 10, 10, 8, 8],
        "traits": "**Nimble Escape.** The goblin can take the Disengage or Hide action as a bonus action on each of its turns.",
        "actions": "**Scimitar.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage.\n**Shortbow.** *Ranged Weapon Attack:* +4 to hit, range 80/320 ft., one target. *Hit:* 5 (1d6 + 2) piercing damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#goblin_mm",
    },
    {
        "name": "Orc",
        "type": "humanoid (orc)",
        "size": "Medium",
        "alignment": "chaotic evil",
        "armor_class": "13 (hide armor)",
        "hit_points": "15 (2d8 + 6)",
        "speed": "30 ft.",
        "challenge_rating": "1/2",
        "scores": [16, 12, 16, 7, 11, 10],
        "traits": "**Aggressive.** As a bonus action, the orc can move up to its speed toward a hostile creature that it can see.",
        "actions": "**Greataxe.** *Melee Weapon Attack:* +5 to hit, reach 5 ft., one target. *Hit:* 9 (1d12 + 3) slashing damage.\n**Javelin.** *Melee or Ranged Weapon Attack:* +5 to hit, reach 5 ft. or range 30/120 ft., one target. *Hit:* 6 (1d6 + 3) piercing damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#orc_mm",
    },
    {
        "name": "Kobold",
        "type": "humanoid (kobold)",
        "size": "Small",
        "alignment": "lawful evil",
        "armor_class": "12",
        "hit_points": "5 (2d6 - 2)",
        "speed": "30 ft.",
        "challenge_rating": "1/8",
        "scores": [7, 15, 9, 8, 7, 8],
        "traits": "**Pack Tactics.** The kobold has advantage on an attack roll against a creature if at least one of the kobold's allies is within 5 feet of the creature.",
        "actions": "**Dagger.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 4 (1d4 + 2) piercing damage.\n**Sling.** *Ranged Weapon Attack:* +4 to hit, range 30/120 ft., one target. *Hit:* 4 (1d4 + 2) bludgeoning damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#kobold_mm",
    },
    {
        "name": "Skeleton",
        "type": "undead",
        "size": "Medium",
        "alignment": "lawful evil",
        "armor_class": "13 (armor scraps)",
        "hit_points": "13 (2d8 + 4)",
        "speed": "30 ft.",
        "challenge_rating": "1/4",
        "scores": [10, 14, 15, 6, 8, 5],
        "actions": "**Shortsword.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) piercing damage.\n**Shortbow.** *Ranged Weapon Attack:* +4 to hit, range 80/320 ft., one target. *Hit:* 5 (1d6 + 2) piercing damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#skeleton_mm",
    },
    {
        "name": "Zombie",
        "type": "undead",
        "size": "Medium",
        "alignment": "neutral evil",
        "armor_class": "8",
        "hit_points": "22 (3d8 + 9)",
        "speed": "20 ft.",
        "challenge_rating": "1/4",
        "scores": [13, 6, 16, 3, 6, 5],
        "traits": "**Undead Fortitude.** If damage reduces the zombie to 0 hit points, it must make a Constitution saving throw with a DC of 5 + the damage taken, unless the damage is radiant or from a critical hit. On a success, the zombie drops to 1 hit point instead.",
        "actions": "**Slam.** *Melee Weapon Attack:* +3 to hit, reach 5 ft., one target. *Hit:* 4 (1d6 + 1) bludgeoning damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#zombie_mm",
    },
    {
        "name": "Bandit",
        "type": "humanoid (any race)",
        "size": "Medium",
        "alignment": "any non-lawful alignment",
        "armor_class": "12 (leather armor)",
        "hit_points": "11 (2d8 + 2)",
        "speed": "30 ft.",
        "challenge_rating": "1/8",
        "scores": [11, 12, 12, 10, 10, 10],
        "actions": "**Scimitar.** *Melee Weapon Attack:* +3 to hit, reach 5 ft., one target. *Hit:* 4 (1d6 + 1) slashing damage.\n**Light Crossbow.** *Ranged Weapon Attack:* +3 to hit, range 80/320 ft., one target. *Hit:* 5 (1d8 + 1) piercing damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#bandit_mm",
    },
    {
        "name": "Wolf",
        "type": "beast",
        "size": "Medium",
        "alignment": "unaligned",
        "armor_class": "13 (natural armor)",
        "hit_points": "11 (2d8 + 2)",
        "speed": "40 ft.",
        "challenge_rating": "1/4",
        "scores": [12, 15, 12, 3, 12, 6],
        "traits": "**Keen Hearing and Smell.** Advantage on Wisdom (Perception) checks that rely on hearing or smell.\n**Pack Tactics.** Advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet.",
        "actions": "**Bite.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 7 (2d4 + 2) piercing damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#wolf_mm",
    },
    {
        "name": "Bugbear",
        "type": "humanoid (goblinoid)",
        "size": "Medium",
        "alignment": "chaotic evil",
        "armor_class": "16 (hide armor, shield)",
        "hit_points": "27 (5d8 + 5)",
        "speed": "30 ft.",
        "challenge_rating": "1",
        "scores": [15, 14, 13, 8, 11, 9],
        "traits": "**Brute.** A melee weapon deals one extra die of its damage when the bugbear hits with it (included in the attack).",
        "actions": "**Morningstar.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 11 (2d8 + 2) piercing damage.\n**Javelin.** *Melee or Ranged Weapon Attack:* +4 to hit, reach 5 ft. or range 30/120 ft., one target. *Hit:* 9 (2d6 + 2) piercing damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#bugbear_mm",
    },
    {
        "name": "Ogre",
        "type": "giant",
        "size": "Large",
        "alignment": "chaotic evil",
        "armor_class": "11 (hide armor)",
        "hit_points": "59 (7d10 + 21)",
        "speed": "40 ft.",
        "challenge_rating": "2",
        "scores": [19, 8, 16, 5, 7, 7],
        "actions": "**Greatclub.** *Melee Weapon Attack:* +6 to hit, reach 5 ft., one target. *Hit:* 13 (2d8 + 4) bludgeoning damage.\n**Javelin.** *Melee or Ranged Weapon Attack:* +6 to hit, reach 5 ft. or range 30/120 ft., one target. *Hit:* 11 (2d6 + 4) piercing damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#ogre_mm",
    },
    {
        "name": "Owlbear",
        "type": "monstrosity",
        "size": "Large",
        "alignment": "unaligned",
        "armor_class": "13 (natural armor)",
        "hit_points": "59 (7d10 + 21)",
        "speed": "40 ft.",
        "challenge_rating": "3",
        "scores": [20, 12, 17, 3, 12, 7],
        "traits": "**Keen Sight and Smell.** The owlbear has advantage on Wisdom (Perception) checks that rely on sight or smell.",
        "actions": "**Multiattack.** The owlbear makes two attacks: one with its beak and one with its claws.\n**Beak.** *Melee Weapon Attack:* +7 to hit, reach 5 ft., one creature. *Hit:* 10 (1d10 + 5) piercing damage.\n**Claws.** *Melee Weapon Attack:* +7 to hit, reach 5 ft., one target. *Hit:* 14 (2d8 + 5) slashing damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#owlbear_mm",
    },
    {
        "name": "Troll",
        "type": "giant",
        "size": "Large",
        "alignment": "chaotic evil",
        "armor_class": "15 (natural armor)",
        "hit_points": "84 (8d10 + 40)",
        "speed": "30 ft.",
        "challenge_rating": "5",
        "scores": [18, 13, 20, 7, 9, 7],
        "traits": "**Regeneration.** The troll regains 10 hit points at the start of its turn unless it took acid or fire damage.",
        "actions": "**Multiattack.** The troll makes three attacks: one with its bite and two with its claws.\n**Bite.** *Melee Weapon Attack:* +7 to hit, reach 5 ft., one target. *Hit:* 7 (1d6 + 4) piercing damage.\n**Claw.** *Melee Weapon Attack:* +7 to hit, reach 5 ft., one target. *Hit:* 11 (2d6 + 4) slashing damage.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/bestiary.html#troll_mm",
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
        "scores": [27, 10, 25, 16, 13, 21],
        "traits": "**Legendary Resistance (3/Day).** If the dragon fails a saving throw, it can choose to succeed instead.",
        "actions": "**Multiattack.** The dragon makes three attacks: one with its bite and two with its claws.\n**Bite.** *Melee Weapon Attack:* +14 to hit, reach 10 ft., one target. *Hit:* 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage.\n**Fire Breath (Recharge 5-6).** The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much on a successful one.",
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
        "scores": [10, 14, 18, 17, 15, 17],
        "traits": "**Antimagic Cone.** The beholder's central eye creates an area of antimagic, as in the antimagic field spell, in a 150-foot cone.",
        "actions": "**Bite.** *Melee Weapon Attack:* +5 to hit, reach 5 ft., one target. *Hit:* 14 (4d6) piercing damage.\n**Eye Rays.** Shoots 3 random eye rays per turn at targets within 120 ft.",
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
        "scores": [17, 12, 15, 5, 13, 8],
        "traits": "**Shapechanger.** The mimic can use its action to polymorph into an object or back into its true, amorphous form.\n**False Appearance.** While remaining motionless, it is indistinguishable from an ordinary object.",
        "actions": "**Pseudopod.** *Melee Weapon Attack:* +5 to hit, reach 5 ft., one target. *Hit:* 7 (1d8 + 3) bludgeoning damage.\n**Bite.** *Melee Weapon Attack:* +5 to hit, reach 5 ft., one target. *Hit:* 7 (1d8 + 3) piercing damage plus 4 (1d8) acid damage.",
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
        "scores": [14, 3, 20, 1, 6, 1],
        "traits": "**Transparent.** Even when in plain sight, it takes a successful DC 15 Perception check to spot a motionless cube.",
        "actions": "**Pseudopod.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 10 (3d6) acid damage.\n**Engulf.** Moves up to its speed and engulfs creatures in its space, subjecting them to 3d6 acid damage and paralysis.",
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
        "dice": "2d8",
        "higher_levels": "Each slot level above 1st increases healing by 2d8.",
        "description": "A creature you touch regains Hit Points equal to 2d8 + your spellcasting ability modifier. (2024 Revised: healing doubled to 2d8 from 1d8!)",
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
        "dice": "2d4",
        "higher_levels": "Each slot level above 1st increases healing by 2d4.",
        "description": "A creature of your choice within range regains Hit Points equal to 2d4 + your spellcasting ability modifier. (2024 Revised: healing increased to 2d4 from 1d4!)",
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
        "damage_type": "Radiant",
        "dice": "2d8",
        "higher_levels": "The damage increases by 1d8 for each spell slot level above 1st.",
        "description": "As you strike, your weapon or unarmed strike bursts with holy radiance. The target takes an extra 2d8 Radiant damage, plus 1d8 for each slot level above 1st. If the target is Fiend or Undead, damage increases by 1d8.",
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
        "save": "Constitution",
        "description": "You attempt to interrupt a creature in the process of casting a spell. The target must make a Constitution saving throw against your spell save DC. On a failed save, the spell fails and is wasted.",
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
        "damage_type": "Radiant",
        "dice": "1d6",
        "description": "Guided by a flash of magical insight, you make one attack with the weapon used in the casting. You can use your spellcasting ability instead of Strength or Dexterity for the attack and damage rolls, and the damage is Radiant damage. Increases by 1d6 at level 5, 11, and 17.",
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
        "save": "Dexterity",
        "damage_type": "Fire",
        "dice": "8d6",
        "higher_levels": "The damage increases by 1d6 for each spell slot level above 3rd.",
        "description": "A bright streak flashes from your pointing finger to a point you choose within range and blossoms into an explosion of flame. Each creature in a 20-foot-radius sphere must make a Dexterity saving throw, taking 8d6 Fire damage on a failed save, or half as much on a successful one.",
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
        "scores": [8, 15, 10, 10, 8, 8],
        "traits": "**Nimble Escape.** Bonus Action to Disengage or Hide.",
        "actions": "**Scimitar.** +4 to hit, reach 5 ft., 5 (1d6 + 2) Slashing damage.\n**Shortbow.** +4 to hit, range 80/320 ft., 5 (1d6 + 2) Piercing damage.",
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
        "scores": [27, 10, 25, 16, 13, 23],
        "traits": "**Legendary Resistance (3/Day).** If the dragon fails a saving throw, it can choose to succeed instead.",
        "actions": "**Multiattack.** Three Rend attacks.\n**Fire Breath (Recharge 5-6).** 60-foot cone, DC 21 Dex save, 63 (18d6) Fire damage.",
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
        "name": "Longsword",
        "type": "Weapon (martial, melee)",
        "rarity": "Common",
        "weight": "3 lbs.",
        "description": "1d8 slashing damage (versatile 1d10). Proficiencies: Martial weapons.",
        "source": "SRD 5.1",
        "source_url": "https://5e.tools/items.html#longsword_phb",
    },
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
    {
        "name": "Paladin",
        "type": "Class",
        "hit_die": "d10",
        "primary_ability": "Strength and Charisma",
        "saving_throws": "Wisdom, Charisma",
        "description": "A holy warrior bound to a sacred oath, combining martial prowess with divine magic and Divine Smite.",
        "source": "SRD 5.1",
    },
]

SUBCLASSES = [
    {
        "name": "Oath of Vengeance",
        "type": "Paladin Subclass",
        "description": "The Oath of Vengeance is a solemn commitment to punish those who have committed a grievous sin. Channel Divinity options include Abjure Enemy and Vow of Enmity.",
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
    "subclasses": SUBCLASSES,
}

REVISED_2024 = {
    "spells": SPELLS_2024,
    "monsters": MONSTERS_2024,
    "conditions": CONDITIONS_2024,
}


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _ability_entries(scores):
    labels = ("STR", "DEX", "CON", "INT", "WIS", "CHA")
    out = []
    for label, score in zip(labels, scores):
        mod = (int(score) - 10) // 2
        out.append({"label": label, "score": int(score), "mod": f"{mod:+d}"})
    return out


def build_card(kind: str, item: dict) -> dict:
    """Return a LookupCard-shaped payload alongside raw fields for Hoffle."""
    name = item.get("name", "Unknown")
    source = item.get("source", "SRD 5.1")
    source_url = item.get("source_url")
    card_kind = kind.rstrip("s") if kind != "classes" and kind != "subclasses" else ("class" if kind == "classes" else "subclass")
    card = {
        "kind": card_kind,
        "name": name,
        "subtitle": "",
        "source": source,
        "source_label": source,
        "source_url": source_url,
        "facts": [],
        "tags": [],
        "sections": [],
        "abilities": [],
    }

    if kind == "spells":
        level = int(item.get("level", 0) or 0)
        school = str(item.get("school", "")).capitalize()
        card["subtitle"] = f"{school} cantrip" if level == 0 else f"{_ordinal(level)}-level {school.lower()}"
        for label, key in (
            ("Casting time", "casting_time"),
            ("Range", "range"),
            ("Components", "components"),
            ("Duration", "duration"),
            ("Save", "save"),
            ("Damage type", "damage_type"),
        ):
            if item.get(key):
                card["facts"].append({"label": label, "value": str(item[key])})
        if item.get("concentration"):
            card["tags"].append("Concentration")
        if item.get("description"):
            card["sections"].append({"title": "", "body": item["description"]})
        if item.get("higher_levels"):
            card["sections"].append({"title": "At higher levels" if level else "Cantrip upgrade", "body": item["higher_levels"]})
    elif kind == "monsters":
        size = item.get("size", "")
        mtype = item.get("type", "")
        align = item.get("alignment", "")
        card["subtitle"] = f"{size} {mtype}".strip() + (f", {align}" if align else "")
        for label, key in (
            ("Armor Class", "armor_class"),
            ("Hit Points", "hit_points"),
            ("Speed", "speed"),
            ("Challenge", "challenge_rating"),
        ):
            if item.get(key):
                card["facts"].append({"label": label, "value": str(item[key])})
        if item.get("scores"):
            card["abilities"] = _ability_entries(item["scores"])
        if item.get("traits"):
            card["sections"].append({"title": "Traits", "body": item["traits"]})
        if item.get("actions"):
            card["sections"].append({"title": "Actions", "body": item["actions"]})
        if item.get("description") and not card["sections"]:
            card["sections"].append({"title": "Actions", "body": item["description"]})
    else:
        card["subtitle"] = str(item.get("type", ""))
        for label, key in (
            ("Rarity", "rarity"),
            ("Weight", "weight"),
            ("Speed", "speed"),
            ("Hit Die", "hit_die"),
            ("Primary Ability", "primary_ability"),
            ("Saving Throws", "saving_throws"),
        ):
            if item.get(key):
                card["facts"].append({"label": label, "value": str(item[key])})
        if item.get("traits"):
            card["sections"].append({"title": "Traits", "body": item["traits"]})
        if item.get("description"):
            card["sections"].append({"title": "", "body": item["description"]})

    return {**item, "card": card}


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
                return self.send_json({"status": "ok", "service": "hoffle-dnd-bot", "version": "1.2", "editions": ["2014", "2024"]})
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
                    return self.send_json(build_card(kind, item))

            # 2. Prefix / partial match
            for item in items:
                if query_raw in item["name"].lower():
                    return self.send_json(build_card(kind, item))

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
