import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-teal-800", className)} {...props} />;
}
