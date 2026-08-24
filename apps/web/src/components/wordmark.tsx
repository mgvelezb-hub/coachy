import { cn } from "@/lib/utils";

/**
 * Logotipo de texto: "COACHY" en serif clásica con tracking amplio y la última
 * letra en rosa, más la línea fina que Holy Gains usa como divisor.
 *
 * El texto no cambia — solo su tipografía y su color.
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
      <span className="wordmark leading-none">
        Coach<span className="text-pr">y</span>
      </span>
      {rule ? (
        <span aria-hidden className="mt-1.5 block h-px w-10 bg-pr/70" />
      ) : null}
    </span>
  );
}
