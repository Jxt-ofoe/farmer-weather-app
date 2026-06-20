import { NextResponse } from 'next/server';
import { db, initializeDatabase } from '../../lib/db';

export async function GET() {
  try {
    await initializeDatabase();
    
    const result = await db.execute('SELECT crop_name, price_per_kg, currency, updated_at FROM market_prices');
    
    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Failed to fetch market prices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch market prices' },
      { status: 500 }
    );
  }
}
