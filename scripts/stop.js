/**
 * Stop script for AvgExpert Gateway
 * Terminates every running server.ts instance (all Node/tsx versions, any port).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PID_FILE = path.join(__dirname, '..', 'server.pid');
const ENV_FILE = path.join(__dirname, '..', '.env');
const SERVER_MARKER = 'server.ts';

function getConfiguredPort() {
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
  } catch (_) {
    return fallbackPort;
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function readPidFile() {
  if (!fs.existsSync(PID_FILE)) return null;

  const pid = Number.parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    try { fs.unlinkSync(PID_FILE); } catch (_) {}
    return null;
  }

  return pid;
}

function findPidsListeningOnPort(port) {
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano -p tcp | findstr ":${port}"`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });

      return [...new Set(output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.includes('LISTENING'))
        .map((line) => Number.parseInt(line.split(/\s+/).pop(), 10))
        .filter((portPid) => Number.isInteger(portPid) && portPid > 0))];
    } catch (_) {
      return [];
    }
  }

  try {
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });

    return [...new Set(output
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((portPid) => Number.isInteger(portPid) && portPid > 0))];
  } catch (_) {
    return [];
  }
}

function isServerCommandLine(commandLine) {
  if (!commandLine || typeof commandLine !== 'string') return false;
  if (!commandLine.includes(SERVER_MARKER)) return false;
  if (commandLine.includes('worker.ts')) return false;
  if (commandLine.includes('stop.js')) return false;
  return true;
}

function findPidsByCommandLine() {
  if (process.platform === 'win32') {
    const commands = [
      'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match \'server\\.ts\' -and $_.CommandLine -notmatch \'worker\\.ts\' -and $_.CommandLine -notmatch \'stop\\.js\' } | Select-Object -ExpandProperty ProcessId',
      'wmic process where "CommandLine like \'%server.ts%\' and not CommandLine like \'%worker.ts%\' and not CommandLine like \'%stop.js%\'" get ProcessId /format:csv'
    ];

    for (const command of commands) {
      try {
        const output = execSync(`powershell -NoProfile -Command "${command}"`, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        });

        const pids = output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            if (line.includes(',')) {
              const value = line.split(',').pop();
              return Number.parseInt(value, 10);
            }
            return Number.parseInt(line, 10);
          })
          .filter((pid) => Number.isInteger(pid) && pid > 0);

        if (pids.length > 0) return pids;
      } catch (_) {}
    }

    return [];
  }

  try {
    const output = execSync('pgrep -f "[t]sx.*server\\.ts|[n]ode.*server\\.ts"', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });

    return output
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch (_) {
    return [];
  }
}

function collectAllServerPids() {
  const pids = new Set();

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

function killProcessTree(pid) {
  if (!isRunning(pid)) return true;

  console.log(`Stopping server (PID ${pid})...`);

  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' });
      return true;
    } catch (_) {
      return !isRunning(pid);
    }
  }

  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch (e) {
    if (e.code === 'ESRCH') return true;

    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch (e2) {
      if (e2.code === 'ESRCH') return true;
      console.error(`Failed to kill process ${pid}: ${e2.message}`);
      return false;
    }
  }
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function waitForAllStopped(pids, timeoutMs = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const stillRunning = pids.filter((pid) => isRunning(pid));
    if (stillRunning.length === 0) return true;

    for (const pid of stillRunning) {
      try { process.kill(pid, 'SIGKILL'); } catch (_) {}
      if (process.platform === 'win32') {
        try { execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' }); } catch (_) {}
      }
    }

    sleep(100);
  }

  return pids.every((pid) => !isRunning(pid));
}

function cleanupPidFile() {
  try { fs.unlinkSync(PID_FILE); } catch (_) {}
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
