import logo from "@/assets/mozaplay-logo.png";
import { cn } from "@/lib/utils";

export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src={logo}
      alt="MozaPlay"
      width={size}
      height={size}
      className={cn("shrink-0 drop-shadow-[0_6px_18px_rgba(250,190,40,0.28)]", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Logo size={size} />
      <div className="leading-none">
        <p className="font-display text-lg font-extrabold tracking-tight">
          MOZA<span className="text-primary">PLAY</span>
        </p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Joga. Desafia. Compete.
        </p>
      </div>
    </div>
  );
}
