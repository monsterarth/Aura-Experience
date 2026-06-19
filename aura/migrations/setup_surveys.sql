-- Creates survey related tables for new Aura Experience feature
-- Please run this script in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.survey_categories (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "propertyId" text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.survey_templates (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "propertyId" text NOT NULL,
    title text NOT NULL,
    "isDefault" boolean DEFAULT false,
    questions jsonb NOT NULL DEFAULT '[]'::jsonb,
    reward jsonb NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.survey_responses (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "propertyId" text NOT NULL,
    "stayId" text NOT NULL,
    "guestId" text NOT NULL,
    "templateId" uuid NOT NULL,
    answers jsonb NOT NULL DEFAULT '[]'::jsonb,
    metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.survey_insights (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "propertyId" text NOT NULL,
    period text NOT NULL,
    "startDate" text NOT NULL,
    "endDate" text NOT NULL,
    "positiveInsight" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "attentionInsight" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.stays 
ADD COLUMN IF NOT EXISTS "hasSurvey" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "npsScore" double precision;
