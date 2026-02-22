# opencode-responsive-tables

An [OpenCode](https://opencode.ai) plugin that makes markdown tables readable on any screen. Tables that fit your terminal are left alone — tables that don't are reformatted as stacked cards.

## Before / After

A table too wide for the terminal:

```
| Name  | Age | City     | Country | Email             |
| ----- | --- | -------- | ------- | ----------------- |
| Alice | 30  | New York | USA     | alice@example.com |
| Bob   | 25  | London   | UK      | bob@example.com   |
```

Becomes:

```
**Name**: Alice
**Age**: 30
**City**: New York
**Country**: USA
**Email**: alice@example.com
────────────────────────
**Name**: Bob
**Age**: 25
**City**: London
**Country**: UK
**Email**: bob@example.com
```

Tables that fit are passed through unchanged. Tables inside code fences are never touched.

## Install

```json
{
  "plugin": ["opencode-responsive-tables"]
}
```

## How it works

1. Detects markdown tables in assistant output
2. Measures each table's display width (markdown-aware — bold, links, and code are measured by their rendered width, not their raw syntax)
3. If the table fits the terminal → pass through as-is
4. If the table overflows → reformat as stacked key-value cards with `─` separators
5. No terminal width (e.g. OpenCode web) → all tables pass through


## Pairs well with

Works great alongside [`@franlol/opencode-md-table-formatter`](https://github.com/franlol/opencode-md-table-formatter), which aligns and prettifies tables that fit. This plugin picks up where that one leaves off — reformatting the tables that are still too wide as stacked cards.

## License

[MIT](LICENSE)
