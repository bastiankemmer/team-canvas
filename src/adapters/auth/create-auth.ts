import type { Auth } from '../../ports/auth.js'
import { createDisabledAuthAdapter } from './disabled-auth.js'

/** Named login-protocol adapters; only `disabled` ships in v1. */
export type AuthAdapterKind = 'disabled'

/** Select the Auth adapter by kind. Default is disabled (open access). */
export function createAuthAdapter(kind: AuthAdapterKind = 'disabled'): Auth {
  switch (kind) {
    case 'disabled':
      return createDisabledAuthAdapter()
    default: {
      const _exhaustive: never = kind
      throw new Error(`Unknown auth adapter: ${String(_exhaustive)}`)
    }
  }
}
