"use client";

import { Printer } from "lucide-react";
import { Button } from "./Button";

/** Печать страницы или сохранение в PDF средствами браузера (стили печати — globals.css). */
export function PrintButton({ label = "Печать / PDF" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()} className="no-print" aria-label={label}>
      <Printer className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
