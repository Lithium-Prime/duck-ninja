import { useEffect, useState } from "react";
import { getSession } from "@/lib/api";
import type { User } from "@/types";

export function useSession() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  async function refresh() {
    const s = await getSession();
    setUser(s?.user ?? null);
  }
  useEffect(() => {
    void refresh().catch(() => setUser(null));
  }, []);
  return { user, refresh, setUser };
}
