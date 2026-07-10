# GodFirst

A fully offline desktop app (macOS + Windows) that runs quietly in the tray
and, on a schedule, locks the screen behind a fullscreen overlay until you
complete a required activity — v1: reading a Bible or Quran passage.

**Privacy:** GodFirst sends nothing about you, ever — no telemetry, no
accounts. All data (settings, reading progress, lock state, the scripture
text itself) lives locally on your machine. Its single optional network
touch is a once-a-day check of the latest release version number (GitHub
Releases), toggleable off in Settings for a fully offline app. Scripture sources
and licenses: [NOTICES.md](NOTICES.md).

## Features (v1 complete)

- **Background tray app** — no window on launch; single instance; quits only
  from the tray. Starts at login (hidden) via `app.setLoginItemSettings`,
  toggleable in Settings/onboarding.
- **Lock overlay** — covers every display at screen-saver z-level (above the
  menu bar, Dock, and fullscreen apps); primary display hosts the activity,
  others show black. Best-effort keyboard swallowing (OS-reserved escapes
  like Ctrl+Alt+Del / power button / Cmd+Ctrl+Q are deliberately untouched;
  Cmd+Tab switching just shows black since the overlay stays on top).
- **The activity** — at each lock you pick a **theme** (encouragement,
  admonishment, salvation, peace, wisdom, gratitude, patience, forgiveness)
  and a passage from that theme is **chosen at random** (recent repeats
  avoided), from the King James Version or the Quran (Tanzil Arabic +
  Pickthall English). Press **Start reading** and verses reveal on a dwell
  timer you can't fast-forward (total session length is set by you — e.g. 10 minutes — and the per-verse pace adapts); a brief reflection on the theme and a fill-in-the-blank comprehension check
  follows, then a quick **"how do you feel?"** mood question (logged
  locally) before the screen unlocks. Activities implement `ActivityModule`
  ([src/activities/types.ts](src/activities/types.ts)).
- **Whole-canon reading plan** — alongside the themes, a "Reading Plan"
  option reads the entire Bible or Quran cover to cover: sequential
  sessions, persistent position, progress bar, and a session length
  auto-paced from your schedule to finish in a target duration (Settings:
  3 months – 3 years). Finishing the canon starts a fresh lap.
- **Per-text ambience** — session screens are themed: deep indigo with a
  faint quatrefoil (window-tracery) lattice for the Bible; deep emerald and
  gold with an eight-point star lattice for the Quran. Generated entirely
  from CSS gradients + inline SVG; no assets fetched.
- **Reading presence (camera)** — during a reading, on-device face detection
  (MediaPipe BlazeFace, bundled — no network) pauses the dwell timer when
  nobody is in front of the screen, so a session can't be waited out from
  another room. Fail-open by design: no camera, denied permission, or any
  detector error simply disables the check; it can never strand a present
  reader. The camera is active only during the reading phase.
- **Scheduling** — two combinable triggers: fixed daily times and **hours of
  active use** (default: 3h — counts real
  keyboard/mouse time via the system idle clock, so idle time, sleep, and
  unused weekend days never fire a lock; the counter resets whenever any
  lock happens). Sleep/wake safe: at most ONE catch-up lock ever fires, no
  matter how long the machine slept. "Pause for 1 hour" in the tray;
  triggers crossed while paused fire once when the pause ends. The tray
  shows both the next clock lock and the remaining active-use time.
- **Safety design** — *fail open, never fail locked*: any error tears the
  overlay down. The **recovery passcode** (salted scrypt hash; mandatory in
  onboarding) is the break-glass escape, always reachable at the bottom of
  the lock screen; its use is logged locally. Because it is the only escape,
  **GodFirst refuses to start a lock while no passcode is set**. A watchdog
  restores the lock if the app is killed mid-lock.
- **First-run onboarding** — the only window that ever auto-opens: privacy
  statement, mandatory passcode setup, camera permission (optional,
  presence check), scripture + schedule config, start-at-login
  confirmation, macOS Accessibility note.

