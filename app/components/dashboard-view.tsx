"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hash,
  Search,
  Send,
  Plus,
  Bot,
  User,
  Star,
  Pin,
  Info,
  Paperclip,
  Smile,
  AtSign,
  Bold,
  Italic,
  Code,
  List,
  CheckCircle2,
  ExternalLink,
  Code2,
  FileText,
  FlaskConical,
  MessageSquare,
  ThumbsUp,
  Flame,
  Eye,
  Check,
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { useToast } from "./toast";

// ─── Data Types ─────────────────────────────────────────────────────────────

interface Reaction {
  emoji: string;
  count: number;
  userReacted?: boolean;
}

interface ArtifactCard {
  type: "code" | "prd" | "qa";
  title: string;
  subtitle?: string;
  status?: string;
  content?: string;
  actionText?: string;
}

interface Message {
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

interface ChannelItem {
  id: string;
  name: string;
  type: "group" | "dm";
  topic?: string;
  agents: string[];
  unread: number;
}

// ─── Mock Enterprise Data ───────────────────────────────────────────────────

const channels: ChannelItem[] = [
  { id: "1", name: "sprint-planning", type: "group", topic: "Sprint 4 Auth Flow & Playwright QA", agents: ["Alex", "Dev-Bot", "QA-Guard"], unread: 2 },
  { id: "2", name: "frontend-squad", type: "group", topic: "Next.js App Router & Tailwind components", agents: ["Dev-Bot", "QA-Guard"], unread: 1 },
  { id: "3", name: "product-roadmap", type: "group", topic: "Quarterly feature planning & user stories", agents: ["Alex"], unread: 0 },
  { id: "4", name: "Alex (PM)", type: "dm", agents: ["Alex"], unread: 0 },
  { id: "5", name: "Dev-Bot (Senior Coder)", type: "dm", agents: ["Dev-Bot"], unread: 0 },
  { id: "6", name: "QA-Guard (Inspector)", type: "dm", agents: ["QA-Guard"], unread: 0 },
];

const mockMessages: Record<string, Message[]> = {
  "1": [
    {
      id: "m1",
      sender: "Alex",
      role: "Product Manager",
      avatarColor: "#1E1F24",
      text: "Good morning team! I've finalized the Sprint 4 scope. Our main target is shipping the JWT authentication flow and validating it with E2E Playwright tests.",
      time: "9:02 AM",
      reactions: [{ emoji: "👍", count: 3 }, { emoji: "🚀", count: 2 }],
      artifact: {
        type: "prd",
        title: "PRD v1.2: Authentication & Sprint 4 Roadmap",
        subtitle: "Approved by Alex (PM) · 14 KB",
        status: "APPROVED",
        content: "Key deliverables: 1. JWT Middleware with Refresh Token Rotation. 2. Onboarding Wizard Flow. 3. Playwright E2E Test Suite.",
        actionText: "View PRD Spec",
      },
    },
    {
      id: "m2",
      sender: "Dev-Bot",
      role: "Senior Full-Stack Coder",
      avatarColor: "#1E1F24",
      text: "I've implemented the JWT authentication middleware in Next.js. Here is the core snippet for token validation:",
      time: "9:05 AM",
      reactions: [{ emoji: "🔥", count: 4 }, { emoji: "✅", count: 2 }],
      artifact: {
        type: "code",
        title: "auth/middleware.ts",
        subtitle: "Pull Request #142 · Dev-Bot",
        status: "BUILD PASSED",
        content: `export async function middleware(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(token);
  return NextResponse.next();
}`,
        actionText: "View PR #142",
      },
    },
    {
      id: "m3",
      sender: "QA-Guard",
      role: "QA Inspector",
      avatarColor: "#1E1F24",
      text: "Automated test suite has been executed against Dev-Bot's branch. All critical authentication paths passed.",
      time: "9:07 AM",
      reactions: [{ emoji: "🎉", count: 3 }],
      artifact: {
        type: "qa",
        title: "Playwright E2E Auth Test Suite",
        subtitle: "Run #842 · QA-Guard",
        status: "23 PASSED · 0 FAILED · 94% COVERAGE",
        content: "Passed: Login Flow (12ms), Refresh Token Rotation (18ms), Logout & Session Revocation (10ms).",
        actionText: "View Test Logs",
      },
    },
  ],
  "2": [
    {
      id: "m4",
      sender: "Dev-Bot",
      role: "Senior Full-Stack Coder",
      avatarColor: "#1E1F24",
      text: "Landing page component refactor complete. Tailwind light theme styling applied across all breakpoints.",
      time: "10:15 AM",
      reactions: [{ emoji: "👀", count: 2 }],
    },
  ],
};

const agentRoleMap: Record<string, string> = {
  Alex: "Product Manager",
  "Dev-Bot": "Senior Full-Stack Coder",
  "QA-Guard": "QA Inspector",
  You: "Workspace CEO",
};

export default function DashboardView() {
  const [activeChannelId, setActiveChannelId] = useState("1");
  const [messages, setMessages] = useState<Record<string, Message[]>>(mockMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [search, setSearch] = useState("");
  const [starred, setStarred] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  const channel = channels.find((c) => c.id === activeChannelId)!;
  const channelMessages = messages[activeChannelId] || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages, isTyping]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "You",
      role: "Workspace CEO",
      avatarColor: "#1E1F24",
      text: input,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      reactions: [{ emoji: "👍", count: 1 }],
    };

