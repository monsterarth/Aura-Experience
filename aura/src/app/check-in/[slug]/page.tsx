// src/app/check-in/[slug]/page.tsx
import { PropertyProvider } from "@/context/PropertyContext";
import { CheckInForm } from "@/components/guest/CheckInForm";
import { Metadata } from "next";

// Gerar metadados dinâmicos baseados no slug (Opcional, mas recomendado para SEO/Branding)
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const name = params.slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  return {
    title: `Check-in | ${name}`,
    description: "Realize seu check-in de forma rápida e segura no Projeto Aura.",
  };
}

export default function CheckInPage({ params }: { params: { slug: string } }) {
  return (
    // O PropertyProvider envolve a página e injeta as cores/dados da propriedade via slug
    <PropertyProvider initialSlug={params.slug}>
      <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-2xl">
          <CheckInForm />
        </div>
      </main>
    </PropertyProvider>
  );
}