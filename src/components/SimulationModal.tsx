import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FlaskConical } from 'lucide-react';

export const SimulationModal = ({ isOpen, onClose, title, description, simulationUrl }: { isOpen: boolean, onClose: () => void, title: string, description: string, simulationUrl: string }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        >
          <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-600/10 rounded-2xl flex items-center justify-center text-red-600">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{title}</h3>
                <p className="text-sm text-slate-400 font-medium">{description}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-3 hover:bg-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          
          <div className="flex-1 bg-slate-950 relative min-h-[500px]">
            <iframe 
              src={simulationUrl} 
              className="absolute inset-0 w-full h-full border-none"
              title={title}
              allowFullScreen
            />
          </div>
          
          <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-between items-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nguồn: PhET Interactive Simulations | University of Colorado Boulder</p>
            <button 
              onClick={onClose}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-600/20"
            >
              Đóng mô phỏng
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export default SimulationModal;
