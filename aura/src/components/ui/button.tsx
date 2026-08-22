"use client";

// Adaptador do Button do shadcn -> kit Aura. Os ~19 importadores antigos
// (variant default|destructive|outline|secondary|ghost|link, size icon) passam a
// renderizar o Button do kit sem mudar uma linha. buttonVariants continua
// exportado (calendar.tsx usa como classe) — é a cva antiga, só para esse caso.
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Button as AuraButton, type ButtonVariant, type ButtonSize } from "@/components/aura/Button";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const VARIANT_MAP: Record<string, ButtonVariant> = {
  default: "primary",
  destructive: "danger-solid",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  link: "link",
};
const SIZE_MAP: Record<string, ButtonSize> = { default: "md", sm: "sm", lg: "lg", icon: "md" };

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const v = VARIANT_MAP[variant ?? "default"] ?? "primary";
    const s = SIZE_MAP[size ?? "default"] ?? "md";
    if (asChild) {
      return (
        <Slot
          className={cn("ak-btn ak-press ak-focus", size === "icon" && "ak-btn--icon", className)}
          data-variant={v}
          data-size={s}
          ref={ref}
          {...(props as object)}
        >
          {children}
        </Slot>
      );
    }
    return (
      <AuraButton
        ref={ref}
        variant={v}
        size={s}
        className={cn(size === "icon" && "ak-btn--icon", className)}
        {...props}
      >
        {children}
      </AuraButton>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
