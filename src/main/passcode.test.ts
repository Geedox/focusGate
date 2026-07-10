import { describe, it, expect } from 'vitest'
import { hashPasscode, verifyPasscode, isValidPasscode } from './passcode'

describe('passcode hashing (break-glass safety path)', () => {
  it('verifies the correct passcode', () => {
    const record = hashPasscode('open-sesame')
    expect(verifyPasscode('open-sesame', record)).toBe(true)
  })

  it('rejects a wrong passcode', () => {
    const record = hashPasscode('open-sesame')
    expect(verifyPasscode('open-sesam', record)).toBe(false)
    expect(verifyPasscode('OPEN-SESAME', record)).toBe(false)
    expect(verifyPasscode('', record)).toBe(false)
  })

  it('rejects when no passcode is set', () => {
    expect(verifyPasscode('anything', null)).toBe(false)
  })

  it('rejects non-string input without throwing', () => {
    const record = hashPasscode('open-sesame')
    expect(verifyPasscode(1234 as unknown as string, record)).toBe(false)
    expect(verifyPasscode(undefined, record)).toBe(false)
    expect(verifyPasscode(null, record)).toBe(false)
  })

  it('never throws on a corrupt stored record (fail open, not crash)', () => {
    expect(verifyPasscode('x', { saltHex: 'zz-not-hex', hashHex: '!!' })).toBe(false)
    expect(verifyPasscode('x', { saltHex: '', hashHex: '' })).toBe(false)
    // Truncated hash must not verify (timingSafeEqual length guard)
    const record = hashPasscode('open-sesame')
    expect(verifyPasscode('open-sesame', { ...record, hashHex: record.hashHex.slice(0, 8) })).toBe(
      false
    )
  })

  it('salts: same passcode hashes differently per record', () => {
    const a = hashPasscode('open-sesame')
    const b = hashPasscode('open-sesame')
    expect(a.hashHex).not.toBe(b.hashHex)
    expect(a.saltHex).not.toBe(b.saltHex)
    // both still verify
    expect(verifyPasscode('open-sesame', a)).toBe(true)
    expect(verifyPasscode('open-sesame', b)).toBe(true)
  })

  it('enforces minimum length on set', () => {
    expect(isValidPasscode('123')).toBe(false)
    expect(() => hashPasscode('123')).toThrow()
    expect(isValidPasscode('1234')).toBe(true)
  })
})
