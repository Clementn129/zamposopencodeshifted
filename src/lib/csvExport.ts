type SaleItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

type Sale = {
  id: string;
  items: SaleItem[];
  subtotal: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
  synced?: boolean;
};

type Business = {
  id: string;
  name: string;
  payment_code: string;
  subscription_status: string;
  subscription_expires_at: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  created_at: string;
};

export const exportSalesToCsv = (sales: Sale[], filename: string = 'sales-export') => {
  const headers = ['Date', 'Time', 'Sale ID', 'Items', 'Payment Method', 'Subtotal', 'Total', 'Synced'];
  
  const rows = sales.map(sale => {
    const date = new Date(sale.createdAt);
    const itemsStr = sale.items.map(i => `${i.quantity}x ${i.name}`).join('; ');
    return [
      date.toLocaleDateString(),
      date.toLocaleTimeString(),
      sale.id,
      itemsStr,
      sale.paymentMethod === 'cash' ? 'Cash' : 'Mobile Money',
      sale.subtotal.toFixed(2),
      sale.total.toFixed(2),
      sale.synced ? 'Yes' : 'No'
    ];
  });

  downloadCsv(headers, rows, filename);
};

export const exportBusinessesToCsv = (businesses: Business[], filename: string = 'businesses-export') => {
  const headers = ['Business Name', 'Payment Code', 'Status', 'Expires At', 'Phone', 'Email', 'Address', 'Created At'];
  
  const rows = businesses.map(b => [
    b.name,
    b.payment_code,
    b.subscription_status,
    b.subscription_expires_at ? new Date(b.subscription_expires_at).toLocaleDateString() : 'N/A',
    b.phone || '',
    b.email || '',
    b.address || '',
    new Date(b.created_at).toLocaleDateString()
  ]);

  downloadCsv(headers, rows, filename);
};

const downloadCsv = (headers: string[], rows: string[][], filename: string) => {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
