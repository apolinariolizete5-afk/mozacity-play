
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MatchShell, ResultOverlay } from "@/components/MatchShell";
import { LudoBoard } from "@/components/boards/LudoBoard";
import { Button, Card, Pill } from "@/components/ui/primitives";
import {
  LUDO_COLORS,
  LUDO_NAMES,
  ludoBotMove,
  ludoEngine,
  movableTokens,
  type LudoMove,
} from "@/lib/games/ludo";
import { botName, placeBet, recordMatch, useApp } from "@/lib/store";
import { ArrowDown, Dice5, Flame, Trophy } from "lucide-react";

export const Route = createFileRoute("/games/ludo")({
  validateSearch: (search: Record<string, unknown>) => ({
    bet: Number(search["bet"] ?? 0) || 0,
    timer: Number(search["timer"] ?? 15) || 15,
    players: Math.min(4, Math.max(2, Number(search["players"] ?? 4) || 4)),
  
