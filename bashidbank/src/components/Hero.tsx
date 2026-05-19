import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Landmark, ArrowRight, Shield, Zap, Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { AuthModal } from './AuthModal';

export function Hero() {
  const { t } = useLanguage();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="pt-32 pb-20 px-4 bg-slate-950">
      <div className="max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-emerald-400 text-sm font-medium mb-8 border border-slate-800"
        >
          <Zap className="w-4 h-4 text-emerald-500 fill-emerald-500" />
          {t('future')}
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-6xl md:text-8xl font-display font-bold tracking-tight text-white mb-8"
        >
          {t('welcome').split(',').map((part, i) => (
            <span key={i}>
              {part}{i === 0 ? ',' : ''}
              {i === 0 && <br />}
            </span>
          ))}
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="max-w-2xl mx-auto text-xl text-slate-400 mb-12"
        >
          {t('subtitle')}
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="group relative bg-emerald-500 text-slate-950 px-8 py-4 rounded-2xl text-lg font-bold hover:bg-emerald-400 transition-all flex items-center gap-3 mx-auto shadow-2xl shadow-emerald-500/20 hover:-translate-y-1"
          >
            {t('openAccount')}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>

        <AuthModal 
          isOpen={isAuthModalOpen} 
          onClose={() => setIsAuthModalOpen(false)} 
        />

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-12 text-left">
          <FeatureCard 
            icon={<Shield className="w-6 h-6 text-emerald-400" />}
            title="Iron Security"
            description="Multi-layer encryption and real-time monitoring keep your Bashids safe."
            delay={0.6}
          />
          <FeatureCard 
            icon={<Globe className="w-6 h-6 text-emerald-400" />}
            title="Borderless Transactions"
            description="Send BSD anywhere in the world instantly with zero fees."
            delay={0.7}
          />
          <FeatureCard 
            icon={<Zap className="w-6 h-6 text-emerald-400" />}
            title="Real-time Analytics"
            description="Track your spending and income with intelligent Bashid insights."
            delay={0.8}
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      className="p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-sm hover:shadow-emerald-500/5 transition-shadow"
    >
      <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-6">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-3 tracking-tight">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </motion.div>
  );
}
