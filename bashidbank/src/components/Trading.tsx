import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft, Zap, Coins, History, Search } from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import { useLanguage } from '../context/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment, runTransaction, query, where, orderBy, limit, onSnapshot, setDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { MarketMakerBot } from './MarketMakerBot';

export function Trading() {
  const { user, userAccount } = useFirebase();
  const { t } = useLanguage();
  const [price, setPrice] = useState(12.50);
  const [marketState, setMarketState] = useState<any>(null);
  const [priceHistory, setPriceHistory] = useState<{ time: string, price: number }[]>([]);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeStatus, setTradeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Listen to global market state
  useEffect(() => {
    const marketRef = doc(db, 'market', 'sartircoin');
    
    const unsubscribe = onSnapshot(marketRef, async (snap) => {
      if (!snap.exists()) {
        // Initialize market if it doesn't exist
        try {
          await setDoc(doc(db, 'market', 'sartircoin'), {
            totalBuyVolume: 0,
            totalSellVolume: 0,
            totalBuyCount: 0,
            totalSellCount: 0,
            basePrice: 12.50,
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          // Could fail if someone else created it at the same time, which is fine
        }
      } else {
        const data = snap.data();
        setMarketState(data);
        
        // Calculate price based on supply/demand
        // Formula: basePrice * (1 + netVolumeFactor + netCountFactor)
        const buyV = data.totalBuyVolume || 0;
        const sellV = data.totalSellVolume || 0;
        const buyC = data.totalBuyCount || 0;
        const sellC = data.totalSellCount || 0;
        
        const netVolume = buyV - sellV;
        const netCount = buyC - sellC;
        
        // Sensitivity factors
        const volSensitivity = 0.005; // Each BSD net volume moves price slightly
        const countSensitivity = 0.1; // Each net trade moves price more noticeably (pumps/dumps)
        
        const calculatedPrice = Math.max(0.1, data.basePrice + (netVolume * volSensitivity) + (netCount * countSensitivity));
        setPrice(Number(calculatedPrice.toFixed(2)));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'market/sartircoin'));

    return () => unsubscribe();
  }, []);



  useEffect(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setPriceHistory(prev => {
      const newHistory = [...prev, { time: timeStr, price }];
      return newHistory.slice(-20);
    });
  }, [price]);

  const handleTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userAccount) return;

    setTradeStatus('loading');
    const amount = Number(tradeAmount);
    const totalCost = amount * price;

    if (amount <= 0) {
      setTradeStatus('error');
      setErrorMessage(t('errorAmount'));
      return;
    }

    try {
      const accountRef = doc(db, 'accounts', user.uid);
      const marketRef = doc(db, 'market', 'sartircoin');

      await runTransaction(db, async (transaction) => {
        const accountSnap = await transaction.get(accountRef);
        const marketSnap = await transaction.get(marketRef);
        
        if (!accountSnap.exists()) throw new Error("Account missing");
        if (!marketSnap.exists()) throw new Error("Market data missing");

        const accountData = accountSnap.data();
        const marketData = marketSnap.data();
        
        const currentBalance = accountData.balance || 0;
        const currentSartBalance = accountData.sartirCoinBalance || 0;

        if (tradeType === 'buy') {
          if (totalCost > currentBalance) {
            throw new Error("Insufficient funds");
          }

          transaction.update(accountRef, {
            balance: currentBalance - totalCost,
            sartirCoinBalance: currentSartBalance + amount,
            updatedAt: serverTimestamp()
          });

          // Update global market volume and count
          transaction.update(marketRef, {
            totalBuyVolume: (marketData.totalBuyVolume || 0) + amount,
            totalBuyCount: (marketData.totalBuyCount || 0) + 1,
            updatedAt: serverTimestamp()
          });
        } else {
          if (amount > currentSartBalance) {
            throw new Error("Insufficient SartirCoin");
          }

          transaction.update(accountRef, {
            balance: currentBalance + totalCost,
            sartirCoinBalance: currentSartBalance - amount,
            updatedAt: serverTimestamp()
          });

          // Update global market volume and count
          transaction.update(marketRef, {
            totalSellVolume: (marketData.totalSellVolume || 0) + amount,
            totalSellCount: (marketData.totalSellCount || 0) + 1,
            updatedAt: serverTimestamp()
          });
        }

        // Record transaction
        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          fromUserId: user.uid,
          toUserId: null,
          amount: totalCost,
          sartirCoinAmount: amount,
          description: tradeType === 'buy' ? `Bought ${amount} SART` : `Sold ${amount} SART`,
          timestamp: serverTimestamp(),
          type: 'trade'
        });
      });

      setTradeStatus('success');
      setTimeout(() => {
        setTradeStatus('idle');
        setIsBuyModalOpen(false);
        setTradeAmount('');
      }, 1500);
    } catch (err: any) {
      setTradeStatus('error');
      if (err.message === "Insufficient funds") {
        setErrorMessage(t('insufficientFunds'));
      } else if (err.message === "Insufficient SartirCoin") {
        setErrorMessage(t('insufficientSartir'));
      } else {
        setErrorMessage(t('errorGeneric'));
        console.error(err);
      }
    }
  };

  const currentSartirBalance = userAccount?.sartirCoinBalance || 0;
  const portfolioValue = currentSartirBalance * price;

  return (
    <div className="pt-24 pb-20 px-4 max-w-7xl mx-auto bg-slate-950 min-h-screen">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Trading Chart & Portfolio */}
        <div className="lg:col-span-2 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 md:p-12 rounded-[40px] bg-slate-900 border border-slate-800 shadow-2xl relative overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Coins className="w-5 h-5 text-emerald-400" />
                    <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">{t('sartirCoin')}</p>
                  </div>
                  <h2 className="text-4xl md:text-6xl font-display font-bold text-white flex items-baseline gap-3">
                    {price.toFixed(2)} 
                    <span className="text-xl font-light text-slate-500">BSD</span>
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">{t('marketValue')}</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    +{(Math.random() * 2).toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="h-[300px] w-full mt-8">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={priceHistory}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      stroke="#475569" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false} 
                    />
                    <YAxis 
                      stroke="#475569" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#10b981" 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill="url(#colorPrice)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="p-8 rounded-[40px] bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{t('yourCards')}</p>
                  <h4 className="text-2xl font-bold text-white tracking-tight">{currentSartirBalance.toLocaleString()} <span className="text-xs text-slate-500">SART</span></h4>
                </div>
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400">
                  <Zap className="w-6 h-6" />
                </div>
             </div>
             <div className="p-8 rounded-[40px] bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{t('marketValue')}</p>
                  <h4 className="text-2xl font-bold text-white tracking-tight">{portfolioValue.toLocaleString()} <span className="text-xs text-slate-500">BSD</span></h4>
                </div>
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-teal-400">
                  <TrendingUp className="w-6 h-6" />
                </div>
             </div>
          </div>

          {/* Market Depth Stats */}
          {marketState && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-6 rounded-[30px] bg-slate-900/50 border border-emerald-500/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Buy Volume</p>
                <p className="text-xl font-bold text-emerald-400">{marketState.totalBuyVolume?.toLocaleString()} SART</p>
              </div>
              <div className="p-6 rounded-[30px] bg-slate-900/50 border border-emerald-500/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Buy Trades</p>
                <p className="text-xl font-bold text-emerald-400">{marketState.totalBuyCount?.toLocaleString()}</p>
              </div>
              <div className="p-6 rounded-[30px] bg-slate-900/50 border border-rose-500/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Sell Volume</p>
                <p className="text-xl font-bold text-rose-400">{marketState.totalSellVolume?.toLocaleString()} SART</p>
              </div>
              <div className="p-6 rounded-[30px] bg-slate-900/50 border border-rose-500/10">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Sell Trades</p>
                <p className="text-xl font-bold text-rose-400">{marketState.totalSellCount?.toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Trade Controls */}
        <div className="space-y-8">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-8 rounded-[40px] bg-slate-900 border border-slate-800 shadow-xl"
          >
            <h3 className="text-xl font-bold text-white mb-6 tracking-tight">{t('tradeNow')}</h3>
            
            <div className="space-y-6">
              <div className="flex p-1 bg-slate-950 rounded-2xl">
                <button 
                  onClick={() => setTradeType('buy')}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-bold text-sm transition-all",
                    tradeType === 'buy' ? "bg-emerald-500 text-slate-950 shadow-lg" : "text-slate-500 hover:text-white"
                  )}
                >
                  {t('buy')}
                </button>
                <button 
                  onClick={() => setTradeType('sell')}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-bold text-sm transition-all",
                    tradeType === 'sell' ? "bg-rose-500 text-white shadow-lg" : "text-slate-500 hover:text-white"
                  )}
                >
                  {t('sell')}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-1">{t('amount')} (SART)</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={tradeAmount}
                    onChange={(e) => setTradeAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-800 border-none rounded-2xl px-6 py-4 text-white font-mono text-lg focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-700"
                  />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-600">SART</span>
                </div>
              </div>

              <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">{t('price')}</span>
                  <span className="text-white font-bold">{price} BSD</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">Est. Cost</span>
                  <span className="text-white font-bold">{(Number(tradeAmount) * price).toFixed(2)} BSD</span>
                </div>
              </div>

              {tradeStatus === 'error' && (
                <p className="text-rose-400 text-xs font-bold bg-rose-400/10 p-4 rounded-xl border border-rose-400/20">{errorMessage}</p>
              )}

              {tradeStatus === 'success' && (
                <p className="text-emerald-400 text-xs font-bold bg-emerald-400/10 p-4 rounded-xl border border-emerald-400/20">{t('tradeSuccess')}</p>
              )}

              <button 
                onClick={handleTrade}
                disabled={tradeStatus === 'loading'}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2",
                  tradeType === 'buy' ? "bg-emerald-500 text-slate-950 shadow-emerald-500/20 hover:bg-emerald-400" : "bg-rose-500 text-white shadow-rose-500/20 hover:bg-rose-400"
                )}
              >
                {tradeStatus === 'loading' ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {tradeType === 'buy' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    {tradeType === 'buy' ? t('buy') : t('sell')} SART
                  </>
                )}
              </button>
            </div>
          </motion.div>

          <MarketMakerBot />

          <div className="p-8 rounded-[40px] bg-slate-900 border border-slate-800 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
             <h4 className="text-white font-bold mb-2 tracking-tight">Trading Risk Disclosure</h4>
             <p className="text-xs text-slate-500 font-medium leading-relaxed">
               SartirCoin is a highly volatile electronic asset. Trading involves significant risk. Always monitor the Bashid economic trajectory before major trades.
             </p>
          </div>


        </div>
      </div>
    </div>
  );
}


