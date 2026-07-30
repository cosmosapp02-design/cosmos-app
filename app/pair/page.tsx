"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";
import { CheckCircle2, Laptop, ArrowRight } from "lucide-react";
import AuthOnboardingModal from "../components/auth-onboarding-modal";

function PairPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code = searchParams.get("code");
  const { user, orgName } = useAuth();
  
  const [pairingStatus, setPairingStatus] = useState<"authenticating" | "ready" | "paired">("ready");
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const handleApprovePairing = useCallback(async () => {
    setPairingStatus("paired");

    try {
      const ws = new WebSocket("ws://127.0.0.1:8080");

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "approve_pairing",
            code,
            userId: user?.id,
            email: user?.email,
            orgName,
          })
        );
        ws.close();
      };
    } catch (err) {}

    // Instant redirect to workspace dashboard
    setTimeout(() => {
      window.location.href = "/";
    }, 600);
  }, [user, code, orgName]);

  useEffect(() => {
    if (!user) {
      setAuthModalOpen(true);
    } else {
      setAuthModalOpen(false);
    }
  }, [user]);

  const handleModalClose = () => {
    setAuthModalOpen(false);
    // Directly redirect to workspace
    window.location.href = "/";
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#FAF8F5] text-[#1E1F24] p-6 select-none">
      <div className="w-full max-w-md bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-8 shadow-xl text-center space-y-6">
        <img
          src="/logo.svg"
          alt="Cosmos AI Logo"
          className="w-14 h-14 rounded-2xl shadow-md mx-auto object-cover"
        />

        <div>
          <h1 className="text-xl font-bold text-[#1E1F24]">Pair Device with Cosmos AI</h1>
          <p className="text-xs text-[#72737A] mt-1">
            Authorizing local engine daemon on this computer
          </p>
        </div>

        {code && (
          <div className="px-4 py-2 rounded-xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] font-mono text-xs text-[#1E1F24]">
            Pairing Code: <span className="font-bold">{code}</span>
          </div>
        )}

        {pairingStatus === "paired" ? (
          <div className="py-4 space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-sm font-bold text-[#1E1F24]">Device Paired Successfully!</h3>
            <p className="text-xs text-[#72737A]">Opening workspace...</p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {user && (
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] text-left text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#878890]">Account:</span>
                  <span className="font-semibold text-[#1E1F24]">{user.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#878890]">Organization:</span>
                  <span className="font-semibold text-[#1E1F24]">{orgName}</span>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                handleApprovePairing();
                window.location.href = "/";
              }}
              className="w-full py-3 rounded-xl bg-[#1E1F24] text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-[#32333A] transition-all shadow-sm"
            >
              <span>{user ? "Open My Workspace" : "Sign In to Pair Device"}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      <AuthOnboardingModal
        isOpen={authModalOpen}
        onClose={handleModalClose}
        onAgentCreated={() => {
          handleApprovePairing();
        }}
      />
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center text-xs text-[#72737A]">Loading pairing session...</div>}>
      <PairPageContent />
    </Suspense>
  );
}
