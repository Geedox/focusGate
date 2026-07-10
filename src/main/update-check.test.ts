import { describe, it, expect, vi } from 'vitest'

// isNewerVersion is pure; stub the electron import the module pulls in.
vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0' },
  net: {}
}))
vi.mock('./store', () => ({ store: { get: () => null } }))

const { isNewerVersion } = await import('./update-check')

describe('isNewerVersion (update banner condition)', () => {
  it('detects strictly newer versions', () => {
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(true)
    expect(isNewerVersion('0.1.9', '0.2.0')).toBe(true)
    expect(isNewerVersion('1.9.9', '2.0.0')).toBe(true)
    expect(isNewerVersion('0.1.0', 'v0.1.1')).toBe(true) // tag prefix
  })

  it('never nags on same or older versions', () => {
    expect(isNewerVersion('0.1.1', '0.1.1')).toBe(false)
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(false)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(false)
  })

  it('numeric compare, not string compare (0.1.10 > 0.1.9)', () => {
    expect(isNewerVersion('0.1.9', '0.1.10')).toBe(true)
    expect(isNewerVersion('0.1.10', '0.1.9')).toBe(false)
  })

  it('never nags on malformed tags', () => {
    expect(isNewerVersion('0.1.0', 'latest')).toBe(false)
    expect(isNewerVersion('0.1.0', '')).toBe(false)
    expect(isNewerVersion('garbage', '9.9.9')).toBe(false)
  })
})
