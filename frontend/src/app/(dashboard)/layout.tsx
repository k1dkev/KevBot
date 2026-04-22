import { ReactNode } from "react";
import { NavBar } from "@/components/nav-bar";
import { SideBar } from "@/components/side-bar";
import { PlayBar } from "@/components/play-bar";
import { RequireAuth } from "@/components/require-auth";
import { MusicPlayerProvider } from "@/lib/contexts/music-player-context";
import { LibraryFiltersProvider } from "@/lib/contexts/library-filters-context";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <RequireAuth>
      <MusicPlayerProvider>
        <LibraryFiltersProvider>
          <div className="relative min-h-screen flex flex-col dark:bg-black bg-zinc-50">
            <NavBar />
            <div className="flex-1 pt-14">
              <div className="h-[calc(100vh-3.5rem-6rem)] flex gap-3 p-3">
                <div className="w-80 rounded-xl border dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
                  <div className="h-full overflow-auto">
                    <SideBar />
                  </div>
                </div>
                <main className="flex-1 rounded-xl border dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
                  <div className="h-full overflow-auto p-3">{children}</div>
                </main>
              </div>
            </div>
            <PlayBar />
          </div>
        </LibraryFiltersProvider>
      </MusicPlayerProvider>
    </RequireAuth>
  );
}
