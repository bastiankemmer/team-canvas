import type { Auth } from '../../ports/auth.js'

/** Always allows access — no login UI, credentials, or SSO. Default off switch. */
export function createDisabledAuthAdapter(): Auth {
  return {
    allow() {
      return true
    },
  }
}
