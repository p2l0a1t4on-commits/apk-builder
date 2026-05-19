import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, Play, Square, Settings, Activity, ShieldCheck, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp, increment, getDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface BotStats {
  totalVolume: number;
  tradesCount: number;
  lastAction: string;
  status: 'idle' | 'active' | 'pausing';
}

export function MarketMakerBot() {
  const { userAccount } = useFirebase();
  const [isActive, setIsActive] = useState(false);
  const [targetPrice, setTargetPrice] = useState(12.50);
  const [aggression, setAggression] = useState(0.5); // 0 to 1
  const [stats, setStats] = useState<BotStats>({
    totalVolume: 0,
    tradesCount: 0,
    lastAction: 'Waiting for orders...',
    status: 'idle'
  });
  
  const isMaster = userAccount?.subscriptionTier === 'master';
  const botInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive && isMaster) {
      setStats(prev => ({ ...prev, status: 'active', lastAction: 'Bot initialized.' }));
      
      botInterval.current = setInterval(async () => {
        await executeMarketAction();
      }, 5000 + Math.random() * 5000); // Random interval between 5-10s
    } else {
      if (botInterval.current) clearInterval(botInterval.current);
      setStats(prev => ({ ...prev, status: 'idle' }));
    }

    return () => {
      if (botInterval.current) clearInterval(botInterval.current);
    };
  }, [isActive, isMaster, targetPrice, aggression]);

  const executeMarketAction = async () => {
    try {
      const marketRef = doc(db, 'market', 'sartircoin');
      
      // Decision logic: Influence the market to drift towards targetPrice
      // We need to know the current market state to decide
      // But for simplicity and to avoid over-fetching in the loop, 
      // we can use the marketState from a prop or just rely on a smarter probabilistic drift
      
      // Let's make it smarter: 
      // We'll fetch the current state for a precise action
      const snap = await getDoc(marketRef);
      if (!snap.exists()) return;
      
      const data = snap.data();
      const buyV = data.totalBuyVolume || 0;
      const sellV = data.totalSellVolume || 0;
      const buyC = data.totalBuyCount || 0;
      const sellC = data.totalSellCount || 0;
      
      const netVolume = buyV - sellV;
      const netCount = buyC - sellC;
      const volSensitivity = 0.005;
      const countSensitivity = 0.1;
      
      const currentPrice = Math.max(0.1, data.basePrice + (netVolume * volSensitivity) + (netCount * countSensitivity));
      const priceDiff = targetPrice - currentPrice;
      
      // If price is lower than target, bot should BUY (to push it up)
      // If price is higher than target, bot should SELL (to push it down)
      // Added some randomness so it's not perfectly robotic
      const bias = priceDiff > 0 ? 0.7 : 0.3; 
      const actionType = Math.random() < bias ? 'buy' : 'sell';
      const amount = Math.floor(Math.random() * (10 * aggression)) + 1;
      
      if (actionType === 'buy') {
        await updateDoc(marketRef, {
          totalBuyVolume: increment(amount),
          totalBuyCount: increment(1),
          updatedAt: serverTimestamp()
        });
        setStats(prev => ({
          ...prev,
          totalVolume: prev.totalVolume + amount,
          tradesCount: prev.tradesCount + 1,
          lastAction: `Bought ${amount} SART to maintain liquidity.`
        }));
      } else {
        await updateDoc(marketRef, {
          totalSellVolume: increment(amount),
          totalSellCount: increment(1),
          updatedAt: serverTimestamp()
        });
        setStats(prev => ({
          ...prev,
          totalVolume: prev.totalVolume + amount,
          tradesCount: prev.tradesCount + 1,
          lastAction: `Sold ${amount} SART to stabilize price.`
        }));
      }
    } catch (err) {
      console.error("Bot action failed:", err);
      setStats(prev => ({ ...prev, lastAction: 'Action failed: Connection error.' }));
    }
  };

  if (!isMaster) {
    return (
      <div className="p-8 rounded-[40px] bg-slate-900/50 border border-slate-800 border-dashed text-center">
        <Bot className="w-12 h-12 text-slate-700 mx-auto mb-4 opacity-50" />
        <h4 className="text-white font-bold mb-2 tracking-tight">Market Maker Bot</h4>
        <p className="text-xs text-slate-500 mb-6 max-w-[200px] mx-auto leading-relaxed">
          Unlock automated liquidity providing and price stabilization tools with a <span className="text-emerald-500 font-bold">Master Subscription</span>.
        </p>
        <button disabled className="w-full py-3 bg-slate-800 text-slate-600 rounded-2xl font-bold text-xs uppercase tracking-widest cursor-not-allowed">
          Subscription Required
        </button>
      </div>
    );
  }

  return (
    <div className={cn(
      "p-8 rounded-[40px] bg-slate-900 border transition-all duration-500 overflow-hidden relative",
      isActive ? "border-emerald-500 shadow-[0_0_50px_-12px_rgba(16,185,129,0.3)]" : "border-slate-800"
    )}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
      
      <div className="flex items-center justify-between mb-8 relative z-10">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-3 rounded-2xl transition-all",
            isActive ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 animate-pulse" : "bg-slate-800 text-slate-500"
          )}>
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-white font-bold tracking-tight">Market Maker Bot</h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-500" : "bg-slate-600")} />
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                {isActive ? 'Bot Running' : 'Standby Mode'}
              </span>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setIsActive(!isActive)}
          className={cn(
            "p-4 rounded-2xl transition-all active:scale-90 shadow-lg",
            isActive ? "bg-rose-500 text-white shadow-rose-500/20" : "bg-emerald-500 text-slate-950 shadow-emerald-500/20"
          )}
        >
          {isActive ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
        </button>
      </div>

      <div className="space-y-6 relative z-10">
        {/* Controls */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3 flex items-center gap-2">
              <Zap className="w-3 h-3" /> Aggression
            </p>
            <input 
              type="range" 
              min="0.1" 
              max="1" 
              step="0.1"
              value={aggression}
              onChange={(e) => setAggression(Number(e.target.value))}
              className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between mt-2">
              <span className="text-[8px] font-bold text-slate-600">QUIET</span>
              <span className="text-[8px] font-bold text-emerald-500">INTENSE</span>
            </div>
          </div>
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 flex items-center gap-2">
              <TrendingUp className="w-3 h-3" /> Target Price
            </p>
            <div className="flex items-center gap-2">
               <input 
                 type="number"
                 step="0.1"
                 value={targetPrice}
                 onChange={(e) => setTargetPrice(Number(e.target.value))}
                 className="bg-transparent border-none p-0 text-xl font-bold text-white w-full focus:ring-0 placeholder:text-slate-700"
               />
               <span className="text-[10px] text-slate-500 font-bold">BSD</span>
            </div>
          </div>
        </div>

        {/* Real-time Feed */}
        <div className="p-5 bg-slate-950 rounded-[28px] border border-slate-800 min-h-[100px] flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-3">
             <Activity className="w-3 h-3 text-emerald-500" />
             <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Live Operation Log</span>
          </div>
          <p className={cn(
            "text-xs font-medium leading-relaxed transition-colors",
            isActive ? "text-slate-300" : "text-slate-600"
          )}>
            {stats.lastAction}
          </p>
        </div>

        {/* Performance */}
        <div className="pt-4 border-t border-slate-800/50 grid grid-cols-2 gap-8">
           <div>
             <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-1">Bot Volume</p>
             <p className="text-lg font-bold text-white tracking-tight">{stats.totalVolume.toLocaleString()} <span className="text-[10px] text-slate-500">SART</span></p>
           </div>
           <div>
             <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-1">Executions</p>
             <p className="text-lg font-bold text-white tracking-tight">{stats.tradesCount.toLocaleString()}</p>
           </div>
        </div>
      </div>
    </div>
  );
}
