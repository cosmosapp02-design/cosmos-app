"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Key, X, CheckCircle2, ShieldCheck, Cpu, Server, Layers, Cloud } from "lucide-react";
import { useToast } from "./toast";

interface APIVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function APIVaultModal({ isOpen, onClose }: APIVaultModalProps) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [nvidiaNimKey, setNvidiaNimKey] = useState("");
  const [nvidiaNimUrl, setNvidiaNimUrl] = useState("https://integrate.api.nvidia.com/v1");
  const [vertexJson, setVertexJson] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [saved, setSaved] = useState(false);

  const { addToast } = useToast();

  if (!isOpen) return null;

  const handleSaveKeys = (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const ws = new WebSocket("ws://127.0.0.1:8080");
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "save_api_vault",
            keys: {
              openaiKey,
              openaiBaseUrl,
              anthropicKey,
              geminiKey,
              nvidiaNimKey,
              nvidiaNimUrl,
              vertexJson,
              ollamaUrl,
            },
          })
        );
        ws.close();
      };
    } catch (e) {}

    setSaved(true);
    addToast("BYOK Vault updated with OpenAI-Compatible, NVIDIA NIM & Vertex AI endpoints!", "success");
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
          className="w-full max-w-xl bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-7 shadow-2xl overflow-hidden relative select-none space-y-5 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-[#1E1F24] text-white flex items-center justify-center font-bold text-sm shadow-sm">
                <Key size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1E1F24]">Enterprise BYOK API Vault</h2>
                <p className="text-xs text-[#72737A]">Configure Custom Models, NVIDIA NIM, & Vertex AI</p>
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
                Encrypted locally in <code className="font-mono text-[#1E1F24] font-bold">~/.cosmos/vault.json</code>. Zero third-party telemetry.
              </span>
            </div>

            {/* OpenAI & OpenAI-Compatible Custom Endpoints */}
            <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] space-y-2.5">
              <div className="flex items-center gap-1.5 font-bold text-[#1E1F24] text-[11px]">
                <Layers size={13} />
                <span>OPENAI / OPENAI-COMPATIBLE CUSTOM ENDPOINT</span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">API KEY</label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-proj-... or custom provider key"
                  className="w-full px-3 py-1.5 rounded-xl border border-[rgba(0,0,0,0.12)] bg-white outline-none font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">CUSTOM BASE URL (Optional e.g. Together / Groq / vLLM)</label>
                <input
                  type="text"
                  value={openaiBaseUrl}
                  onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                  placeholder="https://api.together.xyz/v1 or http://localhost:8000/v1"
                  className="w-full px-3 py-1.5 rounded-xl border border-[rgba(0,0,0,0.12)] bg-white outline-none font-mono text-xs"
                />
              </div>
            </div>

            {/* NVIDIA NIM */}
            <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] space-y-2.5">
              <div className="flex items-center gap-1.5 font-bold text-[#1E1F24] text-[11px]">
                <Cpu size={13} />
                <span>NVIDIA NIM INFERENCE ENDPOINT</span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">NVIDIA NIM API KEY</label>
                <input
                  type="password"
                  value={nvidiaNimKey}
                  onChange={(e) => setNvidiaNimKey(e.target.value)}
                  placeholder="nvapi-..."
                  className="w-full px-3 py-1.5 rounded-xl border border-[rgba(0,0,0,0.12)] bg-white outline-none font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">NIM BASE ENDPOINT</label>
                <input
                  type="text"
                  value={nvidiaNimUrl}
                  onChange={(e) => setNvidiaNimUrl(e.target.value)}
                  placeholder="https://integrate.api.nvidia.com/v1"
                  className="w-full px-3 py-1.5 rounded-xl border border-[rgba(0,0,0,0.12)] bg-white outline-none font-mono text-xs"
                />
              </div>
            </div>

            {/* Google Cloud Vertex AI */}
            <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] space-y-2.5">
              <div className="flex items-center gap-1.5 font-bold text-[#1E1F24] text-[11px]">
                <Cloud size={13} />
                <span>GOOGLE CLOUD VERTEX AI CREDENTIALS</span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">SERVICE ACCOUNT JSON / OAUTH TOKEN</label>
                <textarea
                  rows={2}
                  value={vertexJson}
                  onChange={(e) => setVertexJson(e.target.value)}
                  placeholder='{"type": "service_account", "project_id": "my-gcp-project", ...}'
                  className="w-full px-3 py-1.5 rounded-xl border border-[rgba(0,0,0,0.12)] bg-white outline-none font-mono text-xs"
                />
              </div>
            </div>

            {/* Standard Keys */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">ANTHROPIC API KEY</label>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">GOOGLE GEMINI KEY</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] outline-none font-mono text-xs"
                />
              </div>
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
