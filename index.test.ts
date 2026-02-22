import { describe, test, expect, afterAll } from "bun:test";
import { formatResponsiveTables } from "./index";

// ── Helpers ────────────────────────────────────────────────────────

const savedColumns = process.stdout.columns;

afterAll(() => {
  Object.defineProperty(process.stdout, "columns", {
    value: savedColumns,
    configurable: true,
  });
});

/** Run the formatter with a controlled terminal width. */
function format(text: string, termCols: number | undefined): string {
  Object.defineProperty(process.stdout, "columns", {
    value: termCols,
    configurable: true,
  });
  return formatResponsiveTables(text);
}

// ── Tests ──────────────────────────────────────────────────────────

describe("passthrough (no tables)", () => {
  test("plain text", () => {
    const input = "Hello world\n\nThis is a paragraph.";
    expect(format(input, 200)).toBe(input);
  });

  test("markdown without tables", () => {
    const input = ["# Heading", "", "Some text.", "", "- item 1", "- item 2"].join("\n");
    expect(format(input, 200)).toBe(input);
  });
});

describe("table fits terminal → passthrough", () => {
  test("small 2-column table", () => {
    const input = ["| Name | Age |", "| --- | --- |", "| Alice | 30 |", "| Bob | 25 |"].join("\n");
    expect(format(input, 200)).toMatchSnapshot();
  });

  test("header-only table (no data rows) always passes through", () => {
    const input = ["| Column A | Column B |", "| --- | --- |"].join("\n");
    expect(format(input, 30)).toMatchSnapshot();
  });
});

describe("table exceeds terminal → stacked cards", () => {
  test("wide table becomes stacked", () => {
    const input = [
      "| Name | Age | City | Country | Email |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | 30 | New York | USA | alice@example.com |",
      "| Bob | 25 | London | UK | bob@example.com |",
    ].join("\n");
    expect(format(input, 40)).toMatchSnapshot();
  });

  test("single data row — no separator between cards", () => {
    const input = [
      "| Name | Age | City | Country | Email |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | 30 | New York | USA | alice@example.com |",
    ].join("\n");
    const result = format(input, 40);
    expect(result).not.toContain("─");
    expect(result).toMatchSnapshot();
  });

  test("three data rows — separators between each card", () => {
    const input = [
      "| Name | Age | City | Country | Email |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | 30 | New York | USA | alice@example.com |",
      "| Bob | 25 | London | UK | bob@example.com |",
      "| Carol | 35 | Paris | France | carol@example.com |",
    ].join("\n");
    const result = format(input, 40);
    // Two separators for three cards
    const separators = result.split("\n").filter((l) => /^─+$/.test(l));
    expect(separators).toHaveLength(2);
    expect(result).toMatchSnapshot();
  });

  test("stacked cards preserve all cell values", () => {
    const input = [
      "| Name | Age | City |",
      "| --- | --- | --- |",
      "| Alice | 30 | New York |",
    ].join("\n");
    const result = format(input, 20);
    expect(result).toContain("**Name**: Alice");
    expect(result).toContain("**Age**: 30");
    expect(result).toContain("**City**: New York");
  });
});

describe("code fence protection", () => {
  test("backtick fences", () => {
    const input = ["```", "| Name | Age |", "| --- | --- |", "| Alice | 30 |", "```"].join("\n");
    expect(format(input, 200)).toBe(input);
  });

  test("tilde fences", () => {
    const input = ["~~~", "| Name | Age |", "| --- | --- |", "| Alice | 30 |", "~~~"].join("\n");
    expect(format(input, 200)).toBe(input);
  });

  test("table before code fence is processed, table inside is not", () => {
    const input = [
      "| Name | Age | City | Country | Email |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | 30 | NYC | USA | a@b.com |",
      "",
      "```",
      "| Name | Age |",
      "| --- | --- |",
      "| Bob | 25 |",
      "```",
    ].join("\n");
    const result = format(input, 40);
    expect(result).toContain("**Name**: Alice");
    expect(result).toContain("| Bob | 25 |");
    expect(result).toMatchSnapshot();
  });
});

describe("invalid tables → passthrough", () => {
  test("no separator row", () => {
    const input = ["| Name | Age |", "| Alice | 30 |"].join("\n");
    expect(format(input, 200)).toBe(input);
  });

  test("mismatched column counts", () => {
    const input = ["| Name | Age |", "| --- | --- |", "| Alice | 30 | extra |"].join("\n");
    expect(format(input, 200)).toBe(input);
  });

  test("single row", () => {
    const input = "| just | one | row |";
    expect(format(input, 200)).toBe(input);
  });
});

describe("mixed content", () => {
  test("text around a stacked table", () => {
    const input = [
      "Here is a table:",
      "",
      "| Name | Age | City | Country | Email |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | 30 | New York | USA | alice@example.com |",
      "",
      "End of document.",
    ].join("\n");
    expect(format(input, 40)).toMatchSnapshot();
  });

  test("multiple tables — one fits, one stacks", () => {
    const input = [
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "Text between tables.",
      "",
      "| Name | Age | City | Country | Email |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | 30 | New York | USA | alice@example.com |",
    ].join("\n");
    const result = format(input, 40);
    expect(result).toContain("| A | B |");
    expect(result).toContain("**Name**: Alice");
    expect(result).toMatchSnapshot();
  });
});

describe("markdown in cells", () => {
  test("bold text", () => {
    const input = [
      "| Feature | Status |",
      "| --- | --- |",
      "| **Auth** | Done |",
      "| **API** | WIP |",
    ].join("\n");
    expect(format(input, 200)).toMatchSnapshot();
  });

  test("inline code", () => {
    const input = [
      "| Command | Description |",
      "| --- | --- |",
      "| `git status` | Show working tree |",
      "| `git diff` | Show changes |",
    ].join("\n");
    expect(format(input, 200)).toMatchSnapshot();
  });

  test("links", () => {
    const input = [
      "| Project | Link |",
      "| --- | --- |",
      "| React | [repo](https://github.com/facebook/react) |",
      "| Vue | [repo](https://github.com/vuejs/vue) |",
    ].join("\n");
    expect(format(input, 200)).toMatchSnapshot();
  });
});

describe("edge cases", () => {
  test("no terminal width (e.g. OpenCode web) → all tables pass through", () => {
    const input = [
      "| A really long header column | Another really long header | And yet another one |",
      "| --- | --- | --- |",
      "| lots of content here | more content over here | even more content |",
    ].join("\n");
    expect(format(input, undefined)).toMatchSnapshot();
  });

  test("empty string", () => {
    expect(format("", 200)).toBe("");
  });

  test("table at very end of text (no trailing newline)", () => {
    const input = [
      "Some intro text.",
      "",
      "| Name | Age | City | Country | Email |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | 30 | NYC | USA | a@b.com |",
    ].join("\n");
    expect(format(input, 40)).toMatchSnapshot();
  });

  test("consecutive tables with no gap", () => {
    const input = [
      "| A | B |",
      "| - | - |",
      "| 1 | 2 |",
      "| X | Y | Z |",
      "| - | - | - |",
      "| 3 | 4 | 5 |",
    ].join("\n");
    expect(format(input, 200)).toMatchSnapshot();
  });
});
