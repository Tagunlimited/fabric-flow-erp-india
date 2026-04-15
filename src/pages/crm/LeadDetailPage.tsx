import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, Save, Mail, Phone, Building2, Target, Globe, UserRound, CalendarClock, History, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LeadStatus = "contacted" | "not_interested" | "negotiation" | "converted";

type LeadRow = {
  id: string;
  created_at: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company_activity: string | null;
  interest: string | null;
  project_details: string | null;
  source: string | null;
  referral: string | null;
  assigned_sales_manager: string | null;
  lead_status: LeadStatus | null;
  lead_remark: string | null;
};

type SalesManager = { id: string; full_name: string; department?: string | null; avatar_url?: string | null };
type LeadActivity = {
  id: string;
  created_at: string;
  status: LeadStatus | null;
  remark: string | null;
  sales_manager_id: string | null;
  created_by: string | null;
};

const LEAD_STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "contacted", label: "Contacted" },
  { value: "not_interested", label: "Not Interested" },
  { value: "negotiation", label: "Negotiation" },
  { value: "converted", label: "Converted" },
];

const getLeadStatusBadgeClassName = (status?: string | null) => {
  switch (status) {
    case "converted":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "not_interested":
      return "bg-red-100 text-red-800 border-red-200";
    case "contacted":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "negotiation":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getLeadStatusLabel = (status?: string | null) =>
  LEAD_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? "New";

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const getLeadInitials = (name?: string | null) => {
  const clean = (name || "").trim();
  if (!clean) return "LD";
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
};

const getInitials = (value?: string | null) => {
  const clean = (value || "").trim();
  if (!clean) return "SM";
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
};

export default function LeadDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [salesManagers, setSalesManagers] = useState<SalesManager[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [salesManagerId, setSalesManagerId] = useState<string>("");
  const [remark, setRemark] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const salesManagerMap = useMemo(() => {
    const m: Record<string, { full_name: string; avatar_url?: string | null }> = {};
    salesManagers.forEach((sm) => {
      m[sm.id] = { full_name: sm.full_name || "—", avatar_url: sm.avatar_url || null };
    });
    return m;
  }, [salesManagers]);

  const hasUnsavedChanges = useMemo(() => {
    if (!lead) return false;
    const normalizedRemark = remark.trim();
    const normalizedCurrentRemark = (lead.lead_remark || "").trim();
    return (
      (status || "") !== (lead.lead_status || "") ||
      (salesManagerId || "") !== (lead.assigned_sales_manager || "") ||
      normalizedRemark !== normalizedCurrentRemark
    );
  }, [lead, status, salesManagerId, remark]);

  const fetchLead = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("contact_submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (e) {
      setError(e.message);
      setLead(null);
    } else if (!data) {
      setError("Lead not found.");
      setLead(null);
    } else {
      const row = data as unknown as LeadRow;
      setLead(row);
      setStatus((row.lead_status as LeadStatus | null) ?? "");
      setSalesManagerId(row.assigned_sales_manager ?? "");
      setRemark(row.lead_remark ?? "");
    }
    setLoading(false);
  }, [id]);

  const fetchSalesManagers = useCallback(async () => {
    const { data } = await supabase.from("employees").select("id, full_name, department, avatar_url").order("full_name");
    const rows = (data || []) as SalesManager[];
    const filtered = rows.filter((emp) => (emp.department || "").toLowerCase().includes("sales"));
    setSalesManagers(filtered);
  }, []);

  const fetchActivities = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("lead_status_activities")
      .select("id, created_at, status, remark, sales_manager_id, created_by")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });
    setActivities((data || []) as LeadActivity[]);
  }, [id]);

  useEffect(() => {
    void Promise.all([fetchLead(), fetchSalesManagers(), fetchActivities()]);
  }, [fetchLead, fetchSalesManagers, fetchActivities]);

  const saveLeadDetails = async () => {
    if (!id || !lead) return;
    setSaving(true);
    try {
      const statusValue: LeadStatus | null = status ? (status as LeadStatus) : null;
      const managerValue = salesManagerId || null;
      const remarkValue = remark.trim() || null;

      const { error: updateError } = await (supabase
        .from("contact_submissions") as any)
        .update({
          lead_status: statusValue,
          assigned_sales_manager: managerValue,
          lead_remark: remarkValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updateError) throw updateError;

      const { data: authUser } = await supabase.auth.getUser();
      const { error: activityError } = await (supabase
        .from("lead_status_activities") as any)
        .insert({
          lead_id: id,
          status: statusValue,
          sales_manager_id: managerValue,
          remark: remarkValue,
          created_by: authUser.user?.id ?? null,
        });
      if (activityError) throw activityError;

      toast.success("Lead details saved");
      await Promise.all([fetchLead(), fetchActivities()]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save lead details");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ErpLayout>
        <div className="h-[70vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ErpLayout>
    );
  }

  if (!lead) {
    return (
      <ErpLayout>
        <div className="p-6">
          <Button variant="outline" onClick={() => navigate("/crm/leads")} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Leads
          </Button>
          <Card>
            <CardContent className="py-10 text-destructive">{error || "Lead not found."}</CardContent>
          </Card>
        </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate("/crm/leads")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                  {getLeadInitials(lead.name)}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{lead.name || "Lead Details"}</h1>
                  <p className="text-sm text-muted-foreground">
                    Submitted: {formatDateTime(lead.created_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" />
                Unsaved changes
              </Badge>
            )}
            <Badge variant="outline" className={getLeadStatusBadgeClassName(status || lead.lead_status)}>
              {getLeadStatusLabel(status || lead.lead_status)}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader>
              <CardTitle>Lead Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Email</div>
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="font-medium text-primary hover:underline break-all">{lead.email}</a>
                  ) : "—"}
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</div>
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="font-medium hover:underline">{lead.phone}</a>
                  ) : "—"}
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Company / Activity</div>
                  <div className="font-medium">{lead.company_activity || "—"}</div>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Target className="h-3.5 w-3.5" /> Interest</div>
                  <div className="font-medium">{lead.interest || "—"}</div>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Source</div>
                  <div className="font-medium">{lead.source || "website_contact_modal"}</div>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> Referral</div>
                  <div className="font-medium">{lead.referral || "—"}</div>
                </div>
              </div>
              <Separator />
              <div>
                <div className="text-xs text-muted-foreground mb-2">Project Details</div>
                <div className="rounded-lg border p-3 bg-background min-h-20">
                  <p className="whitespace-pre-wrap">{lead.project_details || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:sticky lg:top-6 h-fit">
            <CardHeader>
              <CardTitle>Update Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Sales Manager</Label>
                <Select value={salesManagerId || "unassigned"} onValueChange={(v) => setSalesManagerId(v === "unassigned" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sales manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {salesManagers.map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        {manager.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {salesManagerId && (
                  <div className="mt-2 rounded-md border p-2 flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={salesManagerMap[salesManagerId]?.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">
                        {getInitials(salesManagerMap[salesManagerId]?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-sm">{salesManagerMap[salesManagerId]?.full_name || "Assigned"}</div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status || "new"} onValueChange={(v) => setStatus(v === "new" ? "" : (v as LeadStatus))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    {LEAD_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Remark</Label>
                <Textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={5}
                  placeholder="Add lead remark..."
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={!hasUnsavedChanges || saving}
                  onClick={() => {
                    setStatus((lead.lead_status as LeadStatus | null) ?? "");
                    setSalesManagerId(lead.assigned_sales_manager ?? "");
                    setRemark(lead.lead_remark ?? "");
                  }}
                >
                  Reset
                </Button>
                <Button className="flex-[2]" onClick={saveLeadDetails} disabled={saving || !hasUnsavedChanges}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Lead Details
              </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Lead Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <div className="text-sm text-muted-foreground">No activity yet.</div>
            ) : (
              <div className="space-y-4">
                {activities.map((activity, idx) => (
                  <div key={activity.id} className="relative pl-6">
                    {idx !== activities.length - 1 && (
                      <span className="absolute left-[11px] top-7 bottom-[-14px] w-px bg-border" />
                    )}
                    <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-primary/80 border-2 border-background" />
                    <div className="rounded-lg border p-3 hover:bg-muted/20 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={getLeadStatusBadgeClassName(activity.status)}>
                            {getLeadStatusLabel(activity.status)}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {activity.sales_manager_id
                              ? `Sales Manager: ${salesManagerMap[activity.sales_manager_id]?.full_name || "—"}`
                              : "Sales Manager: Unassigned"}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {formatDateTime(activity.created_at)}
                        </span>
                      </div>
                      {activity.sales_manager_id && (
                        <div className="mt-2 flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={salesManagerMap[activity.sales_manager_id]?.avatar_url || undefined} />
                            <AvatarFallback className="text-[10px]">
                              {getInitials(salesManagerMap[activity.sales_manager_id]?.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">
                            {salesManagerMap[activity.sales_manager_id]?.full_name || "Assigned manager"}
                          </span>
                        </div>
                      )}
                      <p className="mt-2 text-sm whitespace-pre-wrap">{activity.remark || "No remark"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
}

