"use client";

import { Check } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const NotifyContext = createContext<(message: string) => void>(() => undefined);

export function NotifyProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState("");
  const timerRef = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const notify = useCallback((message: string) => {
    window.clearTimeout(timerRef.current);
    setToast(message);
    timerRef.current = window.setTimeout(() => setToast(""), 2400);
  }, []);
  return (
    <NotifyContext.Provider value={notify}>
      {children}
      {toast ? <div className="toast"><Check size={16}/> {toast}</div> : null}
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  return useContext(NotifyContext);
}
