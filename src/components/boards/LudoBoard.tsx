import {
  FINISHED,
  LUDO_COLORS,
  LUDO_BG_COLORS,
  RING,
  SAFE_STEPS,
  cellFor,
  movableTokens,
  ringCell,
  type LudoState,
} from "@/lib/games/ludo";
import { cn } from "@/lib/utils";
import { Sparkles, Star } from "lucide-react";

interface TokenView {
  player: number;
  token: number;
  row: number;
  col: number;
  movable: boolean;
}
