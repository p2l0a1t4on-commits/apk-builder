import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, ArrowUpRight, ArrowDownLeft, Send, Wallet, CreditCard, History, Search, Landmark, Zap, Lock, Coins } from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import { useLanguage } from '../context/LanguageContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, increment, getDoc, getDocs, runTransaction } from 'firebase/firestore';
import { cn } from '../lib/utils';

export function Dashboard() {
  const { user, userAccount } = useFirebase();
  const { t } = useLanguage();
  const [cards, setCards] = useState<any[]>([]);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [isCardTransferOpen, setIsCardTransferOpen] = useState(false);
  const [cardTransferType, setCardTransferType] = useState<'to' | 'from'>('to');
  const [transferStatus, setTransferStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [cardStatus, setCardStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);

  const isMaster = userAccount?.subscriptionTier === 'master' && 
                 userAccount?.subscriptionExpiresAt && 
                 new Date(userAccount.subscriptionExpiresAt) > new Date();

  useEffect(() => {
    if (!user) {
      setCards([]);
      return;
    }

    // Clear previous state to prevent ghost data
    setCards([]);

    const qCards = query(
      collection(db, 'cards'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubCards = onSnapshot(qCards, (snapshot) => {
      setCards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cards'));

    return () => {
      unsubCards();
    };
  }, [user]);

  const handleCreateCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setCardStatus('loading');
    
    if (cards.length >= 3 && !isMaster) {
      setCardStatus('error');
      setErrorMessage(t('maxCardsReached') || 'Standard tier limited to 3 cards.');
      return;
    }

    const formData = new FormData(e.currentTarget);
    const cardName = formData.get('cardName') as string;
    const type = formData.get('type') as 'virtual' | 'physical';
    const pin = formData.get('pin') as string;

    try {
      const cardNumber = Array.from({ length: 4 }, () => Math.floor(1000 + Math.random() * 9000)).join(' ');
      const expiry = "12/28";
      const cvv = Math.floor(100 + Math.random() * 900).toString();

      await addDoc(collection(db, 'cards'), {
        userId: user.uid,
        cardName: cardName || (type === 'virtual' ? t('virtualCard') : t('physicalCard')),
        balance: 0,
        cardNumber,
        expiry,
        cvv,
        type,
        pin,
        status: 'active',
        createdAt: serverTimestamp()
      });

      setCardStatus('success');
      setTimeout(() => {
        setCardStatus('idle');
        setIsCardModalOpen(false);
      }, 1500);
    } catch (err) {
      setCardStatus('error');
      console.error(err);
    }
  };

  const handleTransfer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !userAccount) return;

    setTransferStatus('loading');
    const formData = new FormData(e.currentTarget);
    const targetEmail = formData.get('email') as string;
    const amount = Number(formData.get('amount'));
    const description = formData.get('description') as string;
    const fee = isMaster ? 0 : Math.round(amount * 0.03 * 100) / 100;
    const totalDeduction = amount + fee;

    if (amount <= 0 || totalDeduction > userAccount.balance) {
      setTransferStatus('error');
      setErrorMessage(t('errorAmount'));
      return;
    }

    try {
      // Find recipient by email
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', targetEmail));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        setTransferStatus('error');
        setErrorMessage(t('errorUserNotFound'));
        return;
      }

      const recipient = querySnap.docs[0].data();
      if (recipient.userId === user.uid) {
        setTransferStatus('error');
        setErrorMessage(t('errorSelfTransfer'));
        return;
      }

      const senderAccountRef = doc(db, 'accounts', user.uid);
      const recipientAccountRef = doc(db, 'accounts', recipient.userId);

      await runTransaction(db, async (transaction) => {
        const senderSnap = await transaction.get(senderAccountRef);
        if (!senderSnap.exists()) throw new Error("Sender account missing");
        
        const currentBalance = senderSnap.data().balance;
        if (currentBalance < totalDeduction) {
          throw new Error("Insufficient funds");
        }

        // 1. Create Transaction record
        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          fromUserId: user.uid,
          toUserId: recipient.userId,
          amount: amount,
          fee: fee,
          description: description || t('transfer'),
          timestamp: serverTimestamp(),
          type: 'transfer'
        });

        // 2. Update Sender Balance
        transaction.update(senderAccountRef, {
          balance: currentBalance - totalDeduction,
          updatedAt: serverTimestamp()
        });

        // 3. Update Receiver Balance
        transaction.update(recipientAccountRef, {
          balance: increment(amount),
          updatedAt: serverTimestamp()
        });
      });

      setTransferStatus('success');
      setTimeout(() => {
        setTransferStatus('idle');
        setIsTransferOpen(false);
      }, 2000);
    } catch (err: any) {
      setTransferStatus('error');
      if (err.message === "Insufficient funds") {
        setErrorMessage(t('insufficientFunds'));
      } else {
        setErrorMessage(t('errorGeneric'));
        console.error(err);
      }
    }
  };

  const handleCardTransfer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !userAccount || !selectedCard) return;

    setTransferStatus('loading');
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const inputPin = formData.get('pin') as string;

    if (amount <= 0) {
      setTransferStatus('error');
      setErrorMessage(t('errorAmount'));
      return;
    }

    if (inputPin !== selectedCard.pin) {
      setTransferStatus('error');
      setErrorMessage(t('invalidPin'));
      return;
    }

    if (cardTransferType === 'to' && amount > userAccount.balance) {
      setTransferStatus('error');
      setErrorMessage(t('insufficientFunds'));
      return;
    }

    if (cardTransferType === 'from' && amount > (selectedCard.balance || 0)) {
      setTransferStatus('error');
      setErrorMessage(t('insufficientFunds'));
      return;
    }

    try {
      const cardRef = doc(db, 'cards', selectedCard.id);
      const accountRef = doc(db, 'accounts', user.uid);

      if (cardTransferType === 'to') {
        // From Account to Card
        await updateDoc(accountRef, {
          balance: increment(-amount),
          updatedAt: serverTimestamp()
        });
        await updateDoc(cardRef, {
          balance: increment(amount)
        });
      } else {
        // From Card to Account
        await updateDoc(cardRef, {
          balance: increment(-amount)
        });
        await updateDoc(accountRef, {
          balance: increment(amount),
          updatedAt: serverTimestamp()
        });
      }

      // Record transaction
      await addDoc(collection(db, 'transactions'), {
        fromUserId: cardTransferType === 'to' ? user.uid : null,
        toUserId: cardTransferType === 'from' ? user.uid : null,
        fromCardId: cardTransferType === 'from' ? selectedCard.id : null,
        toCardId: cardTransferType === 'to' ? selectedCard.id : null,
        amount: amount,
        description: cardTransferType === 'to' ? `${t('transferToCard')} (${selectedCard.cardName})` : `${t('transferFromCard')} (${selectedCard.cardName})`,
        timestamp: serverTimestamp(),
        type: 'transfer'
      });

      setTransferStatus('success');
      setTimeout(() => {
        setTransferStatus('idle');
        setIsCardTransferOpen(false);
        setSelectedCard(null);
      }, 1500);
    } catch (err) {
      setTransferStatus('error');
      setErrorMessage(t('errorGeneric'));
      console.error(err);
    }
  };

  const handleUpgrade = async () => {
    if (!user || !userAccount || isUpgradeLoading) return;
    
    if (userAccount.balance < 100) {
      alert(t('notEnoughForSubscription'));
      return;
    }

    setIsUpgradeLoading(true);
    try {
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + 1);

      await updateDoc(doc(db, 'accounts', user.uid), {
        balance: increment(-100),
        subscriptionTier: 'master',
        subscriptionExpiresAt: expirationDate.toISOString(),
        updatedAt: serverTimestamp()
      });
      
      await addDoc(collection(db, 'transactions'), {
        fromUserId: user.uid,
        toUserId: null,
        amount: 100,
        description: t('upgradeToMaster'),
        timestamp: serverTimestamp(),
        type: 'subscription'
      });
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `accounts/${user.uid}`);
    } finally {
      setIsUpgradeLoading(false);
    }
  };

  return (
    <div className="pt-24 pb-20 px-4 max-w-7xl mx-auto bg-slate-950">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Balance Card */}
        <div className="lg:col-span-2 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 md:p-12 rounded-[40px] bg-gradient-to-br from-emerald-600 to-teal-800 text-white relative overflow-hidden shadow-2xl"
          >
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/10 rounded-full blur-3xl opacity-50" />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-12">
                <div>
                  <p className="text-emerald-100/80 text-sm font-medium mb-1 uppercase tracking-widest">{t('totalBalance')}</p>
                  <h2 className="text-5xl md:text-7xl font-display font-bold flex items-baseline gap-2">
                    {userAccount?.balance?.toLocaleString() || '0'} 
                    <span className="text-2xl font-light opacity-60">BSD</span>
                  </h2>
                </div>
                <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md">
                  <CreditCard className="w-8 h-8 text-white" />
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <button 
                  onClick={() => setIsTransferOpen(true)}
                  className="bg-white text-emerald-900 px-8 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-50 transition-all active:scale-95 shadow-lg"
                >
                  <Send className="w-5 h-5" />
                  {t('sendMoney')}
                </button>
                <button className="bg-white/20 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-white/30 transition-all active:scale-95 backdrop-blur-md border border-white/10">
                  <Plus className="w-5 h-5" />
                  {t('deposit')}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions / Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard icon={<Coins className="text-teal-400" />} label={t('sartirCoin')} value={`${(userAccount?.sartirCoinBalance || 0).toLocaleString()} SART`} bg="bg-slate-900" />
          </div>

          {/* Subscription Manager */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900 rounded-[40px] p-8 border border-slate-800 shadow-sm relative overflow-hidden group"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div className="flex items-center gap-5">
                <div className={cn(
                  "w-16 h-16 rounded-[24px] flex items-center justify-center transition-all",
                  isMaster ? "bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-500/20 rotate-3" : "bg-slate-800 text-slate-500"
                )}>
                  <Zap className={cn("w-8 h-8", isMaster && "fill-current")} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    {isMaster ? t('masterTier') : t('standardTier')}
                  </h3>
                  <p className="text-sm text-slate-500 font-medium">{t('subscriptionDesc')}</p>
                  {isMaster && (
                    <p className="text-[10px] uppercase font-bold text-emerald-500 mt-2 tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-md inline-block">
                      {t('activeUntil')}: {new Date(userAccount?.subscriptionExpiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              {!isMaster && (
                <button 
                  onClick={handleUpgrade}
                  disabled={isUpgradeLoading}
                  className="bg-emerald-500 text-slate-950 px-8 py-3 rounded-2xl font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/20 disabled:bg-slate-800 disabled:text-slate-600"
                >
                  {isUpgradeLoading ? t('processing') : `${t('upgrade')} (100 BSD)`}
                </button>
              )}
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.div>


        </div>

        {/* Sidebar / Profile Card */}
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2 px-2">
              <h3 className="text-lg font-bold text-white tracking-tight">{t('yourCards')}</h3>
              <button 
                onClick={() => setIsCardModalOpen(true)}
                className="text-emerald-400 text-xs font-bold bg-emerald-400/10 px-3 py-1 rounded-lg border border-emerald-500/20 hover:bg-emerald-400/20 transition-all"
              >
                + {t('issueCard')}
              </button>
            </div>

            {cards.length > 0 ? (
              <div className="space-y-4">
                {cards.map((card) => (
                  <div key={card.id} className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
                    <div className="flex justify-between items-start relative z-10 mb-4">
                      <div className="bg-slate-800/50 p-2 rounded-lg">
                        <CreditCard className={cn("w-5 h-5", card.type === 'virtual' ? "text-emerald-400" : "text-teal-400")} />
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-emerald-400/80 mb-1 tracking-widest">{t('cardBalance')}</p>
                        <h4 className="text-xl font-bold text-white tracking-tight">{(card.balance || 0).toLocaleString()} BSD</h4>
                      </div>
                    </div>

                    <div className="flex justify-between items-end mb-6 relative z-10">
                      <div>
                        <h4 className="text-[10px] font-bold text-white uppercase tracking-wider mb-1">{card.cardName}</h4>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest block">{card.type}</span>
                          {card.pin && <Lock className="w-2.5 h-2.5 text-emerald-500/60" />}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setSelectedCard(card);
                            setCardTransferType('to');
                            setIsCardTransferOpen(true);
                          }}
                          className="p-2 bg-slate-800 rounded-lg text-emerald-400 hover:bg-emerald-500 hover:text-slate-900 transition-all shadow-sm"
                          title={t('topUp')}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedCard(card);
                            setCardTransferType('from');
                            setIsCardTransferOpen(true);
                          }}
                          className="p-2 bg-slate-800 rounded-lg text-teal-400 hover:bg-teal-500 hover:text-slate-900 transition-all shadow-sm"
                          title={t('withdraw')}
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="relative z-10 pt-4 border-t border-slate-800/50">
                      <p className="text-sm text-white mb-2 tracking-[0.15em] font-mono">{card.cardNumber}</p>
                      <div className="flex justify-between items-end">
                        <p className="text-[10px] font-medium tracking-tight italic opacity-30">Bashid {card.type === 'virtual' ? t('cardAlpha') : t('cardSignature')}</p>
                        <p className="text-[10px] font-mono text-slate-600">{card.expiry}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div 
                onClick={() => setIsCardModalOpen(true)}
                className="bg-slate-900 border-2 border-slate-800 border-dashed rounded-[32px] p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-emerald-500/30 transition-all group"
              >
                <div className="bg-slate-800 p-3 rounded-2xl mb-3 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-slate-500 text-xs font-bold">{t('issueCard')}</p>
              </div>
            )}
          </div>



          <div className="bg-slate-900 rounded-[40px] p-8 border border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
            <h3 className="text-xl font-bold text-white mb-6 tracking-tight relative z-10">{t('profile')}</h3>
            <div className="flex flex-col items-center text-center relative z-10">
              <div className="w-24 h-24 rounded-[32px] bg-slate-800 mb-4 overflow-hidden border-4 border-slate-950 shadow-2xl">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Me" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Landmark className="w-12 h-12 m-auto text-slate-600 h-full" />
                )}
              </div>
              <h4 className="font-bold text-lg text-white tracking-tight">{user?.displayName}</h4>
              <p className="text-sm text-slate-500 mb-6 font-medium">{user?.email}</p>
              
              <div className="w-full pt-6 border-t border-slate-800 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-1">{t('status')}</p>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-lg border border-emerald-500/20">{t('verified')}</span>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold mb-1">{t('tier')}</p>
                  <span className="text-xs font-bold text-teal-400 bg-teal-400/10 px-3 py-1 rounded-lg border border-teal-500/20">{t('premium')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-[40px] p-8 text-white overflow-hidden relative border border-slate-800">
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-16 -mb-16" />
            <div className="relative z-10">
              <h4 className="font-bold mb-2 tracking-tight">{t('inviteFriends')}</h4>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed font-medium">{t('inviteDescription')}</p>
              <button className="w-full py-3 bg-emerald-500 text-slate-950 rounded-2xl font-bold text-sm hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/10">{t('getInviteLink')}</button>
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Modal */}
      <AnimatePresence>
        {isTransferOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTransferOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 w-full max-w-md rounded-[50px] p-10 relative z-10 shadow-2xl border border-slate-800"
            >
              <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">{t('sendBashids')}</h3>
              <p className="text-slate-500 mb-8 font-medium">{t('sendBashidsDesc')}</p>
              
              <form onSubmit={handleTransfer} className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 px-1">{t('recipientEmail')}</label>
                  <input 
                    name="email"
                    type="email" 
                    required
                    placeholder="name@example.com"
                    className="w-full px-6 py-4 bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-slate-100 placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 px-1">{t('amount')}</label>
                  <div className="relative">
                    <input 
                      name="amount"
                      type="number" 
                      required
                      min="1"
                      placeholder="0.00"
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val > 0) {
                          const fee = isMaster ? 0 : Math.round(val * 0.03 * 100) / 100;
                          const total = val + fee;
                          const feeElement = document.getElementById('transfer-fee-display');
                          if (feeElement) feeElement.innerText = `Fee: ${fee} BSD | Total: ${total} BSD`;
                        } else {
                          const feeElement = document.getElementById('transfer-fee-display');
                          if (feeElement) feeElement.innerText = '';
                        }
                      }}
                      className="w-full px-6 py-4 bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 font-mono text-lg transition-all text-slate-100 placeholder:text-slate-600"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-600">BSD</span>
                  </div>
                  <p id="transfer-fee-display" className="text-[10px] font-bold text-emerald-500 mt-2 px-1 tracking-wider h-4"></p>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 px-1">{t('description')}</label>
                  <input 
                    name="description"
                    type="text" 
                    placeholder={t('descriptionPlaceholder')}
                    className="w-full px-6 py-4 bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-slate-100 placeholder:text-slate-600"
                  />
                </div>

                {transferStatus === 'error' && (
                  <p className="text-rose-400 text-sm font-medium bg-rose-400/10 p-4 rounded-xl border border-rose-400/20">{errorMessage}</p>
                )}

                {transferStatus === 'success' && (
                  <p className="text-emerald-400 text-sm font-medium bg-emerald-400/10 p-4 rounded-xl border border-emerald-400/20">{t('transferSuccess')}</p>
                )}

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsTransferOpen(false)}
                    className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-bold hover:bg-slate-700 transition-all active:scale-95"
                    disabled={transferStatus === 'loading'}
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-emerald-500 text-slate-950 rounded-2xl font-bold hover:bg-emerald-400 transition-all active:scale-95 disabled:bg-slate-700 disabled:text-slate-500 shadow-lg shadow-emerald-500/10"
                    disabled={transferStatus === 'loading' || transferStatus === 'success'}
                  >
                    {transferStatus === 'loading' ? t('processing') : t('sendNow')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Card Modal */}
      <AnimatePresence>
        {isCardModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCardModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 w-full max-w-md rounded-[50px] p-10 relative z-10 shadow-2xl border border-slate-800"
            >
              <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">{t('issueCard')}</h3>
              <p className="text-slate-500 mb-8 font-medium">{t('issueCardDesc')}</p>
              
              <form onSubmit={handleCreateCard} className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 px-1">{t('cardName')}</label>
                  <input 
                    name="cardName"
                    type="text" 
                    placeholder={t('cardNamePlaceholder')}
                    className="w-full px-6 py-4 bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-slate-100 placeholder:text-slate-600"
                  />
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <label className="cursor-pointer group">
                      <input type="radio" name="type" value="virtual" defaultChecked className="hidden peer" />
                      <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 peer-checked:border-emerald-500 peer-checked:bg-emerald-500/5 transition-all text-center h-full flex flex-col items-center justify-center">
                        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 mb-3 group-hover:scale-110 transition-transform">
                          <Zap className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-white text-xs tracking-tight">{t('virtualCard')}</h4>
                      </div>
                    </label>

                    <label className="cursor-pointer group">
                      <input type="radio" name="type" value="physical" className="hidden peer" />
                      <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 peer-checked:border-teal-500 peer-checked:bg-teal-500/5 transition-all text-center h-full flex flex-col items-center justify-center">
                        <div className="w-10 h-10 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-500 mb-3 group-hover:scale-110 transition-transform">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <h4 className="font-bold text-white text-xs tracking-tight">{t('physicalCard')}</h4>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 px-1">{t('cardPin')}</label>
                  <p className="text-[10px] text-slate-600 mb-2 px-1">{t('cardPinDesc')}</p>
                  <input 
                    name="pin"
                    type="password" 
                    required
                    pattern="[0-9]{4}"
                    maxLength={4}
                    placeholder="****"
                    className="w-full px-6 py-4 bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 font-mono text-xl tracking-[0.5em] transition-all text-slate-100 placeholder:text-slate-600"
                  />
                </div>

                {cardStatus === 'loading' && (
                  <div className="flex items-center justify-center gap-3 text-emerald-400 font-bold">
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    {t('processing')}
                  </div>
                )}

                {cardStatus === 'success' && (
                  <div className="p-4 bg-emerald-400/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-center font-bold">
                    {t('cardSuccess')}
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsCardModalOpen(false)}
                    className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-bold hover:bg-slate-700 transition-all active:scale-95"
                    disabled={cardStatus === 'loading'}
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-emerald-500 text-slate-950 rounded-2xl font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/10"
                    disabled={cardStatus === 'loading' || cardStatus === 'success'}
                  >
                    {t('issueCard')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Card Transfer Modal */}
      <AnimatePresence>
        {isCardTransferOpen && selectedCard && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCardTransferOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 w-full max-w-md rounded-[50px] p-10 relative z-10 shadow-2xl border border-slate-800"
            >
              <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">
                {cardTransferType === 'to' ? t('transferToCard') : t('transferFromCard')}
              </h3>
              <p className="text-slate-500 mb-8 font-medium">
                {selectedCard.cardName} • {selectedCard.cardNumber}
              </p>
              
              <form onSubmit={handleCardTransfer} className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 px-1">{t('amount')}</label>
                  <div className="relative">
                    <input 
                      name="amount"
                      type="number" 
                      required
                      min="1"
                      placeholder="0.00"
                      className="w-full px-6 py-4 bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 font-mono text-lg transition-all text-slate-100 placeholder:text-slate-600"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-bold text-slate-600">BSD</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 px-1">{t('cardPin')}</label>
                  <input 
                    name="pin"
                    type="password" 
                    required
                    pattern="[0-9]{4}"
                    maxLength={4}
                    placeholder="****"
                    className="w-full px-6 py-4 bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 font-mono text-xl tracking-[0.5em] transition-all text-slate-100 placeholder:text-slate-600"
                  />
                </div>

                {transferStatus === 'error' && (
                  <p className="text-rose-400 text-sm font-medium bg-rose-400/10 p-4 rounded-xl border border-rose-400/20">{errorMessage}</p>
                )}

                {transferStatus === 'success' && (
                  <p className="text-emerald-400 text-sm font-medium bg-emerald-400/10 p-4 rounded-xl border border-emerald-400/20">{t('transferSuccess')}</p>
                )}

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsCardTransferOpen(false)}
                    className="flex-1 py-4 bg-slate-800 text-slate-400 rounded-2xl font-bold hover:bg-slate-700 transition-all active:scale-95"
                    disabled={transferStatus === 'loading'}
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-emerald-500 text-slate-950 rounded-2xl font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-emerald-500/10"
                    disabled={transferStatus === 'loading' || transferStatus === 'success'}
                  >
                    {transferStatus === 'loading' ? t('processing') : t('sendNow')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode, label: string, value: string, bg: string }) {
  return (
    <div className={cn("p-6 rounded-[32px] border border-slate-800 shadow-sm", bg)}>
      <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center mb-4 shadow-sm">
        {icon}
      </div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{label}</p>
      <p className="text-lg font-bold text-white tracking-tight">{value}</p>
    </div>
  );
}


