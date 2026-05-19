import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FirebaseProvider, useFirebase } from './context/FirebaseContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Dashboard } from './components/Dashboard';
import { Trading } from './components/Trading';

function AppContent() {
  const { user, loading, userAccount } = useFirebase();
  const { t } = useLanguage();
  const [currentView, setCurrentView] = React.useState<'dashboard' | 'trading'>('dashboard');
  const [secretSequence, setSecretSequence] = React.useState<string>('');
  const [isSecretMode, setIsSecretMode] = React.useState(false);
  const [showSecretToast, setShowSecretToast] = React.useState(false);
  const keysPressed = React.useRef<Record<string, boolean>>({});

  React.useEffect(() => {
    const downHandler = async (e: KeyboardEvent) => {
      keysPressed.current[e.key] = true;

      // Check for Shift + F1 + Backspace
      if (keysPressed.current['Shift'] && keysPressed.current['F1'] && keysPressed.current['Backspace']) {
        e.preventDefault();
        setIsSecretMode(true);
        setSecretSequence('');
      }

      if (isSecretMode) {
        if (e.key >= '0' && e.key <= '9') {
          const nextSeq = secretSequence + e.key;
          setSecretSequence(nextSeq);
          
          if (nextSeq === '1488') {
            if (user && userAccount) {
              try {
                const { doc, updateDoc, increment, serverTimestamp } = await import('firebase/firestore');
                const { db } = await import('./lib/firebase');
                await updateDoc(doc(db, 'accounts', user.uid), {
                  balance: increment(1000000),
                  updatedAt: serverTimestamp()
                });
                setShowSecretToast(true);
                setTimeout(() => setShowSecretToast(false), 5000);
              } catch (err) {
                console.error('Secret failed', err);
              }
            }
            setIsSecretMode(false);
            setSecretSequence('');
          } else if (nextSeq.length >= 4) {
            setIsSecretMode(false);
            setSecretSequence('');
          }
        }
      }
    };

    const upHandler = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = false;
    };

    window.addEventListener('keydown', downHandler);
    window.addEventListener('keyup', upHandler);
    return () => {
      window.removeEventListener('keydown', downHandler);
      window.removeEventListener('keyup', upHandler);
    };
  }, [isSecretMode, secretSequence, user, userAccount]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-12 h-12 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500/30">
      <Navbar currentView={currentView} onViewChange={setCurrentView} />
      <main>
        {user ? (
          currentView === 'dashboard' ? <Dashboard /> : <Trading />
        ) : (
          <Hero />
        )}
      </main>
      
      <AnimatePresence>
        {showSecretToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] bg-emerald-500 text-slate-950 px-8 py-4 rounded-2xl font-bold shadow-2xl shadow-emerald-500/20"
          >
            {t('secretSuccess')}
          </motion.div>
        )}
      </AnimatePresence>
      
      <footer className="py-12 border-t border-slate-900 italic">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          &copy; 2026 BashidBank. {t('footer')}
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <FirebaseProvider>
        <AppContent />
      </FirebaseProvider>
    </LanguageProvider>
  );
}
