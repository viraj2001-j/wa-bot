import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function usePostgresAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearSession: () => Promise<void>;
}> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_auth (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const writeData = async (key: string, data: unknown) => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await pool.query(
      `INSERT INTO wa_auth (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, serialized]
    );
  };

  const readData = async (key: string) => {
    const res = await pool.query(`SELECT value FROM wa_auth WHERE key = $1`, [key]);
    if (!res.rows.length) return null;
    return JSON.parse(res.rows[0].value, BufferJSON.reviver);
  };

  const removeData = async (key: string) => {
    await pool.query(`DELETE FROM wa_auth WHERE key = $1`, [key]);
  };

  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              if (value) data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap];
            for (const id in entries) {
              const value = entries[id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
    clearSession: async () => {
      await pool.query(`DELETE FROM wa_auth`);
    },
  };
}

export async function shouldSendDailyMenu(jid: string, dateStr: string): Promise<boolean> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_daily_sent (
      jid TEXT NOT NULL,
      sent_date TEXT NOT NULL,
      PRIMARY KEY (jid, sent_date)
    )
  `);

  // Try to insert today's record; if it already exists, do nothing and return 0 rows
  const res = await pool.query(
    `INSERT INTO wa_daily_sent (jid, sent_date)
     VALUES ($1, $2)
     ON CONFLICT (jid, sent_date) DO NOTHING
     RETURNING jid`,
    [jid, dateStr]
  );

  // Returns true ONLY on the user's first message of the day
  return res.rows.length > 0;
}