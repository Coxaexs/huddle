/** Server-side dice: crypto randomness, every face equally likely. */

/** Rejection sampling so every face of the die stays equally likely. */
export function randomDie(sides: number): number {
  const limit = Math.floor(4294967296 / sides) * sides;
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return (values[0] % sides) + 1;
}

export function randomSeed(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
