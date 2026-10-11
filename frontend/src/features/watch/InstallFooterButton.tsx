"use client";

import { Download } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { promptInstall } from "@/lib/pwa";
import { useInstallState, useIsPhone } from "./hooks";
import { openInstallPopup } from "./InstallPopup";

/** Footer "Install the app" — phones only, hidden once installed. */
export function InstallFooterButton({ dict }: { dict: Dictionary }) {
  const phone = useIsPhone();
  const { offer, standalone } = useInstallState();
  if (!phone || standalone || offer === "installed") return null;

  return (
    <button
      type="button"
      onClick={() => {
        // Android/Chrome: the browser's own install dialog. Elsewhere (iPhone): the popup with the steps.
        if (offer === "prompt") void promptInstall();
        else openInstallPopup();
      }}
      className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft"
    >
      <Download className="size-4" aria-hidden />
      {dict.watch.installFooter}
    </button>
  );
}
