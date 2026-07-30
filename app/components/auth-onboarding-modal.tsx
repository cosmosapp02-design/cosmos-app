"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";
import { Bot, Sparkles, Building2, UserPlus, ArrowRight, CheckCircle2, Lock, Mail, Key, X } from "lucide-react";
import { useToast } from "./toast";

interface AuthOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentCreated: (agent: any) => void;
}

export default function AuthOnboardingModal({ isOpen, onClose, onAgentCreated }: AuthOnboardingModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Auth/Org, 2: First Agent, 3: Success
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgNameInput, setOrgNameInput] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentRole, setAgentRole] = useState("");
  const [agentPurpose, setAgentPurpose] = useState("");
  const [loading, setLoading] = useState(false);

  const { setOrgName } = useAuth();
  const { addToast } = useToast();

  if (!isOpen) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;
        addToast("Account created successfully! Let's build your organization.", "success");
        if (orgNameInput) setOrgName(orgNameInput);
        setStep(2); // Proceed to Create First Agent step
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        addToast("Welcome back to Cosmos AI!", "success");
        onClose();
      }
    } catch (err: any) {
      addToast(err.message || "Authentication failed.", "danger");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFirstAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName || !agentRole) {
      addToast("Please provide an Agent Name and Role.", "danger");
      return;
    }

    setLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      const newAgent = {
        name: agentName,
        role: agentRole,
        purpose: agentPurpose || "General AI worker & assistant",
        skills: ["TypeScript", "API Integration", "PRDs"],
        avatar_color: "#1E1F24",
        user_id: userId,
      };

      const { data, error } = await supabase.from("agents").insert([newAgent]).select();

      if (error) throw error;

      addToast(`First AI Employee "${agentName}" created!`, "success");
      if (data && data[0]) {
        onAgentCreated(data[0]);
      }
      setStep(3);
    } catch (err: any) {
      addToast(err.message || "Failed to create agent.", "danger");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-7 shadow-2xl overflow-hidden relative select-none"
        >
          {/* Top Brand Header with Top-Right Close Button */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-[#1E1F24] text-white flex items-center justify-center font-bold text-sm shadow-sm">
                C
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#1E1F24]">Cosmos AI Platform</h2>
                <p className="text-[11px] text-[#72737A]">Build & Manage Your AI Organization</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="btn-icon p-1.5 rounded-xl hover:bg-black/5 text-[#878890] hover:text-[#1E1F24] transition-colors"
              title="Close modal"
            >
              <X size={16} />
            </button>
          </div>

          {/* STEP 1: AUTH & ORG NAME */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex bg-[#FAF8F5] p-1 rounded-xl border border-[rgba(0,0,0,0.08)]">
                <button
                  onClick={() => setMode("signup")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    mode === "signup" ? "bg-white text-[#1E1F24] shadow-2xs" : "text-[#72737A]"
                  }`}
                >
                  Create AI Company
                </button>
                <button
                  onClick={() => setMode("signin")}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    mode === "signin" ? "bg-white text-[#1E1F24] shadow-2xs" : "text-[#72737A]"
                  }`}
                >
                  Sign In
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {mode === "signup" && (
                  <div>
                    <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">
                      COMPANY / ORG NAME
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5]">
                      <Building2 size={15} className="text-[#878890]" />
                      <input
                        type="text"
                        value={orgNameInput}
                        onChange={(e) => setOrgNameInput(e.target.value)}
                        placeholder="e.g. Acme AI Technologies"
                        required
                        className="bg-transparent outline-none w-full text-xs text-[#1E1F24] placeholder-[#878890]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">EMAIL ADDRESS</label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5]">
                    <Mail size={15} className="text-[#878890]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@company.com"
                      required
                      className="bg-transparent outline-none w-full text-xs text-[#1E1F24] placeholder-[#878890]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">PASSWORD</label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5]">
                    <Key size={15} className="text-[#878890]" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      minLength={6}
                      className="bg-transparent outline-none w-full text-xs text-[#1E1F24] placeholder-[#878890]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-[#1E1F24] text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#32333A] transition-all shadow-sm"
                >
                  {loading ? (
                    "Processing..."
                  ) : mode === "signup" ? (
                    <>
                      <span>Next: Develop First Agent</span>
                      <ArrowRight size={14} />
                    </>
                  ) : (
                    "Sign In to Organization"
                  )}
                </button>
              </form>
            </div>
          )}

          {/* STEP 2: BUILD FIRST AGENT */}
          {step === 2 && (
            <form onSubmit={handleCreateFirstAgent} className="space-y-4">
              <div className="p-3 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] flex items-center gap-3">
                <Sparkles size={18} className="text-amber-600 shrink-0" />
                <p className="text-xs text-[#52535A] leading-snug">
                  Your organization starts with <strong>0 default agents</strong>. Create your first AI employee below!
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">AGENT NAME</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5]">
                  <Bot size={15} className="text-[#878890]" />
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. Dev-Bot or Nova-Coder"
                    required
                    className="bg-transparent outline-none w-full text-xs text-[#1E1F24] placeholder-[#878890]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">ROLE & TITLE</label>
                <input
                  type="text"
                  value={agentRole}
                  onChange={(e) => setAgentRole(e.target.value)}
                  placeholder="e.g. Senior Full-Stack Engineer"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] text-xs outline-none focus:border-[#1E1F24]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">
                  PURPOSE & SOUL.MD PROMPT
                </label>
                <textarea
                  rows={3}
                  value={agentPurpose}
                  onChange={(e) => setAgentPurpose(e.target.value)}
                  placeholder="Describe your agent's identity, responsibilities, and system prompts..."
                  className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] text-xs outline-none focus:border-[#1E1F24]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#1E1F24] text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#32333A] transition-all shadow-sm"
              >
                {loading ? "Creating Agent..." : "Create Employee & Launch Org"}
              </button>
            </form>
          )}

          {/* STEP 3: SUCCESS */}
          {step === 3 && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1E1F24]">Organization Launched!</h3>
                <p className="text-xs text-[#52535A] mt-1">
                  Your private AI company workspace is initialized with <strong>{agentName}</strong>.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[#1E1F24] text-white text-xs font-semibold hover:bg-[#32333A] transition-all"
              >
                Open My Workspace
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
