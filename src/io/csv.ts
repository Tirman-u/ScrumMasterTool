export interface CsvRow {
  [header: string]: string;
}

export interface CsvParseResult {
  headers: string[];
  rows: CsvRow[];
}

export function parseCsv(text: string): CsvParseResult {
  const rows = parseCsvRows(stripBom(text));
  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map((header) => header.trim());
  const body = rows.slice(1).filter((row) => row.some((cell) => cell.trim().length > 0));

  const mappedRows = body.map((row) => {
    const record: CsvRow = {};
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      const value = (row[i] ?? "").trim();
      mergeColumnValue(record, header, value);
    }
    return record;
  });

  return {
    headers,
    rows: mappedRows,
  };
}

function mergeColumnValue(record: CsvRow, header: string, value: string): void {
  const existing = record[header];
  if (existing === undefined || existing.length === 0) {
    record[header] = value;
    return;
  }

  if (value.length === 0 || existing === value) {
    return;
  }

  record[header] = `${existing},${value}`;
}

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (char === '\r') {
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  const hasData = currentRow.some((cell) => cell.length > 0) || rows.length > 0;
  if (hasData) {
    rows.push(currentRow);
  }

  return rows;
}

export function parseNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s/g, "").replace(',', '.');
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const dotDate = parseDotSeparatedDate(trimmed);
  if (dotDate) {
    return dotDate;
  }

  const slashDate = parseSlashSeparatedDate(trimmed);
  if (slashDate) {
    return slashDate;
  }

  const native = new Date(trimmed);
  if (!Number.isNaN(native.getTime())) {
    return native;
  }

  return null;
}

function parseDotSeparatedDate(value: string): Date | null {
  const match = value.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4] ?? "0", 10);
  const minute = Number.parseInt(match[5] ?? "0", 10);
  const second = Number.parseInt(match[6] ?? "0", 10);

  return buildDate(year, month, day, hour, minute, second);
}

function parseSlashSeparatedDate(value: string): Date | null {
  const match = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (!match) {
    return null;
  }

  const a = Number.parseInt(match[1], 10);
  const b = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4] ?? "0", 10);
  const minute = Number.parseInt(match[5] ?? "0", 10);
  const second = Number.parseInt(match[6] ?? "0", 10);

  let month = a;
  let day = b;

  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  }

  if (a <= 12 && b <= 12) {
    day = a;
    month = b;
  }

  return buildDate(year, month, day, hour, minute, second);
}

function buildDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date | null {
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }

  return date;
}
