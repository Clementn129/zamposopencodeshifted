import { useState } from "react";
import { FileText, Plus, Eye, Edit, Trash2, Download, Printer, Search, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Invoice } from "@/hooks/useInvoices";

interface InvoiceListProps {
  invoices: Invoice[];
  isLoading: boolean;
  onNew: () => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPay: (id: string) => void;
  onPrint: (id: string) => void;
}

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/15 text-primary',
  paid: 'bg-success/15 text-success',
  void: 'bg-destructive/15 text-destructive',
};

const payable = (status: string) => status !== 'paid' && status !== 'void';

const InvoiceList = ({ invoices, isLoading, onNew, onView, onEdit, onDelete, onPay, onPrint }: InvoiceListProps) => {
  const [search, setSearch] = useState("");

  const filtered = invoices.filter(i => {
    const s = search.toLowerCase();
    return !s || i.invoiceNumber.toLowerCase().includes(s) ||
      (i.customerName && i.customerName.toLowerCase().includes(s));
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Loading invoices…</p></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoices…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="pos" onClick={onNew}>
          <Plus className="h-4 w-4 mr-1" /> New Invoice
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{search ? 'No invoices match your search.' : 'No invoices yet. Create your first one!'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(i => (
            <Card key={i.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-display font-semibold text-sm">{i.invoiceNumber}</p>
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusColors[i.status] || ''}`}>
                        {i.status.charAt(0).toUpperCase() + i.status.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {i.customerName || 'No customer'} • ZMW {i.total.toFixed(2)} • {new Date(i.issuedDate + 'T00:00:00').toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(i.id)} title="View">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {payable(i.status) && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(i.id)} title="Edit">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => onPay(i.id)} title="Mark as Paid (creates sale)">
                          <BadgeCheck className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPrint(i.id)} title="Print/Download">
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
                          <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will archive {i.invoiceNumber}. Any sale already created from a paid invoice will not be affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(i.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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

export default InvoiceList;