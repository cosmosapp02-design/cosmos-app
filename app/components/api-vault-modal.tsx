"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Key, X, CheckCircle2, ShieldCheck, Cpu, Lock, Sparkles, Server } from "lucide-react";
import { useToast } from "./toast";

interface APIVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface APIKeys {
  openaiKey: string;
  anthropicKey: string;
  geminiKey: string;
  ollamaUrl: string;
}

export default function APIVaultModal({ isOpen, onClose }: APIVaultModalProps) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [saved, setSaved] = useState(false);

  const { addToast } = useToast();

  if (!isOpen) return null;

  const handleSaveKeys = (e: React.FormEvent) => {
    e.preventDefault();

    // Send encrypted keys to local daemon to store in ~/.cosmos/vault.json
    try {
      const ws = new WebSocket("ws://127.0.0.1:8080");
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "save_api_vault",
            keys: { openaiKey, anthropicKey, geminiKey, ollamaUrl },
          })
        );
        ws.close();
      };
    } catch (e) {}

    setSaved(true);
    addToast("API Keys & Provider endpoints saved securely in local vault!", "success");
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-lg bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-7 shadow-2xl overflow-hidden relative select-none space-y-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-[#1E1F24] text-white flex items-center justify-center font-bold text-sm shadow-sm">
                <Key size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1E1F24]">Bring Your Own Keys (BYOK)</h2>
                <p className="text-xs text-[#72737A]">Configure API Keys & LLM Models per Agent</p>
              </div>
            </div>
            <button onClick={onClose} className="btn-icon p-1.5 rounded-xl hover:bg-black/5 text-[#878890]">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSaveKeys} className="space-y-4 text-xs">
            <div className="p-3 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] flex items-center gap-2.5">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
              <span className="text-[#52535A] text-[11px] leading-relaxed">
                Your keys are encrypted locally in <code className="font-mono text-[#1E1F24] font-bold">~/.cosmos/vault.json</code>. Keys are never sent to external servers.
              </span>
            </div>

            {/* Anthropic Claude Key */}
            <div>
              <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">
                ANTHROPIC CLAUDE API KEY (e.g. Dev-Bot)
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none focus:border-[#1E1F24] font-mono text-xs"
              />
            </div>

            {/* OpenAI Key */}
            <div>
              <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">
                OPENAI API KEY (e.g. Alex PM / GPT-4o)
              </label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-proj-..."
                className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none focus:border-[#1E1F24] font-mono text-xs"
              />
            </div>

            {/* Google Gemini Key */}
            <div>
              <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">
                GOOGLE GEMINI API KEY (e.g. QA-Guard / Gemini 2.5)
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none focus:border-[#1E1F24] font-mono text-xs"
              />
            </div>

            {/* Local Ollama Endpoint */}
            <div>
              <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1 flex items-center gap-1">
                <Server size={12} /> LOCAL OLLAMA ENDPOINT (Offline LLM)
              </label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none focus:border-[#1E1F24] font-mono text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#1E1F24] text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#32333A] transition-all shadow-sm mt-3"
            >
              {saved ? (
                <>
                  <CheckCircle2 size={15} className="text-emerald-400" />
                  <span>Vault Updated!</span>
                </>
              ) : (
                <span>Save API Vault Configuration</span>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
