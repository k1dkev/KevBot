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
          <div className="kb-shell">
            <NavBar />
            <div className="kb-body">
              <SideBar />
              <div className="kb-main">
                <div className="kb-content">{children}</div>
              </div>
            </div>
          </div>
          <PlayBar />
        </LibraryFiltersProvider>
      </MusicPlayerProvider>
    </RequireAuth>
  );
}
