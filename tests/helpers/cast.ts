/** Narrow test-only cast for partial mocks used at runtime. */
export function asMock<T>(value: unknown): T {
  return value as T;
}
