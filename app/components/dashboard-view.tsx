"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Hash, User, Lock, Search, Plus, Sparkles, MessageSquare, Terminal, AlertTriangle, ShieldCheck, CheckCircle2, Copy, FileText, Code2, Check, RefreshCw, Cpu, Bot, Zap, Clock, ShieldAlert, ChevronRight, X
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import FormattedMessage from "./formatted-message";
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
  isDeactivated?: boolean;
}

export default function DashboardView() {
  const { user, orgName } = useAuth();
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create Channel Modal state
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelTopic, setNewChannelTopic] = useState("");

  // Multi-agent automated conversation state & 5-message approval gate
  const [agentTurnCount, setAgentTurnCount] = useState<number>(0);
  const [requiresApproval, setRequiresApproval] = useState<boolean>(false);
  const [isAutoLoopActive, setIsAutoLoopActive] = useState<boolean>(false);

  // Per-channel persistent session mapping
  const [sessionsMap, setSessionsMap] = useState<Record<string, string>>({});

  const channelObj = channels.find((c) => c.id === activeChannelId) || channels[0] || {
    id: "general",
    name: "general",
    type: "group" as const,
    topic: "General Channel",
    agents: ["Dev-Bot"],
    unread: 0,
  };

  useEffect(() => {
    if (!channelObj?.name) return;
    async function fetchSession() {
      try {
        const res = await fetch(`/api/v1/sessions?channel=${channelObj.name}`);
        if (res.ok) {
          const data = await res.json();
          setSessionsMap((prev) => ({ ...prev, [channelObj.name]: data.sessionId }));
        }
      } catch (e) {}
    }
    fetchSession();
  }, [channelObj?.name]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  const fetchWorkspaceChannels = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Sync & fetch active Hermes CLI profiles and synced channels
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
          }
          if (sJson.channels) {
            syncedChannelsList = sJson.channels;
          }
        }
      } catch (e) {}

      // 2. Fetch channels from Supabase DB
      let dbChannels: any[] = [];
      try {
        const { data } = await supabase.from("channels").select("*");
        if (data) dbChannels = data;
      } catch (e) {}

      const channelMap = new Map<string, ChannelItem>();

      // Ensure default channels exist
      channelMap.set("general", {
        id: "ch-general",
        name: "general",
        type: "group",
        topic: "General discussions & Dev-Bot",
        agents: ["Dev-Bot"],
        unread: 0,
      });

      channelMap.set("sprint-planning", {
        id: "ch-sprint-planning",
        name: "sprint-planning",
        type: "group",
        topic: "Sprint planning & Team Collaboration",
        agents: ["Dev-Bot", "Peter"],
        unread: 0,
      });

      // Add DB channels first
      dbChannels.forEach((c: any) => {
        const normName = (c.name || "").toLowerCase().replace(/-agent$/, "").trim();
        const isGeneral = normName === "general" || normName === "sprint-planning";
        const profileSlugNorm = normName.replace(/[^a-z0-9]/g, "");

        const isActiveAgent = isGeneral || activeProfileSlugs.includes(profileSlugNorm);
        const isDeactivated = c.is_deactivated || (!isGeneral && activeProfileSlugs.length > 0 && !isActiveAgent);

        channelMap.set(c.name.toLowerCase(), {
          id: c.id || `ch-${c.name}`,
          name: c.name,
          type: c.type || "group",
          topic: isDeactivated
            ? "Former employee (No longer with organization)"
            : (c.topic || `Dedicated channel for #${c.name}`),
          agents: c.agents || [c.name],
          unread: 0,
          isDeactivated,
        });
      });

      // Merge any active Hermes synced channels missing from DB
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

          // Auto insert missing active channel to Supabase DB
          try {
            await supabase.from("channels").insert([{
              name: sc.name,
              type: "group",
              topic: newChan.topic,
              agents: newChan.agents,
            }]);
          } catch (e) {}
        }
      }

      const finalChannels = Array.from(channelMap.values());
      setChannels(finalChannels);
      setActiveChannelId((prev) => (prev && finalChannels.some((c) => c.id === prev) ? prev : finalChannels[0]?.id || "ch-general"));
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;

    const formattedName = newChannelName.toLowerCase().replace(/\s+/g, "-");
    const newChanObj = {
      name: formattedName,
      type: "group",
      topic: newChannelTopic || "Channel topic",
      user_id: user?.id,
    };

    try {
      const { data, error } = await supabase.from("channels").insert([newChanObj]).select();
      if (!error && data && data.length > 0) {
        const createdItem: ChannelItem = {
          id: data[0].id,
          name: data[0].name,
          type: "group",
          topic: data[0].topic,
          agents: ["Dev-Bot"],
          unread: 0,
        };
        setChannels((prev) => [...prev, createdItem]);
        setActiveChannelId(createdItem.id);
        addToast(`Channel #${formattedName} created!`, "success");
      } else {
        const localItem: ChannelItem = {
          id: `c-${Date.now()}`,
          name: formattedName,
          type: "group",
          topic: newChannelTopic || "Channel topic",
          agents: ["Dev-Bot"],
          unread: 0,
        };
        setChannels((prev) => [...prev, localItem]);
        setActiveChannelId(localItem.id);
        addToast(`Channel #${formattedName} created!`, "success");
      }
    } catch (e) {
    } finally {
      setCreateChannelModalOpen(false);
      setNewChannelName("");
      setNewChannelTopic("");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeChannelId) return;

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

    const activeChan = channels.find((c) => c.id === activeChannelId);
    const isMultiAgent = activeChan?.agents && activeChan.agents.length > 1;

    // Trigger agent-to-agent autonomous turn
    const triggerAgentTurn = async (currentTurnCount: number) => {
      if (currentTurnCount >= 5) {
        setRequiresApproval(true);
        setIsAutoLoopActive(false);
        return;
      }

      const chanMsgs = messages[activeChannelId] || [];
      if (chanMsgs.length === 0) return;

      const lastMsg = chanMsgs[chanMsgs.length - 1];
      const isNextPeter = lastMsg.sender === "Dev-Bot";

      const nextSender = isNextPeter ? "Peter" : "Dev-Bot";
      const nextRole = isNextPeter ? "Specialist Agent (Peter)" : "Senior AI Engineer";
      const nextAvatarColor = isNextPeter ? "#4F46E5" : "#1E1F24";

      const directEndpoint = isNextPeter
        ? "http://127.0.0.1:8642/p/peter/v1/chat/completions"
        : "http://127.0.0.1:8642/v1/chat/completions";

      const proxyEndpoint = isNextPeter
        ? "/api/v1/chat/completions?profile=peter"
        : "/api/v1/chat/completions";

      const contextMsgs = chanMsgs.slice(-6).map((m) => ({
        role: m.sender === "You" || m.sender.includes("@") ? "user" : "assistant",
        content: `${m.sender}: ${m.text}`,
      }));

      const payloadMessages = contextMsgs;

      setIsTyping(true);
      const botMsgId = `agent-${Date.now()}`;
      const initialBotMsg: Message = {
        id: botMsgId,
        sender: nextSender,
        role: nextRole,
        avatarColor: nextAvatarColor,
        text: "",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isStreaming: true,
      };

      setMessages((prev) => ({
        ...prev,
        [activeChannelId]: [...(prev[activeChannelId] || []), initialBotMsg],
      }));

      const consumeStream = async (res: Response) => {
        if (!res.body) return false;
        setIsTyping(false);

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulatedText = "";
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
                const deltaContent = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || "";
                if (deltaContent) {
                  accumulatedText += deltaContent;
                  const currentText = accumulatedText;
                  setMessages((prev) => {
                    const currentList = prev[activeChannelId] || [];
                    return {
                      ...prev,
                      [activeChannelId]: currentList.map((msg) =>
                        msg.id === botMsgId
                          ? { ...msg, text: currentText, isStreaming: true }
                          : msg
                      ),
                    };
                  });
                }
              } catch (e) {}
            }
          }
        }

        const finalText = accumulatedText;
        setMessages((prev) => {
          const currentList = prev[activeChannelId] || [];
          return {
            ...prev,
            [activeChannelId]: currentList.map((msg) =>
              msg.id === botMsgId
                ? { ...msg, text: finalText, isStreaming: false }
                : msg
            ),
          };
        });

        const nextCount = currentTurnCount + 1;
        setAgentTurnCount(nextCount);

        if (nextCount >= 5) {
          setRequiresApproval(true);
          setIsAutoLoopActive(false);
        } else if (isMultiAgent) {
          setTimeout(() => {
            triggerAgentTurn(nextCount);
          }, 1500);
        }
        return true;
      };

      const currentSessionId = sessionsMap[channelObj.name] || `session-${channelObj.name}-stable`;

      try {
        let response = await fetch(directEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer sk-hermes-secret-key-1234567890abcdef1234567890abcdef",
            "X-Hermes-Session-Id": currentSessionId,
          },
          body: JSON.stringify({
            model: "hermes-agent",
            messages: payloadMessages,
            stream: true,
          }),
        });

        if (!response.ok) {
          response = await fetch(proxyEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Hermes-Session-Id": currentSessionId,
            },
            body: JSON.stringify({
              model: "hermes-agent",
              messages: payloadMessages,
              stream: true,
            }),
          });
        }

        if (response.ok && response.body) {
          await consumeStream(response);
        }
      } catch (e) {
        setIsTyping(false);
      }
    };

    const chanName = (activeChan?.name || "general").toLowerCase().replace(/-agent$/, "").trim();
    const isGeneral = chanName === "general" || chanName === "sprint-planning";

    const profileSlug = chanName.replace(/[^a-z0-9_-]/g, "");

    const directEndpoint = isGeneral
      ? "http://127.0.0.1:8642/v1/chat/completions"
      : `http://127.0.0.1:8642/p/${profileSlug}/v1/chat/completions`;

    const proxyEndpoint = isGeneral
      ? "/api/v1/chat/completions"
      : `/api/v1/chat/completions?profile=${profileSlug}`;

    const formattedAgentName = profileSlug
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    const botSender = isGeneral ? "Dev-Bot" : formattedAgentName;
    const botRole = isGeneral ? "Senior AI Engineer" : `${formattedAgentName} Agent`;

    setIsTyping(true);

    const botMsgId = `agent-${Date.now()}`;
    const initialBotMsg: Message = {
      id: botMsgId,
      sender: botSender,
      role: botRole,
      avatarColor: "#1E1F24",
      text: "",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isStreaming: true,
    };

    setMessages((prev) => ({
      ...prev,
      [activeChannelId]: [...(prev[activeChannelId] || []), initialBotMsg],
    }));

    const consumeStream = async (res: Response) => {
      if (!res.body) return false;
      setIsTyping(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";
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

          if (trimmed === "data: [DONE]") {
            break;
          }

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.substring(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const deltaContent = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || "";
              if (deltaContent) {
                accumulatedText += deltaContent;
                const currentText = accumulatedText;
                setMessages((prev) => {
                  const currentList = prev[activeChannelId] || [];
                  return {
                    ...prev,
                    [activeChannelId]: currentList.map((msg) =>
                      msg.id === botMsgId
                        ? { ...msg, text: currentText, isStreaming: true }
                        : msg
                    ),
                  };
                });
              }
            } catch (e) {
              // Ignore partial JSON parse errors
            }
          }
        }
      }

      const finalText = accumulatedText;
      setMessages((prev) => {
        const currentList = prev[activeChannelId] || [];
        return {
          ...prev,
          [activeChannelId]: currentList.map((msg) =>
            msg.id === botMsgId
              ? { ...msg, text: finalText, isStreaming: false }
              : msg
          ),
        };
      });

      if (user && finalText) {
        try {
          await supabase.from("messages").insert([
            {
              channel_id: activeChannelId,
              user_id: user.id,
              sender: initialBotMsg.sender,
              role: initialBotMsg.role,
              text: finalText,
            },
          ]);
        } catch (e) {}
      }

      if (isMultiAgent) {
        setAgentTurnCount(1);
        setIsAutoLoopActive(true);
        setTimeout(() => {
          triggerAgentTurn(1);
        }, 1500);
      }

      return true;
    };

    const currentSessionId = sessionsMap[channelObj.name] || `session-${channelObj.name}-stable`;

    try {
      let response = await fetch(directEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer sk-hermes-secret-key-1234567890abcdef1234567890abcdef",
          "X-Hermes-Session-Id": currentSessionId,
        },
        body: JSON.stringify({
          model: "hermes-agent",
          messages: [{ role: "user", content: userText }],
          stream: true,
        }),
      });

      if (!response.ok) {
        response = await fetch(proxyEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Session-Id": currentSessionId,
          },
          body: JSON.stringify({
            model: "hermes-agent",
            messages: [{ role: "user", content: userText }],
            stream: true,
          }),
        });
      }

      if (response.ok && response.body) {
        await consumeStream(response);
      }
    } catch (error: any) {
      try {
        const fallbackRes = await fetch(proxyEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Session-Id": currentSessionId,
          },
          body: JSON.stringify({
            model: "hermes-agent",
            messages: [{ role: "user", content: userText }],
            stream: true,
          }),
        });
        if (fallbackRes.ok && fallbackRes.body) {
          await consumeStream(fallbackRes);
        }
      } catch (e) {
        setIsTyping(false);
      }
    }
  };

  const handleApproveContinue = () => {
    setRequiresApproval(false);
    setAgentTurnCount(0);
    setIsAutoLoopActive(true);

    const chanMsgs = messages[activeChannelId] || [];
    if (chanMsgs.length === 0) return;
    const lastMsg = chanMsgs[chanMsgs.length - 1];
    const isNextPeter = lastMsg.sender === "Dev-Bot";

    const nextSender = isNextPeter ? "Peter" : "Dev-Bot";
    const nextRole = isNextPeter ? "Specialist Agent (Peter)" : "Senior AI Engineer";
    const nextAvatarColor = isNextPeter ? "#4F46E5" : "#1E1F24";

    const directEndpoint = isNextPeter
      ? "http://127.0.0.1:8642/p/peter/v1/chat/completions"
      : "http://127.0.0.1:8642/v1/chat/completions";

    const proxyEndpoint = isNextPeter
      ? "/api/v1/chat/completions?profile=peter"
      : "/api/v1/chat/completions";

    const systemPrompt = isNextPeter
      ? "You are Peter, a Specialist AI Agent on the Cosmos platform. Respond directly and conversationally to Dev-Bot's latest message. Keep your response concise (2-3 sentences)."
      : "You are Dev-Bot, a Senior AI Engineer on the Cosmos platform. Respond directly and conversationally to Peter's latest message. Keep your response concise (2-3 sentences).";

    const contextMsgs = chanMsgs.slice(-6).map((m) => ({
      role: m.sender === "You" || m.sender.includes("@") ? "user" : "assistant",
      content: `${m.sender}: ${m.text}`,
    }));

    setIsTyping(true);
    const botMsgId = `agent-${Date.now()}`;
    const initialBotMsg: Message = {
      id: botMsgId,
      sender: nextSender,
      role: nextRole,
      avatarColor: nextAvatarColor,
      text: "",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isStreaming: true,
    };

    setMessages((prev) => ({
      ...prev,
      [activeChannelId]: [...(prev[activeChannelId] || []), initialBotMsg],
    }));

    (async () => {
      try {
        let response = await fetch(directEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer sk-hermes-secret-key-1234567890abcdef1234567890abcdef",
          },
          body: JSON.stringify({
            model: "hermes-agent",
            messages: [{ role: "system", content: systemPrompt }, ...contextMsgs],
            stream: true,
          }),
        });

        if (!response.ok) {
          response = await fetch(proxyEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "hermes-agent",
              messages: [{ role: "system", content: systemPrompt }, ...contextMsgs],
              stream: true,
            }),
          });
        }

        if (response.ok && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let accumulatedText = "";
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
                  const deltaContent = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || "";
                  if (deltaContent) {
                    accumulatedText += deltaContent;
                    const currentText = accumulatedText;
                    setMessages((prev) => {
                      const currentList = prev[activeChannelId] || [];
                      return {
                        ...prev,
                        [activeChannelId]: currentList.map((msg) =>
                          msg.id === botMsgId
                            ? { ...msg, text: currentText, isStreaming: true }
                            : msg
                        ),
                      };
                    });
                  }
                } catch (e) {}
              }
            }
          }

          const finalText = accumulatedText;
          setMessages((prev) => {
            const currentList = prev[activeChannelId] || [];
            return {
              ...prev,
              [activeChannelId]: currentList.map((msg) =>
                msg.id === botMsgId
                  ? { ...msg, text: finalText, isStreaming: false }
                  : msg
              ),
            };
          });

          setAgentTurnCount(1);
        }
      } catch (e) {
        setIsTyping(false);
      }
    })();
  };

  const handleStopConversation = () => {
    setRequiresApproval(false);
    setIsAutoLoopActive(false);
    setAgentTurnCount(0);
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
            <div className="flex items-center justify-between px-2 mb-1.5">
              <div className="text-[10px] font-bold text-[#878890] uppercase tracking-wider">
                CHANNELS
              </div>
              <button
                onClick={() => setCreateChannelModalOpen(true)}
                className="p-1 rounded-lg text-[#878890] hover:text-[#1E1F24] hover:bg-black/5 transition-all"
                title="Create New Channel"
              >
                <Plus size={14} />
              </button>
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
                  } ${ch.isDeactivated ? "opacity-70" : ""}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Hash size={13} className={activeChannelId === ch.id ? "text-white" : "text-[#878890]"} />
                    <span className="truncate">{ch.name}</span>
                  </div>
                  {ch.isDeactivated && (
                    <span className="text-[9px] font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-md shrink-0">
                      Former
                    </span>
                  )}
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
              {isTyping ? (
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 animate-pulse">
                  <Sparkles size={11} className="animate-spin text-amber-500" />
                  <span>Agent is typing...</span>
                </div>
              ) : (
                <p className="text-[10px] text-[#72737A]">{channelObj.topic}</p>
              )}
            </div>
          </div>
          {channelObj.agents && channelObj.agents.length > 1 && !isAutoLoopActive && !requiresApproval && (
            <button
              onClick={() => {
                setRequiresApproval(false);
                setAgentTurnCount(0);
                setIsAutoLoopActive(true);
                const chanMsgs = messages[activeChannelId] || [];
                const lastMsg = chanMsgs[chanMsgs.length - 1];
                const isNextPeter = lastMsg?.sender === "Dev-Bot";
                const nextSender = isNextPeter ? "Peter" : "Dev-Bot";
                const nextRole = isNextPeter ? "Specialist Agent (Peter)" : "Senior AI Engineer";
                const nextAvatarColor = isNextPeter ? "#4F46E5" : "#1E1F24";

                const directEndpoint = isNextPeter
                  ? "http://127.0.0.1:8642/p/peter/v1/chat/completions"
                  : "http://127.0.0.1:8642/v1/chat/completions";
                const proxyEndpoint = isNextPeter
                  ? "/api/v1/chat/completions?profile=peter"
                  : "/api/v1/chat/completions";
                const systemPrompt = isNextPeter
                  ? "You are Peter, a Specialist AI Agent on the Cosmos platform. Respond directly to Dev-Bot. Keep your response concise (2-3 sentences)."
                  : "You are Dev-Bot, a Senior AI Engineer on the Cosmos platform. Respond directly to Peter. Keep your response concise (2-3 sentences).";
                const contextMsgs = chanMsgs.slice(-6).map((m) => ({
                  role: m.sender === "You" || m.sender.includes("@") ? "user" : "assistant",
                  content: `${m.sender}: ${m.text}`,
                }));

                setIsTyping(true);
                const botMsgId = `agent-${Date.now()}`;
                const initialBotMsg: Message = {
                  id: botMsgId,
                  sender: nextSender,
                  role: nextRole,
                  avatarColor: nextAvatarColor,
                  text: "",
                  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  isStreaming: true,
                };

                setMessages((prev) => ({
                  ...prev,
                  [activeChannelId]: [...(prev[activeChannelId] || []), initialBotMsg],
                }));

                (async () => {
                  try {
                    let response = await fetch(directEndpoint, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer sk-hermes-secret-key-1234567890abcdef1234567890abcdef",
                      },
                      body: JSON.stringify({
                        model: "hermes-agent",
                        messages: [{ role: "system", content: systemPrompt }, ...contextMsgs],
                        stream: true,
                      }),
                    });
                    if (!response.ok) {
                      response = await fetch(proxyEndpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          model: "hermes-agent",
                          messages: [{ role: "system", content: systemPrompt }, ...contextMsgs],
                          stream: true,
                        }),
                      });
                    }
                    if (response.ok && response.body) {
                      const reader = response.body.getReader();
                      const decoder = new TextDecoder("utf-8");
                      let accumulatedText = "";
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
                              const deltaContent = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || "";
                              if (deltaContent) {
                                accumulatedText += deltaContent;
                                const currentText = accumulatedText;
                                setMessages((prev) => ({
                                  ...prev,
                                  [activeChannelId]: (prev[activeChannelId] || []).map((msg) =>
                                    msg.id === botMsgId ? { ...msg, text: currentText, isStreaming: true } : msg
                                  ),
                                }));
                              }
                            } catch (e) {}
                          }
                        }
                      }
                      const finalText = accumulatedText;
                      setMessages((prev) => ({
                        ...prev,
                        [activeChannelId]: (prev[activeChannelId] || []).map((msg) =>
                          msg.id === botMsgId ? { ...msg, text: finalText, isStreaming: false } : msg
                        ),
                      }));
                      setAgentTurnCount(1);
                    }
                  } catch (e) {
                    setIsTyping(false);
                  }
                })();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1E1F24] text-white text-xs font-semibold hover:bg-[#32333A] transition-all shadow-2xs"
            >
              <Sparkles size={13} className="text-amber-400 animate-pulse" />
              <span>Start Agent Discussion</span>
            </button>
          )}
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
            channelMessages.map((msg, i) => {
              const prevMsg = i > 0 ? channelMessages[i - 1] : null;
              const isGrouped = prevMsg && prevMsg.sender === msg.sender;

              if (isGrouped) {
                return (
                  <div key={msg.id} className="flex gap-3.5 text-xs group hover:bg-black/[0.015] px-2.5 py-1 rounded-2xl transition-all border border-transparent hover:border-black/[0.04] -mt-2">
                    <div className="w-[36px] shrink-0 flex justify-end items-center pr-1">
                      <span className="text-[9px] text-[#878890] font-medium opacity-0 group-hover:opacity-100 transition-opacity select-none">
                        {msg.time}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="p-3.5 rounded-2xl bg-white border border-[rgba(0,0,0,0.08)] text-[#1E1F24] shadow-xs max-w-3xl leading-relaxed">
                        <FormattedMessage content={msg.text} isStreaming={msg.isStreaming} />
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex gap-3.5 text-xs group hover:bg-black/[0.015] p-2.5 rounded-2xl transition-all border border-transparent hover:border-black/[0.04]">
                  <AgentAvatar name={msg.sender} size={36} />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#1E1F24] text-xs">{msg.sender}</span>
                      <span className="px-2 py-0.5 rounded-md bg-[#1E1F24]/5 border border-black/5 text-[10px] font-semibold text-[#52535A]">
                        {msg.role}
                      </span>
                      <span className="text-[10px] text-[#878890] font-medium">{msg.time}</span>
                    </div>
                    <div className="p-4 rounded-2xl bg-white border border-[rgba(0,0,0,0.08)] text-[#1E1F24] shadow-xs max-w-3xl leading-relaxed">
                      <FormattedMessage content={msg.text} isStreaming={msg.isStreaming} />
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {isTyping && (
            <div className="flex items-center gap-2 text-xs text-[#878890] italic">
              <Sparkles size={13} className="animate-spin text-amber-500" />
              <span>Agents are collaborating...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Interactive Approval Banner when 5 messages limit is reached */}
        {requiresApproval && (
          <div className="p-3.5 bg-amber-50 border-t border-b border-amber-200 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-amber-950">
              <AlertTriangle size={17} className="text-amber-600 shrink-0" />
              <span>
                Automated conversation limit reached: <strong>5 messages exchanged between Dev-Bot & Peter</strong>. Approve to continue or stop discussion.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleApproveContinue}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-all shadow-2xs"
              >
                Approve & Continue (+5 turns)
              </button>
              <button
                onClick={handleStopConversation}
                className="px-3.5 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-semibold hover:bg-amber-100 transition-all"
              >
                Stop Conversation
              </button>
            </div>
          </div>
        )}

        {/* Input Bar */}
        {channelObj.isDeactivated ? (
          <div className="p-4 bg-white border-t border-[rgba(0,0,0,0.08)] shrink-0">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 text-xs text-amber-900 font-semibold">
              <ShieldAlert size={16} className="text-amber-600 shrink-0" />
              <span>This employee is no longer with the organization. Conversation history is archived.</span>
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {/* Create Channel Modal */}
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
                <button onClick={() => setCreateChannelModalOpen(false)} className="btn-icon">
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">CHANNEL NAME</label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5]">
                    <Hash size={14} className="text-[#878890]" />
                    <input
                      type="text"
                      value={newChannelName}
                      onChange={(e) => setNewChannelName(e.target.value)}
                      placeholder="e.g. backend-squad or product-ideas"
                      className="bg-transparent outline-none w-full text-xs text-[#1E1F24] placeholder-[#878890]"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#72737A] uppercase block mb-1">TOPIC & DESCRIPTION</label>
                  <input
                    type="text"
                    value={newChannelTopic}
                    onChange={(e) => setNewChannelTopic(e.target.value)}
                    placeholder="e.g. Backend API development & architecture"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAF8F5] text-xs outline-none focus:border-[#1E1F24]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setCreateChannelModalOpen(false)} className="btn btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button onClick={handleCreateChannel} className="btn btn-primary flex-1 justify-center">
                  Create Channel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
