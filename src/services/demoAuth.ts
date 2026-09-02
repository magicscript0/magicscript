/**
 * DEMO-only access gate. This is NOT authentication.
 *
 * The passcode is environment-configurable on purpose. The original Android
 * app's shared secret is deliberately NOT used and must never be placed here.
 */
const DEFAULT_DEMO_PASSWORD = 'demo-access'

export function getDemoPassword(): string {
  const fromEnv = import.meta.env.VITE_DEMO_PASSWORD
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : DEFAULT_DEMO_PASSWORD
}

/** Demo gate check — trivial comparison by design (see header comment). */
export function checkDemoPassword(input: string): boolean {
  return input === getDemoPassword()
}
