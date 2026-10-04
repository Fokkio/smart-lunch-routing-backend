import { getPool, closePool } from '../src/database/mysql.connection';
import { hashPassword, login, verifyPassword } from '../src/middleware/auth';
import { createHash } from 'node:crypto';

async function prompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Run in an interactive terminal');
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let answer = '';
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') {
          process.stdin.off('data', onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(answer);
          return;
        }
        if (char === '\u0003') {
          process.stdin.off('data', onData);
          process.stdin.setRawMode(false);
          process.stdout.write('\n');
          reject(new Error('Cancelled'));
          return;
        }
        if (char === '\u007f' || char === '\b') answer = answer.slice(0, -1);
        else answer += char;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const username = (process.env['OWNER_USERNAME'] ?? await prompt('Owner username: ')).trim();
  const password = process.env['OWNER_PASSWORD'] ?? await prompt('Owner password (input hidden): ');
  if (!username || username.length > 100 || !password) throw new Error('Username and password are required');
  const [existing] = await getPool().execute<(import('mysql2/promise').RowDataPacket & { password_hash: string })[]>(
    'SELECT admin_user_id,password_hash FROM admin_users WHERE username=?', [username],
  );
  if (process.argv.includes('--verify')) {
    if (!existing[0] || !/^\$2[aby]\$10\$/.test(existing[0].password_hash) || !await verifyPassword(password, existing[0].password_hash)) {
      throw new Error('Owner login verification failed');
    }
    const session = await login('OWNER', username, password);
    await getPool().execute('DELETE FROM auth_sessions WHERE token_hash=?', [createHash('sha256').update(session.token).digest('hex')]);
    console.log('Owner login verified with bcrypt cost 10');
    return;
  }
  if (existing.length) throw new Error('Owner account already exists; refusing to replace its password');
  const hash = await hashPassword(password);
  await getPool().execute('INSERT INTO admin_users(username,display_name,password_hash,role) VALUES(?,?,?,?)',
    [username, username, hash, 'OWNER']);
  console.log('Owner account created');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => closePool());
