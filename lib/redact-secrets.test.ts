import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact-secrets";

describe("redactSecrets", () => {
  it("hides an api key in a pasted link and keeps the rest", () => {
    expect(
      redactSecrets("/watch https://media.example/Items/abc/Download?api_key=187c41b933244fca8b8acf2b5609e8ff"),
    ).toBe("/watch https://media.example/Items/abc/Download?api_key=•••");
  });

  it("hides every secret parameter, wherever it sits", () => {
    expect(redactSecrets("/play https://x.example/a?id=7&token=abc.def&t=30&Signature=zz#k"))
      .toBe("/play https://x.example/a?id=7&token=•••&t=30&Signature=•••#k");
  });

  it("hides a password written into the link", () => {
    expect(redactSecrets("/watch https://ana:hunter2@nas.example/film.mkv")).toBe(
      "/watch https://•••@nas.example/film.mkv",
    );
  });

  it("leaves ordinary commands and links alone", () => {
    for (const text of [
      "/play let it happen",
      "/play https://www.youtube.com/watch?v=plndlWYfugQ&t=42",
      "/roll 2d6+3",
      "/remind 10:30 call mum",
    ]) {
      expect(redactSecrets(text)).toBe(text);
    }
  });
});
