'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useOfflineSync, queueOfflineItem, getOfflineQueue } from '../lib/sync';

export default function TrackerDashboard() {
  const [username, setUsername] = useState('');
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  
  // App states
  const [marketPrices, setMarketPrices] = useState({});
  const [syncedData, setSyncedData] = useState({ yields: [], expenses: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' }); // type: 'success' | 'error'

  // Input states
  const [yieldCrop, setYieldCrop] = useState('Corn');
  const [yieldQuantity, setYieldQuantity] = useState('');
  
  const [expenseCategory, setExpenseCategory] = useState('Seeds');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');

  // Local stats refresh trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Load username
  useEffect(() => {
    const savedUsername = localStorage.getItem('agri_username');
    if (savedUsername) {
      setUsername(savedUsername);
      setIsOnboarded(true);
    }
  }, []);

  // Use custom offline sync hook
  const {
    isOnline,
    pendingCount,
    syncQueue,
    isSyncing,
    triggerSync,
    updateQueueStats
  } = useOfflineSync(username, () => {
    // Callback when records sync successfully
    showStatusMessage('✅ Offline data successfully synced!', 'success');
    fetchData();
  });

  // Fetch prices and tracker data
  const fetchData = async () => {
    if (!username) return;
    setIsLoading(true);
    try {
      // Fetch prices (with static fallbacks if offline/api error)
      const pricesRes = await fetch('/api/market-prices').catch(() => null);
      let pricesMap = {
        'Corn': 0.18,
        'Wheat': 0.24,
        'Soybeans': 0.42,
        'Rice': 0.35,
        'Potatoes': 0.15
      };
      
      if (pricesRes && pricesRes.ok) {
        const pricesData = await pricesRes.json();
        if (pricesData.success) {
          const map = {};
          pricesData.data.forEach(p => {
            map[p.crop_name] = p.price_per_kg;
          });
          pricesMap = map;
        }
      }
      setMarketPrices(pricesMap);

      // Fetch user's synced yields & expenses
      const dataRes = await fetch(`/api/tracker-data?username=${username}`).catch(() => null);
      if (dataRes && dataRes.ok) {
        const dataJson = await dataRes.json();
        if (dataJson.success) {
          setSyncedData(dataJson.data);
        }
      }
    } catch (err) {
      console.error('Error fetching tracker data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOnboarded && username) {
      fetchData();
    }
  }, [username, isOnboarded, refreshTrigger]);

  const showStatusMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage({ text: '', type: '' });
    }, 5000);
  };

  // Log Yield Form Submit
  const handleLogYield = (e) => {
    e.preventDefault();
    const qty = parseFloat(yieldQuantity);
    if (isNaN(qty) || qty <= 0) {
      showStatusMessage('⚠️ Please enter a valid yield quantity', 'error');
      return;
    }

    const payload = {
      crop_name: yieldCrop,
      quantity_kg: qty
    };

    // Save to offline queue
    queueOfflineItem('yield', payload);
    setYieldQuantity('');
    showStatusMessage(
      isOnline 
        ? 'Logging yield...' 
        : '💾 Offline mode: Yield saved locally to phone. Will sync when online.', 
      'success'
    );
    
    // Trigger check
    updateQueueStats();
    setRefreshTrigger(prev => prev + 1);
  };

  // Log Expense Form Submit
  const handleLogExpense = (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) {
      showStatusMessage('⚠️ Please enter a valid expense amount', 'error');
      return;
    }

    const payload = {
      category: expenseCategory,
      amount: amt,
      description: expenseDesc.trim()
    };

    // Save to offline queue
    queueOfflineItem('expense', payload);
    setExpenseAmount('');
    setExpenseDesc('');
    showStatusMessage(
      isOnline 
        ? 'Logging expense...' 
        : '💾 Offline mode: Expense saved locally to phone. Will sync when online.', 
      'success'
    );

    // Trigger check
    updateQueueStats();
    setRefreshTrigger(prev => prev + 1);
  };

  const handleOnboard = (e) => {
    e.preventDefault();
    const trimmed = usernameInput.trim();
    if (!trimmed || trimmed.length < 3) {
      showStatusMessage('Username must be at least 3 characters', 'error');
      return;
    }
    localStorage.setItem('agri_username', trimmed);
    setUsername(trimmed);
    setIsOnboarded(true);
    setUsernameInput('');
  };

  // === CALCULATE REAL-TIME VALUES ===
  // Combine database synced values and pending queue values
  const getCombinedData = () => {
    const combinedYields = [...syncedData.yields];
    const combinedExpenses = [...syncedData.expenses];

    // Append pending local items
    syncQueue.forEach(item => {
      if (item.type === 'yield') {
        combinedYields.unshift({
          id: item.id,
          crop_name: item.crop_name,
          quantity_kg: item.quantity_kg,
          logged_at: item.timestamp,
          pending: true
        });
      } else if (item.type === 'expense') {
        combinedExpenses.unshift({
          id: item.id,
          category: item.category,
          amount: item.amount,
          description: item.description,
          logged_at: item.timestamp,
          pending: true
        });
      }
    });

    return { combinedYields, combinedExpenses };
  };

  const { combinedYields, combinedExpenses } = getCombinedData();

  // Compute stats
  const totalYieldValue = combinedYields.reduce((acc, y) => {
    const price = marketPrices[y.crop_name] || 0;
    return acc + (y.quantity_kg * price);
  }, 0);

  const totalExpenses = combinedExpenses.reduce((acc, e) => acc + e.amount, 0);
  const estimatedProfit = totalYieldValue - totalExpenses;

  // Onboarding screen if user not signed in
  if (!isOnboarded) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="text-center mb-8">
            <span className="text-5xl block mb-2">📊</span>
            <h1 className="text-3xl font-black tracking-tight text-black uppercase">
              Yield & Expense Tracker
            </h1>
            <p className="text-black font-bold mt-2 text-sm">
              Please enter your username to continue
            </p>
          </div>

          <form onSubmit={handleOnboard} className="space-y-4">
            <div>
              <label className="block text-sm font-black uppercase text-black mb-1">
                Your unique username
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="e.g. farmer_maria"
                className="w-full px-4 py-3 border-3 border-black text-black font-bold placeholder:text-gray-400 focus:outline-none focus:bg-yellow-50"
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-black hover:bg-gray-900 active:bg-gray-800 text-white font-black uppercase tracking-wider border-2 border-black transition-colors"
            >
              Continue to Tracker
            </button>
          </form>

          {message.text && (
            <div className="mt-4 border-3 border-black p-3 bg-red-100 font-bold text-black text-center">
              {message.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-black pb-12">
      {/* High-Contrast Navigation Header */}
      <nav className="bg-white border-b-4 border-black sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl font-bold">🌾</span>
              <span className="font-black text-xl tracking-tighter uppercase">AgriNotify</span>
            </Link>
            <span className="hidden sm:inline px-2 py-0.5 text-xs font-black border-2 border-black uppercase bg-yellow-300">
              Tracker
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm font-black border-2 border-black px-3 py-1 bg-[#efefef]">
              👤 {username}
            </div>
            <Link 
              href="/"
              className="text-sm px-4 py-1.5 border-2 border-black font-black uppercase hover:bg-gray-100"
            >
              Back to Alerts
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        
        {/* Status Messages */}
        {message.text && (
          <div className={`mb-6 border-4 border-black p-4 font-black text-base text-center ${
            message.type === 'success' ? 'bg-green-200' : 'bg-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* 1. CONNECTION & SYNC INDICATOR - HIGH CONTRAST */}
        <div className="border-4 border-black p-4 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-6 h-6 border-2 border-black rounded-full flex items-center justify-center font-black text-xs ${
              isOnline ? 'bg-green-500 text-white' : 'bg-red-500 text-white animate-pulse'
            }`}>
              {isOnline ? '✓' : '!'}
            </div>
            <div>
              <div className="font-black uppercase text-lg">
                Connection Status: {isOnline ? 'ONLINE' : 'OFFLINE'}
              </div>
              <p className="text-xs font-bold text-gray-700">
                {isOnline 
                  ? 'All local loggings are actively synced to Turso Cloud DB.'
                  : 'Device is offline. Your logged expenses and yields are saved to local storage.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <span className="px-3 py-1 bg-yellow-300 font-black text-xs uppercase border-2 border-black animate-pulse">
                {pendingCount} PENDING SYNC
              </span>
            )}
            <button
              onClick={triggerSync}
              disabled={isSyncing || !isOnline || pendingCount === 0}
              className={`px-5 py-2.5 font-black uppercase text-sm border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ${
                pendingCount > 0 && isOnline
                  ? 'bg-black text-white hover:bg-gray-800'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-400 shadow-none'
              }`}
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>

        {/* 2. REAL-TIME ESTIMATED PROFIT CALCULATOR - SUNLIGHT OPTIMIZED LARGE TEXT */}
        <div className="border-4 border-black p-6 bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] mb-8">
          <div className="text-center md:text-left mb-4">
            <h2 className="text-sm font-black uppercase text-gray-600 tracking-wider">Estimated Profit Margin</h2>
            <div className={`text-5xl md:text-6xl font-black tracking-tighter mt-1 ${
              estimatedProfit >= 0 ? 'text-green-800' : 'text-red-800'
            }`}>
              ${estimatedProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs font-black text-gray-600 mt-1 uppercase">
              Formula: (Total Yields × Current Price) − Total Expenses
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t-4 border-black pt-4 text-center">
            <div className="border-r-4 border-black pr-2">
              <span className="text-xs font-black uppercase text-gray-600">Total Crop Value</span>
              <div className="text-xl md:text-2xl font-black text-black">
                +${totalYieldValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <span className="text-xs font-black uppercase text-gray-600">Total Expenses</span>
              <div className="text-xl md:text-2xl font-black text-black">
                -${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* 3. MARKET PRICES DISPLAY - HIGH-CONTRAST / LARGE-TEXT */}
        <div className="mb-8">
          <h2 className="text-xl font-black uppercase tracking-tight mb-4 flex items-center gap-2">
            <span>📈</span> Current Market Prices
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(marketPrices).map(([crop, price]) => (
              <div 
                key={crop} 
                className="border-3 border-black p-4 bg-white text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <div className="text-sm font-black uppercase text-gray-600">{crop}</div>
                <div className="text-2xl font-black text-black mt-1">
                  ${price.toFixed(2)}
                </div>
                <div className="text-[10px] font-bold text-gray-500 uppercase">per Kilogram</div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. LOGGING FORMS */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          
          {/* Yield Logging Form */}
          <div className="border-4 border-black p-6 bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-lg font-black uppercase border-b-2 border-black pb-2 mb-4 flex items-center gap-2">
              <span>🌾</span> Log Harvested Yield
            </h3>
            <form onSubmit={handleLogYield} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                  Select Crop type
                </label>
                <select
                  value={yieldCrop}
                  onChange={(e) => setYieldCrop(e.target.value)}
                  className="w-full px-3 py-2.5 border-3 border-black font-black bg-white focus:outline-none focus:bg-yellow-50"
                >
                  {Object.keys(marketPrices).map(crop => (
                    <option key={crop} value={crop}>{crop}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                  Quantity Harvested (Kilograms)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={yieldQuantity}
                  onChange={(e) => setYieldQuantity(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full px-3 py-2.5 border-3 border-black font-black placeholder:text-gray-400 focus:outline-none focus:bg-yellow-50"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-black hover:bg-gray-900 active:bg-gray-800 text-white font-black uppercase border-2 border-black transition-colors"
              >
                Log Harvested Yield
              </button>
            </form>
          </div>

          {/* Expense Logging Form */}
          <div className="border-4 border-black p-6 bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-lg font-black uppercase border-b-2 border-black pb-2 mb-4 flex items-center gap-2">
              <span>💸</span> Log Farm Expense
            </h3>
            <form onSubmit={handleLogExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                  Expense Category
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2.5 border-3 border-black font-black bg-white focus:outline-none focus:bg-yellow-50"
                >
                  <option value="Seeds">Seeds</option>
                  <option value="Fertilizer">Fertilizer</option>
                  <option value="Fuel">Fuel</option>
                  <option value="Labor">Labor</option>
                  <option value="Equipment">Equipment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                  Amount (USD)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="e.g. 450.00"
                  className="w-full px-3 py-2.5 border-3 border-black font-black placeholder:text-gray-400 focus:outline-none focus:bg-yellow-50"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-700 mb-1">
                  Optional Description
                </label>
                <input
                  type="text"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  placeholder="e.g. Purchased fertilizer from vendor"
                  className="w-full px-3 py-2.5 border-3 border-black font-black placeholder:text-gray-400 focus:outline-none focus:bg-yellow-50"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-black hover:bg-gray-900 active:bg-gray-800 text-white font-black uppercase border-2 border-black transition-colors"
              >
                Log Farm Expense
              </button>
            </form>
          </div>

        </div>

        {/* 5. DYNAMIC TRANSACTION LOGS - COLLAPSIBLE OR SIDE-BY-SIDE */}
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Yields Logs */}
          <div className="border-4 border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-base font-black uppercase border-b-2 border-black pb-2 mb-3">
              🌾 Logged Crop Harvests ({combinedYields.length})
            </h3>
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {combinedYields.length === 0 ? (
                <p className="text-xs font-bold text-gray-500 py-4 text-center">No harvest yield logged yet.</p>
              ) : (
                combinedYields.map((y) => (
                  <div 
                    key={y.id} 
                    className={`border-2 border-black p-3 flex justify-between items-center ${
                      y.pending ? 'bg-yellow-50 border-dashed' : 'bg-[#fbfbfb]'
                    }`}
                  >
                    <div>
                      <div className="font-black text-sm uppercase">
                        {y.crop_name} {y.pending && <span className="text-[10px] bg-yellow-300 border-2 border-black px-1.5 py-0.5 ml-1 font-black">PENDING</span>}
                      </div>
                      <div className="text-xs font-bold text-gray-500">
                        {new Date(y.logged_at).toLocaleDateString()} at {new Date(y.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-base">{y.quantity_kg.toLocaleString()} kg</div>
                      <div className="text-[10px] font-bold text-gray-600">
                        Est. Value: ${(y.quantity_kg * (marketPrices[y.crop_name] || 0)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Expenses Logs */}
          <div className="border-4 border-black p-6 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-base font-black uppercase border-b-2 border-black pb-2 mb-3">
              💸 Logged Expenses ({combinedExpenses.length})
            </h3>
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {combinedExpenses.length === 0 ? (
                <p className="text-xs font-bold text-gray-500 py-4 text-center">No expenses logged yet.</p>
              ) : (
                combinedExpenses.map((e) => (
                  <div 
                    key={e.id} 
                    className={`border-2 border-black p-3 flex justify-between items-center ${
                      e.pending ? 'bg-yellow-50 border-dashed' : 'bg-[#fbfbfb]'
                    }`}
                  >
                    <div>
                      <div className="font-black text-sm uppercase">
                        {e.category} {e.pending && <span className="text-[10px] bg-yellow-300 border-2 border-black px-1.5 py-0.5 ml-1 font-black">PENDING</span>}
                      </div>
                      <div className="text-xs font-bold text-gray-500">
                        {e.description || 'No description'} • {new Date(e.logged_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-base">-${e.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
