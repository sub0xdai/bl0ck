import { cn } from "@/lib/utils";
import { type ComponentProps, memo, useMemo } from "react";
import { Streamdown } from "streamdown";

type ResponseProps = ComponentProps<typeof Streamdown>;

/**
 * Preprocess message content to add semantic markers for styling
 * - Detects warning/note patterns and wraps them for styling
 * - Detects key-value data patterns
 */
function preprocessContent(content: string): string {
  if (typeof content !== 'string') return content;

  let processed = content;

  // Wrap warning/caution/note patterns in blockquotes with markers
  // Pattern: lines starting with Warning:, Note:, Caution:, Important:, ⚠️, etc.
  processed = processed.replace(
    /^((?:⚠️?\s*)?(?:Warning|Caution|Alert|Important|Note|Info|Tip):?\s*.+)$/gim,
    '> [!$1]'
  );

  return processed;
}

export const Response = memo(
  ({ className, children, ...props }: ResponseProps) => {
    // Preprocess content to add semantic markers
    const processedChildren = useMemo(() => {
      if (typeof children === 'string') {
        return preprocessContent(children);
      }
      return children;
    }, [children]);

    return (
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",

          // === Link Styles ===
          "[&_a]:underline [&_a]:underline-offset-2 [&_a]:font-medium",
          "[&_a]:text-blue-700 dark:[&_a]:text-blue-400",
          "hover:[&_a]:text-blue-600 dark:hover:[&_a]:text-blue-300",
          "[&_a]:decoration-blue-600/50 dark:[&_a]:decoration-blue-400/60 hover:[&_a]:decoration-2",
          "focus-visible:[&_a]:outline-none focus-visible:[&_a]:ring-1 focus-visible:[&_a]:ring-blue-400/40 focus-visible:[&_a]:rounded-sm",
          "[&_a]:wrap-break-word",

          // === UX IMPROVEMENT #3: Enhanced Blockquote Styles (Warning Callouts) ===
          "[&_blockquote]:my-3 [&_blockquote]:pl-4 [&_blockquote]:py-2.5",
          "[&_blockquote]:border-l-4 [&_blockquote]:rounded-r",
          // Amber/Yellow warning color - more prominent
          "[&_blockquote]:bg-amber-500/10 [&_blockquote]:border-amber-500",
          "[&_blockquote]:text-amber-100",
          "[&_blockquote_p]:m-0 [&_blockquote_p]:text-sm [&_blockquote_p]:leading-relaxed",
          // Add a subtle icon effect via before pseudo-element
          "[&_blockquote]:relative",
          "before:[&_blockquote]:content-['⚠'] before:[&_blockquote]:absolute before:[&_blockquote]:-left-1",
          "before:[&_blockquote]:top-2 before:[&_blockquote]:text-amber-500 before:[&_blockquote]:text-lg",

          // === UX IMPROVEMENT #1: Better paragraph spacing and line-height ===
          "[&_p]:my-2 [&_p]:leading-relaxed",

          // === List Styles (Grid-like appearance) ===
          "[&_ul]:my-2 [&_ul]:space-y-1",
          "[&_ol]:my-2 [&_ol]:space-y-1",
          "[&_li]:text-sm [&_li]:leading-relaxed",
          "[&_li]:pl-1 [&_li]:marker:text-muted-foreground",

          // === Table Styles ===
          "[&_table]:w-full [&_table]:my-2 [&_table]:text-sm",
          "[&_table]:border-collapse [&_table]:border [&_table]:border-border/50",
          "[&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium",
          "[&_th]:bg-accent/50 [&_th]:border [&_th]:border-border/50",
          "[&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-border/50",
          "[&_tr:hover]:bg-accent/20",

          // === Code Styles ===
          "[&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs",
          "[&_code]:bg-accent/50 [&_code]:font-mono",
          "[&_pre]:my-2 [&_pre]:p-2 [&_pre]:rounded [&_pre]:bg-accent/30",
          "[&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0",

          // === Strong/Bold for emphasis ===
          "[&_strong]:font-semibold [&_strong]:text-foreground",

          // === Horizontal Rule ===
          "[&_hr]:my-3 [&_hr]:border-border/50",

          className
        )}
        {...props}
      >
        {processedChildren}
      </Streamdown>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
