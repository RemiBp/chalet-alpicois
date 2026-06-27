/** Valeur pour <input type="date"> (YYYY-MM-DD). */

export function toDateInputValue(value: unknown): string {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const fr = s.match(/^(\d{1,2})[/. -]+(\d{1,2})[/. -]+(\d{4})$/);
  if (fr) {
    const [, d, m, y] = fr;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return '';
}

export function isDateFieldKey(key: string): boolean {
  return [
    'contractDate', 'issueDate', 'checkIn', 'checkOut',
    'depositDueDate', 'balanceDueDate',
  ].includes(key);
}
