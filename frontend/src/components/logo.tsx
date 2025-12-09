import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  inverted?: boolean;
}

const sizeClasses = {
  sm: "size-6",
  md: "size-8",
  lg: "size-12",
  xl: "size-16",
  "2xl": "size-20",
};

export function Logo({ size = "md", className, inverted = false }: LogoProps) {
  if (inverted) {
    // Inverted: filled background with cutout logo
    return (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(sizeClasses[size], className)}
        aria-label="Stashd logo"
      >
        {/* Filled background */}
        <rect width="64" height="64" fill="currentColor" rx="8" />
        {/* Cutout center - creates the inverse effect */}
        <rect x="12" y="12" width="40" height="40" fill="var(--sidebar-primary)" className="fill-sidebar-primary" />
        {/* Square dots in S-diagonal pattern (now filled) */}
        <rect x="28" y="16" width="8" height="8" fill="currentColor" />
        <rect x="40" y="16" width="8" height="8" fill="currentColor" />
        <rect x="28" y="28" width="8" height="8" fill="currentColor" />
        <rect x="16" y="40" width="8" height="8" fill="currentColor" />
        <rect x="28" y="40" width="8" height="8" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(sizeClasses[size], className)}
      aria-label="Stashd logo"
    >
      {/* Box frame */}
      <rect x="4" y="4" width="56" height="8" fill="currentColor" />
      <rect x="4" y="52" width="56" height="8" fill="currentColor" />
      <rect x="4" y="4" width="8" height="56" fill="currentColor" />
      <rect x="52" y="4" width="8" height="56" fill="currentColor" />
      {/* Square dots in S-diagonal pattern */}
      <rect x="28" y="16" width="8" height="8" fill="currentColor" />
      <rect x="40" y="16" width="8" height="8" fill="currentColor" />
      <rect x="28" y="28" width="8" height="8" fill="currentColor" />
      <rect x="16" y="40" width="8" height="8" fill="currentColor" />
      <rect x="28" y="40" width="8" height="8" fill="currentColor" />
    </svg>
  );
}
