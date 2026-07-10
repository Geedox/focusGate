# src/activities

Activity modules — the tasks a user must complete to unlock the screen.

Phase 4 defines the `ActivityModule` interface here (`{ id, render(), isComplete() }`)
and implements the first activity: scripture reading (WEB Bible / Quran) with a
timed-scroll reader and a fill-in-the-blank comprehension check.

v2 camera-based activities (squats, water drinking via on-device MediaPipe)
plug into the same interface without touching the lock core.
