import { execSync } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

process.env.NODE_ENV = 'test';
if (!process.env.AVGEXPERT_SECRET) {
  process.env.AVGEXPERT_SECRET = 'test_secret_that_is_at_least_32_characters_long';
}

// Загружаем .env для тестов, чтобы можно было подменить хост на Windows
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function isLocalDockerPgRunning(): boolean {
  try {
    const out = execSync(
      'docker ps --filter publish=5432 --filter status=running --format "{{.Names}}"',
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

if (process.platform === 'win32') {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && (dbUrl.includes('127.0.0.1') || dbUrl.includes('localhost'))) {
      if (isLocalDockerPgRunning()) {
        console.log('[test-env] Windows host: Docker PostgreSQL on localhost, keeping DATABASE_URL');
      } else {
        const wslIp = execSync('wsl hostname -I', { encoding: 'utf8' }).trim().split(' ')[0];
        if (wslIp && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(wslIp)) {
          process.env.DATABASE_URL = dbUrl
            .replace('127.0.0.1', wslIp)
            .replace('localhost', wslIp);
          console.log(`[test-env] Windows host detected. Dynamic DATABASE_URL redirect to WSL IP: ${wslIp}`);
        }
      }
    }
  } catch (err) {
    // WSL may not be available or error, ignore
  }
}
