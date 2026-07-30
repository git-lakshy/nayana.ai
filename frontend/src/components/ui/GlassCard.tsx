"use client";

// Frosted glass card used across the dark pine UI.

import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  strong?: boolean;
  padded?: boolean;
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ strong = false, padded = true, className = "", children, ...rest }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={`${strong ? "glass-strong" : "glass"} ${padded ? "p-6" : ""} ${className}`}
        {...rest}
      >
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = "GlassCard";
export default GlassCard;
