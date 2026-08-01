import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PRIMARY_AGENTS_MD = "/Users/cosmos/AGENTS.md";
const WORKSPACE_AGENTS_MD = "/Users/cosmos/Documents/cosmos-app/AGENTS.md";
const ORG_JSON_PATH = "/Users/cosmos/Documents/cosmos-app/.org_structure.json";
const PROFILES_DIR = "/Users/cosmos/.hermes/profiles";

export async function GET() {
  try {
    if (fs.existsSync(ORG_JSON_PATH)) {
      const dataStr = fs.readFileSync(ORG_JSON_PATH, "utf-8");
      const parsed = JSON.parse(dataStr);
      return NextResponse.json({ success: true, ...parsed });
    }

    try {
      const { supabase } = await import("@/app/lib/supabase");
      const { data } = await supabase.from("org_structure").select("*").single();
      if (data && data.nodes) {
        return NextResponse.json({ success: true, nodes: data.nodes, edges: data.edges });
      }
    } catch (e) {}

    return NextResponse.json({ success: true, nodes: null, edges: null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodes, edges } = body;

    if (!nodes || !Array.isArray(nodes)) {
      return NextResponse.json({ error: "Invalid nodes array." }, { status: 400 });
    }

    // 1. Save flowchart state to .org_structure.json
    try {
      fs.writeFileSync(ORG_JSON_PATH, JSON.stringify({ nodes, edges }, null, 2), "utf-8");
    } catch (e) {}

    // 2. Save flowchart state to Supabase DB
    try {
      const { supabase } = await import("@/app/lib/supabase");
      await supabase.from("org_structure").upsert([{ id: "default_org", nodes, edges, updated_at: new Date().toISOString() }]);
    } catch (e) {}

    // 3. Build tree traversal & parent lookup
    const nodeMap = new Map<string, any>();
    nodes.forEach((n: any) => {
      nodeMap.set(n.id, n);
    });

    const parentMap = new Map<string, string>(); // childId -> parentId
    const childrenMap = new Map<string, string[]>(); // parentId -> childIds[]

    if (edges && Array.isArray(edges)) {
      edges.forEach((e: any) => {
        parentMap.set(e.target, e.source);
        if (!childrenMap.has(e.source)) {
          childrenMap.set(e.source, []);
        }
        childrenMap.get(e.source)!.push(e.target);
      });
    }

    // Find roots
    const roots: any[] = [];
    nodes.forEach((n: any) => {
      if (!parentMap.has(n.id)) {
        roots.push(n);
      }
    });

    // CEO / Root node identification
    const ceoNode = nodes.find((n: any) => n.id === "ceo" || n.data?.isRoot) || roots[0];
    const ceoName = ceoNode?.data?.name || "Cosmos Enterprise Platform (CEO)";
    const ceoRole = ceoNode?.data?.role || "Chief Executive Officer / Organization Lead";
    const ceoHeaderLine = `- **${ceoName}** (${ceoRole})`;

    const directChildrenOfCeo = childrenMap.get(ceoNode?.id) || [];
    const hierarchyBlocks: string[] = [];
    const visited = new Set<string>();
    if (ceoNode) visited.add(ceoNode.id);

    function buildBranch(nodeId: string, depth: number, lines: string[]) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const n = nodeMap.get(nodeId);
      if (!n) return;

      const name = n.data?.name || n.id;
      const role = n.data?.role || "Team Member";
      const indent = "  ".repeat(depth);

      lines.push(`${indent}- **${name}** (${role})`);

      const children = childrenMap.get(nodeId) || [];
      children.forEach((cId) => {
        buildBranch(cId, depth + 1, lines);
      });
    }

    if (directChildrenOfCeo.length > 0) {
      directChildrenOfCeo.forEach((childId) => {
        const branchLines: string[] = [ceoHeaderLine];
        buildBranch(childId, 1, branchLines);
        hierarchyBlocks.push(branchLines.join("\n"));
      });
    } else {
      hierarchyBlocks.push(`${ceoHeaderLine}\n  - No active workforce nodes connected.`);
    }

    // Handle any orphaned unlinked nodes
    nodes.forEach((n: any) => {
      if (!visited.has(n.id)) {
        const orphanLines: string[] = [];
        buildBranch(n.id, 0, orphanLines);
        if (orphanLines.length > 0) {
          hierarchyBlocks.push(orphanLines.join("\n"));
        }
      }
    });

    const mdContent = `# Hermes Organization Hierarchy & Reporting Rules

## Team Structure & Hierarchy

${hierarchyBlocks.join("\n\n")}

## Reporting Rules & Operating Guidelines

1. **Reporting Chain**: All AI agents and team members acknowledge their direct parent manager in the organizational hierarchy defined above.
2. **Task Delegation & Approvals**: When proposing implementation plans, task execution steps, or strategic decisions, team members submit updates and requests for review to their respective manager.
3. **Managerial Oversight**: Managers oversee technical direction, provide feedback, review engineering outputs, and direct workforce execution.
`;

    // 4. Write AGENTS.md to primary, workspace, and each profile directory
    try {
      fs.writeFileSync(PRIMARY_AGENTS_MD, mdContent, "utf-8");
      fs.writeFileSync(WORKSPACE_AGENTS_MD, mdContent, "utf-8");
    } catch (e) {}

    if (fs.existsSync(PROFILES_DIR)) {
      const profileItems = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });

      for (const item of profileItems) {
        if (item.isDirectory() && !item.name.startsWith(".")) {
          const profileDirPath = path.join(PROFILES_DIR, item.name);
          const profileAgentsMdPath = path.join(profileDirPath, "AGENTS.md");
          const soulFilePath = path.join(profileDirPath, "SOUL.md");
          const memoriesDirPath = path.join(profileDirPath, "memories");

          // Write AGENTS.md
          try {
            fs.writeFileSync(profileAgentsMdPath, mdContent, "utf-8");
          } catch (e) {}

          // Clean up any extra manager sections appended to SOUL.md if present
          if (fs.existsSync(soulFilePath)) {
            try {
              let existingSoul = fs.readFileSync(soulFilePath, "utf-8");
              if (existingSoul.includes("## Manager & Reporting Chain")) {
                const cleanedSoul = existingSoul.replace(/\n## Manager & Reporting Chain[\s\S]*$/, "").trim() + "\n";
                fs.writeFileSync(soulFilePath, cleanedSoul, "utf-8");
              }
            } catch (e) {}
          }

          // Clear cached memories so stale reports don't persist
          if (fs.existsSync(memoriesDirPath)) {
            try {
              const memFiles = fs.readdirSync(memoriesDirPath);
              memFiles.forEach((mf) => {
                try {
                  fs.unlinkSync(path.join(memoriesDirPath, mf));
                } catch (e) {}
              });
            } catch (e) {}
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Organization structure saved and synchronized in AGENTS.md across all profile directories.",
      content: mdContent,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
