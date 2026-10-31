"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChartNoAxesCombined, CreditCard, FileText, FlaskConical, LayoutDashboard, LogOut, Menu, Network, RefreshCw, Settings, ShieldCheck, ShoppingCart, Sparkles, TriangleAlert, X } from "lucide-react";
import type { Session } from "@/server/auth/session";

const nav = [
  ["Overview", "/app", LayoutDashboard], ["Orders", "/app/orders", ShoppingCart], ["Invoices", "/app/invoices", FileText], ["Payments", "/app/payments", CreditCard], ["Reconciliation", "/app/reconciliation", RefreshCw], ["Exception Center", "/app/exceptions", TriangleAlert],
  ["AI Insights", "/app/ai-insights", Sparkles], ["Governance Center", "/app/governance", ShieldCheck], ["Workflow Lab", "/app/workflow-lab", FlaskConical], ["Analytics", "/app/analytics", ChartNoAxesCombined], ["Architecture", "/app/architecture", Network], ["Settings", "/app/settings", Settings],
] as const;

function Navigation({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return <><div className="nav-section">Financial operations</div>{nav.slice(0, 6).map(([label, href, Icon]) => <Link onClick={onNavigate} key={href} href={href} className={`nav-link ${path === href ? "active" : ""}`}><Icon />{label}</Link>)}<div className="nav-section">Intelligence & controls</div>{nav.slice(6).map(([label, href, Icon]) => <Link onClick={onNavigate} key={href} href={href} className={`nav-link ${path === href ? "active" : ""}`}><Icon />{label}</Link>)}</>;
}

export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter(); const [open, setOpen] = useState(false); const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); } }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [open]);
  async function logout() { await fetch("/api/session/logout", { method: "POST", headers: { "content-type": "application/json" } }); router.push("/login"); router.refresh(); }
  return <div className="app-frame"><aside className="sidebar"><Link className="brand" href="/app"><span className="mark">Ⅱ</span><span>Second Entry</span></Link><Navigation path={path} /><div className="sidebar-footer"><BookOpen size={15} /><p>Local synthetic demo</p><span>No real funds or accounts</span><button className="logout-button" onClick={logout}><LogOut size={15} />Sign out</button></div></aside><main className="main"><header className="topbar"><button ref={menuButton} className="mobile-menu-button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen((value) => !value)}>{open ? <X /> : <Menu />}</button><div className="workspace-label"><small>Workspace</small><div>Synthetic Portfolio Operations</div></div><div className="user"><div style={{ textAlign: "right" }}><b style={{ fontSize: 12 }}>{session.name}</b><br /><small>{session.role.replaceAll("_", " ")}</small></div><span className="avatar">{session.name.charAt(0)}</span></div></header>{open && <nav id="mobile-navigation" className="mobile-navigation" aria-label="Application navigation"><Navigation path={path} onNavigate={()=>setOpen(false)} /><button className="nav-link logout-button" onClick={logout}><LogOut />Sign out</button></nav>}<div className="content">{children}</div></main></div>;
}
