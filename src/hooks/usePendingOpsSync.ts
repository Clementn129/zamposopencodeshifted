import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPendingOps, removePendingOp, updatePendingOpRetry, cacheProducts, cacheDebtors, generateOfflineId, getPendingImageUpload, removePendingImageUpload } from "@/lib/offlineStorage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// Maximum number of retries before marking an op as permanently failed
const MAX_RETRIES = 5;

const resolvePendingImageUrl = async (imageUrl: string | null | undefined, bId: string): Promise<string | null> => {
  if (!imageUrl || !imageUrl.startsWith('pending:')) return imageUrl ?? null;
  const uploadId = imageUrl.replace('pending:', '');
  const upload = await getPendingImageUpload(uploadId);
  if (!upload) return null;
  const ext = upload.originalName.split('.').pop() || 'jpg';
  const path = `${bId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('product-images')
    .upload(path, upload.blob, { cacheControl: '3600', upsert: false });
  if (upErr) throw upErr;
  await removePendingImageUpload(uploadId);
  return path;
};

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
        // Skip permanently failed ops (exceeded max retries)
        if (op.permanentlyFailed) {
          continue;
        }
        
        try {
          switch (op.type) {
            case 'debtor_create': {
              const amountPaid = op.payload.amountPaid || 0;
              const { data: returnedSaleId, error: saleErr } = await (supabase.rpc as any)("sync_offline_sale", {
                p_business_id: businessId,
                p_offline_id: op.payload.offlineId || generateOfflineId(),
                p_items: op.payload.items,
                p_subtotal: op.payload.subtotal || op.payload.total || 0,
                p_total: op.payload.total || 0,
                p_discount_amount: op.payload.discountAmount || 0,
                p_discount_type: op.payload.discountType || null,
                p_payment_method: op.payload.paymentMethod || 'credit',
                p_created_at: op.payload.createdAt || new Date().toISOString(),
                p_tax_amount: op.payload.taxAmount || 0,
                p_taxable_amount: op.payload.taxableAmount || 0,
                p_zero_rated_amount: op.payload.zeroRatedAmount || 0,
                p_exempt_amount: op.payload.exemptAmount || 0,
                p_customer_name: op.payload.customerName,
                p_customer_tpin: op.payload.customerTpin || null,
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
              const imageUrl = await resolvePendingImageUrl(op.payload.image_url, businessId);
              const tempId = op.payload.tempId;
              const { data: created, error: createErr } = await supabase.from('products').insert({
                business_id: businessId,
                is_active: true,
                name: op.payload.name,
                price: op.payload.price,
                cost_price: op.payload.cost_price ?? op.payload.costPrice,
                stock: op.payload.stock,
                minimum_stock: op.payload.minimum_stock ?? op.payload.minimumStock,
                category: op.payload.category,
                tax_category: op.payload.tax_category ?? op.payload.taxCategory ?? 'taxable',
                barcode: op.payload.barcode || null,
                item_type: op.payload.item_type ?? op.payload.itemType ?? 'product',
                image_url: imageUrl,
              }).select('id');
              if (createErr) throw createErr;
              const newProductId = created?.[0]?.id;

              // If this product was created offline with a temp ID, any sales that synced
              // before this product existed will have items referencing the temp ID.
              // Decrement stock for those sales now.
              if (tempId && newProductId) {
                try {
                  const { data: affectedSales } = await supabase
                    .from('sales')
                    .select('id, items')
                    .eq('business_id', businessId)
                    .filter('items', 'cs', `[{"productId": "${tempId}"}]`);
                  if (affectedSales) {
                    let totalQty = 0;
                    for (const s of affectedSales) {
                      if (Array.isArray(s.items)) {
                        for (const item of s.items) {
                          if ((item as any).productId === tempId) {
                            totalQty += Number((item as any).quantity || 0);
                          }
                        }
                      }
                    }
                    if (totalQty > 0) {
                      await supabase.from('products').update({
                        stock: Math.max(0, Number(op.payload.stock || 0) - totalQty),
                      }).eq('id', newProductId);
                    }
                  }
                } catch {
                  // stock fixup best-effort
                }
              }

              processed.push(op.id);
              break;
            }

            case 'product_update': {
              const imageUrl = await resolvePendingImageUrl(op.payload.image_url, businessId);
              const { error: updateErr } = await supabase.from('products').update({
                name: op.payload.name,
                price: op.payload.price,
                cost_price: op.payload.cost_price ?? op.payload.costPrice,
                stock: op.payload.stock,
                minimum_stock: op.payload.minimum_stock ?? op.payload.minimumStock,
                category: op.payload.category,
                tax_category: op.payload.tax_category ?? op.payload.taxCategory,
                barcode: op.payload.barcode || null,
                item_type: op.payload.item_type ?? op.payload.itemType,
                image_url: imageUrl,
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

            case 'expense_create': {
              const { error: expInsErr } = await supabase.from('expenses').insert({
                business_id: businessId,
                name: op.payload.name,
                amount: op.payload.amount,
                expense_date: op.payload.expenseDate,
                notes: op.payload.notes || null,
                category: op.payload.category || 'business',
              });
              if (expInsErr) throw expInsErr;
              processed.push(op.id);
              break;
            }

            case 'expense_delete': {
              const { error: expDelErr } = await supabase.from('expenses').delete().eq('id', op.payload.id);
              if (expDelErr) throw expDelErr;
              processed.push(op.id);
              break;
            }

            case 'category_create': {
              const { error: catErr } = await supabase.from('product_categories').insert({
                business_id: businessId,
                name: op.payload.name,
              });
              if (catErr) throw catErr;
              processed.push(op.id);
              break;
            }

            case 'category_delete': {
              const { error: catDelErr } = await supabase.from('product_categories').delete().eq('id', op.payload.id);
              if (catDelErr) throw catDelErr;
              processed.push(op.id);
              break;
            }

            case 'settings_update': {
              const { error: setErr } = await supabase.from('businesses').update(op.payload.updates).eq('id', businessId);
              if (setErr) throw setErr;
              processed.push(op.id);
              break;
            }

            case 'sale_delete': {
              // Restore stock for each item in the sale
              const items: Array<{ productId: string; quantity: number }> = op.payload.items || [];
              const productIds = [...new Set(items.map((i: any) => i.productId).filter(Boolean))];
              if (productIds.length > 0) {
                const { data: products } = await supabase.from('products').select('id, stock').in('id', productIds);
                if (products) {
                  const updates = items
                    .map((item: any) => {
                      if (!item.productId) return null;
                      const prod = products.find((p: any) => p.id === item.productId);
                      if (!prod) return null;
                      return supabase.from('products').update({ stock: Number(prod.stock) + (item.quantity || 0) }).eq('id', item.productId);
                    })
                    .filter(Boolean);
                  await Promise.all(updates);
                }
              }
              const { error: saleDelErr } = await supabase.from('sales').delete().eq('id', op.payload.saleId);
              if (saleDelErr) throw saleDelErr;
              processed.push(op.id);
              break;
            }

            case 'debtor_delete': {
              // Restore stock from linked sale, delete sale, delete debtor payments, delete debtor
              const { data: debtorData } = await supabase.from('debtors').select('sale_id').eq('id', op.payload.id).maybeSingle();
              if (debtorData?.sale_id) {
                const { data: saleData } = await supabase.from('sales').select('items').eq('id', debtorData.sale_id).maybeSingle();
                if (saleData?.items && Array.isArray(saleData.items)) {
                  const saleItems: Array<{ productId: string; quantity: number }> = saleData.items;
                  const pIds = [...new Set(saleItems.map((i: any) => i.productId).filter(Boolean))];
                  if (pIds.length > 0) {
                    const { data: prods } = await supabase.from('products').select('id, stock').in('id', pIds);
                    if (prods) {
                      const updates = saleItems
                        .map((item: any) => {
                          if (!item.productId) return null;
                          const prod = prods.find((p: any) => p.id === item.productId);
                          if (!prod) return null;
                          return supabase.from('products').update({ stock: Number(prod.stock) + (item.quantity || 0) }).eq('id', item.productId);
                        })
                        .filter(Boolean);
                      await Promise.all(updates);
                    }
                  }
                }
                await supabase.from('sales').delete().eq('id', debtorData.sale_id);
              }
              await supabase.from('debtor_payments').delete().eq('debtor_id', op.payload.id);
              const { error: debtDelErr } = await supabase.from('debtors').delete().eq('id', op.payload.id);
              if (debtDelErr) throw debtDelErr;
              processed.push(op.id);
              break;
            }

            case 'quotation_create': {
              const { data: newId, error: qErr } = await (supabase.rpc as any)('create_quotation_with_items', {
                p_business_id: businessId,
                p_header: op.payload.header,
                p_items: op.payload.items,
              });
              if (qErr) throw qErr;
              processed.push(op.id);
              break;
            }

            case 'quotation_update': {
              const { error: qUpdErr } = await supabase.from('quotations').update(op.payload.header).eq('id', op.payload.id);
              if (qUpdErr) throw qUpdErr;
              await supabase.from('quotation_items').delete().eq('quotation_id', op.payload.id);
              if (op.payload.items?.length) {
                const { error: qItemsErr } = await supabase.from('quotation_items').insert(
                  op.payload.items.map((i: any) => ({ ...i, quotation_id: op.payload.id }))
                );
                if (qItemsErr) throw qItemsErr;
              }
              processed.push(op.id);
              break;
            }

            case 'quotation_delete': {
              const { error: qDelErr } = await supabase.from('quotations').update({ deleted_at: new Date().toISOString() }).eq('id', op.payload.id);
              if (qDelErr) throw qDelErr;
              processed.push(op.id);
              break;
            }
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          const currentRetryCount = (op.retryCount || 0) + 1;
          
          if (currentRetryCount >= MAX_RETRIES) {
            console.error(`Pending op ${op.id} (${op.type}) permanently failed after ${MAX_RETRIES} retries:`, e);
          } else {
            console.error(`Failed to process pending op ${op.id} (${op.type}), retry ${currentRetryCount}/${MAX_RETRIES}:`, e);
          }
          
          // Update retry count in IndexedDB
          await updatePendingOpRetry(op.id, currentRetryCount, errorMsg);
        }
      }

      for (const id of processed) {
        await removePendingOp(id);
      }

      if (processed.length > 0) {
        // Refresh cached products & debtors after sync
        try {
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
