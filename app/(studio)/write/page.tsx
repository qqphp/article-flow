"use client";

import { Suspense } from "react";
import WritePage from "../../components/write-page";

export default function Page() {
  return (
    <Suspense fallback={<div className="page"><div className="empty-state">正在打开写作台...</div></div>}>
      <WritePage />
    </Suspense>
  );
}
