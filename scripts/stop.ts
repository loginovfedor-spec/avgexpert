/**
 * Stop script for AvgExpert Gateway
 * Terminates every running server.ts instance (all Node/tsx versions, any port).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(__dirname, '..', 'server.pid');
const ENV_FILE = path.join(__dirname, '..', '.env');
function getConfiguredPort(): number {
  const fallbackPort = 8200;

  try {
    const envText = fs.readFileSync(ENV_FILE, 'utf-8');
    const line = envText
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith('AVGEXPERT_PORT='));

    if (!line) return fallbackPort;

    const value = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    const port = Number.parseInt(value, 10);
    return Number.isInteger(port) && port > 0 ? port : fallbackPort;
  } catch {
    return fallbackPort;
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readPidFile(): number | null {
  if (!fs.existsSync(PID_FILE)) return null;

  const pid = Number.parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
    return null;
  }

  return pid;
}

function findPidsListeningOnPort(port: number): number[] {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano -p tcp | findstr ":${port}"`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      return [
        ...new Set(
          output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.includes('LISTENING'))
            .map((line) => Number.parseInt(line.split(/\s+/).pop()!, 10))
            .filter((portPid) => Number.isInteger(portPid) && portPid > 0)
        ),
      ];
    } catch {
      return [];
    }
  }

  try {
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return [
      ...new Set(
        output
          .split(/\r?\n/)
          .map((line) => Number.parseInt(line.trim(), 10))
          .filter((portPid) => Number.isInteger(portPid) && portPid > 0)
      ),
    ];
  } catch {
    return [];
  }
}

function findPidsByCommandLine(): number[] {
  if (process.platform === 'win32') {
    const commands = [
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'server\\.ts' -and $_.CommandLine -notmatch 'worker\\.ts' -and $_.CommandLine -notmatch 'stop\\.(js|ts)' } | Select-Object -ExpandProperty ProcessId",
      "wmic process where \"CommandLine like '%server.ts%' and not CommandLine like '%worker.ts%' and not CommandLine like '%stop.js%' and not CommandLine like '%stop.ts%'\" get ProcessId /format:csv",
    ];

    for (const command of commands) {
      try {
        const output = execSync(`powershell -NoProfile -Command "${command}"`, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });

        const pids = output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            if (line.includes(',')) {
              const value = line.split(',').pop();
              return Number.parseInt(value!, 10);
            }
            return Number.parseInt(line, 10);
          })
          .filter((pid) => Number.isInteger(pid) && pid > 0);

        if (pids.length > 0) return pids;
      } catch {
        /* try next */
      }
    }

    return [];
  }

  try {
    const output = execSync('pgrep -f "[t]sx.*server\\.ts|[n]ode.*server\\.ts"', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return output
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function collectAllServerPids(): number[] {
  const pids = new Set<number>();

  const pidFromFile = readPidFile();
  if (pidFromFile) pids.add(pidFromFile);

  for (const portPid of findPidsListeningOnPort(getConfiguredPort())) {
    pids.add(portPid);
  }

  for (const commandPid of findPidsByCommandLine()) {
    pids.add(commandPid);
  }

  pids.delete(process.pid);
  return [...pids];
}

function killProcessTree(pid: number): boolean {
  if (!isRunning(pid)) return true;

  console.log(`Stopping server (PID ${pid})...`);

  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
      return true;
    } catch {
      return !isRunning(pid);
    }
  }

  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ESRCH') return true;

    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch (e2) {
      const err2 = e2 as NodeJS.ErrnoException;
      if (err2.code === 'ESRCH') return true;
      console.error(`Failed to kill process ${pid}: ${err2.message}`);
      return false;
    }
  }
}

function sleep(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function waitForAllStopped(pids: number[], timeoutMs = 5000): boolean {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const stillRunning = pids.filter((pid) => isRunning(pid));
    if (stillRunning.length === 0) return true;

    for (const pid of stillRunning) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
        } catch {
          /* ignore */
        }
      }
    }

    sleep(100);
  }

  return pids.every((pid) => !isRunning(pid));
}

function cleanupPidFile(): void {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

const pids = collectAllServerPids();

if (pids.length === 0) {
  cleanupPidFile();
  console.log('No AvgExpert server processes found.');
  process.exit(0);
}

let failed = 0;
for (const pid of pids) {
  if (!killProcessTree(pid)) failed += 1;
}

const allStopped = waitForAllStopped(pids);
cleanupPidFile();

if (!allStopped || failed > 0) {
  const remaining = pids.filter((pid) => isRunning(pid));
  if (remaining.length > 0) {
    console.error(`Failed to stop process(es): ${remaining.join(', ')}`);
    process.exit(1);
  }
}

console.log(`Stopped ${pids.length} server process(es).`);
process.exit(0);
