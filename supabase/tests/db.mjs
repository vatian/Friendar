// Общая подготовка тестовой базы: PGlite (Postgres прямо в Node) с заглушками
// Supabase (роли anon/authenticated, auth.users, auth.uid()) и всеми миграциями.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

// Идентификатор тестового пользователя номер n
export const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

export async function createTestDb(userCount = 8) {
  const migrationsDir = new URL('../migrations/', import.meta.url);
  const migrations = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'));

  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (const sql of migrations) await db.exec(sql);

  for (let i = 1; i <= userCount; i++) {
    await db.exec(`insert into auth.users values ('${U(i)}');
      insert into public.profiles (id, telegram_id, first_name, username)
      values ('${U(i)}', ${i}, 'User${i}', ${i % 2 ? `'nick${i}'` : 'null'});`);
  }

  // Выполнить запрос от имени пользователя n (null — без входа)
  async function as(n, sql) {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub', '${n ? U(n) : ''}', false); set role authenticated;`,
    );
    try {
      return { rows: (await db.query(sql)).rows };
    } catch (e) {
      return { error: e.message };
    } finally {
      await db.exec('reset role;');
    }
  }

  return { db, as };
}

export function createChecker() {
  let failed = 0;
  return {
    check(name, cond, got) {
      if (cond) console.log('OK   ', name);
      else {
        failed++;
        console.log('FAIL ', name, JSON.stringify(got));
      }
    },
    finish() {
      console.log(failed ? `\n${failed} проверок не прошло` : '\nВсе проверки прошли');
      process.exit(failed ? 1 : 0);
    },
  };
}