    setMessages((prev) => ({ ...prev, [activeChannelId]: [...(prev[activeChannelId] || []), userMsg] }));
    setInput("");
    setIsTyping(true);

    // Agent automated response simulation
    setTimeout(() => {
      const agentName = channel.agents[0] || "Dev-Bot";
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: agentName,
        role: agentRoleMap[agentName] || "AI Worker",
        avatarColor: "#1E1F24",
        text: `Received request: "${input}". Processing task across team AST and executing updates...`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        reactions: [{ emoji: "👀", count: 1 }],
      };

      setMessages((prev) => ({ ...prev, [activeChannelId]: [...(prev[activeChannelId] || []), agentMsg] }));
      setIsTyping(false);
    }, 1200);
  };

  const handleToggleReaction = (msgId: string, emoji: string) => {
    setMessages((prev) => ({
      ...prev,
      [activeChannelId]: (prev[activeChannelId] || []).map((m) => {
        if (m.id !== msgId) return m;
        const existingReactions = m.reactions || [];
        const found = existingReactions.find((r) => r.emoji === emoji);
        let updated: Reaction[];
        if (found) {
          updated = existingReactions.map((r) =>
            r.emoji === emoji ? { ...r, count: r.count + 1 } : r
          );
        } else {
          updated = [...existingReactions, { emoji, count: 1 }];
        }
        return { ...m, reactions: updated };
      }),
    }));
  };

  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full w-full bg-[#FAF8F5] text-[#1E1F24] overflow-hidden select-none">
      {/* ── 1. Left Slack/Teams Channel & DM Navigation (220px) ── */}
      <div className="w-56 shrink-0 flex flex-col bg-[#F3F0EA] border-r border-[rgba(0,0,0,0.08)]">
        {/* Search & Jump-to header */}
        <div className="p-3 border-b border-[rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-[rgba(0,0,0,0.08)] text-xs text-[#878890]">
            <Search size={13} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search channels & DMs..."
              className="bg-transparent outline-none w-full text-xs text-[#1E1F24] placeholder-[#878890]"
            />
          </div>
        </div>

        {/* Channels & DMs List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 text-xs">
          {/* Group Channels */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5 text-[10px] font-bold text-[#878890] uppercase tracking-wider">
              <span>Channels</span>
              <button className="hover:text-[#1E1F24]" title="Create Channel"><Plus size={12} /></button>
            </div>
            {filteredChannels.filter((c) => c.type === "group").map((ch) => {
              const isActive = activeChannelId === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannelId(ch.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all ${
                    isActive
                      ? "bg-[#E5E1D8] text-[#1E1F24] font-bold"
                      : "text-[#52535A] hover:bg-black/[0.04] hover:text-[#1E1F24]"
                  }`}
                >
                  <Hash size={14} className={isActive ? "text-[#1E1F24]" : "text-[#72737A]"} />
                  <span className="truncate flex-1">{ch.name}</span>
                  {ch.unread > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-[#1E1F24] text-white text-[9px] font-bold">
                      {ch.unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Direct Messages */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5 text-[10px] font-bold text-[#878890] uppercase tracking-wider">
              <span>Direct Messages</span>
              <button className="hover:text-[#1E1F24]" title="New DM"><Plus size={12} /></button>
            </div>
            {filteredChannels.filter((c) => c.type === "dm").map((ch) => {
              const isActive = activeChannelId === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => setActiveChannelId(ch.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all ${
                    isActive
                      ? "bg-[#E5E1D8] text-[#1E1F24] font-bold"
                      : "text-[#52535A] hover:bg-black/[0.04] hover:text-[#1E1F24]"
                  }`}
                >
                  <div className="relative shrink-0">
                    <AgentAvatar name={ch.agents[0]} size={20} />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute -bottom-0.5 -right-0.5 border border-white" />
                  </div>
                  <span className="truncate flex-1">{ch.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Workspace Footer */}
        <div className="p-3 border-t border-[rgba(0,0,0,0.08)] bg-white/40">
          <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white border border-[rgba(0,0,0,0.08)] text-xs text-[#1E1F24] font-semibold shadow-sm hover:bg-[#FAF8F5]">
            <Plus size={13} />
            <span>Add Channel</span>
          </button>
        </div>
      </div>

      {/* ── 2. Main Slack Message Feed & Header (Flex-1) ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#FAF8F5]">
        {/* Top Channel Header Bar */}
        <div className="h-13 border-b border-[rgba(0,0,0,0.08)] px-6 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5">
              <Hash size={17} className="text-[#1E1F24]" />
              <h1 className="text-sm font-bold text-[#1E1F24]">{channel.name}</h1>
              <button onClick={() => setStarred(!starred)} className="text-[#878890] hover:text-amber-500">
                <Star size={14} className={starred ? "fill-amber-500 text-amber-500" : ""} />
              </button>
            </div>
            {channel.topic && (
              <span className="text-xs text-[#72737A] border-l border-[rgba(0,0,0,0.1)] pl-3 truncate max-w-md">
                {channel.topic}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center -space-x-1.5">
              {channel.agents.map((a) => (
                <AgentAvatar key={a} name={a} size={24} className="border-2 border-white" />
              ))}
            </div>
            <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 text-[11px] font-semibold">
              3 Agents Active
            </div>
            <div className="flex items-center gap-1 text-[#72737A]">
              <button className="btn-icon"><Pin size={14} /></button>
              <button className="btn-icon"><Info size={14} /></button>
            </div>
          </div>
        </div>

        {/* ── Slack-Native Message Stream (Full Width, No Speech Bubbles) ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {channelMessages.map((msg) => (
            <div
              key={msg.id}
              className="group relative flex gap-3.5 items-start p-2 rounded-xl hover:bg-black/[0.02] transition-colors"
            >
              {/* Left Avatar */}
              {msg.sender === "You" ? (
                <div className="w-9 h-9 rounded-lg bg-[#1E1F24] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                  <User size={16} />
                </div>
              ) : (
                <AgentAvatar name={msg.sender} size={36} className="shrink-0" />
              )}

              {/* Message Content */}
              <div className="flex-1 min-w-0">
                {/* Header Line */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-[#1E1F24]">{msg.sender}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#EFECE6] text-[#52535A]">
                    {msg.role}
                  </span>
                  <span className="text-[10.5px] text-[#878890]">{msg.time}</span>
                </div>

                {/* Message Text */}
                <div className="text-xs text-[#1E1F24] leading-relaxed font-normal mb-2">
                  {msg.text}
                </div>

                {/* ── Enterprise Work Artifact Attachment Card ── */}
                {msg.artifact && (
                  <div className="mt-2.5 max-w-xl rounded-xl bg-white border border-[rgba(0,0,0,0.1)] p-3.5 shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {msg.artifact.type === "code" && <Code2 size={16} className="text-[#1E1F24]" />}
                        {msg.artifact.type === "prd" && <FileText size={16} className="text-indigo-600" />}
                        {msg.artifact.type === "qa" && <FlaskConical size={16} className="text-emerald-600" />}
                        <div>
                          <div className="text-xs font-bold text-[#1E1F24]">{msg.artifact.title}</div>
                          {msg.artifact.subtitle && (
                            <div className="text-[10px] text-[#878890]">{msg.artifact.subtitle}</div>
                          )}
                        </div>
                      </div>
                      {msg.artifact.status && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EFECE6] text-[#1E1F24]">
                          {msg.artifact.status}
                        </span>
                      )}
                    </div>

                    {msg.artifact.content && (
                      <div className="p-3 rounded-lg bg-[#FAF8F5] border border-[rgba(0,0,0,0.06)] font-mono text-[11px] text-[#1E1F24] leading-relaxed overflow-x-auto">
                        <pre className="whitespace-pre-wrap">{msg.artifact.content}</pre>
                      </div>
                    )}

                    {msg.artifact.actionText && (
                      <button
                        onClick={() => addToast(`Opening ${msg.artifact?.title}...`, "info")}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1E1F24] text-white text-xs font-semibold hover:bg-[#32333A] transition-colors"
                      >
                        <span>{msg.artifact.actionText}</span>
                        <ExternalLink size={12} />
                      </button>
                    )}
                  </div>
                )}

                {/* Reactions Row */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {msg.reactions.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => handleToggleReaction(msg.id, r.emoji)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-[rgba(0,0,0,0.1)] hover:border-[rgba(0,0,0,0.2)] text-xs text-[#1E1F24] font-medium shadow-2xs transition-colors"
                      >
                        <span>{r.emoji}</span>
                        <span className="text-[10px] font-bold text-[#52535A]">{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Hover Action Bar (Slack-style Toolbar) ── */}
              <div className="absolute right-3 top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-[rgba(0,0,0,0.12)] rounded-lg p-1 shadow-md flex items-center gap-1 text-[#52535A]">
                <button
                  onClick={() => handleToggleReaction(msg.id, "👍")}
                  className="p-1 hover:bg-[#FAF8F5] rounded text-xs"
                  title="React 👍"
                >
                  👍
                </button>
                <button
                  onClick={() => handleToggleReaction(msg.id, "🚀")}
                  className="p-1 hover:bg-[#FAF8F5] rounded text-xs"
                  title="React 🚀"
                >
                  🚀
                </button>
                <button
                  onClick={() => handleToggleReaction(msg.id, "✅")}
                  className="p-1 hover:bg-[#FAF8F5] rounded text-xs"
                  title="React ✅"
                >
                  ✅
                </button>
                <div className="w-px h-3 bg-[rgba(0,0,0,0.1)] mx-0.5" />
                <button className="p-1 hover:bg-[#FAF8F5] rounded text-[#52535A] hover:text-[#1E1F24]" title="Reply in thread">
                  <MessageSquare size={13} />
                </button>
                <button className="p-1 hover:bg-[#FAF8F5] rounded text-[#52535A] hover:text-[#1E1F24]" title="Pin to channel">
                  <Pin size={13} />
                </button>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 items-center text-xs text-[#72737A] p-2">
              <AgentAvatar name={channel.agents[0]} size={28} />
              <span>{channel.agents[0]} is generating response...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── 4. Slack-Native Rich Text Composer Toolbar ── */}
        <div className="p-4 bg-white border-t border-[rgba(0,0,0,0.08)] shrink-0">
          <div className="rounded-xl border border-[rgba(0,0,0,0.14)] bg-white overflow-hidden shadow-xs focus-within:border-[#1E1F24] transition-all">
            {/* Rich Text Toolbar */}
            <div className="px-3 py-1.5 bg-[#FAF8F5] border-b border-[rgba(0,0,0,0.06)] flex items-center gap-1 text-[#72737A]">
              <button className="p-1 rounded hover:bg-[#EFECE6] hover:text-[#1E1F24]" title="Bold"><Bold size={13} /></button>
              <button className="p-1 rounded hover:bg-[#EFECE6] hover:text-[#1E1F24]" title="Italic"><Italic size={13} /></button>
              <button className="p-1 rounded hover:bg-[#EFECE6] hover:text-[#1E1F24]" title="Inline Code"><Code size={13} /></button>
              <button className="p-1 rounded hover:bg-[#EFECE6] hover:text-[#1E1F24]" title="Bullet List"><List size={13} /></button>
              <div className="w-px h-3 bg-[rgba(0,0,0,0.1)] mx-1" />
              <button className="p-1 rounded hover:bg-[#EFECE6] hover:text-[#1E1F24]" title="Mention Agent"><AtSign size={13} /></button>
              <button className="p-1 rounded hover:bg-[#EFECE6] hover:text-[#1E1F24]" title="Attach File"><Paperclip size={13} /></button>
            </div>

            {/* Input Text Area */}
            <div className="p-3 flex items-end gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={`Message #${channel.name}...`}
                rows={2}
                className="flex-1 bg-transparent text-xs text-[#1E1F24] placeholder-[#878890] outline-none resize-none"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isTyping}
                className="p-2 rounded-xl bg-[#1E1F24] hover:bg-[#32333A] text-white disabled:opacity-30 transition-all cursor-pointer"
              >
                <Send size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10.5px] text-[#878890] mt-1.5 px-1">
            <span>Press Enter to send · Shift+Enter for new line</span>
            <span>Cosmos Enterprise Workspace</span>
          </div>
        </div>
      </div>
    </div>
  );
}
