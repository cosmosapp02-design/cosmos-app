import * as fs from "fs";
import * as path from "path";

export interface ASTNode {
  id: string;
  name: string;
  type: "function" | "class" | "interface" | "component" | "export";
  filePath: string;
  line: number;
  dependencies: string[];
}

export interface ASTGraph {
  nodes: ASTNode[];
  updatedAt: string;
  totalFilesIndexed: number;
}

/**
 * Scans a project directory and generates a token-efficient AST symbol graph.
 */
export async function buildASTGraph(projectPath: string): Promise<ASTGraph> {
  const nodes: ASTNode[] = [];
  let fileCount = 0;

  function scanDir(currentPath: string) {
    if (!fs.existsSync(currentPath)) return;
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".next"
      ) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        fileCount++;
        parseFileSymbols(fullPath, projectPath, nodes);
      }
    }
  }

  scanDir(projectPath);

  const graph: ASTGraph = {
    nodes,
    updatedAt: new Date().toISOString(),
    totalFilesIndexed: fileCount,
  };

  // Save graph.json in project root
  const graphPath = path.join(projectPath, "graph.json");
  try {
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");
  } catch (e) {}

  return graph;
}

function parseFileSymbols(filePath: string, projectPath: string, nodes: ASTNode[]) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const relativePath = path.relative(projectPath, filePath);
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      // Functions / Arrow functions
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/);
      if (funcMatch) {
        const name = funcMatch[1] || funcMatch[2];
        if (name && name !== "React" && !name.startsWith("use")) {
          nodes.push({
            id: `${relativePath}#${name}`,
            name,
            type: name.charAt(0) === name.charAt(0).toUpperCase() ? "component" : "function",
            filePath: relativePath,
            line: index + 1,
            dependencies: [],
          });
        }
      }

      // Interfaces / Types / Classes
      const structMatch = line.match(/(?:export\s+)?(class|interface|type)\s+([A-Za-z0-9_]+)/);
      if (structMatch) {
        const [, structType, name] = structMatch;
        nodes.push({
          id: `${relativePath}#${name}`,
          name,
          type: structType === "class" ? "class" : "interface",
          filePath: relativePath,
          line: index + 1,
          dependencies: [],
        });
      }
    });
  } catch (e) {}
}

export function queryASTGraph(graph: ASTGraph, query: string): ASTNode[] {
  const q = query.toLowerCase();
  return graph.nodes.filter(
    (node) => node.name.toLowerCase().includes(q) || node.filePath.toLowerCase().includes(q)
  );
}
