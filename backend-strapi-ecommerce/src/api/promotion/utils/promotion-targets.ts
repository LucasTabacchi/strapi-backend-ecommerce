export function normStr(value: any) {
  return String(value ?? "").trim();
}

export function lower(value: any) {
  return normStr(value).toLowerCase();
}

export function readStringList(input: any): string[] {
  if (Array.isArray(input)) {
    return input.map(normStr).filter(Boolean);
  }

  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(normStr).filter(Boolean);
      }
    } catch {
      return raw
        .split(/[;,|]/g)
        .map(normStr)
        .filter(Boolean);
    }

    return [];
  }

  return [];
}

export function uniqNums(input: any[]) {
  const out = new Set<number>();

  for (const raw of input) {
    const numericValue = Number(raw);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      out.add(Math.trunc(numericValue));
    }
  }

  return Array.from(out);
}

export function readProductTargets(
  input: any
): { ids: number[]; documentIds: string[] } {
  const ids = new Set<number>();
  const documentIds = new Set<string>();

  for (const raw of Array.isArray(input) ? input : []) {
    if (raw == null) continue;

    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      ids.add(Math.trunc(raw));
      continue;
    }

    const normalized = normStr(raw);
    if (!normalized) continue;

    if (/^\d+$/.test(normalized)) {
      const numericValue = Number(normalized);
      if (Number.isFinite(numericValue) && numericValue > 0) {
        ids.add(Math.trunc(numericValue));
        continue;
      }
    }

    documentIds.add(lower(normalized));
  }

  return { ids: Array.from(ids), documentIds: Array.from(documentIds) };
}

export function normalizeProductTargetInput(input: any) {
  const targets = readProductTargets(
    Array.isArray(input) ? input : readStringList(input)
  );

  return [...targets.ids, ...targets.documentIds];
}
