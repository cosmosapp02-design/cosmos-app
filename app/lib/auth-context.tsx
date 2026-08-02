"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "./supabase";
import { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  orgName: string;
  orgId: string | null;
  loading: boolean;
  setOrgName: (name: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  orgName: "My AI Organization",
  orgId: null,
  loading: true,
  setOrgName: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [orgName, setOrgName] = useState<string>("Cosmos Enterprise Platform");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  /** Resolve org_id for the authenticated user from org_members */
  const resolveOrgId = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("org_members")
        .select("org_id, organizations(name)")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (data?.org_id) {
        setOrgId(data.org_id);
        const orgNameFromDB = (data as any)?.organizations?.name;
        if (orgNameFromDB) setOrgName(orgNameFromDB);
      }
    } catch {
      // Not a member of any org yet — will be created on first Hire
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) resolveOrgId(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        resolveOrgId(session.user.id);
      } else {
        setOrgId(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, orgName, orgId, loading, setOrgName, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
