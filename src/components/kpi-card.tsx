import type { LucideIcon } from "lucide-react";
export function KpiCard({label,value,note,icon:Icon}:{label:string;value:string;note:string;icon:LucideIcon}){return <div className="card kpi"><div className="kpi-top"><span>{label}</span><span className="kpi-icon"><Icon/></span></div><strong>{value}</strong><small>{note}</small></div>}
