import { useState } from "react";
import { FileText, Plus, Eye, Edit, Trash2, ShoppingCart, Download, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Quotation } from "@/hooks/useQuotations";

interface QuotationListProps {
  quotations: Quotation[];
  isLoading: boolean;
  onNew: () => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string) => void;
  onPrint: (id: string) => void;
}

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/15 text-primary',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-destructive/15 text-destructive',
  expired: 'bg-warning/15 text-warning',
  converted: 'bg-accent/15 text-accent',
};

const QuotationList = ({ quotations, isLoading, onNew, onView, onEdit, onDelete, onConvert, onPrint }: QuotationListProps) => {
  const [search, setSearch] = useState("");

  const filtered = quotations.filter(q => {
    const s = search.toLowerCase();
    return !s || q.quotationNumber.toLowerCase().includes(s) ||
      (q.customerName && q.customerName.toLowerCase().includes(s));
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Loading quotations…</p></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search quotations…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="pos" onClick={onNew}>
          <Plus className="h-4 w-4 mr-1" /> New Quotation
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{search ? 'No quotations match your search.' : 'No quotations yet. Create your first one!'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(q => (
            <Card key={q.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-display font-semibold text-sm">{q.quotationNumber}</p>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusColors[q.status] || ''}`}>
                        {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {q.customerName || 'No customer'} • ZMW {q.total.toFixed(2)} • {new Date(q.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(q.id)} title="View">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {q.status !== 'converted' && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(q.id)} title="Edit">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onConvert(q.id)} title="Convert to Sale">
                          <ShoppingCart className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPrint(q.id)} title="Print/Download">
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Quotation?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will archive {q.quotationNumber}. No stock or accounting records will be affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(q.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuotationList;
