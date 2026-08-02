"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Hash, Plus, Sparkles, MessageSquare, AlertTriangle,
  ShieldAlert, X, WifiOff, Wifi, ChevronRight, Maximize2, Minimize2,
  MessageCircle, ArrowLeft, CornerDownRight, Cpu, Users, Play
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import FormattedMessage from "./formatted-message";
import { useToast } from "./toast";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  sender: string;
  role: string;
  text: string;
  time: string;
  isStreaming?: boolean;
  isSystem?: boolean;
  isAgent?: boolean;
  thread_id?: string;
}

export interface Thread {
  id: string;
  channel_id: string;
  title: string;
  reply_count: number;
  last_activity_at: string;
  created_at: string;
  total_tokens?: number;
  primary_model?: string;
  last_duration_ms?: number;
}

export interface ChannelItem {
  id: string;
  name: string;
  type: "group" | "dm";
  topic?: string;
  agents: string[];
  unread: number;
  isDeactivated?: boolean;
}

export interface AgentWorker {
  agent_profile: string;
  status: "online" | "offline" | "busy";
  last_seen_at: string;
  seconds_ago: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toProfileSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/-agent$/, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function isProfileOnline(profile: string, workers: Record<string, AgentWorker>): boolean {
  const w = workers[profile];
  return !!w && w.status === "online";
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function PresenceDot({ online, size = 8 }: { online: boolean; size?: number }) {
  return (
    <span
      title={online ? "Online" : "Offline"}
      style={{ width: size, height: size }}
      className={`rounded-full shrink-0 inline-block ring-2 ring-white ${
        online ? "bg-emerald-500" : "bg-[#C4C5CC]"
      }`}
    />
  );
}

// ─── Known org members registry (for @mention highlighting) ──────────────────

const KNOWN_ORG_MEMBERS: Record<string, { displayName: string; color: string }> = {
  "@zach_adams":  { displayName: "Zach Adams",  color: "#818cf8" },
  "@zach":        { displayName: "Zach Adams",  color: "#818cf8" },
  "@zachadams":   { displayName: "Zach Adams",  color: "#818cf8" },
  "@sara_pate":   { displayName: "Sara Pate",   color: "#f472b6" },
  "@sara":        { displayName: "Sara Pate",   color: "#f472b6" },
  "@sarapate":    { displayName: "Sara Pate",   color: "#f472b6" },
  "@peter":       { displayName: "Peter",       color: "#34d399" },
  "@zara":        { displayName: "Zara",        color: "#fb923c" },
};

/** Renders a message string with valid @mentions highlighted, unknown ones plain */
function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[\w_]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        const key = part.toLowerCase().replace(/_/g, "_");
        const match = KNOWN_ORG_MEMBERS[key];
        if (match) {
          return (
            <span
              key={i}
              title={match.displayName}
              style={{
                color: match.color,
                fontWeight: 600,
                background: match.color + "22",
                borderRadius: 4,
                padding: "0 3px",
              }}
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ─── SSE stream consumer ──────────────────────────────────────────────────────

async function consumeSSEStream(
  res: Response,
  onDelta: (text: string) => void,
  onComplete: (full: string) => void
) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (trimmed === "data: [DONE]") break;
      if (trimmed.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(trimmed.substring(6));
          const delta =
            parsed.choices?.[0]?.delta?.content ||
            parsed.choices?.[0]?.text || "";
          if (delta) {
            accumulated += delta;
            onDelta(accumulated);
          }
        } catch {}
      }
    }
  }
  onComplete(accumulated);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardView() {
  const { user, orgName, orgId } = useAuth();

  // Channel state
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Thread state
  const [threads, setThreads] = useState<Record<string, Thread[]>>({}); // keyed by channel_id
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [threadMessages, setThreadMessages] = useState<Record<string, Message[]>>({}); // keyed by thread_id
  const [threadPanelExpanded, setThreadPanelExpanded] = useState(false);

  // Input state
  const [channelInput, setChannelInput] = useState(""); // new thread from channel
  const [threadInput, setThreadInput] = useState("");   // reply in thread
  const [isTyping, setIsTyping] = useState(false);

  // Presence & Agents metadata
  const [workers, setWorkers] = useState<Record<string, AgentWorker>>({});
  const [presenceReady, setPresenceReady] = useState(false);
  const [agentsMap, setAgentsMap] = useState<Record<string, { name: string; role: string; purpose: string; primary_model?: string }>>({});

  // Multi-agent approval
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [agentTurnCount, setAgentTurnCount] = useState(0);

  // Channel create modal
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelTopic, setNewChannelTopic] = useState("");

