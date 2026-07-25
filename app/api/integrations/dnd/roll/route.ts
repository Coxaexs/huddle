export const dynamic = "force-dynamic";

/** Rejection sampling so every face of the die stays equally likely. */
function randomDie(sides: number): number {
  const limit = Math.floor(4294967296 / sides) * sides;
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return (values[0] % sides) + 1;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { command?: string };
  const input = (body.command || "").replace(/^\/roll\s*/i, "").trim();
  if (!input) {
    return Response.json(
      { error: "Use `/roll 2d20`, `/roll 4d6+2`, or `/roll d20 advantage`." },
      { status: 400 },
    );
  }

  const advantage = /\b(adv|advantage)\b/i.test(input);
  const disadvantage = /\b(dis|disadvantage)\b/i.test(input);
  const expression = input
    .replace(/\b(adv|advantage|dis|disadvantage)\b/gi, "")
    .replace(/\s+/g, "");

  const tokens = expression.match(/[+-]?[^+-]+/g) || [];
  if (!tokens.length || tokens.length > 20) {
    return Response.json(
      { error: "That dice expression is too complex." },
      { status: 400 },
    );
  }

  let total = 0;
  const details: string[] = [];

  for (const token of tokens) {
    const sign = token.startsWith("-") ? -1 : 1;
    const term = token.replace(/^[+-]/, "");
    const dice = term.match(/^(\d*)d(\d+)$/i);

    if (dice) {
      let count = Number(dice[1] || 1);
      const sides = Number(dice[2]);
      if (
        !Number.isInteger(count) ||
        !Number.isInteger(sides) ||
        count < 1 ||
        count > 100 ||
        sides < 2 ||
        sides > 1000
      ) {
        return Response.json(
          { error: "Use 1–100 dice with 2–1000 sides each." },
          { status: 400 },
        );
      }
      if ((advantage || disadvantage) && count === 1 && sides === 20) count = 2;

      const rolls = Array.from({ length: count }, () => randomDie(sides));
      let subtotal = rolls.reduce((sum, roll) => sum + roll, 0);
      let kept: number | undefined;
      if ((advantage || disadvantage) && sides === 20 && count === 2) {
        kept = advantage ? Math.max(...rolls) : Math.min(...rolls);
        subtotal = kept;
      }
      total += sign * subtotal;
      details.push(
        `${sign < 0 ? "−" : ""}${count}d${sides} [${rolls.join(", ")}]${
          kept === undefined ? ` = ${subtotal}` : ` → kept ${kept}`
        }`,
      );
      continue;
    }

    if (!/^\d+$/.test(term)) {
      return Response.json(
        { error: `I couldn't understand \`${term}\`. Try something like \`2d20+5\`.` },
        { status: 400 },
      );
    }
    const modifier = Number(term) * sign;
    total += modifier;
    details.push(`${modifier >= 0 ? "+" : "−"}${Math.abs(modifier)}`);
  }

  const mode = advantage
    ? " with advantage"
    : disadvantage
      ? " with disadvantage"
      : "";
  return Response.json({
    text: `Rolled ${expression}${mode}: ${details.join(" · ")}. Total: ${total}`,
    kind: "dnd",
    payload: {
      type: "roll",
      name: "Dice result",
      expression: `${expression}${mode}`,
      total,
      details,
    },
  });
}
