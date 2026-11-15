import { execFileSync } from 'node:child_process';

export default function setup() {
  if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL)
    throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to a dedicated browser test database');
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
}
