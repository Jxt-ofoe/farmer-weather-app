// App-level client-side PWA Sync utility
import { useState, useEffect } from 'react';

const QUEUE_KEY = 'agri_sync_queue';

// Generate safe unique IDs
function generateUniqueId(prefix) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Retrieve queue from localStorage
export function getOfflineQueue() {
  if (typeof window === 'undefined') return [];
  try {
    const queueJson = localStorage.getItem(QUEUE_KEY);
    return queueJson ? JSON.parse(queueJson) : [];
  } catch (err) {
    console.error('Failed to parse offline sync queue:', err);
    return [];
  }
}

// Save queue to localStorage
export function saveOfflineQueue(queue) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    // Trigger custom event so other components know the queue updated
    window.dispatchEvent(new Event('agri_queue_updated'));
  } catch (err) {
    console.error('Failed to save offline sync queue:', err);
  }
}

// Queue an item (yield or expense) to be synced
export function queueOfflineItem(type, data) {
  const queue = getOfflineQueue();
  const newItem = {
    id: generateUniqueId(type === 'expense' ? 'exp' : 'yld'),
    type,
    ...data,
    timestamp: new Date().toISOString()
  };
  
  queue.push(newItem);
  saveOfflineQueue(queue);
  return newItem;
}

// Post offline queue to Turso backend database
export async function syncPendingRecords(username) {
  if (typeof window === 'undefined' || !navigator.onLine) return { success: false, reason: 'offline' };
  
  const queue = getOfflineQueue();
  if (queue.length === 0) return { success: true, syncedCount: 0 };

  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        queue
      })
    });

    if (!response.ok) {
      throw new Error(`Sync API returned status ${response.status}`);
    }

    const result = await response.json();
    if (result.success) {
      // Clear queue on success
      saveOfflineQueue([]);
      return { success: true, syncedCount: result.syncedCount };
    } else {
      throw new Error(result.error || 'Unknown sync error');
    }
  } catch (err) {
    console.error('Sync failed:', err);
    return { success: false, error: err.message };
  }
}

// Custom React Hook to listen to network and auto-sync
export function useOfflineSync(username, onSyncSuccess) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncQueue, setSyncQueue] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Update stats from localStorage
  const updateQueueStats = () => {
    const queue = getOfflineQueue();
    setSyncQueue(queue);
    setPendingCount(queue.length);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);
    updateQueueStats();

    const handleOnline = async () => {
      setIsOnline(true);
      if (username) {
        setIsSyncing(true);
        const res = await syncPendingRecords(username);
        setIsSyncing(false);
        if (res.success && res.syncedCount > 0 && onSyncSuccess) {
          onSyncSuccess();
        }
        updateQueueStats();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueUpdate = () => {
      updateQueueStats();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('agri_queue_updated', handleQueueUpdate);

    // Initial check & auto-sync if online on load
    if (navigator.onLine && username) {
      handleOnline();
    }

    // Periodic sync check every 20 seconds (background guard)
    const interval = setInterval(async () => {
      if (navigator.onLine && username && getOfflineQueue().length > 0) {
        setIsSyncing(true);
        const res = await syncPendingRecords(username);
        setIsSyncing(false);
        if (res.success && res.syncedCount > 0 && onSyncSuccess) {
          onSyncSuccess();
        }
        updateQueueStats();
      }
    }, 20000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('agri_queue_updated', handleQueueUpdate);
      clearInterval(interval);
    };
  }, [username]);

  const triggerSync = async () => {
    if (!username) return { success: false, error: 'No username logged in' };
    setIsSyncing(true);
    const res = await syncPendingRecords(username);
    setIsSyncing(false);
    updateQueueStats();
    if (res.success && res.syncedCount > 0 && onSyncSuccess) {
      onSyncSuccess();
    }
    return res;
  };

  return {
    isOnline,
    pendingCount,
    syncQueue,
    isSyncing,
    triggerSync,
    updateQueueStats
  };
}
