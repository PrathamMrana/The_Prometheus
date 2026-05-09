import React from 'react';
import { Settings as SettingsIcon, Shield, Bell, Database, Globe, Cpu } from 'lucide-react';
import { motion } from 'framer-motion';

const Settings = () => {
    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-4xl space-y-8"
        >
            <div>
                <h1 className="text-2xl font-syne font-black text-white tracking-widest uppercase">System Settings</h1>
                <p className="text-[10px] font-mono text-muted tracking-widest uppercase mt-1">Terminal Configuration // CORE_v6.8</p>
            </div>

            <div className="space-y-4">
                {[
                    { label: 'Network & Connectivity', desc: 'Manage WebSocket endpoints and pooling frequencies.', icon: Globe },
                    { label: 'Security & Keys', desc: 'Manage API credentials and execution encryption.', icon: Shield },
                    { label: 'Notification Hub', desc: 'Configure execution alerts and system health toasts.', icon: Bell },
                    { label: 'Data Management', desc: 'Clear local cache and re-sync historical buffers.', icon: Database },
                    { label: 'Intelligence Core', desc: 'Adjust ML model sensitivity and factor weighting.', icon: Cpu },
                ].map((item, i) => (
                    <div key={i} className="glass p-6 rounded-sm border border-white/5 flex items-center justify-between group cursor-pointer hover:bg-white/[0.02] transition-all">
                        <div className="flex items-center gap-6">
                            <div className="p-3 bg-white/5 rounded-sm group-hover:bg-gold/10 transition-colors">
                                <item.icon size={18} className="text-muted group-hover:text-gold" />
                            </div>
                            <div>
                                <div className="text-xs font-syne font-black text-white uppercase tracking-widest">{item.label}</div>
                                <div className="text-[10px] font-mono text-muted mt-1 uppercase tracking-tight">{item.desc}</div>
                            </div>
                        </div>
                        <div className="text-[8px] font-mono text-gold opacity-0 group-hover:opacity-100 uppercase tracking-widest">Configure →</div>
                    </div>
                ))}
            </div>

            <div className="pt-8 border-t border-white/5">
                <div className="flex justify-between items-center text-[9px] font-mono text-muted tracking-widest uppercase">
                    <span>BUILD VERSION: 6.8.0-STABLE</span>
                    <span>LAST SYNC: {new Date().toLocaleTimeString()}</span>
                </div>
            </div>
        </motion.div>
    );
};

export default Settings;
