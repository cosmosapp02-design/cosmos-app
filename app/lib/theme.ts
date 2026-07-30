// Cosmos App — Claude / ChatGPT Minimal Light Theme Tokens

export const theme = {
  colors: {
    // Light palette
    base: "#FAF8F5",          // Warm off-white / Claude parchment base
    surface: "#F3F0EA",       // Sidebar / Secondary background
    surfaceSolid: "#FFFFFF",  // Pure white card background
    elevated: "#F0EDE6",      // Bubble / Input background
    overlay: "#FFFFFF",       // Modal background

    border: "rgba(0, 0, 0, 0.08)",       // Hairline border
    borderStrong: "rgba(0, 0, 0, 0.16)", // Stronger border
    borderAccent: "rgba(30, 31, 36, 0.2)",

    accent: "#1E1F24",         // Clean charcoal primary accent
    accentSubtle: "rgba(30, 31, 36, 0.06)",

    textPrimary: "#1E1F24",    // Charcoal primary text
    textSecondary: "#52535A",  // Muted secondary text
    textMuted: "#878890",      // Light muted text

    statusOnline: "#10B981",
    statusBusy: "#D97706",
    statusOffline: "#878890",

    danger: "#DC2626",
    warning: "#D97706",
    success: "#10B981",
  },
  shadows: {
    card: "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)",
    elevated: "0 4px 16px rgba(0, 0, 0, 0.06)",
    overlay: "0 20px 40px rgba(0, 0, 0, 0.12)",
  },
} as const;

export type Theme = typeof theme;
