import { NextResponse } from 'next/server';
import { db, initializeDatabase } from '../../lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'username query parameter is required' },
        { status: 400 }
      );
    }

    await initializeDatabase();

    // Query yields
    const yieldsResult = await db.execute({
      sql: 'SELECT id, crop_name, quantity_kg, logged_at FROM yields WHERE username = ? ORDER BY logged_at DESC',
      args: [username],
    });

    // Query expenses
    const expensesResult = await db.execute({
      sql: 'SELECT id, category, amount, description, logged_at FROM expenses WHERE username = ? ORDER BY logged_at DESC',
      args: [username],
    });

    return NextResponse.json({
      success: true,
      data: {
        yields: yieldsResult.rows,
        expenses: expensesResult.rows,
      },
    });
  } catch (error) {
    console.error('Failed to fetch tracker data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tracker data' },
      { status: 500 }
    );
  }
}
