import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

function modules(dir: string, prefix = ""): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return modules(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    const match = entry.name.match(/^(.*)\.(ts|tsx)$/);
    return match && !match[1].endsWith(".test") ? [`${prefix}${match[1]}`] : [];
  });
}

describe("module names", () => {
  // The Docker image builds the project at /app. There, "@/lib/x" becomes
  // /app/lib/x, which Vite first tries as a root-relative path, i.e.
  // app/lib/x: a module in app/lib with the same name as one in lib shadows
  // it, and only the Docker build breaks (it did for profile-style).
  it("never repeats a lib/ module's name in app/lib/", () => {
    const root = new Set(modules("lib"));
    expect(modules("app/lib").filter((name) => root.has(name))).toEqual([]);
  });
});
