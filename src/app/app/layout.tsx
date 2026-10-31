import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/server/auth/session";
export const dynamic="force-dynamic";
export default async function ProtectedLayout({children}:{children:React.ReactNode}){const session=await getSession();if(!session)redirect("/login");return <AppShell session={session}>{children}</AppShell>}
