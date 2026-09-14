import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getSession, isDivisionLead } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A divisional leader sees only their own nav entry. This is presentation —
  // the middleware and each page's own check are what actually deny access.
  const session = await getSession();
  const divisionOnly = !!session && isDivisionLead(session);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar divisionOnly={divisionOnly} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
