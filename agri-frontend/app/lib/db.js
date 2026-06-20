import { createClient } from '@libsql/client';

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({
  url: TURSO_DATABASE_URL || 'file:local.db',
  authToken: TURSO_AUTH_TOKEN || 'dummy-token',
});

export async function initializeDatabase() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS farmers (
        username TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        rain_threshold REAL DEFAULT 15.0,
        wind_threshold REAL DEFAULT 20.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_farmers_location 
      ON farmers (latitude, longitude)
    `);

    // Create market_prices table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS market_prices (
        crop_name TEXT PRIMARY KEY,
        price_per_kg REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create expenses table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create yields table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS yields (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        crop_name TEXT NOT NULL,
        quantity_kg REAL NOT NULL,
        logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default market prices if empty
    const checkPrices = await db.execute('SELECT COUNT(*) as count FROM market_prices');
    if (checkPrices.rows[0]?.count === 0) {
      const defaultPrices = [
        ['Corn', 0.18, 'USD'],
        ['Wheat', 0.24, 'USD'],
        ['Soybeans', 0.42, 'USD'],
        ['Rice', 0.35, 'USD'],
        ['Potatoes', 0.15, 'USD'],
      ];
      for (const [crop, price, currency] of defaultPrices) {
        await db.execute({
          sql: 'INSERT INTO market_prices (crop_name, price_per_kg, currency) VALUES (?, ?, ?)',
          args: [crop, price, currency],
        });
      }
      console.log('✓ Seeded default crop market prices');
    }

  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}
