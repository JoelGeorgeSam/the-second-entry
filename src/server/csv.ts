export function isSpreadsheetFormula(value: string) {
  return /^[=+\-@\t]/.test(value);
}

export function parseCsv(source: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') {
      if (field.length) throw new Error("Quote must begin at the start of a CSV field");
      quoted = true;
    } else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n") { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}
