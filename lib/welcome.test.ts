import { describe, expect, it } from "vitest";
import { sanitizeFields, validateAnswers } from "./welcome";

describe("welcome form", () => {
  it("drops empty labels, unknown types and extra fields", () => {
    const fields = sanitizeFields([
      { id: "name", label: " Name ", type: "text", required: true },
      { id: "x", label: "", type: "text" },
      { id: "dob", label: "Birthdate", type: "bogus" },
      ...Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, label: `Q${i}` })),
    ]);
    expect(fields[0]).toEqual({ id: "name", label: "Name", type: "text", required: true });
    expect(fields[1].type).toBe("text");
    expect(fields).toHaveLength(10);
  });

  it("requires required answers and checks dates", () => {
    const fields = sanitizeFields([
      { id: "name", label: "Name", type: "text", required: true },
      { id: "dob", label: "Birthdate", type: "date" },
    ]);
    expect(validateAnswers(fields, {})).toEqual({ error: '"Name" is required.' });
    expect(validateAnswers(fields, { name: "Ay", dob: "nope" })).toEqual({
      error: '"Birthdate" needs a valid date.',
    });
    expect(validateAnswers(fields, { name: "  Ay  ", dob: "2001-05-04", extra: "x" })).toEqual({
      answers: { name: "Ay", dob: "2001-05-04" },
    });
  });
});
