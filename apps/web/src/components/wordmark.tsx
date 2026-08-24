import { cn } from "@/lib/utils";

/**
 * Logotipo de texto: "COACHY" en serif clásica con tracking amplio, un solo
 * color parejo, más la línea fina que Holy Gains usa como divisor.
 */
export function Wordmark({
  className,
  rule = false,
}: {
  className?: string;
  /** Divisor rosa debajo del logotipo (portadas, no headers apretados). */
  rule?: boolean;
}): React.JSX.Element {
  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <span className="wordmark leading-none">Coachy</span>
      {rule ? (
        <span aria-hidden className="mt-1.5 block h-px w-10 bg-pr/70" />
      ) : null}
    </span>
  );
}
