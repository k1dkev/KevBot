import { ReactNode, Suspense } from "react";
import { NavBar } from "@/components/nav-bar";
import { SideBar } from "@/components/side-bar";
import { PlayBar } from "@/components/play-bar";
import { RequireAuth } from "@/components/require-auth";
import { MusicPlayerProvider } from "@/lib/contexts/music-player-context";
import { LibraryFiltersProvider } from "@/lib/contexts/library-filters-context";
import { SearchProvider } from "@/lib/contexts/search-context";

// SearchProvider and NavBar use useSearchParams, which precludes static
// prerender of any page that inherits this layout.
export const dynamic = "force-dynamic";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <RequireAuth>
      <MusicPlayerProvider>
        <LibraryFiltersProvider>
          <Suspense fallback={null}>
            <SearchProvider>
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
            </SearchProvider>
          </Suspense>
        </LibraryFiltersProvider>
      </MusicPlayerProvider>
    </RequireAuth>
  );
}
