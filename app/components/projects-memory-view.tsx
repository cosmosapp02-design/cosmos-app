"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder,
  FileText,
  Code2,
  Image as ImageIcon,
  Database,
  Search,
  Plus,
  ChevronRight,
  Grid,
  List as ListIcon,
  X,
  User,
  ArrowLeft,
  ExternalLink,
  Download,
  Copy,
  Clock,
  Sparkles,
} from "lucide-react";
import AgentAvatar from "./agent-avatar";
import { useToast } from "./toast";

// ─── File & Folder Data Schemas ─────────────────────────────────────────────

export interface MemoryFile {
  id: string;
  name: string;
  type: "code" | "doc" | "image" | "json" | "db";
  size: string;
  creator: string;
  updatedAt: string;
  content: string;
}

export interface MemorySubfolder {
  id: string;
  name: string;
  files: MemoryFile[];
}

export interface ProjectMemory {
  id: string;
  name: string;
  description: string;
  creator: string;
  status: "Active" | "In Review" | "Archived";
  subfolders: MemorySubfolder[];
}

// ─── Initial Company Memory Mock Data ───────────────────────────────────────

const INITIAL_PROJECTS: ProjectMemory[] = [
  {
    id: "proj-1",
    name: "Cosmos Platform Core",
    description: "Main enterprise multi-agent management platform & desktop app",
    creator: "Alex",
    status: "Active",
    subfolders: [
      {
        id: "sf-1",
        name: "Codebase",
        files: [
          {
            id: "f-1",
            name: "auth_middleware.ts",
            type: "code",
            size: "4.2 KB",
            creator: "Dev-Bot",
            updatedAt: "10 mins ago",
            content: `import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Unauthorized: Missing token" }, { status: 401 });
  }

  try {
    const payload = await verifyToken(token);
    const res = NextResponse.next();
    res.headers.set("X-User-Id", payload.sub);
    return res;
  } catch (err) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }
}`,
          },
          {
            id: "f-2",
            name: "schema.prisma",
            type: "db",
            size: "2.8 KB",
            creator: "Dev-Bot",
            updatedAt: "1 hour ago",
            content: `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Agent {
  id          String   @id @default(uuid())
  name        String
  role        String
  status      String   @default("online")
  skills      Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tickets     Ticket[]
}

model Ticket {
  id          String   @id @default(uuid())
  title       String
  priority    String
  status      String
  assigneeId  String
  assignee    Agent    @relation(fields: [assigneeId], references: [id])
}`,
          },
        ],
      },
      {
        id: "sf-2",
        name: "PRD Specs",
        files: [
          {
            id: "f-3",
            name: "PRD_v1.2_Auth.md",
            type: "doc",
            size: "14.8 KB",
            creator: "Alex",
            updatedAt: "2 hours ago",
            content: `# Product Requirements Document v1.2 — JWT Auth & Onboarding

## Executive Summary
This spec covers the architecture for JWT-based session security, refresh token rotation, and multi-tenant agent permissions.

## Key Features
1. **JWT Verification Middleware**: Intercept requests and validate JWT signature in under 12ms.
2. **Onboarding 3-Step Wizard**: Guide new admin users through AI agent squad initialization.
3. **Token Savings Dashboard**: Real-time token consumption metrics widget.

## Acceptance Criteria
- 100% test coverage via Playwright E2E test suite.
- Zero open high-severity security vulnerabilities.`,
          },
        ],
      },
      {
        id: "sf-3",
        name: "QA Reports",
        files: [
          {
            id: "f-4",
            name: "playwright_e2e_results.json",
            type: "json",
            size: "8.1 KB",
            creator: "QA-Guard",
            updatedAt: "30 mins ago",
            content: `{
  "suite": "Auth & Session Security E2E",
  "totalTests": 23,
  "passed": 23,
  "failed": 0,
  "durationMs": 482,
  "coveragePercent": 94.2,
  "runs": [
    { "name": "Login Flow", "status": "passed", "timeMs": 12 },
    { "name": "Refresh Token Rotation", "status": "passed", "timeMs": 18 },
    { "name": "Session Revocation", "status": "passed", "timeMs": 10 }
  ]
}`,
          },
        ],
      },
    ],
  },
  {
    id: "proj-2",
    name: "Auth Microservice",
    description: "Dedicated authentication & RBAC microservice",
    creator: "Dev-Bot",
    status: "Active",
    subfolders: [
      {
        id: "sf-4",
        name: "Microservice Core",
        files: [
          {
            id: "f-5",
            name: "jwt_verifier.ts",
            type: "code",
            size: "3.5 KB",
            creator: "Dev-Bot",
            updatedAt: "Yesterday",
            content: `import { jwtVerify } from "jose";

export async function verifyToken(token: string) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return payload;
}`,
          },
          {
            id: "f-6",
            name: "user_tokens.sql",
            type: "db",
            size: "1.9 KB",
            creator: "Dev-Bot",
            updatedAt: "Yesterday",
            content: `CREATE TABLE user_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    refresh_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`,
          },
        ],
      },
    ],
  },
  {
    id: "proj-3",
    name: "Marketing Landing Page",
    description: "High-conversion public website copy & media assets",
    creator: "You",
    status: "In Review",
    subfolders: [
      {
        id: "sf-5",
        name: "Copy & Assets",
        files: [
          {
            id: "f-7",
            name: "hero_copy_v2.md",
            type: "doc",
            size: "5.4 KB",
            creator: "You",
            updatedAt: "3 days ago",
            content: `# Hero Section Copy — Cosmos AI

## Headline
**Autonomous AI Workforce for High-Growth Enterprises.**

## Sub-headline
Deploy senior AI coders, product managers, and QA inspectors in seconds. Save 70%+ token overhead with local AST memory caching.`,
          },
        ],
      },
    ],
},
];

