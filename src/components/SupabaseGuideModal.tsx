import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Database,
  Key,
  AlertCircle,
  Trash2,
  Sparkles,
} from 'lucide-react';
import {
  SUPABASE_SETUP_SQL,
  SUPABASE_DELETE_PREVIOUS_SQL,
  SUPABASE_MIGRATION_SQL,
} from '../lib/supabaseSql';
import {
  getSavedCredentials,
  saveSupabaseCredentials,
  testSupabaseConnection,
  clearSupabaseCredentials,
  DatabaseVerificationReport,
  isLikelyApiKey,
} from '../lib/supabase';

interface SupabaseGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectionSuccess: () => void;
}

export const SupabaseGuideModal: React.FC<SupabaseGuideModalProps> = ({
  isOpen,
  onClose,
  onConnectionSuccess,
}) => {
  const saved = getSavedCredentials();
  const [url, setUrl] = useState(saved.url || '');
  const [anonKey, setAnonKey] = useState(saved.anonKey || '');
  const [copiedType, setCopiedType] = useState<'migration' | 'setup' | 'delete' | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<DatabaseVerificationReport | null>(null);
  const [activeTab, setActiveTab] = useState<'guide' | 'sql' | 'connect'>('sql');
  const [sqlMode, setSqlMode] = useState<'migration' | 'setup' | 'delete'>('migration');

  if (!isOpen) return null;

  const handleCopySql = (type: 'migration' | 'setup' | 'delete') => {
    let textToCopy = SUPABASE_MIGRATION_SQL;
    if (type === 'setup') textToCopy = SUPABASE_SETUP_SQL;
    if (type === 'delete') textToCopy = SUPABASE_DELETE_PREVIOUS_SQL;

    navigator.clipboard.writeText(textToCopy);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (isLikelyApiKey(cleanUrl)) {
      setAnonKey(cleanUrl);
      setUrl('');
      setTestResult({
        success: false,
        message: 'Publishable key detected and moved to Anon Key! Now enter your Project URL (https://your-ref.supabase.co).',
      });
      return;
    }

    if (!cleanUrl || !anonKey) {
      setTestResult({
        success: false,
        message: 'Please enter both Supabase URL (https://your-ref.supabase.co) and anon public key.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const result = await testSupabaseConnection(cleanUrl, anonKey);
    setIsTesting(false);
    setTestResult(result);

    if (result.success) {
      saveSupabaseCredentials(cleanUrl, anonKey);
      onConnectionSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl max-h-[92vh] rounded-[32px] bg-white border border-slate-100 shadow-2xl flex flex-col overflow-hidden text-slate-800">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#ff3b69] to-[#fb7185] p-[1.5px] shadow-sm flex items-center justify-center text-white">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-slate-900">
                Supabase SQL Scripts & Setup
              </h2>
              <p className="text-xs text-slate-500">Database Schema, Reset & Setup</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-100 bg-slate-50/60 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('sql')}
            className={`pb-2 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'sql'
                ? 'border-[#ff3b69] text-[#ff3b69] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>SQL Scripts</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 text-[#ff3b69] font-bold">
              Updated
            </span>
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`pb-2 px-3 border-b-2 transition-all ${
              activeTab === 'guide'
                ? 'border-[#ff3b69] text-[#ff3b69] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Step-by-Step Guide
          </button>

          <button
            onClick={() => setActiveTab('connect')}
            className={`pb-2 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'connect'
                ? 'border-[#ff3b69] text-[#ff3b69] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Connect App
            {saved.url && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: SQL SCRIPTS */}
          {activeTab === 'sql' && (
            <div className="space-y-3.5">
              {/* Script Type Toggle Buttons */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setSqlMode('migration')}
                  className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1 text-center truncate ${
                    sqlMode === 'migration'
                      ? 'bg-white text-emerald-700 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">Safe Migration</span>
                </button>

                <button
                  onClick={() => setSqlMode('setup')}
                  className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1 text-center truncate ${
                    sqlMode === 'setup'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#ff3b69] shrink-0" />
                  <span className="truncate">Fresh Setup</span>
                </button>

                <button
                  onClick={() => setSqlMode('delete')}
                  className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1 text-center truncate ${
                    sqlMode === 'delete'
                      ? 'bg-white text-rose-600 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="truncate">Wipe Tables</span>
                </button>
              </div>

              {/* Action Header */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div>
                  <h3 className="font-display font-bold text-xs sm:text-sm text-slate-900">
                    {sqlMode === 'migration'
                      ? 'Safe Migration (No Data Loss)'
                      : sqlMode === 'setup'
                      ? 'Complete Clean Production Setup'
                      : 'Delete Previous Tables Script'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {sqlMode === 'migration'
                      ? 'Adds bio column, unique index, and username constraints without touching existing data.'
                      : sqlMode === 'setup'
                      ? 'Recreates complete schema with profiles, messages, E2EE keys, and RLS.'
                      : 'Safely drops messages, conversations, and profile tables in order.'}
                  </p>
                </div>

                <button
                  onClick={() => handleCopySql(sqlMode)}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#ff3b69] to-[#fb7185] hover:opacity-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-pink-500/20 transition-all active:scale-95 shrink-0"
                >
                  {copiedType === sqlMode ? (
                    <Check className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedType === sqlMode ? 'Copied!' : 'Copy Script'}</span>
                </button>
              </div>

              {/* SQL Display Box */}
              <pre className="p-3.5 rounded-2xl bg-slate-900 text-slate-200 text-[11px] font-mono overflow-x-auto max-h-[340px] scrollbar-thin border border-slate-800">
                {sqlMode === 'migration'
                  ? SUPABASE_MIGRATION_SQL
                  : sqlMode === 'setup'
                  ? SUPABASE_SETUP_SQL
                  : SUPABASE_DELETE_PREVIOUS_SQL}
              </pre>

              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#ff3b69] shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <strong>How to run in Supabase:</strong> Open your Supabase project dashboard → Click <strong>SQL Editor</strong> on the left → Click <strong>New query</strong> → Paste this script → Click <strong>Run</strong>.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STEP-BY-STEP GUIDE */}
          {activeTab === 'guide' && (
            <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">
                    1. Create Free Supabase Project
                  </span>
                  <a
                    href="https://supabase.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#ff3b69] hover:underline font-semibold"
                  >
                    supabase.com <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p>Go to supabase.com and create a new free project in your preferred cloud region.</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                <span className="font-bold text-slate-900 text-sm">
                  2. Delete Previous SQL / Run Fresh Setup
                </span>
                <p>
                  1. In your Supabase Dashboard, click <strong>SQL Editor</strong> on the left sidebar.
                </p>
                <p>
                  2. Click <strong>New query</strong>.
                </p>
                <p>
                  3. Switch to the <strong>SQL Scripts</strong> tab above, click <strong>Copy Script</strong>, paste into the editor, and click <strong>Run</strong>!
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                <span className="font-bold text-slate-900 text-sm">
                  3. Connect Your App Credentials
                </span>
                <p>
                  In Supabase, go to <strong>Project Settings</strong> → <strong>API</strong>. Copy your <strong>Project URL</strong> and <strong>Anon Public Key</strong>, then paste them into the "Connect App" tab.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: CONNECT CREDENTIALS */}
          {activeTab === 'connect' && (
            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Supabase Project URL
                </label>
                <div className="relative">
                  <Database className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (isLikelyApiKey(val)) {
                        setAnonKey(val);
                        setUrl('');
                        setTestResult({
                          success: false,
                          message: 'Publishable key detected and moved to Anon Key! Now enter your Project URL.',
                        });
                      } else {
                        setUrl(e.target.value);
                      }
                    }}
                    placeholder="https://xyzcompany.supabase.co"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#ff3b69] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Supabase Anon Public Key
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#ff3b69] focus:bg-white"
                  />
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {testResult.success ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isTesting}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#ff3b69] to-[#fb7185] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm hover:opacity-95 active:scale-95 transition-all disabled:opacity-60"
              >
                <span>{isTesting ? 'Verifying...' : 'Save & Test Connection'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
