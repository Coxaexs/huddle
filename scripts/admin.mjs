#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PBKDF2_ITERATIONS = 150_000;

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return toHex(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt.buffer)}$${hash}`;
}

function findDatabasePath() {
  if (process.env.DB_PATH && fs.existsSync(process.env.DB_PATH)) {
    return process.env.DB_PATH;
  }

  const baseDir = process.env.PERSIST_DIR || path.join(process.cwd(), "state");
  const candidates = [
    path.join(baseDir, "v3/d1/site-creator-d1.sqlite"),
  ];

  const miniflareD1Dir = path.join(baseDir, "v3/d1/miniflare-D1DatabaseObject");
  if (fs.existsSync(miniflareD1Dir)) {
    const files = fs.readdirSync(miniflareD1Dir);
    for (const f of files) {
      if (f.endsWith(".sqlite") && f !== "metadata.sqlite") {
        candidates.unshift(path.join(miniflareD1Dir, f));
      }
    }
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const out = execFileSync("sqlite3", [p, "SELECT count(*) FROM users;"], {
          encoding: "utf-8",
        });
        if (out.trim()) return p;
      } catch {
        // Continue searching
      }
    }
  }

  throw new Error(`Could not find Hoffle SQLite database with 'users' table in: ${baseDir}`);
}

function runSql(dbPath, sql, json = false) {
  const args = [dbPath];
  if (json) args.push("-json");
  args.push(sql);
  const out = execFileSync("sqlite3", args, { encoding: "utf-8" });
  if (json) {
    const trimmed = out.trim();
    return trimmed ? JSON.parse(trimmed) : [];
  }
  return out.trim();
}

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    console.log(`
Hoffle Admin & Disaster Recovery CLI

Usage:
  node scripts/admin.mjs <command> [arguments]

Commands:
  list-users                             List all registered users
  reset-password <username> <new_pass>   Reset a user's password securely
  promote <username>                     Grant admin and invite rights
  create-invite [uses] [expiry_hours]    Create a new server invite code
  backup [destination_path]              Safely backup the SQLite database via VACUUM INTO

Environment Variables:
  PERSIST_DIR  Path to state directory (default: ./state)
  DB_PATH      Direct path to SQLite database file
`);
    process.exit(0);
  }

  const dbPath = findDatabasePath();

  switch (command) {
    case "list-users": {
      const users = runSql(
        dbPath,
        "SELECT id, username, display_name, is_admin, can_invite, created_at, last_seen_at FROM users ORDER BY created_at ASC;",
        true,
      );
      console.table(users);
      break;
    }

    case "reset-password": {
      const [username, newPassword] = args;
      if (!username || !newPassword) {
        console.error("Error: Please specify <username> and <new_pass>");
        process.exit(1);
      }
      const existing = runSql(
        dbPath,
        `SELECT id, username FROM users WHERE username_lower = '${username.toLowerCase().replace(/'/g, "''")}';`,
        true,
      );
      if (!existing || existing.length === 0) {
        console.error(`User '${username}' not found.`);
        process.exit(1);
      }
      const userId = existing[0].id;
      const hashed = await hashPassword(newPassword);
      runSql(
        dbPath,
        `UPDATE users SET password_hash = '${hashed}' WHERE id = '${userId}'; DELETE FROM sessions WHERE user_id = '${userId}';`,
      );
      console.log(`✓ Password successfully reset for '${existing[0].username}'. All active sessions invalidated.`);
      break;
    }

    case "promote": {
      const [username] = args;
      if (!username) {
        console.error("Error: Please specify <username>");
        process.exit(1);
      }
      const existing = runSql(
        dbPath,
        `SELECT id, username FROM users WHERE username_lower = '${username.toLowerCase().replace(/'/g, "''")}';`,
        true,
      );
      if (!existing || existing.length === 0) {
        console.error(`User '${username}' not found.`);
        process.exit(1);
      }
      runSql(
        dbPath,
        `UPDATE users SET is_admin = 1, can_invite = 1 WHERE id = '${existing[0].id}';`,
      );
      console.log(`✓ User '${existing[0].username}' has been promoted to administrator.`);
      break;
    }

    case "create-invite": {
      const maxUses = parseInt(args[0], 10) || 1;
      const expiryHours = parseInt(args[1], 10) || 24;
      const code = crypto.randomBytes(6).toString("base64url").toUpperCase().slice(0, 8);
      const now = new Date();
      const expires = new Date(now.getTime() + expiryHours * 3600 * 1000);

      runSql(
        dbPath,
        `INSERT INTO invites (code, server_id, created_by, max_uses, uses, expires_at, created_at)
         VALUES ('${code}', 'hangout', 'system:admin', ${maxUses}, 0, '${expires.toISOString()}', '${now.toISOString()}');`,
      );
      console.log(`✓ Created invite code: ${code} (Max uses: ${maxUses}, Expires: ${expires.toISOString()})`);
      break;
    }

    case "backup": {
      const defaultDest = path.join(
        path.dirname(dbPath),
        `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
      );
      const dest = args[0] || defaultDest;
      const absDest = path.resolve(dest);
      if (fs.existsSync(absDest)) {
        fs.unlinkSync(absDest);
      }
      runSql(dbPath, `VACUUM INTO '${absDest.replace(/'/g, "''")}';`);
      console.log(`✓ Safe database backup created at: ${absDest}`);
      break;
    }

    default:
      console.error(`Unknown command '${command}'. Run with --help for available commands.`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Admin CLI Error:", err.message);
  process.exit(1);
});