## Development

Requires Node 20+.

```bash
npm install
npm run icons      # generate tray icons into resources/ (once after clone)
node scripts/generate-app-icon.mjs   # generate build/icon.png (once)
node scripts/fetch-scripture.mjs     # download+convert scripture JSON (once; build-time only)
node scripts/fetch-face-model.mjs    # face-detection model + wasm runtime (once; build-time only)
npm run dev        # start Electron in dev mode (tray icon appears; no window)
```

- **macOS:** book-and-star icon in the menu bar. **Windows:** system tray.
- Quit via tray → **Quit GodFirst**. Closing windows never quits.

> Troubleshooting: if Electron crashes on boot with
> `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`,
> your shell has `ELECTRON_RUN_AS_NODE=1` set (some editor-embedded terminals
> do this). Run `unset ELECTRON_RUN_AS_NODE` first.

### Checks

```bash
npm run typecheck  # strict TS across main/preload/renderer
npm test           # unit tests: passcode verify, Esc-hold, comprehension check,
                   # passage progression, scheduler math
npm run build      # production bundles into out/
```

### Live self-tests (dev only — these briefly black out the screen)

```bash
GODFIRST_AUTOTEST=cycle npx electron out/main/index.js          # lock → unlock → flag cleared
GODFIRST_AUTOTEST=crash npx electron out/main/index.js          # hard-kill mid-lock
GODFIRST_AUTOTEST=restore-check npx electron out/main/index.js  # watchdog restores, then unlocks
GODFIRST_AUTOTEST=activity npx electron out/main/index.js       # category → random session → mood log → unlock
GODFIRST_AUTOTEST=face-check npx electron out/main/index.js     # wasm+model served to renderer, CSP allows wasm
GODFIRST_AUTOTEST=schedule GODFIRST_TICK_MS=300 npx electron out/main/index.js  # fire → pause → resume catch-up
GODFIRST_AUTOTEST=usage GODFIRST_TICK_MS=300 GODFIRST_FAKE_IDLE=0 npx electron out/main/index.js  # active-use trigger
```

Add `GODFIRST_AUTOTEST_SHOT=/path/x.png` to `cycle`/`window-shot`, or use
`ui-shot` with `GODFIRST_AUTOTEST_UI=kind|category|intro|reading`, to save
screenshots.

## Building installers

```bash
npm run build
npx electron-builder --mac   # release/GodFirst-<version>-arm64.dmg
npx electron-builder --win   # release/GodFirst Setup <version>.exe (NSIS, x64)
```

Both build unsigned out of the box (fine for local use; expect Gatekeeper /
SmartScreen warnings). **Before distributing, add your signing identities in
[electron-builder.yml](electron-builder.yml)** — the file has commented
instructions for the Apple Developer ID (+ notarization env vars) and the
Windows code-signing certificate.

### Testing autostart for real

Login items register for packaged builds only (in dev the toggle just stores
the preference). Install from the DMG (or run the packaged `.app` once),
leave "Start GodFirst when I log in" on, reboot, and look for the book-and-star icon
in the menu bar.

## Project layout

```text
src/main/        Electron main process: tray, lock/kiosk core, scheduler,
                 scripture session authority, autostart, IPC (validated)
src/preload/     contextBridge API (typed, whitelisted IPC only)
src/renderer/    React + Tailwind UI: lock screens, settings, onboarding
src/activities/  ActivityModule interface + scripture activity (v2 slots in here)
src/shared/      IPC contract + store schema shared across processes
resources/       Tray icons + bundled scripture JSON (extraResources when packaged)
scripts/         Icon generators + build-time scripture fetcher
build/           App icon (electron-builder buildResources)
```

## v2 notes

Camera-based activities (squat detection, water drinking) are planned to run
fully on-device (MediaPipe), preserving the no-network guarantee, and mount
through the same `ActivityModule` interface — the lock core won't change.
