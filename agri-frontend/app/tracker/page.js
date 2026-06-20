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

  // Location/Permissions states
  const [isLocating, setIsLocating] = useState(false);
  const [savedLocation, setSavedLocation] = useState(null);
  const [showLocationSettingsGuide, setShowLocationSettingsGuide] = useState(false);

  // Forms states
  const [activeFormTab, setActiveFormTab] = useState('yield'); // 'yield' | 'expense'
  const [activeLogTab, setActiveLogTab] = useState('yield'); // 'yield' | 'expense'

  // Input states
  const [yieldCrop, setYieldCrop] = useState('Corn');
  const [yieldQuantity, setYieldQuantity] = useState('');
  
  const [expenseCategory, setExpenseCategory] = useState('Seeds');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');

  // Local stats refresh trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Load user configurations
  useEffect(() => {
    const savedUsername = localStorage.getItem('agri_username');
    if (savedUsername) {
      setUsername(savedUsername);
      setIsOnboarded(true);
      const loc = localStorage.getItem('agri_last_location');
      if (loc) {
        try {
          setSavedLocation(JSON.parse(loc));
        } catch (e) {
          console.error(e);
        }
      }
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
    showStatusMessage('✅ Offline logs synchronized with database!', 'success');
    fetchData();
  });

  // Fetch prices and tracker data
  const fetchData = async () => {
    if (!username) return;
    setIsLoading(true);
    try {
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

  // Set Farm Location & Register
  const handleSetFarmLocation = () => {
    if (!navigator.geolocation) {
      showStatusMessage('⚠️ Geolocation is not supported by your browser', 'error');
      return;
    }

    setIsLocating(true);
    setShowLocationSettingsGuide(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const newLocation = { 
          latitude: parseFloat(latitude.toFixed(6)), 
          longitude: parseFloat(longitude.toFixed(6)) 
        };
        
        setSavedLocation(newLocation);
        localStorage.setItem('agri_last_location', JSON.stringify(newLocation));

        // Sync with backend database
        try {
          const response = await fetch('/api/register-farm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, latitude: newLocation.latitude, longitude: newLocation.longitude }),
          });
          const resJson = await response.json();
          if (response.ok && resJson.success) {
            showStatusMessage('📍 Farm location updated successfully!', 'success');
          } else {
            showStatusMessage(resJson.error || 'Failed to register location with backend', 'error');
          }
        } catch (e) {
          showStatusMessage('Saved location locally. Could not sync with database (offline)', 'success');
        }
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setShowLocationSettingsGuide(true);
          showStatusMessage('⚠️ Location permission denied by your phone.', 'error');
        } else {
          showStatusMessage('⚠️ Location error: ' + error.message, 'error');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Log Yield
  const handleLogYield = (e) => {
    e.preventDefault();
    const qty = parseFloat(yieldQuantity);
    if (isNaN(qty) || qty <= 0) {
      showStatusMessage('⚠️ Enter a valid crop yield weight', 'error');
      return;
    }

    queueOfflineItem('yield', { crop_name: yieldCrop, quantity_kg: qty });
    setYieldQuantity('');
    showStatusMessage(
      isOnline 
        ? 'Yield logged successfully!' 
        : '💾 Saved locally to phone cache. Will sync when online.', 
      'success'
    );
    
    updateQueueStats();
    setRefreshTrigger(prev => prev + 1);
  };

  // Log Expense
  const handleLogExpense = (e) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) {
      showStatusMessage('⚠️ Enter a valid expense value', 'error');
      return;
    }

    queueOfflineItem('expense', { category: expenseCategory, amount: amt, description: expenseDesc.trim() });
    setExpenseAmount('');
    setExpenseDesc('');
    showStatusMessage(
      isOnline 
        ? 'Expense logged successfully!' 
        : '💾 Saved locally to phone cache. Will sync when online.', 
      'success'
    );

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

  // Compute profit stats
  const totalYieldValue = combinedYields.reduce((acc, y) => {
    const price = marketPrices[y.crop_name] || 0;
    return acc + (y.quantity_kg * price);
  }, 0);

  const totalExpenses = combinedExpenses.reduce((acc, e) => acc + e.amount, 0);
  const estimatedProfit = totalYieldValue - totalExpenses;

  // Onboarding Screen
  if (!isOnboarded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <span className="text-4xl">🌱</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              AgriNotify
            </h1>
            <p className="text-slate-500 mt-2 text-sm">
              Enter your username to access your Yield Tracker
            </p>
          </div>

          <form onSubmit={handleOnboard} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Farmer Username
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="e.g. farmer_maria"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg placeholder:text-slate-400"
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 transition-colors text-white font-bold rounded-2xl shadow-sm text-base"
            >
              Continue to Dashboard
            </button>
          </form>

          {message.text && (
            <div className="mt-4 border border-red-200 p-3 bg-red-50 rounded-xl font-medium text-red-800 text-center text-sm">
              {message.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-16">
      
      {/* Top Header */}
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">🌾</span>
              <span className="font-bold text-xl text-slate-900 tracking-tight">AgriNotify</span>
            </Link>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">
              Tracker
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-100 rounded-full px-3 py-1.5">
              👤 {username}
            </div>
            <Link 
              href="/"
              className="text-xs px-3.5 py-1.5 border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 font-medium transition-colors"
            >
              Back to Alerts
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Connection status notification */}
        {message.text && (
          <div className={`mb-6 border p-4 rounded-2xl font-medium text-sm text-center shadow-sm ${
            message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Geolocation Guide for iOS / iPhone users */}
        {showLocationSettingsGuide && (
          <div className="mb-6 border-2 border-amber-300 p-4 bg-amber-50 rounded-2xl text-slate-800 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">📱</span>
              <div>
                <h4 className="font-bold text-slate-900">How to Allow Location Access on your iPhone:</h4>
                <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                  Your browser or phone has blocked location access. Please follow these steps to enable it:
                </p>
                <ol className="list-decimal list-inside text-xs text-slate-700 mt-2 space-y-1 font-medium">
                  <li>Open your iPhone <strong>Settings</strong> app.</li>
                  <li>Go to <strong>Privacy & Security</strong> &gt; <strong>Location Services</strong>.</li>
                  <li>Verify <strong>Location Services</strong> is switched <strong>ON</strong>.</li>
                  <li>Scroll down to select <strong>Safari Websites</strong> (or your browser) and set it to <strong>"While Using the App"</strong>.</li>
                  <li>Refresh this webpage and try again.</li>
                </ol>
                <button 
                  onClick={() => setShowLocationSettingsGuide(false)}
                  className="mt-3 text-xs font-bold text-amber-900 border border-amber-300 bg-white/50 hover:bg-white rounded-lg px-2.5 py-1"
                >
                  Dismiss Instructions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAIN BODY GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT & CENTER COLUMN (Tracker Dashboard metrics + forms) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Connection badge status */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`relative flex h-3 w-3`}>
                  {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></span>
                </span>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">
                    Mode: {isOnline ? 'Online (Synced)' : 'Offline (Local Cache)'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {isOnline ? 'Logs sync immediately to Turso cloud storage.' : 'Saves data to your phone. Auto-syncs when connection returns.'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    {pendingCount} Pending Syncs
                  </span>
                )}
                <button
                  onClick={triggerSync}
                  disabled={isSyncing || !isOnline || pendingCount === 0}
                  className="px-4 py-2 text-xs font-semibold rounded-full border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            </div>

            {/* ESTIMATED PROFIT CARD (Emerald mesh gradient) */}
            <div className="bg-gradient-to-br from-emerald-950 via-emerald-800 to-green-700 text-white rounded-3xl p-6 shadow-md border border-emerald-950/20 relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10 text-9xl select-none font-bold">🌾</div>
              
              <div className="relative z-10">
                <span className="text-xs uppercase font-bold text-emerald-200 tracking-wider">Estimated Profit Margin</span>
                <div className="text-4xl md:text-5xl font-extrabold tracking-tight mt-1">
                  ${estimatedProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-emerald-300 uppercase tracking-wider mt-1.5 font-medium">
                  Formula: (Crop Quantity × Price) − Expenses
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-emerald-700/60 text-center sm:text-left">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-300">Total Crop Value</span>
                    <div className="text-lg md:text-xl font-bold mt-0.5">
                      +${totalYieldValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="border-l border-emerald-700/60 pl-4">
                    <span className="text-[10px] uppercase font-bold text-emerald-300">Total Expenses</span>
                    <div className="text-lg md:text-xl font-bold mt-0.5">
                      -${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* MARKET PRICES */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 pl-1">
                📈 Local Crop Market Prices (per kg)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {Object.entries(marketPrices).length > 0 ? (
                  Object.entries(marketPrices).map(([crop, price]) => (
                    <div key={crop} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
                      <div className="text-xs font-bold text-slate-500 uppercase">{crop}</div>
                      <div className="text-lg font-extrabold text-slate-900 mt-1">${price.toFixed(2)}</div>
                      <div className="text-[9px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 mt-1.5 inline-block">
                        Market Price
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-5 bg-white border border-slate-100 rounded-2xl p-4 text-center text-xs text-slate-500">
                    Fetching crop prices...
                  </div>
                )}
              </div>
            </div>

            {/* LOGGING FORMS WITH SWITCHER TABS */}
            <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-100 bg-slate-50/50">
                <button
                  onClick={() => setActiveFormTab('yield')}
                  className={`flex-1 py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                    activeFormTab === 'yield' 
                      ? 'border-emerald-600 text-emerald-700 bg-white' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  🌾 Log Harvested Yield
                </button>
                <button
                  onClick={() => setActiveFormTab('expense')}
                  className={`flex-1 py-4 text-center text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                    activeFormTab === 'expense' 
                      ? 'border-emerald-600 text-emerald-700 bg-white' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  💸 Log Farm Expense
                </button>
              </div>

              <div className="p-6">
                {activeFormTab === 'yield' ? (
                  <form onSubmit={handleLogYield} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Crop Type
                        </label>
                        <select
                          value={yieldCrop}
                          onChange={(e) => setYieldCrop(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
                        >
                          {Object.keys(marketPrices).map(crop => (
                            <option key={crop} value={crop}>{crop}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Quantity Harvested (kg)
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          value={yieldQuantity}
                          onChange={(e) => setYieldQuantity(e.target.value)}
                          placeholder="e.g. 1200"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm placeholder:text-slate-400"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full sm:w-auto px-6 py-3 bg-emerald-700 hover:bg-emerald-800 transition-colors text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm"
                    >
                      Save Yield
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleLogExpense} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Expense Category
                        </label>
                        <select
                          value={expenseCategory}
                          onChange={(e) => setExpenseCategory(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-sm"
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
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Amount (USD)
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          value={expenseAmount}
                          onChange={(e) => setExpenseAmount(e.target.value)}
                          placeholder="e.g. 250.00"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm placeholder:text-slate-400"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Optional Description
                        </label>
                        <input
                          type="text"
                          value={expenseDesc}
                          onChange={(e) => setExpenseDesc(e.target.value)}
                          placeholder="e.g. Fertilizer purchase"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm placeholder:text-slate-400"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full sm:w-auto px-6 py-3 bg-emerald-700 hover:bg-emerald-800 transition-colors text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-sm"
                    >
                      Save Expense
                    </button>
                  </form>
                )}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN (Collapsible Lists / Transaction logs) */}
          <div className="space-y-8">
            
            {/* LOCATION CARD */}
            <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
              <h4 className="font-bold text-sm text-slate-900 uppercase tracking-tight mb-3">📍 Farm Coordinates</h4>
              {savedLocation ? (
                <div className="p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100/50 text-xs font-semibold text-slate-700">
                  Latitude: {savedLocation.latitude}° N<br />
                  Longitude: {savedLocation.longitude}° E
                </div>
              ) : (
                <p className="text-xs text-slate-500 leading-normal mb-3">No location registered. Please set location for crop details.</p>
              )}
              
              <button
                onClick={handleSetFarmLocation}
                disabled={isLocating}
                className="w-full mt-3 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-700 disabled:text-slate-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-colors border border-slate-200/50"
              >
                {isLocating ? 'Locating...' : 'Set Farm Location'}
              </button>
            </div>

            {/* DYNAMIC LOGS CONTAINER */}
            <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-100 bg-slate-50/50">
                <button
                  onClick={() => setActiveLogTab('yield')}
                  className={`flex-1 py-3 text-center text-xs font-bold transition-all border-b-2 ${
                    activeLogTab === 'yield' 
                      ? 'border-emerald-600 text-emerald-700 bg-white' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  🌾 Yield Logs ({combinedYields.length})
                </button>
                <button
                  onClick={() => setActiveLogTab('expense')}
                  className={`flex-1 py-3 text-center text-xs font-bold transition-all border-b-2 ${
                    activeLogTab === 'expense' 
                      ? 'border-emerald-600 text-emerald-700 bg-white' 
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  💸 Expense Logs ({combinedExpenses.length})
                </button>
              </div>

              <div className="p-5 max-h-[380px] overflow-y-auto space-y-3">
                {activeLogTab === 'yield' ? (
                  combinedYields.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center font-medium">No harvested crop yields logged.</p>
                  ) : (
                    combinedYields.map(y => (
                      <div 
                        key={y.id} 
                        className={`p-3.5 border rounded-2xl flex justify-between items-center transition-all ${
                          y.pending 
                            ? 'bg-amber-50/60 border-dashed border-amber-300' 
                            : 'bg-slate-50/50 border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-xs uppercase text-slate-800 flex items-center gap-1.5">
                            {y.crop_name}
                            {y.pending && (
                              <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800 uppercase tracking-wider animate-pulse">
                                Pending
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {new Date(y.logged_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-extrabold text-sm text-slate-800">{y.quantity_kg.toLocaleString()} kg</div>
                          <div className="text-[9px] font-semibold text-slate-500">
                            Est. Value: ${(y.quantity_kg * (marketPrices[y.crop_name] || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  combinedExpenses.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center font-medium">No farm expenses logged.</p>
                  ) : (
                    combinedExpenses.map(e => (
                      <div 
                        key={e.id} 
                        className={`p-3.5 border rounded-2xl flex justify-between items-center transition-all ${
                          e.pending 
                            ? 'bg-amber-50/60 border-dashed border-amber-300' 
                            : 'bg-slate-50/50 border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-xs uppercase text-slate-800 flex items-center gap-1.5">
                            {e.category}
                            {e.pending && (
                              <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800 uppercase tracking-wider animate-pulse">
                                Pending
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 leading-normal">
                            {e.description || 'No description'} • {new Date(e.logged_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-right font-extrabold text-sm text-slate-800">
                          -${e.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
