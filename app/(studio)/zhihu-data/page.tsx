"use client";

import { useRouter } from "next/navigation";
import ZhihuDataPage from "../../zhihu-data-page";
import { useNotify } from "../../components/notify";

export default function Page() {
  const notify = useNotify();
  const router = useRouter();
  return <ZhihuDataPage notify={notify} onOpenSettings={() => router.push("/settings")} />;
}
