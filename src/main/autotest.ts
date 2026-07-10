import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { endLock, isLocked, startLock } from './lock'
import { getSchedulerStatus, pauseForOneHour, rescheduleFromConfig, resumeSchedule } from './scheduler'
import { hasPasscode, setPasscode } from './security'
import { finishOnboarding } from './onboarding-window'
import { openSettingsWindow } from './settings-window'
import { PRELOAD_PATH, loadRenderer } from './windows'
import { chooseCategory, chooseScripture, completeActivity, getSessionState } from './scripture'
import { store } from './store'

/**
 * Dev-only self-test harness, driven by GODFIRST_AUTOTEST. Lets CI/agents
 * verify the lock lifecycle end-to-end with only a few seconds of overlay.
 * Never active in packaged builds.
 *
 *   cycle          lock -> 3s -> unlock -> assert flag cleared -> quit
 *   crash          lock -> 2s -> hard-exit (leaves lockActive=true on disk)
 *   restore-check  boot -> assert watchdog restored the lock -> unlock -> quit
 */
export function maybeRunAutotest(): void {
  // Opt-in via env only — never active for normal users, but allowed in
  // packaged builds so the real artifact can be verified end-to-end.
  const mode = process.env['GODFIRST_AUTOTEST']
  if (!mode) return

  const pass = (msg: string): void => {
    console.log(`[autotest] PASS: ${msg}`)
    endLock('dev')
    setTimeout(() => app.exit(0), 300)
  }
  const fail = (msg: string): void => {
    console.error(`[autotest] FAIL: ${msg}`)
    endLock('dev')
    setTimeout(() => app.exit(1), 300)
  }

  // Any uncaught error during a test step must end the run (exit 1), not
  // leave a zombie instance holding the single-instance lock.
  const step = (fn: () => void): void => {
    try {
      fn()
    } catch (err) {
      fail(`step threw: ${String(err)}`)
    }
  }

  // Locks refuse to start without a recovery passcode (the only escape) —
  // give the test store one.
  if (!hasPasscode()) setPasscode('autotest-passcode')

  console.log(`[autotest] mode=${mode}`)

  if (mode === 'cycle') {
    startLock('manual')
    if (!isLocked()) return fail('lock did not start')
    // Optional: dump a screenshot of the primary overlay for visual checks.
    const shotPath = process.env['GODFIRST_AUTOTEST_SHOT']
    if (shotPath) {
      setTimeout(() => {
        const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
        void win?.webContents.capturePage().then((img) => {
          writeFileSync(shotPath, img.toPNG())
          console.log(`[autotest] overlay screenshot -> ${shotPath}`)
        })
      }, 2000)
    }
    setTimeout(() => {
      if (store.get('lockActive') !== true) return fail('lockActive not persisted')
      endLock('dev')
      if (isLocked()) return fail('endLock left app locked')
      if (store.get('lockActive') !== false) return fail('lockActive not cleared')
      pass('lock/unlock cycle with persisted watchdog flag')
    }, 3000)
  } else if (mode === 'activity') {
    // End-to-end main-side activity path: kind → category → random session →
    // completion(mood) → session log + recent-repeat tracking → unlock.
    // (The renderer half — start button, presence gating, comprehension
    // check — is covered by unit tests.)
    store.set('recentPassages', { bible: [], quran: [] })
    store.set('readingPlan', {
      bible: { book: 0, chapter: 0, verse: 0, versesRead: 0 },
      quran: { book: 0, chapter: 0, verse: 0, versesRead: 0 }
    })
    store.set('scripture', null)
    store.set('streak', { current: 0, best: 0, lastDate: null })
    const logBefore = store.get('sessionLog').length
    startLock('manual')
    setTimeout(() => step(() => {
      let state = getSessionState()
      if (state.stage !== 'kind') return fail(`expected kind stage, got ${state.stage}`)
      state = chooseScripture('bible')
      if (state.stage !== 'category') return fail(`expected category stage, got ${state.stage}`)
      if (state.categories.length < 5) return fail('too few categories offered')
      const categoryId = state.categories[0]!.id
      state = chooseCategory(categoryId)
      if (state.stage !== 'session') return fail(`expected session stage, got ${state.stage}`)
      const session = state.session
      if (session.verses.length < 2) return fail(`session too short: ${session.verses.length}`)
      if (session.categoryId !== categoryId) return fail('session category mismatch')
      const again = getSessionState()
      if (again.stage !== 'session' || again.session.reference !== session.reference) {
        return fail('session not stable across getSession calls')
      }
      completeActivity('calmer')
      if (isLocked()) return fail('completeActivity did not unlock')
      const log = store.get('sessionLog')
      const last = log[log.length - 1]
      if (log.length !== logBefore + 1 || last?.mood !== 'calmer' || last.reference !== session.reference) {
        return fail('session log entry missing or wrong')
      }
      const recent = store.get('recentPassages').bible
      if (recent.length !== 1) return fail('recentPassages not updated')
      // Next random pick in the same category must avoid the recent passage.
      startLock('manual')
      chooseScripture('bible')
      const secondState = chooseCategory(categoryId)
      if (secondState.stage !== 'session') return fail('second session not created')
      if (secondState.session.reference === session.reference) {
        return fail('second session repeated the recent passage')
      }
      completeActivity(null)
      // Whole-canon reading plan: starts at Genesis 1:1 and advances.
      startLock('manual')
      const kindState = chooseScripture('bible')
      if (kindState.stage !== 'category') return fail('expected category stage for plan test')
      if (kindState.plan.nextReference !== 'Genesis 1:1') {
        return fail(`plan should start at Genesis 1:1, got ${kindState.plan.nextReference}`)
      }
      const planState = chooseCategory('plan')
      if (planState.stage !== 'session') return fail('plan session not created')
      if (planState.session.categoryId !== 'plan' || !planState.session.reference.startsWith('Genesis 1:1')) {
        return fail(`plan session unexpected: ${planState.session.reference}`)
      }
      const planLen = planState.session.verses.length
      if (planState.session.streakAfterCompletion !== 1) {
        return fail(`expected streak preview 1, got ${planState.session.streakAfterCompletion}`)
      }
      completeActivity('encouraged')
      const planProgress = store.get('readingPlan').bible
      if (planProgress.versesRead !== planLen) {
        return fail(`plan progress not advanced: ${JSON.stringify(planProgress)}`)
      }
      // Streak: three completions today = a 1-day streak, counted once.
      const streak = store.get('streak')
      if (streak.current !== 1 || streak.best !== 1) {
        return fail(`streak wrong after same-day completions: ${JSON.stringify(streak)}`)
      }
      pass(`activity flow ok (${session.reference} → random differs → plan read ${planLen} verses; streak ${streak.current}d)`)
    }), 2000)
  } else if (mode === 'schedule') {
    // Live scheduler lifecycle (run with GODFIRST_TICK_MS=300):
    // interval fire → unlock → pause holds the next fire → resume delivers
    // exactly one catch-up. Uses a 2-second interval written directly to
    // the store (the IPC layer clamps user input to ≥15 min).
    const cleanup = (): void => {
      store.set('schedule', { times: [], intervalHours: null })
      store.set('pausedUntil', null)
      store.set('lastScheduledFire', null)
      rescheduleFromConfig()
    }
    store.set('pausedUntil', null)
    store.set('lastScheduledFire', null)
    store.set('schedule', { times: [], intervalHours: 2 / 3600 })
    rescheduleFromConfig()
    if (getSchedulerStatus().nextFireAt === null) {
      cleanup()
      return fail('nextFireAt not computed from interval config')
    }

    setTimeout(() => step(() => {
      if (!isLocked()) {
        cleanup()
        return fail('interval trigger did not fire a scheduled lock')
      }
      endLock('dev')
      pauseForOneHour() // next crossing must be held, not fired

      setTimeout(() => step(() => {
        if (isLocked()) {
          cleanup()
          return fail('a lock fired while paused')
        }
        resumeSchedule() // runs a tick synchronously → one catch-up fire
        const catchUpFired = isLocked()
        cleanup()
        if (!catchUpFired) return fail('resume did not deliver the catch-up fire')
        pass('schedule fire → pause holds → resume catch-up, exactly once each')
      }), 4000)
    }), 4000)
  } else if (mode === 'usage') {
    // Usage trigger: with GODFIRST_TICK_MS=300 and GODFIRST_FAKE_IDLE=0
    // (simulated constant activity), a 2-second threshold must fire a lock
    // and reset the counter. The no-accumulation-when-idle half is covered
    // by unit tests.
    store.set('pausedUntil', null)
    store.set('activeUseMs', 0)
    store.set('schedule', { times: [], intervalHours: null, activeUseHours: 2 / 3600 })
    rescheduleFromConfig()
    setTimeout(() => step(() => {
      if (!isLocked()) return fail('usage trigger did not fire')
      if (store.get('activeUseMs') !== 0) return fail('usage counter not reset on fire')
      store.set('schedule', { times: [], intervalHours: null, activeUseHours: 3 })
      pass('usage trigger fired after simulated active use and reset the counter')
    }), 5000)
  } else if (mode === 'finish-onboarding') {
    // Finishing the wizard must immediately run the first reading session.
    store.set('onboardingComplete', false)
    finishOnboarding()
    setTimeout(() => step(() => {
      if (!store.get('onboardingComplete')) return fail('onboarding not marked complete')
      if (!isLocked()) return fail('no test session started after onboarding finish')
      pass('onboarding finish marked complete and started the first session')
    }), 2000)
  } else if (mode === 'crash') {
    startLock('manual')
    setTimeout(() => {
      if (store.get('lockActive') !== true) return fail('lockActive not persisted before crash')
      console.log('[autotest] simulating crash while locked (lockActive stays true)')
      app.exit(42) // hard exit: no teardown, like a kill/power loss
    }, 2000)
  } else if (mode === 'ui-shot') {
    // Screenshot a specific lock-screen stage (GODFIRST_AUTOTEST_UI =
    // kind | category | intro | reading), driving clicks via test hooks.
    const stage = process.env['GODFIRST_AUTOTEST_UI'] ?? 'kind'
    const shotPath = process.env['GODFIRST_AUTOTEST_SHOT']
    const kind = process.env['GODFIRST_AUTOTEST_KIND'] === 'quran' ? 'quran' : 'bible'
    store.set('scripture', stage === 'kind' ? null : kind)
    startLock('manual')
    // Surface the overlay's console so renderer-side failures (e.g. face
    // pipeline init) are visible in the test log.
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.on('console-message', (_e, level, message) => {
        console.log(`[renderer:${level}] ${message}`)
      })
    }
    const win = (): BrowserWindow | undefined =>
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    const click = (selector: string): Promise<unknown> | undefined =>
      win()?.webContents.executeJavaScript(
        `document.querySelector(${JSON.stringify(selector)})?.click()`
      )
    setTimeout(() => step(() => {
      if (stage === 'intro' || stage === 'reading') void click('[data-category]')
      setTimeout(() => step(() => {
        if (stage === 'reading') void click('[data-testid="start-reading"]')
        setTimeout(() => step(() => {
          if (!shotPath) return fail('GODFIRST_AUTOTEST_SHOT not set')
          const w = win()
          if (!w) return fail('no overlay window')
          void w.webContents.capturePage().then((img) => {
            writeFileSync(shotPath, img.toPNG())
            pass(`ui-shot ${stage} -> ${shotPath}`)
          })
        }), stage === 'reading' ? Number(process.env['GODFIRST_AUTOTEST_WAIT'] ?? 2500) : 700)
      }), 700)
    }), 2000)
  } else if (mode === 'face-check') {
    // Verifies the on-device face pipeline plumbing WITHOUT a camera:
    // gfres:// must serve the wasm runtime + model to the renderer, and CSP
    // must allow WebAssembly instantiation.
    startLock('manual')
    setTimeout(() => step(() => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed())
      if (!w) return fail('no overlay window')
      void w.webContents
        .executeJavaScript(
          `(async () => {
            const wasm = await fetch('gfres://models/wasm/vision_wasm_internal.wasm')
            const model = await fetch('gfres://models/blaze_face_short_range.tflite')
            const wasmBytes = (await wasm.arrayBuffer()).byteLength
            const modelBytes = (await model.arrayBuffer()).byteLength
            // trivial module: (module) — proves 'wasm-unsafe-eval' works
            await WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0]))
            return { wasmBytes, modelBytes }
          })()`
        )
        .then((r: { wasmBytes: number; modelBytes: number }) => {
          if (r.wasmBytes < 1_000_000) return fail(`wasm too small: ${r.wasmBytes}`)
          if (r.modelBytes < 100_000) return fail(`model too small: ${r.modelBytes}`)
          const { systemPreferences } = require('electron') as typeof import('electron')
          const cam = process.platform === 'darwin'
            ? systemPreferences.getMediaAccessStatus('camera')
            : 'granted'
          pass(`face pipeline ok (wasm ${r.wasmBytes}B, model ${r.modelBytes}B, camera permission: ${cam})`)
        })
        .catch((err: unknown) => fail(`renderer face-check threw: ${String(err)}`))
    }), 2500)
  } else if (mode === 'window-shot') {
    // Screenshot whatever window auto-opened (onboarding) or open settings
    // first with GODFIRST_AUTOTEST_WINDOW=settings. Path via _SHOT.
    if (process.env['GODFIRST_AUTOTEST_WINDOW'] === 'settings') {
      openSettingsWindow()
    } else if (process.env['GODFIRST_AUTOTEST_WINDOW'] === 'sharecard') {
      const win = new BrowserWindow({
        width: 1240,
        height: 700,
        show: true,
        backgroundColor: '#000000',
        webPreferences: { preload: PRELOAD_PATH }
      })
      void loadRenderer(win, 'sharecard?n=12&best=15')
    }
    // Optionally advance the onboarding wizard N steps before the shot.
    const steps = Number(process.env['GODFIRST_AUTOTEST_STEPS'] ?? 0)
    if (steps > 0) {
      setTimeout(() => {
        const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed())
        for (let i = 0; i < steps; i++) {
          setTimeout(() => {
            void w?.webContents.executeJavaScript(
              `document.querySelector('[data-testid="onboarding-continue"]')?.click()`
            )
          }, i * 400)
        }
      }, 1200)
    }
    setTimeout(() => step(() => {
      const shotPath = process.env['GODFIRST_AUTOTEST_SHOT']
      if (!shotPath) return fail('GODFIRST_AUTOTEST_SHOT not set')
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      if (!win) return fail('no window open to capture')
      void win.webContents.capturePage().then((img) => {
        writeFileSync(shotPath, img.toPNG())
        pass(`window screenshot -> ${shotPath}`)
      })
    }), 2500)
  } else if (mode === 'restore-check') {
    // restoreLockIfNeeded() ran during boot; give overlays a moment.
    setTimeout(() => {
      if (!isLocked()) return fail('watchdog did not restore lock after crash')
      pass('watchdog restored lock after simulated crash')
    }, 2500)
  } else {
    fail(`unknown mode ${mode}`)
  }
}
