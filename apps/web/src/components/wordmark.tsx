import { cn } from "@/lib/utils";

/**
 * Logotipo Holy Gains, réplica del wordmark oficial del brand kit:
 * "HOLY" en Cinzel con tracking amplio, "Gains" en Cormorant cursiva.
 */
export function Wordmark({
  className,
  rule = false,
}: {
  className?: string;
  /** Versión de portada: apilado, con el verso 1 Cor 16:14 debajo. */
  rule?: boolean;
}): React.JSX.Element {
  if (rule) {
    return (
      <span className={cn("inline-flex flex-col items-center", className)}>
        <span className="wordmark leading-none">Holy</span>
        <span className="verse mt-0.5 text-[0.72em] tracking-[0.35em] opacity-90">Gains</span>
        <span
          aria-hidden
          className="mt-2 text-[0.42em] uppercase tracking-[0.5em] opacity-60"
          style={{ fontFamily: "var(--font-display)" }}
        >
          1 · Cor · 16 · 14
        </span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="wordmark leading-none">Holy</span>
      <span className="verse text-[0.85em] tracking-[0.12em]">Gains</span>
    </span>
  );
}
