"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Hash, User, Lock, Search, Plus, Sparkles, MessageSquare, Terminal, AlertTriangle, ShieldCheck, CheckCircle2, Copy, FileText, Code2, Check, RefreshCw, Cpu, Bot, Zap, Clock, ShieldAlert, ChevronRight, X
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { useToast } from "./toast";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

export interface ArtifactCard {
  type: "code" | "prd" | "qa" | "db";
  title: string;
  subtitle: string;
  status?: string;
  content: string;
  actionText?: string;
}

export interface Reaction {
  emoji: string;
  count: number;
}

export interface Message {
  id: string;
  sender: string;
  role: string;
  avatarColor: string;
  text: string;
  time: string;
  reactions?: Reaction[];
  artifact?: ArtifactCard;
  isStreaming?: boolean;
}

export interface ChannelItem {
  id: string;
  name: string;
  type: "group" | "dm";
  topic?: string;
  agents: string[];
  unread: number;
}

export default function DashboardView() {
  const { user, orgName } = useAuth();
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>("general");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [interAgentTurns, setInterAgentTurns] = useState<number>(0);
  const [discussionPaused, setDiscussionPaused] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  const fetchWorkspaceChannels = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: dbChannels, error } = await supabase
        .from("channels")
        .select("*")
        .eq("user_id", user.id);

      if (!error && dbChannels && dbChannels.length > 0) {
        const mapped: ChannelItem[] = dbChannels.map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type || "group",
          topic: c.topic || "Team Collaboration Channel",
          agents: c.agents || ["Dev-Bot"],
          unread: 0,
        }));
        setChannels(mapped);
        if (!mapped.some((c) => c.id === activeChannelId)) {
          setActiveChannelId(mapped[0].id);
        }
      } else {
        // Auto-create default channels for new user
        const defaultChannels = [
          { name: "general", type: "group", topic: "General discussions and team updates", user_id: user.id },
          { name: "sprint-planning", type: "group", topic: "Sprint planning and task execution", user_id: user.id },
        ];

        const { data: created, error: insertError } = await supabase
          .from("channels")
          .insert(defaultChannels)
          .select();

        if (!insertError && created) {
          const mapped: ChannelItem[] = created.map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            topic: c.topic,
            agents: ["Dev-Bot"],
            unread: 0,
          }));
          setChannels(mapped);
          setActiveChannelId(mapped[0].id);
        } else {
          // Fallback in-memory channels
          const fallback = [
            { id: "c-gen", name: "general", type: "group" as const, topic: "General discussions", agents: ["Dev-Bot"], unread: 0 },
            { id: "c-sprint", name: "sprint-planning", type: "group" as const, topic: "Sprint planning", agents: ["Dev-Bot"], unread: 0 },
          ];
          setChannels(fallback);
          setActiveChannelId("c-gen");
        }
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, [user, activeChannelId]);

  const fetchChannelMessages = useCallback(async () => {
    if (!user || !activeChannelId) return;

    try {
      const { data: dbMsgs, error } = await supabase
        .from("messages")
        .select("*")
        .eq("channel_id", activeChannelId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (!error && dbMsgs) {
        const mapped: Message[] = dbMsgs.map((m: any) => ({
          id: m.id,
          sender: m.sender || "You",
          role: m.role || "CEO",
          avatarColor: "#1E1F24",
          text: m.text,
          time: new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          artifact: m.artifact ? JSON.parse(m.artifact) : undefined,
        }));
        setMessages((prev) => ({ ...prev, [activeChannelId]: mapped }));
      }
    } catch (e) {}
  }, [user, activeChannelId]);

  useEffect(() => {
    fetchWorkspaceChannels();
  }, [fetchWorkspaceChannels]);

  useEffect(() => {
    fetchChannelMessages();
  }, [fetchChannelMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChannelId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input.trim();
    setInput("");

    const newMsg: Message = {
      id: `${Date.now()}`,
      sender: user?.email ? user.email.split("@")[0] : "You",
      role: "Workspace CEO",
      avatarColor: "#1E1F24",
      text: userText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => ({
      ...prev,
      [activeChannelId]: [...(prev[activeChannelId] || []), newMsg],
    }));

    if (user) {
      try {
        await supabase.from("messages").insert([
          {
            channel_id: activeChannelId,
            user_id: user.id,
            sender: newMsg.sender,
            role: newMsg.role,
            text: userText,
          },
        ]);
      } catch (e) {}
    }

    // Trigger AI Agent response
    setIsTyping(true);
    setTimeout(async () => {
      setIsTyping(false);
      const agentReply: Message = {
        id: `agent-${Date.now()}`,
        sender: "Dev-Bot",
        role: "Senior AI Engineer",
        avatarColor: "#1E1F24",
        text: `Received: "${userText}". I am executing this task in your local engine daemon sandbox.`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => ({
        ...prev,
        [activeChannelId]: [...(prev[activeChannelId] || []), agentReply],
      }));

      if (user) {
        try {
          await supabase.from("messages").insert([
            {
              channel_id: activeChannelId,
              user_id: user.id,
              sender: agentReply.sender,
              role: agentReply.role,
              text: agentReply.text,
            },
          ]);
        } catch (e) {}
      }
    }, 1200);
  };

  const channelObj = channels.find((c) => c.id === activeChannelId) || {
    id: "general",
    name: "general",
    type: "group" as const,
    topic: "General Channel",
    agents: ["Dev-Bot"],
    unread: 0,
  };

  const channelMessages = messages[activeChannelId] || [];

  return (
    <div className="flex h-full overflow-hidden bg-[#FAF8F5] text-[#1E1F24] select-none">
      {/* Sidebar Channels Column */}
      <div className="w-64 border-r border-[rgba(0,0,0,0.08)] bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-[#1E1F24]">{orgName || "AI Workspace"}</h2>
            <p className="text-[10px] text-[#878890]">Real-time Agent Channels</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div>
            <div className="text-[10px] font-bold text-[#878890] uppercase tracking-wider px-2 mb-1.5">
              CHANNELS
            </div>
            <div className="space-y-0.5">
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannelId(ch.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    activeChannelId === ch.id
                      ? "bg-[#1E1F24] text-white shadow-2xs font-semibold"
                      : "text-[#52535A] hover:bg-[#FAF8F5]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Hash size={13} className={activeChannelId === ch.id ? "text-white" : "text-[#878890]"} />
                    <span className="truncate">{ch.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Stream Column */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF8F5]">
        {/* Header */}
        <div className="h-14 border-b border-[rgba(0,0,0,0.08)] px-6 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Hash size={16} className="text-[#1E1F24]" />
            <div>
              <h3 className="text-xs font-bold text-[#1E1F24]">#{channelObj.name}</h3>
              <p className="text-[10px] text-[#72737A]">{channelObj.topic}</p>
            </div>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-[#878890]">
              Loading workspace conversation...
            </div>
          ) : channelMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-2 text-[#878890]">
              <MessageSquare size={32} className="text-[#878890]/40" />
              <div className="text-xs font-semibold text-[#1E1F24]">Clean Slate Channel</div>
              <div className="text-[11px]">Send a message to start collaborating with your AI workforce in #{channelObj.name}.</div>
            </div>
          ) : (
            channelMessages.map((msg) => (
              <div key={msg.id} className="flex gap-3 text-xs">
                <AgentAvatar name={msg.sender} size={32} />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1E1F24]">{msg.sender}</span>
                    <span className="px-1.5 py-0.2 rounded bg-black/5 text-[10px] font-medium text-[#72737A]">
                      {msg.role}
                    </span>
                    <span className="text-[10px] text-[#878890]">{msg.time}</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-[rgba(0,0,0,0.08)] text-[#1E1F24] shadow-2xs leading-relaxed max-w-2xl">
                    {msg.text}
                  </div>
                </div>
              </div>
            ))
          )}

          {isTyping && (
            <div className="flex items-center gap-2 text-xs text-[#878890] italic">
              <Sparkles size={13} className="animate-spin text-amber-500" />
              <span>Dev-Bot is thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-4 bg-white border-t border-[rgba(0,0,0,0.08)] shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.12)]">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message #${channelObj.name}...`}
              className="bg-transparent outline-none flex-1 text-xs text-[#1E1F24] placeholder-[#878890]"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-1.5 rounded-lg bg-[#1E1F24] text-white disabled:opacity-40 hover:bg-[#32333A] transition-all"
            >
              <Send size={13} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
