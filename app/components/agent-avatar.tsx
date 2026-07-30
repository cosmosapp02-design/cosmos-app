"use client";

interface AgentAvatarProps {
  name: string;
  color?: string;
  size?: number;
  className?: string;
}

export default function AgentAvatar({ name, size = 32, className = "" }: AgentAvatarProps) {
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={`shrink-0 flex items-center justify-center font-bold text-[#1E1F24] rounded-lg select-none ${className}`}
      style={{
        width: size,
        height: size,
        background: "#EFECE6",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        fontSize: size * 0.42,
      }}
    >
      {initial}
    </div>
  );
}
