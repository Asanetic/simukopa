
// File: api/data_control/conn.js
import mysql from 'mysql2/promise';
import mosyDbConfig from '../s_env/appconn_env';

// Force Node process timezone
process.env.TZ = 'Africa/Nairobi';

// Override toISOString globally
Date.prototype.toISOString = function () {
  return this.toLocaleString('sv-SE', {
    timeZone: 'Africa/Nairobi'
  }).replace(',', '');
};

const isLocal = process.env.NODE_ENV !== 'production';
const dbSettings = isLocal ? mosyDbConfig.local : mosyDbConfig.production;

// Export the DB name
const activeDB = dbSettings.DB_NAME;

export { dbSettings, activeDB };

//console.log("🧪 DB Settings Loaded:", dbSettings);

// One shared pool per process (globalThis survives Next.js dev hot-reloads,
// which otherwise create a new pool on every reload and exhaust connections).
const pool = globalThis.__mosyDbPool ??= mysql.createPool({
  host: dbSettings.DB_HOST,
  user: dbSettings.DB_USER,
  password: dbSettings.DB_PASS,
  database: dbSettings.DB_NAME,
  dateStrings: dbSettings.dateStrings,
  timezone: '+03:00',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function connectDB() {
  try {
    const conn = await pool.getConnection();

    // Existing callers use conn.end(); on a pooled connection that must release, not close.
    let released = false;
    conn.end = async () => {
      if (released) return;
      released = true;
      conn.release();
    };
    return conn;

  } catch (err) {
    console.error("❌ DB Connection Failed:", err);
    throw new Error("Could not connect to the database.");
  }
}