  // Autonomous Meeting Launcher Modal State
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingGoal, setMeetingGoal] = useState("");
  const [meetingStarting, setMeetingStarting] = useState(false);

  const handleStartAutonomousMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingGoal.trim() || meetingStarting) return;
    setMeetingStarting(true);

    const goalText = meetingGoal.trim();
    const displaySender = user?.email ? user.email.split("@")[0] : "CEO";

    try {
      // 1. Create thread for meeting
      const title = `[Meeting] ${goalText.slice(0, 50)}`;
      const res = await fetch("/api/v1/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: activeChannelId, title, user_id: user?.id, org_id: orgId }),
      });
      const data = await res.json();
      if (res.ok && data.thread) {
        const newThread = data.thread;
        setActiveThread(newThread);

        // 2. Insert CEO directive message
        const directiveText = `[EXECUTIVE DIRECTIVE FROM CEO]\nProject Goal: ${goalText}\n\nZach Adams (Product Manager): You are leading this project meeting. Immediately convene your team by issuing task cards formatted as [TASK: Task Title | AgentName] for @Sara_Pate (Design), @Peter (Engineering), and @Zara (Marketing), and outline the execution plan.`;

        await fetch("/api/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel_id: activeChannelId,
            thread_id: newThread.id,
            user_id: user?.id,
            sender_name: displaySender,
            sender_role: "Workspace CEO",
            text: directiveText,
            is_agent: false,
            org_id: orgId,
          }),
        });

        // 3. Dispatch to Zach Adams (PM) as meeting lead
        await fetch("/api/v1/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel_id: activeChannelId,
            thread_id: newThread.id,
            user_text: directiveText,
            user_id: user?.id,
            org_id: orgId,
            sender_name: displaySender,
            sender_role: "Workspace CEO",
            target_agent: "Zach Adams",
          }),
        });

        addToast("Autonomous Team Meeting Started!", "success");
        setMeetingGoal("");
        setMeetingModalOpen(false);
        fetchThreads(activeChannelId);
      }
    } catch (err: any) {
      addToast(err?.message || "Failed to start meeting", "danger");
    } finally {
      setMeetingStarting(false);
    }
  };

  const threadEndRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  const channelObj =
    channels.find((c) => c.id === activeChannelId) ||
    channels[0] || {
      id: "general",
      name: "general",
      type: "group" as const,
      topic: "General Channel",
      agents: ["Dev-Bot"],
      unread: 0,
    };

  const activeChannelThreads = threads[activeChannelId] || [];
  const activeThreadMessages = activeThread ? threadMessages[activeThread.id] || [] : [];

  const isSystemChannel =
    channelObj.name === "general" || channelObj.name === "sprint-planning";
  const currentProfileSlug = toProfileSlug(channelObj.name);
  const channelAgentOnline = isSystemChannel
    ? true
    : isProfileOnline(currentProfileSlug, workers);

  // ── Scroll to bottom of thread ─────────────────────────────────────────────

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThreadMessages, activeThread]);

  // ── Fetch channels ─────────────────────────────────────────────────────────

  const fetchWorkspaceChannels = useCallback(async () => {
    setLoading(true);
    try {
      let activeProfileSlugs: string[] = [];
      let syncedChannelsList: any[] = [];

      try {
        const syncRes = await fetch("/api/v1/agents/sync");
        if (syncRes.ok) {
          const sJson = await syncRes.json();
          if (sJson.agents) {
            activeProfileSlugs = sJson.agents.map((a: any) =>
              a.name.toLowerCase().replace(/[^a-z0-9]/g, "")
            );
            const aMap: Record<string, any> = {};
            sJson.agents.forEach((ag: any) => {
              const slug = toProfileSlug(ag.name);
              aMap[slug] = ag;
              aMap[ag.name.toLowerCase()] = ag;
            });
            setAgentsMap(aMap);
          }
          if (sJson.channels) syncedChannelsList = sJson.channels;
        }
      } catch {}

      let dbChannels: any[] = [];
      try {
        const chanRes = await fetch(`/api/v1/channels?user_id=${user?.id || ""}`);
        if (chanRes.ok) {
          const chanJson = await chanRes.json();
          if (chanJson.channels) dbChannels = chanJson.channels;
        }
      } catch {}

      const channelMap = new Map<string, ChannelItem>();

      // Only populate from Supabase DB — no hardcoded defaults

      dbChannels.forEach((c: any) => {
        const normName = (c.name || "").toLowerCase().replace(/-agent$/, "").trim();
        const isGeneral = normName === "general" || normName === "sprint-planning";
        const profileSlugNorm = normName.replace(/[^a-z0-9]/g, "");
        const isActiveAgent = isGeneral || activeProfileSlugs.includes(profileSlugNorm);
        const isDeactivated =
          c.is_deactivated ||
          (!isGeneral && activeProfileSlugs.length > 0 && !isActiveAgent);

        channelMap.set(c.name.toLowerCase(), {
          id: c.id || `ch-${c.name}`,
          name: c.name,
          type: c.type || "group",
          topic: isDeactivated
            ? "Former employee (No longer with organization)"
            : c.topic || c.description || `Dedicated channel for #${c.name}`,
          agents: c.agents || [c.name],
          unread: 0,
          isDeactivated,
        });
      });

      for (const sc of syncedChannelsList) {
        const cKey = sc.name.toLowerCase();
        if (!channelMap.has(cKey)) {
          const newChan: ChannelItem = {
            id: `ch-${sc.name}`,
            name: sc.name,
            type: "group",
            topic: sc.topic || `Dedicated channel for #${sc.name}`,
            agents: sc.agents || [sc.name],
            unread: 0,
            isDeactivated: false,
          };
          channelMap.set(cKey, newChan);
          try {
            await fetch("/api/v1/channels", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: sc.name,
                type: "group",
                description: newChan.topic,
                agents: newChan.agents,
                org_id: orgId,
                user_id: user?.id,
              }),
            });
          } catch {}
        }
      }

      const finalChannels = Array.from(channelMap.values());
      setChannels(finalChannels);
      setActiveChannelId((prev) =>
        prev && finalChannels.some((c) => c.id === prev)
          ? prev
          : finalChannels[0]?.id || "ch-general"
      );
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch threads for active channel ──────────────────────────────────────

  const fetchThreads = useCallback(async (channelId: string) => {
    if (!channelId) return;
    try {
      const res = await fetch(`/api/v1/threads?channel_id=${channelId}`);
      if (res.ok) {
        const { threads: list } = await res.json();
        setThreads((prev) => ({ ...prev, [channelId]: list || [] }));
      }
    } catch {}
  }, []);

  // ── Fetch messages for a thread ───────────────────────────────────────────

  const fetchThreadMessages = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/v1/messages?channel_id=${activeChannelId}&thread_id=${threadId}&limit=200`);
      if (res.ok) {
        const { messages: data } = await res.json();
        if (data) {
          const mapped: Message[] = data.map((m: any) => ({
            id: m.id,
            sender: m.sender_name || "Unknown",
            role: m.sender_role || (m.is_agent ? "Agent" : "CEO"),
            text: m.text || "",
            time: new Date(m.created_at || Date.now()).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            isAgent: !!m.is_agent,
            thread_id: m.thread_id,
          }));

          setThreadMessages((prev) => {
            const existing = prev[threadId] || [];
            const dbIds = new Set(mapped.map((m) => m.id));
            const localOnly = existing.filter((m) => m.isStreaming || !dbIds.has(m.id));
            return { ...prev, [threadId]: [...mapped, ...localOnly] };
          });
        }
      }
    } catch {}
  }, []);

  // ── Supabase Realtime — thread messages ───────────────────────────────────

  useEffect(() => {
    if (!activeThread) return;
    const threadId = activeThread.id;
    fetchThreadMessages(threadId);

    const channel = supabase
      .channel(`thread-messages-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload: any) => {
          if (payload.new && payload.new.thread_id === threadId) {
            fetchThreadMessages(threadId);
            fetchThreads(activeChannelId);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeThread?.id]);

  // ── Supabase Realtime — threads list ─────────────────────────────────────

  useEffect(() => {
    if (!activeChannelId) return;

    const channel = supabase
      .channel(`threads-list:${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "threads",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        () => {
          fetchThreads(activeChannelId);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChannelId, fetchThreads]);

  // ── Supervisor Daemon Init ──────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/v1/supervisor").catch(() => {});
  }, []);

  // ── Presence ──────────────────────────────────────────────────────────────

  const fetchPresence = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/presence");
      if (res.ok) {
        const { workers: list, tableReady } = await res.json();
        if (tableReady && list) {
          const map: Record<string, AgentWorker> = {};
          for (const w of list) map[w.agent_profile] = w;
          setWorkers(map);
          setPresenceReady(true);
        }
      }
    } catch {}
  }, []);

  const sendHeartbeat = useCallback(async (status: "online" | "offline") => {
    const profiles = new Set<string>();
    channels.forEach((ch) => {
      if (!ch.isDeactivated) {
        const slug = toProfileSlug(ch.name);
        if (slug !== "general" && slug !== "sprint-planning" && slug !== "sprint_planning") {
          profiles.add(slug);
        }
      }
    });
    await Promise.allSettled(
      Array.from(profiles).map((profile) =>
        fetch("/api/v1/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, status }),
        })
      )
    );
  }, [channels]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => { fetchWorkspaceChannels(); }, [fetchWorkspaceChannels]);
  useEffect(() => { fetchPresence(); const t = setInterval(fetchPresence, 20_000); return () => clearInterval(t); }, [fetchPresence]);

  useEffect(() => {
    if (!activeChannelId) return;
    fetchThreads(activeChannelId);
    setActiveThread(null); // close thread panel on channel switch
  }, [activeChannelId, fetchThreads]);

  useEffect(() => {
    if (activeThread) fetchThreadMessages(activeThread.id);
  }, [activeThread?.id]);

  // Heartbeat
  useEffect(() => {
    if (channels.length === 0) return;
    sendHeartbeat("online");
    const t = setInterval(() => sendHeartbeat("online"), 15_000);
    const onVis = () => { if (document.hidden) sendHeartbeat("offline"); else sendHeartbeat("online"); };
    const onUnload = () => sendHeartbeat("offline");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onUnload);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("beforeunload", onUnload); };
  }, [channels, sendHeartbeat]);

  // Refetch on tab focus
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) {
        if (activeChannelId) fetchThreads(activeChannelId);
        if (activeThread) fetchThreadMessages(activeThread.id);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [activeChannelId, activeThread?.id, fetchThreads, fetchThreadMessages]);

  // ── Create channel ────────────────────────────────────────────────────────

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    const formattedName = newChannelName.toLowerCase().replace(/\s+/g, "-");
    try {
      const res = await fetch("/api/v1/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formattedName,
          type: "group",
          description: newChannelTopic || "Channel topic",
          user_id: user?.id,
          org_id: orgId,
        }),
      });
      const resData = await res.json();
      if (res.ok && resData.channel) {
        const item: ChannelItem = { id: resData.channel.id, name: resData.channel.name, type: "group", topic: resData.channel.description, agents: ["Dev-Bot"], unread: 0 };
        setChannels((prev) => [...prev, item]);
        setActiveChannelId(item.id);
        addToast(`Channel #${formattedName} created!`, "success");
      }
    } catch {} finally {
      setCreateChannelModalOpen(false);
      setNewChannelName("");
      setNewChannelTopic("");
    }
  };

  // ── Agent call helper ─────────────────────────────────────────────────────

  const callAgent = async ({
    profileSlug,
    isGeneral,
    sessionId,
    contextMessages,
    onStreamMsg,
    streamMsgId,
    setMsgs,
    onComplete,
  }: {
    profileSlug: string;
    isGeneral: boolean;
    sessionId: string;
    contextMessages: { role: string; content: string }[];
    onStreamMsg: (text: string) => void;
    streamMsgId: string;
    setMsgs: React.Dispatch<React.SetStateAction<Record<string, Message[]>>>;
    onComplete: (finalText: string) => Promise<void>;
  }) => {
    const direct = isGeneral
      ? "http://127.0.0.1:8642/v1/chat/completions"
      : `http://127.0.0.1:8642/p/${profileSlug}/v1/chat/completions`;
    const proxy = isGeneral
      ? "/api/v1/chat/completions"
      : `/api/v1/chat/completions?profile=${profileSlug}`;

    const body = JSON.stringify({ model: "hermes-agent", messages: contextMessages, stream: true });

    const tryFetch = (url: string, extra: Record<string, string> = {}) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hermes-Session-Id": sessionId, ...extra },
        body,
      });

    try {
      let res = await tryFetch(direct, { Authorization: "Bearer sk-hermes-secret-key-1234567890abcdef1234567890abcdef" });
      if (!res.ok) res = await tryFetch(proxy);

      if (res.ok && res.body) {
        setIsTyping(false);
        await consumeSSEStream(
          res,
          onStreamMsg,
          onComplete
        );
        return;
      }
    } catch {}

    // Proxy fallback
    try {
      const res = await tryFetch(proxy);
      if (res.ok && res.body) {
        setIsTyping(false);
        await consumeSSEStream(res, onStreamMsg, onComplete);
        return;
      }
    } catch {}

    setIsTyping(false);
  };

  // ── Send NEW message in channel → creates thread ──────────────────────────

  const handleChannelSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelInput.trim() || !activeChannelId || channelObj.isDeactivated) return;

    const userText = channelInput.trim();
    setChannelInput("");

    const displaySender = user?.email ? user.email.split("@")[0] : "You";

    // 1. Create thread
    let newThread: Thread | null = null;
    let threadErr: string | null = null;
    try {
      const res = await fetch("/api/v1/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: activeChannelId, title: userText, user_id: user?.id, org_id: orgId }),
      });
      const data = await res.json();
      if (res.ok && data.thread) {
        newThread = data.thread;
      } else {
        threadErr = data.error || "Failed to create thread";
      }
    } catch (err: any) {
      threadErr = err?.message || "Network error creating thread";
    }

    // If thread creation failed, notify with exact error message and bail
    if (!newThread) {
      addToast(threadErr || "Run supabase/fix_channels_and_threads.sql in Supabase SQL editor", "danger");
      return;
    }

    // 2. Open thread panel immediately
    setActiveThread(newThread);
    setThreadPanelExpanded(false);

    const threadId = newThread.id;
    const sessionId = `session-thread-${threadId}`;

    // 3. Add user message to local state
    const userMsgId = `local-user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: displaySender,
      role: "Workspace CEO",
      text: userText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isAgent: false,
      thread_id: threadId,
    };

    setThreadMessages((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] || []), userMsg],
    }));

    // 4. Persist user message (via server API to avoid RLS issues with browser client)
    try {
      const msgRes = await fetch("/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: newThread.channel_id,
          thread_id: threadId,
          user_id: user?.id,
          sender_name: displaySender,
          sender_role: "Workspace CEO",
          text: userText,
          is_agent: false,
          org_id: orgId,
        }),
      });
      const msgData = await msgRes.json();
      if (msgData?.message?.id) {
        setThreadMessages((prev) => ({
          ...prev,
          [threadId]: (prev[threadId] || []).map((m) =>
            m.id === userMsgId ? { ...m, id: msgData.message.id } : m
          ),
        }));
      }
    } catch {}

    // 5. Update thread list
    setThreads((prev) => ({
      ...prev,
      [activeChannelId]: [newThread!, ...(prev[activeChannelId] || [])],
    }));

    // 6. Call Hermes agent (fresh session = new thread context)
    const profileSlug = toProfileSlug(channelObj.name);
    const agentInfo = agentsMap[profileSlug] || agentsMap[channelObj.name.toLowerCase()];
    const agentName = isSystemChannel
      ? "Dev-Bot"
      : (agentInfo?.name || profileSlug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
    const agentRole = isSystemChannel
      ? "Senior AI Engineer"
      : (agentInfo?.role || `${agentName} Agent`);

    const streamMsgId = `streaming-${Date.now()}`;

    setIsTyping(true);
    // Enqueue dispatch job in Supabase queue for single worker execution
    try {
      await fetch("/api/v1/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: newThread.channel_id,
          thread_id: threadId,
          user_text: userText,
          user_id: user?.id,
          org_id: orgId,
          sender_name: displaySender,
          sender_role: "Workspace CEO",
        }),
      });
    } catch {}
  };

  // ── Reply in thread ───────────────────────────────────────────────────────

  const handleThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadInput.trim() || !activeThread) return;

    const userText = threadInput.trim();
    setThreadInput("");

    const threadId = activeThread.id;
    const sessionId = `session-thread-${threadId}`;
    const displaySender = user?.email ? user.email.split("@")[0] : "You";

    // Add user message locally
    const userMsgId = `local-reply-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: displaySender,
      role: "Workspace CEO",
      text: userText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isAgent: false,
      thread_id: threadId,
    };

    setThreadMessages((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] || []), userMsg],
    }));

    // Persist (via server API to avoid RLS issues with browser client)
    try {
      const msgRes = await fetch("/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: activeThread.channel_id,
          thread_id: threadId,
          user_id: user?.id,
          sender_name: displaySender,
          sender_role: "Workspace CEO",
          text: userText,
          is_agent: false,
          org_id: orgId,
        }),
      });
      const msgData = await msgRes.json();
      if (msgData?.message?.id) {
        setThreadMessages((prev) => ({
          ...prev,
          [threadId]: (prev[threadId] || []).map((m) =>
            m.id === userMsgId ? { ...m, id: msgData.message.id } : m
          ),
        }));
      }
    } catch {}

    // Build context from this thread's messages only
    const profileSlug = toProfileSlug(channelObj.name);
    const agentInfo = agentsMap[profileSlug] || agentsMap[channelObj.name.toLowerCase()];
    const agentName = isSystemChannel
      ? "Dev-Bot"
      : (agentInfo?.name || profileSlug.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
    const agentRole = isSystemChannel
      ? "Senior AI Engineer"
      : (agentInfo?.role || `${agentName} Agent`);

    const currentMsgs = threadMessages[threadId] || [];
    const historyMsgs = currentMsgs
      .filter((m) => !m.isStreaming)
      .slice(-10)
      .map((m) => ({
        role: m.isAgent ? "assistant" : "user",
        content: m.text,
      }));

    const contextMessages = [
      ...historyMsgs,
      { role: "user", content: userText },
    ];

    const streamMsgId = `streaming-reply-${Date.now()}`;

    setIsTyping(true);
    // Enqueue dispatch job in Supabase queue for single worker execution
    try {
      await fetch("/api/v1/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: activeThread.channel_id,
          thread_id: threadId,
          user_text: userText,
          user_id: user?.id,
          org_id: orgId,
          sender_name: displaySender,
          sender_role: "Workspace CEO",
        }),
      });
    } catch {}
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const threadPanelWidth = threadPanelExpanded ? "w-[600px]" : "w-[380px]";

  return (
    <div className="flex h-full overflow-hidden bg-[#FAF8F5] text-[#1E1F24] select-none">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-64 border-r border-[rgba(0,0,0,0.08)] bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-[#1E1F24]">{orgName || "AI Workspace"}</h2>
            <p className="text-[10px] text-[#878890]">Real-time Agent Channels</p>
          </div>
          {presenceReady && (
            <span className="text-[9px] font-semibold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded-md">
              <Wifi size={9} /> Live
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <div className="text-[10px] font-bold text-[#878890] uppercase tracking-wider">CHANNELS</div>
            <button onClick={() => setCreateChannelModalOpen(true)} className="p-1 rounded-lg text-[#878890] hover:text-[#1E1F24] hover:bg-black/5 transition-all" title="Create New Channel">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-0.5">
            {channels.map((ch) => {
              const slug = toProfileSlug(ch.name);
              const isSys = ch.name === "general" || ch.name === "sprint-planning";
              const online = isSys ? true : isProfileOnline(slug, workers);
              const isActive = activeChannelId === ch.id;

              return (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannelId(ch.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    isActive ? "bg-[#1E1F24] text-white shadow-2xs font-semibold" : "text-[#52535A] hover:bg-[#FAF8F5]"
                  } ${ch.isDeactivated ? "opacity-70" : ""}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Hash size={13} className={isActive ? "text-white" : "text-[#878890]"} />
                    <span className="truncate">{ch.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ch.isDeactivated ? (
                      <span className="text-[9px] font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-md">Former</span>
                    ) : (
                      presenceReady && !isSys && <PresenceDot online={online} size={7} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Channel: Thread list ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="h-14 border-b border-[rgba(0,0,0,0.08)] px-6 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Hash size={16} className="text-[#1E1F24]" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-[#1E1F24]">#{channelObj.name}</h3>
                {presenceReady && !isSystemChannel && (
                  <div className="flex items-center gap-1">
                    <PresenceDot online={channelAgentOnline} size={8} />
                    <span className={`text-[10px] font-semibold ${channelAgentOnline ? "text-emerald-600" : "text-[#878890]"}`}>
                      {channelAgentOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-[#72737A]">{channelObj.topic}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMeetingModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all shadow-sm active:scale-98"
              title="Launch an autonomous inter-agent meeting"
            >
              <Users size={13} />
              <span>Run Team Meeting</span>
            </button>
            <div className="text-[10px] text-[#878890] font-medium">
              {activeChannelThreads.length} thread{activeChannelThreads.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Thread cards list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-[#878890]">Loading…</div>
          ) : activeChannelThreads.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-xs mx-auto space-y-3 text-[#878890]">
              <div className="w-14 h-14 rounded-2xl bg-[#1E1F24]/5 flex items-center justify-center">
                <MessageCircle size={26} className="text-[#878890]/50" />
              </div>
              <div className="text-xs font-semibold text-[#1E1F24]">No threads yet</div>
              <div className="text-[11px] leading-relaxed">
                Send a message below to start your first conversation with {isSystemChannel ? "Dev-Bot" : channelObj.name}.
                Each message creates a new thread.
              </div>
              {presenceReady && !isSystemChannel && !channelAgentOnline && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                  <WifiOff size={11} />
                  Agent is offline — messages will queue
                </div>
              )}
            </div>
          ) : (
            activeChannelThreads.map((thread) => {
              const isOpen = activeThread?.id === thread.id;
              return (
                <motion.button
                  key={thread.id}
                  onClick={() => {
                    setActiveThread(isOpen ? null : thread);
                    if (!isOpen) setThreadPanelExpanded(false);
                  }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`w-full text-left p-4 rounded-2xl border transition-all group ${
                    isOpen
                      ? "border-[#1E1F24]/20 bg-[#1E1F24]/[0.04] shadow-sm"
                      : "border-[rgba(0,0,0,0.07)] bg-white hover:border-[rgba(0,0,0,0.14)] hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      <div className="w-8 h-8 rounded-xl bg-[#1E1F24]/8 flex items-center justify-center">
                        <CornerDownRight size={14} className="text-[#878890]" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#1E1F24] truncate leading-relaxed">
                        {thread.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-[#878890]">{timeAgo(thread.last_activity_at)}</span>
                        {thread.reply_count > 0 && (
                          <>
                            <span className="text-[#C4C5CC] text-[10px]">·</span>
                            <span className="text-[10px] text-[#52535A] font-medium flex items-center gap-1">
                              <MessageSquare size={10} />
                              {thread.reply_count} repl{thread.reply_count === 1 ? "y" : "ies"}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={`shrink-0 transition-all ${isOpen ? "text-[#1E1F24]" : "text-[#C4C5CC] group-hover:text-[#878890]"}`}>
                      <ChevronRight size={14} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
        </div>

        {/* Offline strip */}
        {presenceReady && !isSystemChannel && !channelAgentOnline && !channelObj.isDeactivated && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-[11px] text-amber-800 font-medium shrink-0">
            <WifiOff size={12} className="text-amber-600 shrink-0" />
            {channelObj.name} is offline — your message will queue until the agent reconnects.
          </div>
        )}

        {/* New thread input (channel level) */}
        {channelObj.isDeactivated ? (
          <div className="p-4 bg-white border-t border-[rgba(0,0,0,0.08)] shrink-0">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 text-xs text-amber-900 font-semibold">
              <ShieldAlert size={16} className="text-amber-600 shrink-0" />
              This employee is no longer with the organization. Conversation history is archived.
            </div>
          </div>
        ) : (
          <form onSubmit={handleChannelSend} className="p-4 bg-white border-t border-[rgba(0,0,0,0.08)] shrink-0">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.12)] hover:border-[rgba(0,0,0,0.2)] transition-colors focus-within:border-[#1E1F24]">
              <Plus size={14} className="text-[#878890] shrink-0" />
              <input
                type="text"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder={`New thread in #${channelObj.name}…`}
                className="bg-transparent outline-none flex-1 text-xs text-[#1E1F24] placeholder-[#878890]"
              />
              <button
                type="submit"
                disabled={!channelInput.trim()}
                className="p-1.5 rounded-lg bg-[#1E1F24] text-white disabled:opacity-40 hover:bg-[#32333A] transition-all shrink-0"
              >
                <Send size={13} />
              </button>
            </div>
            <p className="text-[10px] text-[#878890] mt-1.5 pl-1">Each message starts a new thread with {isSystemChannel ? "Dev-Bot" : channelObj.name}</p>
          </form>
        )}
      </div>

      {/* ── Thread side panel ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeThread && (
          <motion.div
            key={activeThread.id}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className={`${threadPanelWidth} border-l border-[rgba(0,0,0,0.08)] bg-white flex flex-col shrink-0 transition-all duration-300`}
          >
            {/* Thread header */}
            <div className="py-2.5 px-4 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between gap-2 shrink-0 bg-white">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-7 h-7 rounded-xl bg-[#1E1F24]/6 flex items-center justify-center shrink-0">
                  <CornerDownRight size={13} className="text-[#878890]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-[#1E1F24] truncate">{activeThread.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {isTyping ? (
                      <span className="flex items-center gap-1 text-amber-600 font-semibold animate-pulse text-[10px]">
                        <Sparkles size={9} className="animate-spin" />
                        composing…
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#878890] font-medium">
                        Thread · {activeThread.reply_count} repl{activeThread.reply_count === 1 ? "y" : "ies"}
                      </span>
                    )}
                    <span className="text-[9px] font-mono font-bold bg-[#1E1F24] text-amber-400 px-1.5 py-0.5 rounded flex items-center gap-1 shadow-2xs">
                      <Cpu size={9} className="text-amber-400" />
                      {agentsMap[toProfileSlug(channelObj.name)]?.primary_model || activeThread.primary_model || "nvidia/nemotron-3-super-12"}
                    </span>
                    <span className="text-[9px] font-mono font-semibold bg-black/5 text-[#52535A] px-1.5 py-0.5 rounded">
                      {activeThread.total_tokens ? `${(activeThread.total_tokens / 1000).toFixed(1)}K tokens` : "17.2K tokens"}
                    </span>
                    {activeThread.last_duration_ms ? (
                      <span className="text-[9px] font-mono text-[#878890] bg-black/5 px-1 py-0.5 rounded">
                        ⏱ {Math.round(activeThread.last_duration_ms / 1000)}s
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              {/* Expand/Collapse toggle */}
              <button
                onClick={() => setThreadPanelExpanded((v) => !v)}
                title={threadPanelExpanded ? "Collapse thread panel" : "Expand thread panel"}
                className="p-1.5 rounded-lg text-[#878890] hover:text-[#1E1F24] hover:bg-black/5 transition-all"
              >
                {threadPanelExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                onClick={() => setActiveThread(null)}
                title="Close thread"
                className="p-1.5 rounded-lg text-[#878890] hover:text-[#1E1F24] hover:bg-black/5 transition-all"
              >
                <X size={14} />
              </button>
            </div>

            {/* Thread messages */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
              {activeThreadMessages.length === 0 && !isTyping ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-[11px] text-[#878890]">Starting conversation…</div>
                </div>
              ) : (
                activeThreadMessages.map((msg, i) => {
                  const prev = i > 0 ? activeThreadMessages[i - 1] : null;
                  const grouped = prev && prev.sender === msg.sender;

                  if (msg.isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <span className="text-[11px] text-[#878890] italic bg-black/[0.03] px-3 py-1 rounded-full border border-black/[0.06]">
                          {msg.text}
                        </span>
                      </div>
                    );
                  }

                  if (grouped) {
                    return (
                      <div key={msg.id} className="flex gap-3 -mt-1.5 group">
                        <div className="w-8 shrink-0 flex justify-end items-start pt-1 pr-1">
                          <span className="text-[9px] text-[#878890] opacity-0 group-hover:opacity-100 transition-opacity">{msg.time}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#1E1F24] leading-relaxed p-3.5 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.07)]">
                            <FormattedMessage content={msg.text} isStreaming={msg.isStreaming} />
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className="flex gap-3">
                      <div className="relative shrink-0">
                        <AgentAvatar name={msg.sender} size={32} />
                        {msg.isAgent && presenceReady && !isSystemChannel && (
                          <span className="absolute -bottom-0.5 -right-0.5">
                            <PresenceDot online={isProfileOnline(toProfileSlug(msg.sender), workers)} size={7} />
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#1E1F24]">{msg.sender}</span>
                          <span className="text-[10px] text-[#52535A] bg-black/5 px-1.5 py-0.5 rounded-md font-medium">{msg.role}</span>
                          <span className="text-[10px] text-[#878890]">{msg.time}</span>
                        </div>
                        <div className="text-xs text-[#1E1F24] leading-relaxed p-3.5 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.07)]">
                          <FormattedMessage content={msg.text} isStreaming={msg.isStreaming} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Approval banner inside thread */}
            {requiresApproval && (
              <div className="mx-4 mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-950">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  5 automated turns reached.
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setRequiresApproval(false); setAgentTurnCount(0); }} className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[10px] font-bold hover:bg-amber-700 transition-all">Continue</button>
                  <button onClick={() => { setRequiresApproval(false); setAgentTurnCount(0); }} className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 text-[10px] font-semibold hover:bg-amber-50 transition-all">Stop</button>
                </div>
              </div>
            )}

            {/* Thread reply input */}
            <form onSubmit={handleThreadReply} className="p-4 border-t border-[rgba(0,0,0,0.08)] bg-white shrink-0">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.12)] hover:border-[rgba(0,0,0,0.2)] transition-colors focus-within:border-[#1E1F24]">
                <input
                  type="text"
                  value={threadInput}
                  onChange={(e) => setThreadInput(e.target.value)}
                  placeholder="Reply in thread…"
                  className="bg-transparent outline-none flex-1 text-xs text-[#1E1F24] placeholder-[#878890]"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!threadInput.trim()}
                  className="p-1.5 rounded-lg bg-[#1E1F24] text-white disabled:opacity-40 hover:bg-[#32333A] transition-all shrink-0"
                >
                  <Send size={13} />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create channel modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {createChannelModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setCreateChannelModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-6 shadow-xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,0,0,0.08)]">
                <h2 className="text-sm font-bold text-[#1E1F24]">Create Workspace Channel</h2>
                <button onClick={() => setCreateChannelModalOpen(false)} className="btn-icon"><X size={15} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">CHANNEL NAME</label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5]">
                    <Hash size={14} className="text-[#878890]" />
                    <input type="text" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="e.g. backend-squad" className="bg-transparent outline-none w-full text-xs text-[#1E1F24] placeholder-[#878890]" required />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">TOPIC</label>
                  <input type="text" value={newChannelTopic} onChange={(e) => setNewChannelTopic(e.target.value)} placeholder="e.g. Backend API development" className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] text-xs outline-none focus:border-[#1E1F24]" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setCreateChannelModalOpen(false)} className="btn btn-secondary flex-1 justify-center">Cancel</button>
                <button onClick={handleCreateChannel} className="btn btn-primary flex-1 justify-center">Create Channel</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Run Autonomous Meeting Modal */}
        {meetingModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setMeetingModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-white border border-[rgba(0,0,0,0.12)] rounded-3xl p-6 shadow-2xl space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[rgba(0,0,0,0.08)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Users size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#1E1F24]">Run Autonomous Team Meeting</h2>
                    <p className="text-[10px] text-[#72737A]">AI Employees will convene, delegate, and execute tasks autonomously</p>
                  </div>
                </div>
                <button onClick={() => setMeetingModalOpen(false)} className="btn-icon"><X size={15} /></button>
              </div>

              <form onSubmit={handleStartAutonomousMeeting} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1.5">EXECUTIVE DIRECTIVE / COMPANY GOAL</label>
                  <textarea
                    value={meetingGoal}
                    onChange={(e) => setMeetingGoal(e.target.value)}
                    placeholder="e.g. Design and build the V2 Landing Page & Marketing Campaign with user auth and full API integrations."
                    className="w-full h-24 p-3 rounded-2xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] text-xs outline-none focus:border-indigo-600 focus:bg-white transition-all text-[#1E1F24] placeholder-[#878890] resize-none"
                    required
                  />
                </div>

                <div className="p-3 rounded-2xl bg-indigo-50/50 border border-indigo-100/80 space-y-2">
                  <div className="text-[10px] font-bold text-indigo-900 uppercase">ATTENDING AI EMPLOYEES</div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-[#1E1F24]">
                    <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-indigo-100 shadow-2xs">
                      <AgentAvatar name="Zach Adams" size={20} />
                      <div>
                        <div className="text-[11px] font-bold">Zach Adams</div>
                        <div className="text-[9px] text-[#878890]">Product Manager (Lead)</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-indigo-100 shadow-2xs">
                      <AgentAvatar name="Sara Pate" size={20} />
                      <div>
                        <div className="text-[11px] font-bold">Sara Pate</div>
                        <div className="text-[9px] text-[#878890]">Lead Designer</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-indigo-100 shadow-2xs">
                      <AgentAvatar name="Peter" size={20} />
                      <div>
                        <div className="text-[11px] font-bold">Peter</div>
                        <div className="text-[9px] text-[#878890]">Senior Engineer</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-indigo-100 shadow-2xs">
                      <AgentAvatar name="Zara" size={20} />
                      <div>
                        <div className="text-[11px] font-bold">Zara</div>
                        <div className="text-[9px] text-[#878890]">Marketing Specialist</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button type="button" onClick={() => setMeetingModalOpen(false)} className="btn btn-secondary flex-1 justify-center py-2.5">Cancel</button>
                  <button type="submit" disabled={meetingStarting} className="btn bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex-1 justify-center py-2.5 gap-2 shadow-sm">
                    {meetingStarting ? (
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={13} className="animate-spin" /> Starting…
                      </span>
                    ) : (
                      <>
                        <Play size={13} /> Start Meeting
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
