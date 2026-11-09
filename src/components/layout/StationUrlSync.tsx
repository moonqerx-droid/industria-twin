"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { parseStationParam, useSelection } from "@/store/selection";

function Sync() {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    const fromUrl = parseStationParam(params.get("station"));
    const state = useSelection.getState();
    if (fromUrl) {
      if (state.selectedStationId !== fromUrl) useSelection.setState({ selectedStationId: fromUrl });
    } else if (state.selectedStationId) {
      // Сохраняем выбранный участок при переходе между разделами.
      const url = new URL(window.location.href);
      url.searchParams.set("station", state.selectedStationId);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, [pathname, params]);
  return null;
}

export function StationUrlSync() {
  return (
    <Suspense fallback={null}>
      <Sync />
    </Suspense>
  );
}
