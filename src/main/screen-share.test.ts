import { describe, it, expect } from 'vitest'
import { detectSharing } from './screen-share'

describe('detectSharing', () => {
  it('is false with ordinary processes and windows', () => {
    expect(
      detectSharing(
        ['finder', 'google chrome', 'zoom.us', 'code', 'ms-teams'],
        ['Inbox - Gmail', 'Zoom Meeting', 'Microsoft Teams', 'Settings']
      )
    ).toBe(false)
  })

  it('recognises Zoom by its capture helper process', () => {
    expect(detectSharing(['zoom.us', 'cpthost'], [])).toBe(true)
  })

  it('recognises an Apple Screen Sharing session', () => {
    expect(detectSharing(['screensharingd'], [])).toBe(true)
  })

  it('recognises browser "sharing your screen" bars', () => {
    expect(detectSharing([], ['meet.google.com is sharing your screen.'])).toBe(true)
    expect(detectSharing([], ['Chrome is sharing a window'])).toBe(true)
    expect(detectSharing([], ['app.slack.com is sharing your entire screen'])).toBe(true)
  })

  it('recognises Zoom and Teams toolbar windows', () => {
    expect(detectSharing([], ['zoom share toolbar window'])).toBe(true)
    expect(detectSharing([], ['zoom share statusbar window'])).toBe(true)
    expect(detectSharing([], ['Sharing controls'])).toBe(true)
    expect(detectSharing([], ['Microsoft Teams Screen Sharing'])).toBe(true)
  })

  it('does not trip on the macOS Screen Recording settings pane', () => {
    expect(detectSharing([], ['Screen & System Audio Recording'])).toBe(false)
  })
})
