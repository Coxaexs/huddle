#!/usr/bin/env python3
"""
Fetches the CC-BY-4.0 5e SRD 5.1 (2014) and SRD 5.2 (2024) JSON datasets from
5e-bits/5e-database and normalizes them into services/dnd-bot/srd_data.json.
Uses Python 3 standard library only.
"""

import json
import pathlib
import re
import urllib.request

BASE = "https://raw.githubusercontent.com/5e-bits/5e-database/main/src"
OUT_PATH = pathlib.Path(__file__).resolve().parent.parent / "services" / "dnd-bot" / "srd_data.json"


def fetch_json(edition: str, filename: str):
    url = f"{BASE}/{edition}/en/{filename}"
    req = urllib.request.Request(url, headers={"User-Agent": "hoffle-srd-builder/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def join_text(val) -> str:
    if val is None:
        return ""
    if isinstance(val, list):
        return "\n".join(str(x).strip() for x in val if str(x).strip())
    return str(val).strip()


def format_cr(cr) -> str:
    if cr is None:
        return "0"
    if isinstance(cr, float):
        if cr == 0.125:
            return "1/8"
        if cr == 0.25:
            return "1/4"
        if cr == 0.5:
            return "1/2"
        if cr.is_integer():
            return str(int(cr))
    return str(cr)


def format_cost(cost) -> str:
    if not isinstance(cost, dict):
        return ""
    qty = cost.get("quantity")
    unit = cost.get("unit")
    if qty is None or not unit:
        return ""
    return f"{qty} {unit}"


def normalize_spell(raw: dict, edition: str) -> dict:
    source = "SRD 5.1" if edition == "2014" else "SRD 5.2 (2024)"
    school = raw.get("school", {})
    school_name = school.get("name", "") if isinstance(school, dict) else str(school or "")

    comps = raw.get("components") or []
    comp_str = ", ".join(str(c) for c in comps) if isinstance(comps, list) else str(comps)
    if raw.get("material"):
        comp_str = f"{comp_str} ({raw['material']})" if comp_str else f"M ({raw['material']})"

    dc = raw.get("dc") or {}
    save_name = ""
    if isinstance(dc, dict):
        dc_type = dc.get("dc_type") or {}
        if isinstance(dc_type, dict):
            save_name = dc_type.get("name", "")
            save_map = {
                "STR": "Strength",
                "DEX": "Dexterity",
                "CON": "Constitution",
                "INT": "Intelligence",
                "WIS": "Wisdom",
                "CHA": "Charisma",
            }
            save_name = save_map.get(save_name.upper(), save_name)

    damage = raw.get("damage") or {}
    damage_type = ""
    dice = ""
    if isinstance(damage, dict):
        dt = damage.get("damage_type") or {}
        if isinstance(dt, dict):
            damage_type = dt.get("name", "")
        slot_map = damage.get("damage_at_slot_level") or damage.get("damage_at_character_level") or {}
        if isinstance(slot_map, dict) and slot_map:
            first_key = sorted(slot_map.keys(), key=lambda k: int(k) if str(k).isdigit() else 99)[0]
            dice = str(slot_map[first_key])

    heal_map = raw.get("heal_at_slot_level") or {}
    if not dice and isinstance(heal_map, dict) and heal_map:
        first_key = sorted(heal_map.keys(), key=lambda k: int(k) if str(k).isdigit() else 99)[0]
        dice = str(heal_map[first_key])

    desc = join_text(raw.get("description") if "description" in raw else raw.get("desc"))
    higher = join_text(raw.get("higher_level"))

    entry = {
        "name": raw.get("name", "").strip(),
        "level": int(raw.get("level", 0) or 0),
        "school": school_name.lower(),
        "casting_time": str(raw.get("casting_time") or "").strip(),
        "range": str(raw.get("range") or "").strip(),
        "components": comp_str,
        "duration": str(raw.get("duration") or "").strip(),
        "description": desc,
        "source": source,
    }
    if raw.get("concentration"):
        entry["concentration"] = True
    if raw.get("ritual"):
        entry["ritual"] = True
    if save_name:
        entry["save"] = save_name
    if damage_type:
        entry["damage_type"] = damage_type
    if dice:
        entry["dice"] = dice
    if higher:
        entry["higher_levels"] = higher
    if edition == "2024":
        entry["edition"] = "2024"
    return entry


def format_abilities_block(items) -> str:
    if not isinstance(items, list) or not items:
        return ""
    lines = []
    for entry in items:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        desc = join_text(entry.get("desc") if "desc" in entry else entry.get("description"))
        # Normalize "+5 to hit" or "Hit: 7 (1d8 + 3)" cleanly for card roll chips.
        desc = re.sub(r"\s+", " ", desc).strip()
        if name and desc:
            lines.append(f"• **{name}.** {desc}")
        elif name:
            lines.append(f"• **{name}.**")
        elif desc:
            lines.append(f"• {desc}")
    return "\n".join(lines)


def normalize_monster(raw: dict, edition: str) -> dict:
    source = "SRD 5.1" if edition == "2014" else "SRD 5.2 (2024)"
    ac_raw = raw.get("armor_class")
    ac_str = ""
    if isinstance(ac_raw, list) and ac_raw:
        first = ac_raw[0]
        if isinstance(first, dict):
            val = first.get("value", "")
            kind = first.get("type", "")
            armor_names = ", ".join(a.get("name", "") for a in (first.get("armor") or []) if isinstance(a, dict))
            detail = armor_names or (kind if kind and kind != "dex" else "")
            ac_str = f"{val} ({detail})" if detail else str(val)
        else:
            ac_str = str(first)
    elif ac_raw is not None:
        ac_str = str(ac_raw)

    hp = raw.get("hit_points", "")
    hp_roll = raw.get("hit_points_roll") or raw.get("hit_dice") or ""
    hp_str = f"{hp} ({hp_roll})" if hp and hp_roll else str(hp)

    speed_raw = raw.get("speed") or {}
    if isinstance(speed_raw, dict):
        speed_parts = []
        if speed_raw.get("walk"):
            speed_parts.append(str(speed_raw["walk"]))
        for k, v in speed_raw.items():
            if k != "walk" and v:
                speed_parts.append(f"{k} {v}")
        speed_str = ", ".join(speed_parts) or "0 ft."
    else:
        speed_str = str(speed_raw)

    scores = [
        int(raw.get("strength", 10) or 10),
        int(raw.get("dexterity", 10) or 10),
        int(raw.get("constitution", 10) or 10),
        int(raw.get("intelligence", 10) or 10),
        int(raw.get("wisdom", 10) or 10),
        int(raw.get("charisma", 10) or 10),
    ]

    trait_lines = []
    if raw.get("proficiencies"):
        saves = []
        skills = []
        for p in raw["proficiencies"]:
            if not isinstance(p, dict):
                continue
            pname = str((p.get("proficiency") or {}).get("name") or "")
            pval = p.get("value", 0)
            if pname.startswith("Saving Throw: "):
                saves.append(f"{pname.replace('Saving Throw: ', '')} +{pval}")
            elif pname.startswith("Skill: "):
                skills.append(f"{pname.replace('Skill: ', '')} +{pval}")
        if saves:
            trait_lines.append(f"• **Saving Throws.** {', '.join(saves)}")
        if skills:
            trait_lines.append(f"• **Skills.** {', '.join(skills)}")
    for label, key in (
        ("Damage Vulnerabilities", "damage_vulnerabilities"),
        ("Damage Resistances", "damage_resistances"),
        ("Damage Immunities", "damage_immunities"),
    ):
        vals = raw.get(key) or []
        if vals:
            trait_lines.append(f"• **{label}.** {', '.join(str(v) for v in vals)}")
    cond_imm = raw.get("condition_immunities") or []
    if cond_imm:
        cnames = [c.get("name", str(c)) if isinstance(c, dict) else str(c) for c in cond_imm]
        trait_lines.append(f"• **Condition Immunities.** {', '.join(cnames)}")
    senses = raw.get("senses") or {}
    if isinstance(senses, dict) and senses:
        s_parts = [f"{k.replace('_', ' ')} {v}" for k, v in senses.items() if v is not None]
        if s_parts:
            trait_lines.append(f"• **Senses.** {', '.join(s_parts)}")
    if raw.get("languages"):
        trait_lines.append(f"• **Languages.** {raw['languages']}")

    specials = format_abilities_block(raw.get("special_abilities"))
    if specials:
        trait_lines.append(specials)

    entry = {
        "name": str(raw.get("name") or "").strip(),
        "size": str(raw.get("size") or "").strip(),
        "type": str(raw.get("type") or "").strip(),
        "alignment": str(raw.get("alignment") or "").strip(),
        "armor_class": ac_str,
        "hit_points": hp_str,
        "speed": speed_str,
        "challenge_rating": format_cr(raw.get("challenge_rating")),
        "scores": scores,
        "source": source,
    }
    if trait_lines:
        entry["traits"] = "\n".join(trait_lines)
    actions = format_abilities_block(raw.get("actions"))
    if actions:
        entry["actions"] = actions
    reactions = format_abilities_block(raw.get("reactions"))
    if reactions:
        entry["reactions"] = reactions
    legendary = format_abilities_block(raw.get("legendary_actions"))
    if legendary:
        entry["legendary_actions"] = legendary
    if edition == "2024":
        entry["edition"] = "2024"
    return entry


def normalize_condition(raw: dict, edition: str) -> dict:
    source = "2014 SRD 5.1" if edition == "2014" else "2024 SRD 5.2"
    desc = join_text(raw.get("description") if "description" in raw else raw.get("desc"))
    desc = re.sub(r"(?m)^-\s+", "• ", desc)
    entry = {
        "name": str(raw.get("name") or "").strip(),
        "type": "Condition",
        "description": desc,
        "source": source,
        "edition": edition,
    }
    return entry


def normalize_equipment(raw: dict, edition: str) -> dict:
    source = "SRD 5.1" if edition == "2014" else "SRD 5.2 (2024)"
    cat = raw.get("equipment_category") or {}
    if not cat and isinstance(raw.get("equipment_categories"), list) and raw["equipment_categories"]:
        cat = raw["equipment_categories"][0]
    cat_name = cat.get("name", "Equipment") if isinstance(cat, dict) else "Equipment"
    subtype = raw.get("category_range") or raw.get("armor_category") or raw.get("gear_category", {}).get("name", "") if isinstance(raw.get("gear_category"), dict) else (raw.get("category_range") or raw.get("armor_category") or "")
    item_type = f"{cat_name} ({subtype})" if subtype and subtype.lower() != cat_name.lower() else cat_name

    parts = []
    cost_str = format_cost(raw.get("cost"))
    if cost_str:
        parts.append(f"Cost: {cost_str}.")
    dmg = raw.get("damage") or {}
    if isinstance(dmg, dict) and dmg.get("damage_dice"):
        dt = (dmg.get("damage_type") or {}).get("name", "")
        parts.append(f"Damage: {dmg['damage_dice']} {dt.lower()}.".strip())
    two_h = raw.get("two_handed_damage") or {}
    if isinstance(two_h, dict) and two_h.get("damage_dice"):
        parts.append(f"Versatile: {two_h['damage_dice']}.")
    ac = raw.get("armor_class") or {}
    if isinstance(ac, dict) and ac.get("base"):
        dex_note = " + DEX" if ac.get("dex_bonus") else ""
        max_note = f" (max {ac['max_bonus']})" if ac.get("max_bonus") else ""
        parts.append(f"Armor Class: {ac['base']}{dex_note}{max_note}.")
    props = raw.get("properties") or []
    if isinstance(props, list) and props:
        pnames = [p.get("name", str(p)) if isinstance(p, dict) else str(p) for p in props]
        parts.append(f"Properties: {', '.join(pnames)}.")
    desc = join_text(raw.get("description") if "description" in raw else raw.get("desc"))
    if desc:
        parts.append(desc)

    weight = raw.get("weight")
    entry = {
        "name": str(raw.get("name") or "").strip(),
        "type": item_type,
        "rarity": "Common",
        "description": "\n".join(parts) if parts else item_type,
        "source": source,
    }
    if weight is not None:
        entry["weight"] = f"{weight} lbs."
    if edition == "2024":
        entry["edition"] = "2024"
    return entry


def normalize_magic_item(raw: dict, edition: str) -> dict:
    source = "SRD 5.1" if edition == "2014" else "SRD 5.2 (2024)"
    cat = raw.get("equipment_category") or {}
    cat_name = cat.get("name", "Magic item") if isinstance(cat, dict) else "Magic item"
    rarity_raw = raw.get("rarity")
    rarity = rarity_raw.get("name", "Common") if isinstance(rarity_raw, dict) else str(rarity_raw or "Common")
    if raw.get("attunement"):
        rarity = f"{rarity} (requires attunement)"
    desc = join_text(raw.get("description") if "description" in raw else raw.get("desc"))
    entry = {
        "name": str(raw.get("name") or "").strip(),
        "type": cat_name,
        "rarity": rarity,
        "description": desc,
        "source": source,
    }
    if edition == "2024":
        entry["edition"] = "2024"
    return entry


def normalize_feat(raw: dict, edition: str) -> dict:
    source = "SRD 5.1" if edition == "2014" else "SRD 5.2 (2024)"
    desc = join_text(raw.get("description") if "description" in raw else raw.get("desc"))
    ftype = raw.get("type")
    entry = {
        "name": str(raw.get("name") or "").strip(),
        "type": f"{ftype} Feat" if ftype else "Feat",
        "description": desc,
        "source": source,
    }
    if edition == "2024":
        entry["edition"] = "2024"
    return entry


def normalize_race(raw: dict, edition: str) -> dict:
    source = "SRD 5.1" if edition == "2014" else "SRD 5.2 (2024)"
    speed = raw.get("speed")
    speed_str = f"{speed} ft." if isinstance(speed, (int, float)) else str(speed or "30 ft.")
    traits_parts = []
    if raw.get("ability_bonuses"):
        ab = ", ".join(
            f"{(b.get('ability_score') or {}).get('name', '')} +{b.get('bonus', 0)}"
            for b in raw["ability_bonuses"]
            if isinstance(b, dict)
        )
        if ab:
            traits_parts.append(f"Ability Score Increase: {ab}.")
    if raw.get("traits") and isinstance(raw["traits"], list):
        tnames = [t.get("name", str(t)) if isinstance(t, dict) else str(t) for t in raw["traits"]]
        if tnames:
            traits_parts.append(f"Traits: {', '.join(tnames)}.")
    if raw.get("subraces") and isinstance(raw["subraces"], list):
        snames = [s.get("name", str(s)) if isinstance(s, dict) else str(s) for s in raw["subraces"]]
        if snames:
            traits_parts.append(f"Subraces: {', '.join(snames)}.")
    if raw.get("subspecies") and isinstance(raw["subspecies"], list):
        snames = [s.get("name", str(s)) if isinstance(s, dict) else str(s) for s in raw["subspecies"]]
        if snames:
            traits_parts.append(f"Lineages: {', '.join(snames)}.")
    desc_parts = [
        str(raw.get("size_description") or "").strip(),
        str(raw.get("alignment") or "").strip(),
        str(raw.get("age") or "").strip(),
        str(raw.get("language_desc") or "").strip(),
    ]
    desc = "\n".join(p for p in desc_parts if p)
    if not desc and raw.get("type"):
        desc = f"{raw.get('size', 'Medium')} {raw['type']}."
    entry = {
        "name": str(raw.get("name") or "").strip(),
        "type": "Race" if edition == "2014" else "Species",
        "speed": speed_str,
        "description": desc,
        "source": source,
    }
    if traits_parts:
        entry["traits"] = "\n".join(traits_parts)
    if edition == "2024":
        entry["edition"] = "2024"
    return entry


def normalize_class(raw: dict, edition: str) -> dict:
    source = "SRD 5.1" if edition == "2014" else "SRD 5.2 (2024)"
    hit_die = raw.get("hit_die")
    hd_str = f"d{hit_die}" if hit_die else ""
    saves = [s.get("name", str(s)) if isinstance(s, dict) else str(s) for s in (raw.get("saving_throws") or [])]
    save_map = {"STR": "Strength", "DEX": "Dexterity", "CON": "Constitution", "INT": "Intelligence", "WIS": "Wisdom", "CHA": "Charisma"}
    saves_str = ", ".join(save_map.get(s.upper(), s) for s in saves)

    pa = raw.get("primary_ability")
    pa_str = ""
    if isinstance(pa, dict):
        pa_str = str(pa.get("desc") or "")
    elif pa:
        pa_str = str(pa)
    if not pa_str and saves:
        pa_str = save_map.get(saves[0].upper(), saves[0])

    parts = []
    profs = [p.get("name", str(p)) if isinstance(p, dict) else str(p) for p in (raw.get("proficiencies") or [])]
    profs = [p for p in profs if not p.startswith("Saving Throw:")]
    if profs:
        parts.append(f"• **Proficiencies.** {', '.join(profs)}")
    choices = raw.get("proficiency_choices") or []
    for c in choices[:2]:
        if isinstance(c, dict) and c.get("desc"):
            parts.append(f"• **Choices.** {c['desc']}")
    subs = [s.get("name", str(s)) if isinstance(s, dict) else str(s) for s in (raw.get("subclasses") or [])]
    if subs:
        parts.append(f"• **Subclasses.** {', '.join(subs)}")

    entry = {
        "name": str(raw.get("name") or "").strip(),
        "type": "Class",
        "hit_die": hd_str,
        "primary_ability": pa_str,
        "saving_throws": saves_str,
        "description": "\n".join(parts) or f"{raw.get('name', 'Class')} core class.",
        "source": source,
    }
    if edition == "2024":
        entry["edition"] = "2024"
    return entry


def normalize_subclass(raw: dict, edition: str) -> dict:
    source = "SRD 5.1" if edition == "2014" else "SRD 5.2 (2024)"
    cls = (raw.get("class") or {}).get("name", "") if isinstance(raw.get("class"), dict) else ""
    flavor = raw.get("subclass_flavor") or raw.get("summary") or "Subclass"
    desc = join_text(raw.get("description") if "description" in raw else raw.get("desc"))
    entry = {
        "name": str(raw.get("name") or "").strip(),
        "type": f"{cls} {flavor}".strip(),
        "description": desc,
        "source": source,
    }
    if edition == "2024":
        entry["edition"] = "2024"
    return entry


def build_edition(edition: str) -> dict:
    spells = [normalize_spell(x, edition) for x in fetch_json(edition, "5e-SRD-Spells.json")]
    monsters = [normalize_monster(x, edition) for x in fetch_json(edition, "5e-SRD-Monsters.json")]
    conditions = [normalize_condition(x, edition) for x in fetch_json(edition, "5e-SRD-Conditions.json")]

    equip = [normalize_equipment(x, edition) for x in fetch_json(edition, "5e-SRD-Equipment.json")]
    magic = [normalize_magic_item(x, edition) for x in fetch_json(edition, "5e-SRD-Magic-Items.json")]
    seen_items = set()
    items = []
    for it in equip + magic:
        k = it["name"].lower()
        if k and k not in seen_items:
            seen_items.add(k)
            items.append(it)

    feats = [normalize_feat(x, edition) for x in fetch_json(edition, "5e-SRD-Feats.json")]
    races_file = "5e-SRD-Races.json" if edition == "2014" else "5e-SRD-Species.json"
    races = [normalize_race(x, edition) for x in fetch_json(edition, races_file)]
    classes = [normalize_class(x, edition) for x in fetch_json(edition, "5e-SRD-Classes.json")]
    subclasses = [normalize_subclass(x, edition) for x in fetch_json(edition, "5e-SRD-Subclasses.json")]

    return {
        "spells": spells,
        "monsters": monsters,
        "conditions": conditions,
        "items": items,
        "feats": feats,
        "races": races,
        "classes": classes,
        "subclasses": subclasses,
    }


def main():
    print("Fetching 2014 SRD 5.1 and 2024 SRD 5.2 from 5e-bits/5e-database...")
    payload = {
        "2014": build_edition("2014"),
        "2024": build_edition("2024"),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    for ed in ("2014", "2024"):
        counts = {k: len(v) for k, v in payload[ed].items()}
        print(f"  {ed}: {counts}")
    size_mb = OUT_PATH.stat().st_size / (1024 * 1024)
    print(f"Wrote {OUT_PATH} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
