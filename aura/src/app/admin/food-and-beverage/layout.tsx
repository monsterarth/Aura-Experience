"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Coffee, ListOrdered, FileText } from "lucide-react";

export default function FandBLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const tabs = [
        { name: "Pedidos", href: "/admin/food-and-beverage/orders", icon: ListOrdered },
        { name: "Cardápio", href: "/admin/food-and-beverage/menu", icon: FileText },
    ];

    return (
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-8 animate-in fade-in">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
                        <Coffee className="text-primary" size={32} />
                        Gastronomia (F&B)
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium mt-1">
                        Gestão do Restaurante e opções de Café da Manhã.
                    </p>
                </div>
            </header>

            <div className="flex border-b border-border gap-8 overflow-x-auto custom-scrollbar">
                {tabs.map((tab) => {
                    const isActive = pathname.startsWith(tab.href);
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={cn(
                                "pb-4 font-bold uppercase tracking-widest text-xs flex items-center gap-2 transition-all border-b-2 whitespace-nowrap",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <tab.icon size={16} /> {tab.name}
                        </Link>
                    );
                })}
            </div>

            <main>
                {children}
            </main>
        </div>
    );
}
