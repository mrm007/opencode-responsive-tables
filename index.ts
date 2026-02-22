import type { Plugin, Hooks } from "@opencode-ai/plugin";

// ── Plugin Entry ───────────────────────────────────────────────────

export const ResponsiveTables: Plugin = async () => {
  return {
    "experimental.text.complete": async (
      _input: { sessionID: string; messageID: string; partID: string },
      output: { text: string },
    ) => {
      if (typeof output.text !== "string") return;

      try {
        output.text = formatResponsiveTables(output.text);
      } catch {}
    },
  } as Hooks;
};

// ── Width ──────────────────────────────────────────────────────────

function getMaxWidth(): number {
  const termWidth = process.stdout.columns;
  if (!termWidth) return Infinity;
  return termWidth - 10;
}

// ── Table Detection (from @franlol/opencode-md-table-formatter) ───

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.split("|").length > 2;
}

function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false;
  const cells = trimmed.split("|").slice(1, -1);
  return cells.length > 0 && cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell));
}

function isValidTable(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const rows = lines.map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
  if (rows.length === 0 || rows[0].length === 0) return false;
  const colCount = rows[0].length;
  if (!rows.every((row) => row.length === colCount)) return false;
  return lines.some((line) => isSeparatorRow(line));
}

function isCodeFenceLine(line: string): boolean {
  return /^\s*(`{3,}|~{3,})/.test(line);
}

// ── Table Parsing ──────────────────────────────────────────────────

interface ParsedTable {
  headers: string[];
  dataRows: string[][];
}

function parseTable(lines: string[]): ParsedTable {
  const rows = lines.map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );

  let headers: string[] = [];
  const dataRows: string[][] = [];
  let headerFound = false;

  for (let i = 0; i < lines.length; i++) {
    if (isSeparatorRow(lines[i])) continue;
    if (!headerFound) {
      headers = rows[i];
      headerFound = true;
    } else {
      dataRows.push(rows[i]);
    }
  }

  return { headers, dataRows };
}

// ── Width Measurement (from @franlol/opencode-md-table-formatter) ──

const widthCache = new Map<string, number>();
let cacheOps = 0;

function getDisplayWidth(text: string): number {
  const cached = widthCache.get(text);
  if (cached !== undefined) return cached;
  const width = measureStringWidth(text);
  widthCache.set(text, width);
  return width;
}

// Concealment mode: strip markdown syntax that OpenCode hides
// but preserve content inside backticks (rendered as literal text)
function measureStringWidth(text: string): number {
  const codeBlocks: string[] = [];
  let withPlaceholders = text.replace(/`(.+?)`/g, (_match, content) => {
    codeBlocks.push(content);
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });

  let visual = withPlaceholders;
  let prev = "";
  while (visual !== prev) {
    prev = visual;
    visual = visual
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  }

  visual = visual.replace(/\x00CODE(\d+)\x00/g, (_match, index) => {
    return codeBlocks[parseInt(index)];
  });

  return Bun.stringWidth(visual);
}

function getTableDisplayWidth(lines: string[]): number {
  let max = 0;
  for (const line of lines) {
    max = Math.max(max, getDisplayWidth(line));
  }
  return max;
}

// ── Stacked Cards ──────────────────────────────────────────────────

function formatStacked(table: ParsedTable, maxWidth: number): string[] {
  const { headers, dataRows } = table;
  const cards: string[][] = [];
  let maxLineWidth = 0;

  for (const row of dataRows) {
    const card: string[] = [];
    for (let col = 0; col < headers.length; col++) {
      const value = row[col] ?? "";
      card.push(`**${headers[col]}**: ${value}`);
      maxLineWidth = Math.max(
        maxLineWidth,
        getDisplayWidth(headers[col]) + 2 + getDisplayWidth(value),
      );
    }
    cards.push(card);
  }

  const separatorWidth = Math.min(maxLineWidth, maxWidth);
  const separator = "\u2500".repeat(separatorWidth);
  const result: string[] = [];

  for (let i = 0; i < cards.length; i++) {
    result.push(...cards[i]);
    if (i < cards.length - 1) {
      result.push(separator);
    }
  }

  return result;
}

// ── Orchestrator ───────────────────────────────────────────────────

export function formatResponsiveTables(text: string): string {
  const maxWidth = getMaxWidth();
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;
  let insideCodeBlock = false;

  while (i < lines.length) {
    if (isCodeFenceLine(lines[i])) {
      insideCodeBlock = !insideCodeBlock;
      result.push(lines[i]);
      i++;
      continue;
    }

    if (!insideCodeBlock && isTableRow(lines[i])) {
      const tableLines: string[] = [lines[i]];
      i++;
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }

      if (isValidTable(tableLines)) {
        const parsed = parseTable(tableLines);
        const tableWidth = getTableDisplayWidth(tableLines);

        if (parsed.dataRows.length === 0 || tableWidth <= maxWidth) {
          result.push(...tableLines);
        } else {
          result.push(...formatStacked(parsed, maxWidth));
        }
      } else {
        result.push(...tableLines);
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  incrementCacheOps();
  return result.join("\n");
}

// ── Cache ──────────────────────────────────────────────────────────

function incrementCacheOps() {
  cacheOps++;
  if (cacheOps > 100 || widthCache.size > 1000) {
    widthCache.clear();
    cacheOps = 0;
  }
}
