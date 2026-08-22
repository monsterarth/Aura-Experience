"use client";

// Presets de motion do kit — espelham os tokens CSS de aura-tokens.css
// (--dur-*, --ease-*). Ponderação: Emil 1º (rápido, contido), Jakub 2º (polido).
// O kit usa só `m.*` (LazyMotion strict) — nunca `motion.*`.
import React from "react";
import { LazyMotion, domMax, MotionConfig, type Transition, type Variants } from "motion/react";

type Bezier = [number, number, number, number];
export const EASE_OUT: Bezier = [0.22, 1, 0.36, 1];
export const EASE_IN: Bezier = [0.4, 0, 1, 1];
export const EASE_STD: Bezier = [0.4, 0, 0.2, 1];
export const EASE_SHEET: Bezier = [0.32, 0.72, 0, 1];

/** Transições nomeadas. Durações em segundos (motion). */
export const tr = {
  micro:     { duration: 0.12, ease: EASE_OUT },
  base:      { duration: 0.18, ease: EASE_OUT },
  surface:   { duration: 0.2,  ease: EASE_OUT },
  drawer:    { duration: 0.22, ease: EASE_OUT },
  sheet:     { duration: 0.28, ease: EASE_SHEET },
  exit:      { duration: 0.14, ease: EASE_IN },
  exitSheet: { duration: 0.2,  ease: EASE_IN },
  /** Reflow de listas, indicador de abas, assentar drag — mola sem overshoot. */
  layout:    { type: "spring", stiffness: 500, damping: 40 },
} satisfies Record<string, Transition>;

/** Variantes de entrada/saída. Saídas sempre menores e mais curtas que entradas. */
export const v = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: tr.base },
    exit:    { opacity: 0, transition: tr.exit },
  },
  fadeUp: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: tr.base },
    exit:    { opacity: 0, y: 4, transition: tr.exit },
  },
  modal: {
    initial: { opacity: 0, y: 12, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: tr.surface },
    exit:    { opacity: 0, y: 6, scale: 0.99, transition: tr.exit },
  },
  sheet: {
    initial: { y: "100%" },
    animate: { y: 0, transition: tr.sheet },
    exit:    { y: "100%", transition: tr.exitSheet },
  },
  drawerRight: {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0, transition: tr.drawer },
    exit:    { opacity: 0, x: 16, transition: tr.exit },
  },
  drawerLeft: {
    initial: { opacity: 0, x: -24 },
    animate: { opacity: 1, x: 0, transition: tr.drawer },
    exit:    { opacity: 0, x: -16, transition: tr.exit },
  },
  fullscreen: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: tr.drawer },
    exit:    { opacity: 0, y: 8, transition: tr.exit },
  },
  listItem: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0, transition: tr.base },
    exit:    { opacity: 0, scale: 0.98, transition: tr.exit },
  },
  iconSwap: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1, transition: tr.micro },
    exit:    { opacity: 0, scale: 0.9, transition: tr.micro },
  },
} satisfies Record<string, Variants>;

/**
 * Raiz de motion do admin: carrega as features (domMax = layout/layoutId/drag)
 * de forma lazy e respeita `prefers-reduced-motion` do sistema.
 */
export function AuraMotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={tr.base}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
