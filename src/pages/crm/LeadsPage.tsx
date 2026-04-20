import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, Loader2, Globe, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ContactSubmission = Database["public"]["Tables"]["contact_submissions"]["Row"];
type LeadStatus = "contacted" | "not_interested" | "negotiation" | "converted";

type LeadRow = ContactSubmission & {
  assigned_sales_manager?: string | null;
  lead_status?: LeadStatus | null;
  lead_remark?: string | null;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
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

const getInitials = (value?: string | null) => {
  const clean = (value || "").trim();
  if (!clean) return "SM";
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
};

const LEAD_STATUS_CARD_CONFIG: Array<{
  key: "new" | LeadStatus;
  label: string;
  className: string;
}> = [
  { key: "new", label: "New", className: "border-slate-200 bg-slate-50 text-slate-800" },
  { key: "contacted", label: "Contacted", className: "border-blue-200 bg-blue-50 text-blue-800" },
  { key: "negotiation", label: "Negotiation", className: "border-amber-200 bg-amber-50 text-amber-800" },
  { key: "not_interested", label: "Not Interested", className: "border-red-200 bg-red-50 text-red-800" },
  { key: "converted", label: "Converted", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
];

const LeadsPage = () => {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [salesManagerMap, setSalesManagerMap] = useState<Record<string, { full_name: string; avatar_url?: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showSource, setShowSource] = useState(true);
  const [activeStatusFilter, setActiveStatusFilter] = useState<"new" | LeadStatus | null>(null);
  const [sortField, setSortField] = useState<keyof ContactSubmission>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [columnFilters, setColumnFilters] = useState({
    contact: '',
    sales_manager: '',
    status: '',
    details: '',
  });
  const [filterDialogColumn, setFilterDialogColumn] = useState<keyof typeof columnFilters | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("contact_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (e) {
      setError(e.message);
      setLeads([]);
    } else {
      const rows = (data ?? []) as LeadRow[];
      setLeads(rows);
      const managerIds = Array.from(
        new Set(
          rows
            .map((r) => r.assigned_sales_manager)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      );

      if (managerIds.length > 0) {
        const { data: managerRows } = await supabase
          .from("employees")
          .select("id, full_name, avatar_url")
          .in("id", managerIds as any);
        const map: Record<string, { full_name: string; avatar_url?: string | null }> = {};
        (managerRows || []).forEach((r: any) => {
          if (r?.id) {
            map[r.id] = {
              full_name: r.full_name || "—",
              avatar_url: r.avatar_url || null,
            };
          }
        });
        setSalesManagerMap(map);
      } else {
        setSalesManagerMap({});
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleSort = useCallback((field: string) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDirection("desc");
      return field as keyof ContactSubmission;
    });
  }, []);

  const includesFilter = (value: unknown, filterValue: string) =>
    filterValue.trim() === '' || String(value ?? '').toLowerCase().includes(filterValue.trim().toLowerCase());
  const filteredAndSorted = useMemo(() => {
    const lower = search.trim().toLowerCase();
    let list = leads;
    if (activeStatusFilter) {
      list = list.filter((row) => {
        const rowStatus: "new" | LeadStatus = row.lead_status ? row.lead_status : "new";
        return rowStatus === activeStatusFilter;
      });
    }
    if (lower) {
      list = list.filter(
        (row) =>
          row.name?.toLowerCase().includes(lower) ||
          row.email?.toLowerCase().includes(lower) ||
          row.company_activity?.toLowerCase().includes(lower) ||
          row.interest?.toLowerCase().includes(lower) ||
          row.phone?.toLowerCase().includes(lower) ||
          (row.referral && row.referral.toLowerCase().includes(lower)) ||
          (row.source && row.source.toLowerCase().includes(lower)) ||
          (row.project_details && row.project_details.toLowerCase().includes(lower))
      );
    }
    const withColumnFilters = list.filter((row) => {
      const contactText = `${row.email || ''} ${row.phone || ''}`;
      const managerText = row.assigned_sales_manager
        ? (salesManagerMap[row.assigned_sales_manager]?.full_name || '')
        : '';
      const statusText = getLeadStatusLabel(row.lead_status);
      const detailsText = row.project_details || '';
      return includesFilter(contactText, columnFilters.contact)
        && includesFilter(managerText, columnFilters.sales_manager)
        && includesFilter(statusText, columnFilters.status)
        && includesFilter(detailsText, columnFilters.details);
    });
    return [...withColumnFilters].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const cmp = aVal == null && bVal == null ? 0 : (aVal ?? "") < (bVal ?? "") ? -1 : (aVal ?? "") > (bVal ?? "") ? 1 : 0;
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [leads, search, sortField, sortDirection, activeStatusFilter, salesManagerMap, columnFilters]);
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim() !== '');

  const leadStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      new: 0,
      contacted: 0,
      not_interested: 0,
      negotiation: 0,
      converted: 0,
    };
    leads.forEach((lead) => {
      const status = lead.lead_status;
      if (!status) {
        counts.new += 1;
        return;
      }
      if (counts[status] === undefined) {
        counts.new += 1;
      } else {
        counts[status] += 1;
      }
    });
    return counts;
  }, [leads]);

  return (
    <ErpLayout fullPage>
      <TooltipProvider>
        <div className="flex flex-col min-h-[calc(100vh-4rem)] w-full">
          {/* Full-width header */}
          <header className="w-full border-b bg-muted/30 shrink-0">
            <div className="w-full px-6 py-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Globe className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                      Leads from Website
                    </h1>
                    <p className="text-muted-foreground mt-1">
                      Contact form submissions from your website
                    </p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </span>
                  ) : (
                    <span>
                      {filteredAndSorted.length} lead{filteredAndSorted.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 p-6 w-full">
            {!loading && !error && (
              <div className="mb-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {LEAD_STATUS_CARD_CONFIG.map((cfg) => (
                  <button
                    key={cfg.key}
                    type="button"
                    onClick={() =>
                      setActiveStatusFilter((prev) => (prev === cfg.key ? null : cfg.key))
                    }
                    className="text-left"
                  >
                    <Card
                      className={`border transition-all ${cfg.className} ${
                        activeStatusFilter === cfg.key
                          ? "ring-2 ring-primary shadow-sm"
                          : "hover:shadow-sm hover:-translate-y-0.5"
                      }`}
                    >
                      <CardContent className="py-4">
                        <div className="text-xs font-medium uppercase tracking-wide opacity-80">
                          {cfg.label}
                        </div>
                        <div className="text-2xl font-bold mt-1">
                          {leadStatusCounts[cfg.key] ?? 0}
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                ))}
              </div>
            )}
            <Card className="w-full overflow-hidden">
              <CardHeader className="border-b bg-muted/20">
                <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                  <div className="relative w-full sm:max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, email, company, interest…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    {hasActiveColumnFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setColumnFilters({
                            contact: '',
                            sales_manager: '',
                            status: '',
                            details: '',
                          })
                        }
                      >
                        Clear column filters
                      </Button>
                    )}
                    <span className="text-sm font-medium text-muted-foreground">Show Source</span>
                    <label className="switch" aria-label="Toggle source column visibility">
                      <input
                        type="checkbox"
                        checked={showSource}
                        onChange={(e) => setShowSource(e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {error && (
                  <div className="p-6 text-destructive text-sm">
                    Failed to load leads: {error}
                  </div>
                )}
                {!error && loading && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!error && !loading && filteredAndSorted.length === 0 && (
                  <div className="py-16 text-center text-muted-foreground">
                    {leads.length === 0
                      ? "No leads yet. Submissions will appear here."
                      : "No leads match your search."}
                  </div>
                )}
                {!error && !loading && filteredAndSorted.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <SortableTableHeader
                            label="Name"
                            field="name"
                            currentSortField={sortField}
                            currentSortDirection={sortDirection}
                            onSort={handleSort}
                          />
                          <SortableTableHeader
                            label="Company / Activity"
                            field="company_activity"
                            currentSortField={sortField}
                            currentSortDirection={sortDirection}
                            onSort={handleSort}
                          />
                          <SortableTableHeader
                            label="Interest"
                            field="interest"
                            currentSortField={sortField}
                            currentSortDirection={sortDirection}
                            onSort={handleSort}
                          />
                          <TableHead><div className="flex items-center gap-1">Contact<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.contact ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('contact')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                          {showSource && (
                            <SortableTableHeader
                              label="Source"
                              field="source"
                              currentSortField={sortField}
                              currentSortDirection={sortDirection}
                              onSort={handleSort}
                            />
                          )}
                          <SortableTableHeader
                            label="Submitted"
                            field="created_at"
                            currentSortField={sortField}
                            currentSortDirection={sortDirection}
                            onSort={handleSort}
                          />
                          <TableHead><div className="flex items-center gap-1">Sales Manager<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.sales_manager ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('sales_manager')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                          <TableHead><div className="flex items-center gap-1">Status<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.status ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('status')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                          <TableHead className="w-[80px]">Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAndSorted.map((row) => (
                          <TableRow
                            key={row.id}
                            className="align-top cursor-pointer hover:bg-muted/40"
                            onClick={() => navigate(`/crm/leads/${row.id}`)}
                          >
                            <TableCell className="font-medium whitespace-nowrap">
                              {row.name}
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              <span className="line-clamp-2" title={row.company_activity}>
                                {row.company_activity}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="line-clamp-2" title={row.interest}>
                                {row.interest}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div className="flex flex-col gap-0.5 text-sm">
                                <a
                                  href={`mailto:${row.email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-primary hover:underline truncate max-w-[180px]"
                                >
                                  {row.email}
                                </a>
                                <a
                                  href={`tel:${row.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted-foreground hover:underline"
                                >
                                  {row.phone}
                                </a>
                              </div>
                            </TableCell>
                            {showSource && (
                              <TableCell>
                                <Badge variant="secondary" className="font-normal">
                                  {row.source ?? "website_contact_modal"}
                                </Badge>
                                {row.referral && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    Ref: {row.referral}
                                  </div>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>{formatDate(row.created_at)}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {formatDateTime(row.created_at)}
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {row.assigned_sales_manager ? (
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={salesManagerMap[row.assigned_sales_manager]?.avatar_url || undefined} />
                                    <AvatarFallback className="text-[10px]">
                                      {getInitials(salesManagerMap[row.assigned_sales_manager]?.full_name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{salesManagerMap[row.assigned_sales_manager]?.full_name || "—"}</span>
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`font-normal ${getLeadStatusBadgeClassName(row.lead_status)}`}
                              >
                                {getLeadStatusLabel(row.lead_status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {row.project_details ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs text-muted-foreground line-clamp-2 max-w-[160px] cursor-help">
                                      {row.project_details}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-sm">
                                    <p className="whitespace-pre-wrap">{row.project_details}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        <Dialog open={!!filterDialogColumn} onOpenChange={(open) => !open && setFilterDialogColumn(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Filter column</DialogTitle>
            </DialogHeader>
            {filterDialogColumn && (
              <div className="space-y-3">
                <Input
                  autoFocus
                  placeholder="Type to filter..."
                  value={columnFilters[filterDialogColumn]}
                  onChange={(event) =>
                    setColumnFilters((prev) => ({
                      ...prev,
                      [filterDialogColumn]: event.target.value,
                    }))
                  }
                />
                <div className="flex justify-between">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setColumnFilters((prev) => ({
                        ...prev,
                        [filterDialogColumn]: '',
                      }))
                    }
                  >
                    Clear
                  </Button>
                  <Button onClick={() => setFilterDialogColumn(null)}>Done</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <style>{`
          /* From Uiverse.io by RaspberryBee */
          .switch {
            font-size: 17px;
            position: relative;
            display: inline-block;
            width: 3.5em;
            height: 2em;
          }

          .switch input {
            opacity: 0;
            width: 0;
            height: 0;
          }

          .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgb(182, 182, 182);
            transition: 0.4s;
            border-radius: 10px;
          }

          .slider:before {
            position: absolute;
            content: "";
            height: 1.4em;
            width: 1.4em;
            border-radius: 8px;
            left: 0.3em;
            bottom: 0.3em;
            transform: rotate(270deg);
            background-color: rgb(255, 255, 255);
            transition: 0.4s;
          }

          .switch input:checked + .slider {
            background-color: #21cc4c;
          }

          .switch input:focus + .slider {
            box-shadow: 0 0 1px #2196f3;
          }

          .switch input:checked + .slider:before {
            transform: translateX(1.5em);
          }
        `}</style>
      </TooltipProvider>
    </ErpLayout>
  );
};

export default LeadsPage;
