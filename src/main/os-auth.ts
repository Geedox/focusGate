import { spawn } from 'node:child_process'
import { userInfo } from 'node:os'

/**
 * Break-glass unlock by verifying the user's OWN operating-system login
 * password — the same password they already use to sign into the machine.
 *
 * GodFirst deliberately stores NO passcode of its own: there is nothing extra
 * to invent, forget, or get locked out by. (An earlier design forced a custom
 * "recovery passcode" in onboarding; forgetting it trapped users behind the
 * lock. That failure mode is gone.)
 *
 * Safety-critical rules:
 *  - This module NEVER throws. The caller is the unlock path.
 *  - The password is passed to the OS checker over STDIN, never as a process
 *    argument (argv is visible to `ps`).
 *  - We distinguish three outcomes so the lock can fail open rather than trap:
 *      'correct'      the password verified — unlock.
 *      'incorrect'    a definite wrong password — stay locked.
 *      'unavailable'  the OS check couldn't run/decide — the UI then offers a
 *                     guaranteed force-escape so no one is ever stranded.
 */
export type OsAuthResult = 'correct' | 'incorrect' | 'unavailable'

/** The current OS account name, shown on the lock screen so the field is
 *  unambiguous ("Enter the password for <user>"). Best-effort. */
export function osUsername(): string {
  try {
    return userInfo().username
  } catch {
    return ''
  }
}

export async function verifyOsPassword(password: unknown): Promise<OsAuthResult> {
  if (typeof password !== 'string' || password.length === 0) return 'incorrect'
  try {
    if (process.platform === 'darwin') return await verifyMac(password)
    if (process.platform === 'win32') return await verifyWindows(password)
    // Unsupported platform (dev on Linux, etc.): can't verify, don't trap.
    return 'unavailable'
  } catch (err) {
    console.error('[godfirst] OS password check errored — treating as unavailable', err)
    return 'unavailable'
  }
}

/**
 * macOS: `dscl . -authonly <user>` reads the password from stdin and exits 0
 * only when it matches the local account. No admin rights or sudo needed.
 */
function verifyMac(password: string): Promise<OsAuthResult> {
  const user = osUsername()
  if (!user) return Promise.resolve('unavailable')
  return runChecker('/usr/bin/dscl', ['.', '-authonly', user], `${password}\n`, (code) =>
    code === 0 ? 'correct' : 'incorrect'
  )
}

/**
 * Windows: validate against the local SAM via .NET. User name and password are
 * read from stdin (never argv) and the script prints exactly GODFIRST_OK /
 * GODFIRST_NO. NOTE: this checks the account PASSWORD, not a Windows Hello PIN —
 * the lock screen's force-escape covers anyone who only knows their PIN.
 */
function verifyWindows(password: string): Promise<OsAuthResult> {
  const user = osUsername()
  if (!user) return Promise.resolve('unavailable')
  const script = [
    'Add-Type -AssemblyName System.DirectoryServices.AccountManagement;',
    '$u = [Console]::In.ReadLine();',
    '$p = [Console]::In.ReadLine();',
    "$ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext('Machine');",
    'if ($ctx.ValidateCredentials($u, $p)) { Write-Output "GODFIRST_OK" } else { Write-Output "GODFIRST_NO" }'
  ].join(' ')
  // The password may contain newlines only in pathological cases; strip CR/LF
  // so the two ReadLine() calls stay aligned.
  const stdin = `${user}\n${password.replace(/[\r\n]/g, '')}\n`
  return runChecker(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    stdin,
    (code, out) => {
      if (out.includes('GODFIRST_OK')) return 'correct'
      if (out.includes('GODFIRST_NO')) return 'incorrect'
      // No recognizable verdict (execution policy blocked it, etc.).
      return code === 0 ? 'incorrect' : 'unavailable'
    }
  )
}

/** Spawn a checker, feed the secret over stdin, and map its exit to a result.
 *  Any spawn failure or timeout resolves to 'unavailable' — never a throw. */
function runChecker(
  command: string,
  args: string[],
  stdin: string,
  decide: (code: number | null, stdout: string) => OsAuthResult
): Promise<OsAuthResult> {
  return new Promise<OsAuthResult>((resolve) => {
    let settled = false
    const done = (r: OsAuthResult): void => {
      if (settled) return
      settled = true
      resolve(r)
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] })
    } catch {
      return done('unavailable')
    }

    // Hard timeout: a checker that never returns must not hold the user.
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
      done('unavailable')
    }, 10_000)

    let out = ''
    child.stdout?.on('data', (chunk) => {
      out += String(chunk)
    })
    child.on('error', () => {
      clearTimeout(timer)
      done('unavailable')
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      done(decide(code, out))
    })

    try {
      child.stdin?.write(stdin)
      child.stdin?.end()
    } catch {
      clearTimeout(timer)
      done('unavailable')
    }
  })
}
