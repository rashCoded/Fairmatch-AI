"use client";

import { motion } from "framer-motion";

interface MatchScoreRingProps {
  score: number; // 0-1
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function MatchScoreRing({
  score,
  size = 72,
  strokeWidth = 6,
  className,
}: MatchScoreRingProps) {
  const percentage = Math.round(score * 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - score * circumference;

  const getColor = () => {
    if (percentage >= 70) return "#20C997";
    if (percentage >= 40) return "#F59E0B";
    return "#EF4444";
  };

  const color = getColor();

  return (
    <div className={className} style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted/50"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.span
          className="text-sm font-bold"
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {percentage}%
        </motion.span>
      </div>
    </div>
  );
}
