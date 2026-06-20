import { NextResponse } from 'next/server';
import { db, initializeDatabase } from '../../lib/db';

export async function POST(request) {
  try {
    const body = await request.json();
    const { username, queue } = body;

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'username is required' },
        { status: 400 }
      );
    }

    if (!queue || !Array.isArray(queue)) {
      return NextResponse.json(
        { success: false, error: 'queue must be a valid array' },
        { status: 400 }
      );
    }

    await initializeDatabase();

    const statements = [];

    for (const item of queue) {
      if (item.type === 'expense') {
        const amount = parseFloat(item.amount);
        if (isNaN(amount) || !item.category) continue;

        statements.push({
          sql: `INSERT OR REPLACE INTO expenses (id, username, category, amount, description, logged_at) 
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            item.id,
            username,
            item.category.trim(),
            amount,
            (item.description || '').trim(),
            item.timestamp || new Date().toISOString(),
          ],
        });
      } else if (item.type === 'yield') {
        const qty = parseFloat(item.quantity_kg);
        if (isNaN(qty) || !item.crop_name) continue;

        statements.push({
          sql: `INSERT OR REPLACE INTO yields (id, username, crop_name, quantity_kg, logged_at) 
                VALUES (?, ?, ?, ?, ?)`,
          args: [
            item.id,
            username,
            item.crop_name.trim(),
            qty,
            item.timestamp || new Date().toISOString(),
          ],
        });
      }
    }

    if (statements.length > 0) {
      await db.batch(statements, 'write');
      console.log(`✓ Synced ${statements.length} items for ${username}`);
    }

    return NextResponse.json({
      success: true,
      syncedCount: statements.length,
    });
  } catch (error) {
    console.error('Failed to sync offline queue:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync offline queue' },
      { status: 500 }
    );
  }
}
