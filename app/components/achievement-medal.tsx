"use client";

import {
  Anchor, AtSign, Award, BellRing, BookOpen, Bookmark, Brush, Cake, Calendar, CalendarCheck, CalendarDays,
  CalendarHeart, Castle, CheckCircle2, CircleHelp, Clock, Coffee, Compass, Crown, Dices, Drama, Feather,
  Fish, Flame, Footprints, Gamepad2, Gem, HandHeart, Handshake, Headphones, Heart, Image, Landmark,
  Laugh, Link, Lock, Map, Medal, Megaphone, MessageCircle, MessageSquare, MessagesSquare, Mic, Moon,
  Orbit, Palette, PartyPopper, Pencil, Pin, Radio, Reply, Rocket, Scroll, Shell, Shield, Shirt, Skull,
  Smile, Sparkles, Star, Sunrise, Trophy, Type, Users, Vote, Wand2, Waves, Webhook, Zap,
} from "lucide-react";
import type { AchievementDef } from "@/lib/achievement-defs";

const ICONS: Record<string, typeof Award> = {
  Anchor, AtSign, Award, BellRing, BookOpen, Bookmark, Brush, Cake, Calendar, CalendarCheck, CalendarDays,
  CalendarHeart, Castle, CheckCircle2, CircleHelp, Clock, Coffee, Compass, Crown, Dices, Drama, Feather,
  Fish, Flame, Footprints, Gamepad2, Gem, HandHeart, Handshake, Headphones, Heart, Image, Landmark,
  Laugh, Link, Map, Medal, Megaphone, MessageCircle, MessageSquare, MessagesSquare, Mic, Moon,
  Orbit, Palette, PartyPopper, Pencil, Pin, Radio, Reply, Rocket, Scroll, Shell, Shield, Shirt, Skull,
  Smile, Sparkles, Star, Sunrise, Trophy, Type, Users, Vote, Wand2, Waves, Webhook, Zap,
};

export function achievementIcon(name: string): typeof Award {
  return ICONS[name] || Award;
}

/**
 * A round medal in the achievement's tier metal. Locked medals are greyed;
 * locked secrets show only a question mark.
 */
export function AchievementMedal({
  def,
  earned = true,
  size = 44,
  className = "",
}: {
  def: AchievementDef;
  earned?: boolean;
  size?: number;
  className?: string;
}) {
  const hidden = !earned && def.secret;
  const Icon = hidden ? CircleHelp : achievementIcon(def.icon);
  return (
    <span
      className={`ach-medal ach-tier-${def.tier}${earned ? " is-earned" : " is-locked"} ${className}`}
      style={{ "--ach-size": `${size}px` } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="ach-medal-face">
        <Icon size={Math.round(size * 0.46)} strokeWidth={2.2} />
      </span>
      {!earned && !hidden && (
        <span className="ach-medal-lock">
          <Lock size={Math.max(9, Math.round(size * 0.24))} strokeWidth={2.6} />
        </span>
      )}
    </span>
  );
}
