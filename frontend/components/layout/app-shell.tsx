import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* Fixed Sidebar - 256px */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Fixed Top Bar - 64px */}
        <TopBar />

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto bg-[#FAFAFA] px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
