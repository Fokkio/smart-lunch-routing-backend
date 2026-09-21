import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseConfigError } from '../env';

const DB_VARS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of DB_VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of DB_VARS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('databaseConfigError', () => {
  it('lists every blank variable by name', () => {
    const message = databaseConfigError({ fileExists: () => true });
    expect(message).toContain('Missing database configuration:');
    for (const key of DB_VARS) expect(message).toContain(`- ${key}`);
  });

  it('never prints secret values', () => {
    process.env['DB_PASSWORD'] = 's3cr3t-should-never-appear';
    const message = databaseConfigError({ fileExists: () => true });
    expect(message).toContain('- DB_HOST');
    expect(message).not.toContain('s3cr3t-should-never-appear');
  });

  it('reports a missing CA certificate by path only', () => {
    const message = databaseConfigError({ fileExists: () => false });
    expect(message).toContain('Aiven SSL certificate not found:');
    // Path only — never certificate contents (the fake reader proves it).
    expect(message).not.toContain('BEGIN CERTIFICATE');
  });

  it('stays silent about the certificate when the file exists', () => {
    const message = databaseConfigError({ fileExists: () => true });
    expect(message).not.toContain('certificate');
  });
});
