import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import type { PasscodeRecord } from '@shared/ipc'

/**
 * Pure passcode hashing/verification (scrypt + per-passcode salt).
 * Safety-critical: a bug here can trap someone behind the lock, so this
 * module has no Electron dependencies and is unit-tested directly.
 */

export const MIN_PASSCODE_LENGTH = 4
const KEY_LENGTH = 32

export function isValidPasscode(passcode: unknown): passcode is string {
  return typeof passcode === 'string' && passcode.length >= MIN_PASSCODE_LENGTH
}

export function hashPasscode(passcode: string, salt: Buffer = randomBytes(16)): PasscodeRecord {
  if (!isValidPasscode(passcode)) {
    throw new Error(`passcode must be at least ${MIN_PASSCODE_LENGTH} characters`)
  }
  const hash = scryptSync(passcode, salt, KEY_LENGTH)
  return { saltHex: salt.toString('hex'), hashHex: hash.toString('hex') }
}

export function verifyPasscode(passcode: unknown, record: PasscodeRecord | null): boolean {
  if (record === null) return false
  if (typeof passcode !== 'string' || passcode.length === 0) return false
  try {
    const salt = Buffer.from(record.saltHex, 'hex')
    const expected = Buffer.from(record.hashHex, 'hex')
    const actual = scryptSync(passcode, salt, expected.length)
    return expected.length === KEY_LENGTH && timingSafeEqual(actual, expected)
  } catch {
    // Corrupt record must fail closed for verification (wrong passcode),
    // never throw — the caller is the unlock path.
    return false
  }
}
