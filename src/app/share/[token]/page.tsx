import PublicDashboardView from "./PublicDashboardView";

export const metadata = { robots: { index: false, follow: false } };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicDashboardView token={token} />;
}
