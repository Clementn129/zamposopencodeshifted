import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPendingOps, removePendingOp, cacheProducts, getCachedProducts, cacheDebtors, getCachedDebtors, generateOfflineId } from "@/lib/offlineStorage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function usePendingOpsSync(businessId: string | undefined) {
  const { isOnline } = useOnlineStatus();
  const processing = useRef(false);

  const sync = useCallback(async () => {
    if (!businessId || !isOnline || processing.current) return;

    processing.current = true;
    try {
      const ops = await getPendingOps(businessId);
      if (ops.length === 0) return;

      const processed: string[] = [];

      for (const op of ops) {
        try {
          switch (op.type) {
            case 'debtor_create': {
              const amountPaid = op.payload.amountPaid || 0;
              const { data: returnedSaleId, error: saleErr } = await (supabase.rpc as any)("sync_offline_sale", {
                p_business_id: businessId,
                p_offline_id: op.payload.offlineId || generateOfflineId(),
                p_items: op.payload.items,
                p_subtotal: op.payload.subtotal || op.payload.total,
                p_total: op.payload.total,
                p_discount_amount: op.payload.discountAmount || 0,
                p_discount_type: op.payload.discountType || null,
                p_payment_method: op.payload.paymentMethod || 'credit',
                p_created_at: op.payload.createdAt || new Date().toISOString(),
                p_tax_amount: op.payload.taxAmount || 0,
                p_taxable_amount: op.payload.taxableAmount || 0,
                p_zero_rated_amount: op.payload.zeroRatedAmount || 0,
                p_exempt_amount: op.payload.exemptAmount || 0,
                p_customer_name: op.payload.customerName,
                p_customer_tpin: null,
                p_amount_paid: amountPaid,
                p_due_date: op.payload.dueDate || null,
                p_customer_phone: op.payload.customerPhone || null,
              });

              if (saleErr) throw saleErr;

              const { error: debtorErr } = await supabase.from('debtors').insert({
                business_id: businessId,
                sale_id: returnedSaleId,
                customer_name: op.payload.customerName,
                customer_phone: op.payload.customerPhone || null,
                amount_owed: op.payload.total,
                amount_paid: amountPaid,
                status: amountPaid > 0 ? 'partially_paid' : 'unpaid',
                notes: op.payload.notes || null,
              });

              if (debtorErr) throw debtorErr;
              processed.push(op.id);
              break;
            }

            case 'debtor_payment': {
              const { error: payError } = await supabase.from('debtor_payments').insert({
                debtor_id: op.payload.debtorId,
                amount: op.payload.amount,
                notes: op.payload.notes || null,
              });
              if (payError) throw payError;

              const { data: debtorRow } = await supabase
                .from('debtors')
                .select('amount_paid, amount_owed, sale_id')
                .eq('id', op.payload.debtorId)
                .maybeSingle();

              if (debtorRow) {
                const newAmountPaid = Number(debtorRow.amount_paid || 0) + op.payload.amount;
                const newStatus = newAmountPaid >= Number(debtorRow.amount_owed || 0) ? 'paid' : 'partially_paid';

                await supabase.from('debtors').update({ amount_paid: newAmountPaid, status: newStatus }).eq('id', op.payload.debtorId);

                if (debtorRow.sale_id) {
                  try {
                    const { data: saleRow } = await supabase
                      .from('sales')
                      .select('amount_paid, total')
                      .eq('id', debtorRow.sale_id)
                      .maybeSingle();

                    if (saleRow) {
                      const currentPaid = Number(saleRow.amount_paid || 0);
                      const newSalePaid = Math.min(currentPaid + op.payload.amount, Number(saleRow.total || 0));

                      await supabase.from('sale_payments').insert({
                        sale_id: debtorRow.sale_id,
                        business_id: businessId,
                        amount: op.payload.amount,
                        payment_method: 'cash',
                        notes: 'Payment via debtors',
                        recorded_by: op.payload.userId || '00000000-0000-0000-0000-000000000000',
                      });

                      await supabase.from('sales').update({ amount_paid: newSalePaid }).eq('id', debtorRow.sale_id);
                    }
                  } catch {
                    // ignore linked sale update failure
                  }
                }
              }

              processed.push(op.id);
              break;
            }

            case 'product_create': {
              const { error: createErr } = await supabase.from('products').insert({
                business_id: businessId,
                is_active: true,
                name: op.payload.name,
                price: op.payload.price,
                cost_price: op.payload.costPrice,
                stock: op.payload.stock,
                minimum_stock: op.payload.minimumStock,
                category: op.payload.category,
                tax_category: op.payload.taxCategory || 'taxable',
                barcode: op.payload.barcode || null,
                item_type: op.payload.itemType || 'product',
              });
              if (createErr) throw createErr;
              processed.push(op.id);
              break;
            }

            case 'product_update': {
              const { error: updateErr } = await supabase.from('products').update({
                name: op.payload.name,
                price: op.payload.price,
                cost_price: op.payload.costPrice,
                stock: op.payload.stock,
                minimum_stock: op.payload.minimumStock,
                category: op.payload.category,
                tax_category: op.payload.taxCategory,
                barcode: op.payload.barcode || null,
                item_type: op.payload.itemType,
              }).eq('id', op.payload.productId);
              if (updateErr) throw updateErr;
              processed.push(op.id);
              break;
            }

            case 'product_deactivate': {
              const { error: deactivateErr } = await supabase.from('products').update({ is_active: false }).eq('id', op.payload.productId);
              if (deactivateErr) throw deactivateErr;
              processed.push(op.id);
              break;
            }
          }
        } catch (e) {
          console.error(`Failed to process pending op ${op.id} (${op.type}):`, e);
        }
      }

      for (const id of processed) {
        await removePendingOp(id);
      }

      if (processed.length > 0) {
        // Refresh cached products & debtors after sync
        try {
          const [freshProducts, freshDebtors] = await Promise.all([
            businessId ? getCachedProducts(businessId) : Promise.resolve([]),
            businessId ? getCachedDebtors(businessId) : Promise.resolve([]),
          ]);
          // Re-fetch from server to update caches
          const { data: prodData } = await supabase
            .from('products')
            .select('id, business_id, name, price, cost_price, stock, minimum_stock, category, is_active, tax_category, image_url, parent_id, variant_label, item_type')
            .eq('business_id', businessId)
            .limit(25000);
          if (prodData) {
            await cacheProducts(prodData.map((p: any) => ({
              id: p.id,
              businessId: p.business_id,
              name: p.name,
              price: Number(p.price),
              costPrice: p.cost_price ? Number(p.cost_price) : null,
              stock: Number(p.stock),
              minimumStock: Number(p.minimum_stock ?? 5),
              category: p.category,
              isActive: p.is_active,
              taxCategory: p.tax_category || 'taxable',
              imageUrl: p.image_url,
              imagePath: p.image_url,
              parentId: p.parent_id,
              variantLabel: p.variant_label,
            })));
          }

          const { data: debtData } = await supabase
            .from('debtors')
            .select('id, business_id, customer_name, customer_phone, amount_owed, amount_paid, status, notes, created_at')
            .eq('business_id', businessId)
            .limit(1000);
          if (debtData) {
            await cacheDebtors(debtData.map((d: any) => ({
              id: d.id,
              businessId: d.business_id,
              customerName: d.customer_name,
              customerPhone: d.customer_phone,
              amountOwed: Number(d.amount_owed),
              amountPaid: Number(d.amount_paid),
              status: d.status,
              notes: d.notes,
              createdAt: d.created_at,
            })));
          }
        } catch {
          // cache refresh failed silently
        }

        window.dispatchEvent(new CustomEvent("zampos:sync-complete"));
      }
    } catch (e) {
      console.error("Error in pending ops sync:", e);
    } finally {
      processing.current = false;
    }
  }, [businessId, isOnline]);

  useEffect(() => {
    if (!businessId || !isOnline) return;

    // Initial sync after a short delay to let other syncs settle
    const initialTimer = setTimeout(() => sync(), 5000);

    const interval = setInterval(() => {
      sync();
    }, 60000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [businessId, isOnline, sync]);

  return { syncNow: sync };
}
