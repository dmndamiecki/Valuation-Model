import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[0.72rem] font-bold uppercase tracking-[0.08em] text-slate-600", className)} {...props} />;
}
