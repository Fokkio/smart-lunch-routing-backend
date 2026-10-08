export function badInput(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}
export function validateObject(
  input: unknown,
  message = 'Data must be an object',
): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) badInput(message);
}
export function validateId(id: string, message = 'ID must be a positive integer'): void {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) badInput(message);
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
