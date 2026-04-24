import { ReactNode, Suspense } from "react";
import { NavBar } from "@/components/nav-bar";

// NavBar uses useSearchParams which forces this layout out of static
// generation. Mark dynamic explicitly so Next doesn't try (and fail) to
// prerender pages that inherit this layout.
export const dynamic = "force-dynamic";
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
            <Suspense fallback={<header className="kb-topbar" />}>
              <NavBar />
            </Suspense>
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
