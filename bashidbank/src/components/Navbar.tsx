import React from 'react';
import { Landmark, LogOut, User as UserIcon, Globe, LayoutDashboard, Coins } from 'lucide-react';
import { auth, handleSignIn } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useFirebase } from '../context/FirebaseContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

export function Navbar({ currentView, onViewChange }: { currentView: string, onViewChange: (view: any) => void }) {
  const { user } = useFirebase();
  const { t, language, setLanguage } = useLanguage();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/50 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onViewChange('dashboard')}>
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-slate-950 text-xl shadow-lg shadow-emerald-500/20">
              B
            </div>
            <div className="flex flex-col">
              <span className="hidden sm:inline font-sans font-semibold text-xl tracking-tight text-white line-clamp-1 leading-none">BashidBank</span>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest opacity-80">Live</span>
              </div>
            </div>
          </div>

          {user && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => onViewChange('dashboard')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
                  currentView === 'dashboard' ? "bg-slate-800 text-emerald-400" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden md:inline">{t('yourCards')}</span>
              </button>
              <button 
                onClick={() => onViewChange('trading')}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
                  currentView === 'trading' ? "bg-slate-800 text-teal-400" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <Coins className="w-4 h-4" />
                <span className="hidden md:inline">{t('trading')}</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800">
            <button 
              onClick={() => setLanguage('en')}
              className={cn(
                "px-2 py-1 rounded-lg text-xs font-bold transition-all",
                language === 'en' ? "bg-emerald-500 text-slate-950 shadow-lg" : "text-slate-500 hover:text-slate-300"
              )}
            >
              EN
            </button>
            <button 
              onClick={() => setLanguage('ru')}
              className={cn(
                "px-2 py-1 rounded-lg text-xs font-bold transition-all",
                language === 'ru' ? "bg-emerald-500 text-slate-950 shadow-lg" : "text-slate-500 hover:text-slate-300"
              )}
            >
              RU
            </button>
          </div>

          {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-sm font-medium text-slate-100">{user.displayName}</span>
                <span className="text-[10px] text-slate-500 font-mono">{user.email}</span>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full border border-slate-800" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                  <UserIcon className="w-6 h-6 text-slate-400" />
                </div>
              )}
              <button 
                onClick={() => signOut(auth)}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-rose-400"
                title={t('logout')}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleSignIn()}
              className="bg-emerald-500 text-slate-950 px-6 py-2 rounded-xl font-bold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              {t('signIn')}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
