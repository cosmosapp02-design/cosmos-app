"use client";

interface AgentAvatarProps {
  name: string;
  size?: number;
  className?: string;
}

function stringToHslColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return {
    bg: `hsl(${h}, 60%, 93%)`,
    text: `hsl(${h}, 75%, 25%)`,
    border: `hsl(${h}, 50%, 80%)`,
  };
}

export default function AgentAvatar({ name, size = 32, className = "" }: AgentAvatarProps) {
  const initial = (name || "A").charAt(0).toUpperCase();
  const colors = stringToHslColor(name || "Agent");

  return (
    <div
      className={`shrink-0 flex items-center justify-center font-bold rounded-xl select-none transition-all ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        fontSize: size * 0.42,
      }}
    >
      {initial}
    </div>
  );
}
