import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, ...props }, ref) => {
    const variants = {
      primary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm border border-emerald-500/50",
      secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700",
      outline: "bg-transparent border border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white",
      ghost: "bg-transparent text-zinc-400 hover:text-white hover:bg-zinc-800/50",
      destructive: "bg-red-900/50 text-red-200 border border-red-800 hover:bg-red-900/80",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 py-2 text-sm",
      lg: "h-12 px-6 text-base",
      icon: "h-10 w-10 p-2",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
