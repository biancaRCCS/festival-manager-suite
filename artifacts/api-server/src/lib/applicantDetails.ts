export type ApplicantDetailChange = {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
};

export function isExactObjectWithKeys(
  value: unknown,
  allowedKeys: readonly string[],
): value is Record<string, unknown> {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).every((key) => allowedKeys.includes(key));
}

export function normalizeRequiredText(value: string): string {
  return value.trim();
}

export function normalizeOptionalText(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function asApplicationData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function applicationText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function addDetailChange(
  changes: ApplicantDetailChange[],
  fieldName: string,
  oldValue: string | null,
  newValue: string | null,
): boolean {
  if (oldValue === newValue) return false;
  changes.push({ fieldName, oldValue, newValue });
  return true;
}