"use client";

import React, { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
    value: number;
    onChange?: (v: number) => void;   // se fornecido, é interativo
    size?: number;
    className?: string;
}

export function StarRating({ value, onChange, size = 18, className = "" }: StarRatingProps) {
    const [hover, setHover] = useState<number | null>(null);
    const interactive = !!onChange;
    const display = hover ?? value;

    return (
        <div className={`flex items-center gap-0.5 ${className}`}>
            {[1, 2, 3, 4, 5].map(i => {
                const filled = i <= Math.round(display);
                return (
                    <button
                        key={i}
                        type="button"
                        disabled={!interactive}
                        onClick={() => onChange?.(i)}
                        onMouseEnter={() => interactive && setHover(i)}
                        onMouseLeave={() => interactive && setHover(null)}
                        className={interactive ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"}
                        aria-label={`${i} estrelas`}
                    >
                        <Star
                            size={size}
                            className={filled ? "text-amber-400" : "text-muted-foreground/30"}
                            fill={filled ? "currentColor" : "none"}
                        />
                    </button>
                );
            })}
        </div>
    );
}
