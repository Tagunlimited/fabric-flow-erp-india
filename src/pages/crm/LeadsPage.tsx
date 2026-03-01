import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, Loader2, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ContactSubmission = Database["public"]["Tables"]["contact_submissions"]["Row"];

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

const LeadsPage = () => {
  const [leads, setLeads] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof ContactSubmission>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

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
      setLeads(data ?? []);
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

  const filteredAndSorted = useMemo(() => {
    const lower = search.trim().toLowerCase();
    let list = leads;
    if (lower) {
      list = leads.filter(
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
    return [...list].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const cmp = aVal == null && bVal == null ? 0 : (aVal ?? "") < (bVal ?? "") ? -1 : (aVal ?? "") > (bVal ?? "") ? 1 : 0;
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [leads, search, sortField, sortDirection]);

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
                          <TableHead>Contact</TableHead>
                          <SortableTableHeader
                            label="Source"
                            field="source"
                            currentSortField={sortField}
                            currentSortDirection={sortDirection}
                            onSort={handleSort}
                          />
                          <SortableTableHeader
                            label="Submitted"
                            field="created_at"
                            currentSortField={sortField}
                            currentSortDirection={sortDirection}
                            onSort={handleSort}
                          />
                          <TableHead className="w-[80px]">Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAndSorted.map((row) => (
                          <TableRow key={row.id} className="align-top">
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
                                  className="text-primary hover:underline truncate max-w-[180px]"
                                >
                                  {row.email}
                                </a>
                                <a
                                  href={`tel:${row.phone}`}
                                  className="text-muted-foreground hover:underline"
                                >
                                  {row.phone}
                                </a>
                              </div>
                            </TableCell>
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
      </TooltipProvider>
    </ErpLayout>
  );
};

export default LeadsPage;
