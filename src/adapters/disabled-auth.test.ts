import { describe, expect, it } from 'vitest'
import { createAuthAdapter } from './create-auth.js'
import { createDisabledAuthAdapter } from './disabled-auth.js'

describe('Auth login protocol', () => {
  it('@task-5: DisabledAuthAdapter always allows', async () => {
    const disabled = createDisabledAuthAdapter()
    expect(await disabled.allow({})).toBe(true)
    expect(await disabled.allow({ headers: {} })).toBe(true)

    const byDefault = createAuthAdapter()
    expect(await byDefault.allow({})).toBe(true)

    const byName = createAuthAdapter('disabled')
    expect(await byName.allow({ headers: { authorization: 'ignored' } })).toBe(
      true,
    )
  })
})