import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

export default function ProjectsMemoryView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedSubfolderId, setSelectedSubfolderId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<MemoryFile | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"files" | "ast">("files");
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const { addToast } = useToast();

  const fetchUserProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_files")
        .select("*")
        .eq("user_id", user.id);

      if (!error && data && data.length > 0) {
        const defaultProj: ProjectMemory = {
          id: "proj-user",
          name: "Company Memory Core",
          description: "Internal Repositories & Assets",
          creator: user.email?.split("@")[0] || "You",
          status: "Active",
          subfolders: [
            {
              id: "sf-user-1",
              name: "Codebase & Specs",
              files: data.map((f: any) => ({
                id: f.id,
                name: f.name || "file.ts",
                type: f.type || "code",
                size: f.size || "2.4 KB",
                creator: f.creator || "You",
                updatedAt: "Just now",
                content: f.content || "",
              })),
            },
          ],
        };
        setProjects([defaultProj]);
        setSelectedProjectId("proj-user");
        setSelectedSubfolderId("sf-user-1");
      } else {
        const cleanProj: ProjectMemory = {
          id: "proj-clean",
          name: "Company Memory Repository",
          description: "Upload & Store Project Memory",
          creator: "You",
          status: "Active",
          subfolders: [
            {
              id: "sf-clean-1",
              name: "Repository Assets",
              files: [],
            },
          ],
        };
        setProjects([cleanProj]);
        setSelectedProjectId("proj-clean");
        setSelectedSubfolderId("sf-clean-1");
      }
    } catch (e) {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserProjects();
  }, [fetchUserProjects]);

  const fallbackProject: ProjectMemory = {
    id: "proj-fallback",
    name: "Company Memory Core",
    description: "Internal Repositories & Assets",
    creator: "You",
    status: "Active",
    subfolders: [
      {
        id: "sf-fallback",
        name: "Codebase & Specs",
        files: [],
      },
    ],
  };

  const selectedProject = (projects && projects.length > 0 ? (projects.find((p) => p.id === selectedProjectId) || projects[0]) : null) || fallbackProject;
  const selectedSubfolder = (selectedProject?.subfolders && selectedProject.subfolders.length ? (selectedProject.subfolders.find((sf) => sf.id === selectedSubfolderId) || selectedProject.subfolders[0]) : null) || fallbackProject.subfolders[0];

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    const created: ProjectMemory = {
      id: `proj-${Date.now()}`,
      name: newProjectName,
      description: newProjectDesc || "AI-generated project repository.",
      creator: "You",
      status: "Active",
      subfolders: [
        {
          id: `sf-${Date.now()}`,
          name: "Documentation & Memory",
          files: [
            {
              id: `f-${Date.now()}`,
              name: "project_overview.md",
              type: "doc",
              size: "1.2 KB",
              creator: "You",
              updatedAt: "Just now",
              content: `# ${newProjectName}\n\n${newProjectDesc || "Initial project repository memory created."}`,
            },
          ],
        },
      ],
    };

    setProjects((prev) => [created, ...prev]);
    setSelectedProjectId(created.id);
    setSelectedSubfolderId(created.subfolders[0].id);
    setNewProjectModalOpen(false);
    setNewProjectName("");
    setNewProjectDesc("");
    addToast(`Project memory "${created.name}" created!`, "success");
  };

  const getFileIcon = (type: MemoryFile["type"]) => {
    switch (type) {
      case "code": return <Code2 size={16} className="text-[#1E1F24]" />;
      case "doc": return <FileText size={16} className="text-indigo-600" />;
      case "image": return <ImageIcon size={16} className="text-amber-600" />;
      case "db": return <Database size={16} className="text-purple-600" />;
      case "json": return <Sparkles size={16} className="text-emerald-600" />;
    }
  };

  return (
    <div className="flex h-full w-full bg-[#FAF8F5] text-[#1E1F24] overflow-hidden select-none">
      {/* ── Left Repository Tree Sidebar (240px) ── */}
      <div className="w-60 shrink-0 flex flex-col bg-[#F3F0EA] border-r border-[rgba(0,0,0,0.08)]">
        <div className="p-4 border-b border-[rgba(0,0,0,0.08)]">
          <div className="t-h2 text-[#1E1F24] mb-1">Company Memory</div>
          <div className="t-micro text-[#878890]">Internal Repositories & Assets</div>
        </div>

        {/* Project Folders Tree */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
          {projects.map((proj) => {
            const isProjectSelected = proj.id === selectedProjectId;
            return (
              <div key={proj.id} className="space-y-1">
                <button
                  onClick={() => {
                    setSelectedProjectId(proj.id);
                    setSelectedSubfolderId(proj.subfolders[0]?.id || null);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                    isProjectSelected
                      ? "bg-[#E5E1D8] text-[#1E1F24] font-bold"
                      : "text-[#52535A] hover:bg-black/[0.04]"
                  }`}
                >
                  <Folder size={16} className={isProjectSelected ? "text-[#1E1F24] fill-[#1E1F24]/10" : "text-[#72737A]"} />
                  <div className="flex-1 min-w-0">
                    <div className="t-small truncate">{proj.name}</div>
                    <div className="t-micro text-[#878890] truncate">{proj.subfolders.length} subfolders</div>
                  </div>
                </button>

                {/* Subfolders List */}
                {isProjectSelected && (
                  <div className="pl-6 space-y-1">
                    {proj.subfolders.map((sf) => {
                      const isSubSelected = sf.id === selectedSubfolderId;
                      return (
                        <button
                          key={sf.id}
                          onClick={() => setSelectedSubfolderId(sf.id)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all ${
                            isSubSelected
                              ? "bg-white font-semibold text-[#1E1F24] shadow-2xs"
                              : "text-[#52535A] hover:bg-black/[0.03]"
                          }`}
                        >
                          <Folder size={13} className="text-[#878890]" />
                          <span className="truncate flex-1">{sf.name}</span>
                          <span className="text-[10px] text-[#878890]">{sf.files.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-[rgba(0,0,0,0.08)] bg-white/40">
          <button
            onClick={() => setNewProjectModalOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white border border-[rgba(0,0,0,0.08)] text-xs text-[#1E1F24] font-semibold shadow-sm hover:bg-[#FAF8F5]"
          >
            <Plus size={14} />
            <span>New Project Memory</span>
          </button>
        </div>
      </div>

      {/* ── Right Content File Explorer (Flex-1) ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#FAF8F5]">
        {/* Breadcrumb Navigation Header */}
        <div className="h-13 border-b border-[rgba(0,0,0,0.08)] px-6 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2 text-xs text-[#52535A]">
            <span className="font-semibold text-[#878890]">Company Memory</span>
            <ChevronRight size={13} className="text-[#878890]" />
            <span className="font-bold text-[#1E1F24]">{selectedProject.name}</span>
            {selectedSubfolder && (
              <>
                <ChevronRight size={13} className="text-[#878890]" />
                <span className="font-semibold text-[#1E1F24]">{selectedSubfolder.name}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Tab Switcher */}
            <div className="flex bg-[#FAF8F5] p-1 rounded-xl border border-[rgba(0,0,0,0.08)] text-xs">
              <button
                onClick={() => setActiveTab("files")}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  activeTab === "files" ? "bg-[#1E1F24] text-white shadow-2xs" : "text-[#72737A]"
                }`}
              >
                Files Explorer
              </button>
              <button
                onClick={() => setActiveTab("ast")}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  activeTab === "ast" ? "bg-[#1E1F24] text-white shadow-2xs" : "text-[#72737A]"
                }`}
              >
                AST Symbol Graph
              </button>
            </div>

            {activeTab === "files" && (
              <>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] text-xs text-[#878890]">
                  <Search size={13} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search files..."
                    className="bg-transparent outline-none w-36 text-xs text-[#1E1F24] placeholder-[#878890]"
                  />
                </div>

                <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-xl border border-[rgba(0,0,0,0.08)]">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1 rounded-lg text-xs ${viewMode === "grid" ? "bg-white text-[#1E1F24] shadow-2xs" : "text-[#878890]"}`}
                  >
                    <Grid size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1 rounded-lg text-xs ${viewMode === "list" ? "bg-white text-[#1E1F24] shadow-2xs" : "text-[#878890]"}`}
                  >
                    <ListIcon size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "ast" ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[#1E1F24]">AST Codebase Symbol Graph (Tree-sitter)</h3>
                  <p className="text-[11px] text-[#72737A] mt-0.5">
                    Token-efficient code context index automatically parsed into <code className="font-mono text-[#1E1F24]">graph.json</code>
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-[#1E1F24] text-white text-[10px] font-mono font-bold">
                  24 AST Nodes Indexed
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-xs">
                {[
                  { name: "middleware(req)", type: "function", path: "auth/middleware.ts", line: 4 },
                  { name: "verifyToken(jwt)", type: "function", path: "lib/auth.ts", line: 12 },
                  { name: "AuthProvider", type: "component", path: "lib/auth-context.tsx", line: 18 },
                  { name: "AuthOnboardingModal", type: "component", path: "components/auth-onboarding-modal.tsx", line: 16 },
                  { name: "runInNativeSandbox", type: "function", path: "daemon/sandbox.ts", line: 28 },
                  { name: "runAgentLLMLoop", type: "function", path: "daemon/llm-runner.ts", line: 42 },
                ].map((node) => (
                  <div key={node.name} className="p-3 rounded-xl bg-white border border-[rgba(0,0,0,0.1)] shadow-2xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#1E1F24]">{node.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#FAF8F5] text-[9px] font-bold text-[#72737A] uppercase">
                        {node.type}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#878890] truncate">
                      {node.path}:L{node.line}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !selectedSubfolder || selectedSubfolder.files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-[#878890] space-y-2">
              <Folder size={40} className="text-[#878890]/40" />
              <div className="text-sm font-semibold text-[#1E1F24]">Empty Folder</div>
              <div className="text-xs">No project files found in this repository section.</div>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedSubfolder.files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className="card-interactive bg-white p-4 cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8 h-8 rounded-lg bg-[#FAF8F5] border border-[rgba(0,0,0,0.08)] flex items-center justify-center">
                        {getFileIcon(file.type)}
                      </div>
                      <span className="text-[10px] font-mono text-[#878890]">{file.size}</span>
                    </div>
                    <div className="text-xs font-bold text-[#1E1F24] mb-1 truncate">{file.name}</div>
                    <div className="text-[11px] text-[#72737A] line-clamp-2 leading-relaxed">
                      {file.content.slice(0, 80)}...
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between text-[11px] text-[#878890]">
                    <div className="flex items-center gap-1.5">
                      <AgentAvatar name={file.creator} size={18} />
                      <span>{file.creator}</span>
                    </div>
                    <span>{file.updatedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF8F5] border-b border-[rgba(0,0,0,0.08)] text-[10px] uppercase font-bold text-[#878890]">
                  <tr>
                    <th className="px-4 py-2.5">File Name</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Creator</th>
                    <th className="px-4 py-2.5">Size</th>
                    <th className="px-4 py-2.5">Last Modified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(0,0,0,0.06)]">
                  {selectedSubfolder.files.map((file) => (
                    <tr
                      key={file.id}
                      onClick={() => setSelectedFile(file)}
                      className="hover:bg-[#FAF8F5] cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-[#1E1F24] flex items-center gap-2">
                        {getFileIcon(file.type)}
                        <span>{file.name}</span>
                      </td>
                      <td className="px-4 py-3 uppercase text-[10px] font-mono text-[#878890]">{file.type}</td>
                      <td className="px-4 py-3 text-[#52535A]">
                        <div className="flex items-center gap-1.5">
                          <AgentAvatar name={file.creator} size={18} />
                          <span>{file.creator}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[#878890]">{file.size}</td>
                      <td className="px-4 py-3 text-[#878890]">{file.updatedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── File Inspector & Preview Modal ── */}
      <AnimatePresence>
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedFile(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-3xl bg-white border border-[rgba(0,0,0,0.12)] rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="h-13 px-5 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between bg-[#FAF8F5] shrink-0">
                <div className="flex items-center gap-2.5">
                  {getFileIcon(selectedFile.type)}
                  <div>
                    <h3 className="text-xs font-bold text-[#1E1F24]">{selectedFile.name}</h3>
                    <p className="text-[10px] text-[#878890]">Created by {selectedFile.creator} · {selectedFile.size}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1 rounded-lg hover:bg-black/[0.06] text-[#72737A]"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Content Inspector */}
              <div className="flex-1 overflow-y-auto p-5 font-mono text-xs text-[#1E1F24] bg-[#FAF8F5] leading-relaxed">
                <pre className="whitespace-pre-wrap">{selectedFile.content}</pre>
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.08)] bg-white flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2 text-[#72737A]">
                  <Clock size={13} />
                  <span>Last updated {selectedFile.updatedAt}</span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedFile.content);
                    addToast("File contents copied to clipboard!", "success");
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  <Copy size={13} /> Copy Contents
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New Project Memory Modal ── */}
      <AnimatePresence>
        {newProjectModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setNewProjectModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white border border-[rgba(0,0,0,0.12)] rounded-2xl p-6 shadow-xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-[rgba(0,0,0,0.08)]">
                <h2 className="t-h2 text-[#1E1F24]">Create Project Memory</h2>
                <button onClick={() => setNewProjectModalOpen(false)} className="btn-icon">
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="t-label text-[#72737A] block mb-1">PROJECT NAME</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. Payments Gateway Microservice"
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] t-small outline-none focus:border-[#1E1F24]"
                  />
                </div>
                <div>
                  <label className="t-label text-[#72737A] block mb-1">DESCRIPTION</label>
                  <textarea
                    rows={3}
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    placeholder="Describe the purpose of this project memory..."
                    className="w-full px-3 py-2 rounded-xl border border-[rgba(0,0,0,0.12)] t-small outline-none focus:border-[#1E1F24]"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setNewProjectModalOpen(false)} className="btn btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button onClick={handleCreateProject} className="btn btn-primary flex-1 justify-center">
                  Create Repository
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
