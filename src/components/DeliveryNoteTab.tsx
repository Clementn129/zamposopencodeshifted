import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useDeliveryNotes, DeliveryNote, DeliveryNoteItem } from "@/hooks/useDeliveryNotes";
import { Product } from "@/hooks/useProducts";
import DeliveryNoteList from "./DeliveryNoteList";
import DeliveryNoteForm from "./DeliveryNoteForm";
import DeliveryNoteView from "./DeliveryNoteView";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type View = 'list' | 'new' | 'view';

interface BusinessDetailsExt {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  logoUrl?: string | null;
}

interface DeliveryNoteTabProps {
  businessId: string;
  businessName: string;
  businessDetails: BusinessDetailsExt;
  products: Product[];
  quotationId?: string | null;
  quotationItems?: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; lineTotal: number }> | null;
  onClearQuotation?: () => void;
}

const DeliveryNoteTab = ({ businessId, businessName, businessDetails, products, quotationId, quotationItems, onClearQuotation }: DeliveryNoteTabProps) => {
  const { toast } = useToast();
  const { deliveryNotes, isLoading, createDeliveryNote, updateDeliveryNoteStatus, softDeleteDeliveryNote, getDeliveryNoteWithItems } = useDeliveryNotes(businessId);
  const [view, setView] = useState<View>('list');
  const [activeNote, setActiveNote] = useState<DeliveryNote | null>(null);

  const handleNew = () => {
    setActiveNote(null);
    setView('new');
  };

  const handleView = async (id: string) => {
    const dn = await getDeliveryNoteWithItems(id);
    if (dn) { setActiveNote(dn); setView('view'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await softDeleteDeliveryNote(id);
      toast({ title: 'Delivery note deleted' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const handleMarkDelivered = async (id: string) => {
    try {
      await updateDeliveryNoteStatus(id, 'delivered');
      toast({ title: 'Marked as delivered' });
      if (activeNote?.id === id) {
        setActiveNote(prev => prev ? { ...prev, status: 'delivered' } : null);
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const handleSaveNew = async (
    dn: Omit<DeliveryNote, 'id' | 'deliveryNoteNumber' | 'businessId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
    items: DeliveryNoteItem[]
  ) => {
    await createDeliveryNote(dn, items);
    setView('list');
    onClearQuotation?.();
  };

  return (
    <>
      {view === 'list' && (
        <DeliveryNoteList
          deliveryNotes={deliveryNotes}
          isLoading={isLoading}
          onNew={handleNew}
          onView={handleView}
          onMarkDelivered={handleMarkDelivered}
          onDelete={handleDelete}
        />
      )}

      {view === 'new' && (
        <DeliveryNoteForm
          products={products}
          quotationId={quotationId}
          quotationItems={quotationItems}
          onSave={handleSaveNew}
          onCancel={() => { setView('list'); onClearQuotation?.(); }}
        />
      )}

      {view === 'view' && activeNote && (
        <DeliveryNoteView
          deliveryNote={activeNote}
          businessName={businessName}
          businessDetails={businessDetails}
          onBack={() => setView('list')}
          onMarkDelivered={handleMarkDelivered}
        />
      )}
    </>
  );
};

export default DeliveryNoteTab;
