/**
 * ZRA Smart Invoice Service
 * 
 * Communicates with the Virtual Sales Data Controller (VSDC) which acts as a
 * bridge between ZamPOS and the ZRA Smart Invoice system.
 * 
 * The VSDC runs locally on the client's machine (Java-based WAR file).
 * ZamPOS sends HTTP requests to it, and it forwards data to ZRA.
 * 
 * API docs: https://www.zra.org.zm/wp-content/uploads/2024/08/VSDC-API-Specification-Document-v1.0.7-1.pdf
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmartInvoiceConfig {
  serverUrl: string;   // e.g. http://localhost:8080
  tpin: string;        // 10-digit TPIN
  branchId: string;    // 3-char branch ID (e.g. "001")
  deviceId?: string;   // Assigned after first initialization
}

export interface SmartInvoiceSaleItem {
  itemCd: string;       // Item classification code
  itemNm: string;       // Item name
  qtyUnitCd: string;    // Quantity unit code (e.g. "EA")
  qty: number;          // Quantity
  prc: number;          // Unit price (tax-exclusive)
  splyAmt: number;      // Supply amount (total for line, tax-exclusive)
  taxTyCd: string;      // Tax type code (A=VAT 16%, B=VAT 0%, C=Exempt, D=Zero-rated)
  taxAmt: number;       // Tax amount
  totAmt: number;       // Total amount (tax-inclusive)
}

export interface SmartInvoiceSaleData {
  brNo: string;          // Branch number
  wrhsNo: string;        // Warehouse number
  salesDt: string;       // Sale date (yyyyMMdd)
  salesTyCd: string;     // Sales type code (N=Normal)
  rcptTyCd: string;      // Receipt type code (S=Sales receipt)
  pmtTyCd: string;       // Payment type code (01=Cash, 02=Card, 03=Mobile money)
  salesSttsCd: string;   // Sales status (S=Normal sale)
  totItemCnt: number;    // Total item count
  taxblAmtA: number;     // Taxable amount A (VAT 16%)
  taxblAmtB: number;     // Taxable amount B (VAT 0%)
  taxblAmtC: number;     // Taxable amount C (Exempt)
  taxblAmtD: number;     // Taxable amount D (Zero-rated)
  taxRtA: number;        // Tax rate A (16.00)
  taxRtB: number;        // Tax rate B (0.00)
  taxRtC: number;        // Tax rate C (0.00)
  taxRtD: number;        // Tax rate D (0.00)
  taxAmtA: number;       // Tax amount A
  taxAmtB: number;       // Tax amount B
  taxAmtC: number;       // Tax amount C
  taxAmtD: number;       // Tax amount D
  totSalesAmt: number;   // Total sales amount (tax-inclusive)
  items: SmartInvoiceSaleItem[];
}

export interface SmartInvoiceResponse {
  resultCd: string;       // Result code ("000" = success)
  resultMsg: string;      // Result message
  resultDt: string;       // Result datetime
  data: {
    rcptNo?: string;      // Receipt number (Mark ID)
    rcptSign?: string;    // Receipt signature
    rcptCode?: string;    // Verification code
    totTaxAmt?: number;   // Total tax amount
    qrCode?: string;      // QR code data (if returned)
    [key: string]: unknown;
  } | null;
}

export interface DeviceInitResponse {
  resultCd: string;
  resultMsg: string;
  resultDt: string;
  data: null;
}

// ---------------------------------------------------------------------------
// API Version
// ---------------------------------------------------------------------------

const API_VERSION = '/v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a date as yyyyMMdd for ZRA API
 */
function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Format a datetime as yyyyMMddHHmmss for ZRA API
 */
function formatDateTime(d: Date): string {
  return formatDate(d) +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
}

/**
 * Round to 2 decimal places
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Determine ZRA tax type code from our tax category
 */
function getTaxTypeCode(
  taxCategory: string,
  taxMode: string,
  taxRate: number
): string {
  if (taxCategory === 'exempt') return 'C';
  if (taxCategory === 'zero_rated') return 'D';
  if (taxMode === 'vat' && taxRate === 0) return 'B';
  if (taxMode === 'vat' || taxMode === 'custom') return 'A';
  return 'C'; // Default to exempt if no tax mode
}

/**
 * Map our payment method to ZRA payment type code
 */
function getPaymentTypeCode(paymentMethod: string): string {
  switch (paymentMethod) {
    case 'cash': return '01';
    case 'card': return '02';
    case 'mobile_money': return '03';
    case 'credit': return '04';
    default: return '01';
  }
}

// ---------------------------------------------------------------------------
// API Calls
// ---------------------------------------------------------------------------

/**
 * Make a request to the VSDC server
 */
async function vsdcRequest<T>(
  serverUrl: string,
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<T> {
  const url = `${serverUrl.replace(/\/+$/, '')}${API_VERSION}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`VSDC request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Initialize a device with ZRA Smart Invoice system.
 * This associates the TPIN and branch ID with the VSDC.
 * Must be called once before submitting any sales.
 */
export async function initializeDevice(
  config: SmartInvoiceConfig
): Promise<DeviceInitResponse> {
  const result = await vsdcRequest<DeviceInitResponse>(
    config.serverUrl,
    '/InitializationInfo/selectInitInfo',
    'POST',
    {
      tin: config.tpin,
      bhfId: config.branchId,
      dvcId: config.deviceId || `DVC-${config.tpin}-${config.branchId}`,
      mrcNo: config.tpin,
    }
  );

  return result;
}

/**
 * Submit a sale transaction to ZRA Smart Invoice.
 * Returns the verification code (Mark ID) and QR code data.
 */
export async function submitSale(
  config: SmartInvoiceConfig,
  saleData: SmartInvoiceSaleData,
  originalInvoiceNo: number = 1
): Promise<SmartInvoiceResponse> {
  const now = new Date();
  
  const payload = {
    tin: config.tpin,
    bhfId: config.branchId,
    invcNo: originalInvoiceNo,
    orgInvcNo: originalInvoiceNo,
    salesDt: formatDateTime(now),
    salesTyCd: saleData.salesTyCd,
    rcptTyCd: saleData.rcptTyCd,
    pmtTyCd: saleData.pmtTyCd,
    salesSttsCd: saleData.salesSttsCd,
    totItemCnt: saleData.totItemCnt,
    taxblAmtA: round2(saleData.taxblAmtA),
    taxblAmtB: round2(saleData.taxblAmtB),
    taxblAmtC: round2(saleData.taxblAmtC),
    taxblAmtD: round2(saleData.taxblAmtD),
    taxRtA: saleData.taxRtA,
    taxRtB: saleData.taxRtB,
    taxRtC: saleData.taxRtC,
    taxRtD: saleData.taxRtD,
    taxAmtA: round2(saleData.taxAmtA),
    taxAmtB: round2(saleData.taxAmtB),
    taxAmtC: round2(saleData.taxAmtC),
    taxAmtD: round2(saleData.taxAmtD),
    totSalesAmt: round2(saleData.totSalesAmt),
    items: saleData.items,
  };

  const result = await vsdcRequest<SmartInvoiceResponse>(
    config.serverUrl,
    '/trnsSales/saveSales',
    'POST',
    payload
  );

  return result;
}

/**
 * Build Smart Invoice sale data from a ZamPOS sale.
 * 
 * This converts our sale format to the ZRA Smart Invoice format.
 */
export function buildSaleData(
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    taxCategory?: string;
  }>,
  taxBreakdown: {
    taxableAmount: number;
    zeroRatedAmount: number;
    exemptAmount: number;
    taxAmount: number;
    rate: number;
  },
  paymentMethod: string,
  config: SmartInvoiceConfig
): SmartInvoiceSaleData {
  const now = new Date();
  
  // Group items by tax category
  const taxRate = taxBreakdown.rate;
  const taxRateA = taxRate; // VAT rate for taxable items
  const taxRateB = 0;      // VAT rate for zero-rated
  const taxRateC = 0;      // Tax rate for exempt
  const taxRateD = 0;      // Tax rate for zero-rated

  // Build ZRA items
  const zraItems: SmartInvoiceSaleItem[] = items.map((item, index) => {
    const itemTaxCategory = item.taxCategory || 'taxable';
    const taxTypeCode = getTaxTypeCode(itemTaxCategory, 'vat', taxRate);
    
    // Calculate tax-exclusive amounts
    const lineTotalTaxInclusive = item.price * item.quantity;
    let lineTaxAmount = 0;
    let lineTaxExclusive = lineTotalTaxInclusive;
    
    if (itemTaxCategory === 'taxable' && taxRate > 0) {
      lineTaxAmount = (lineTotalTaxInclusive * taxRate) / (100 + taxRate);
      lineTaxExclusive = lineTotalTaxInclusive - lineTaxAmount;
    }

    return {
      itemCd: `ITEM${String(index + 1).padStart(3, '0')}`,
      itemNm: item.name.substring(0, 60),
      qtyUnitCd: 'EA',
      qty: item.quantity,
      prc: round2(lineTaxExclusive / item.quantity || 0),
      splyAmt: round2(lineTaxExclusive),
      taxTyCd: taxTypeCode,
      taxAmt: round2(lineTaxAmount),
      totAmt: round2(lineTotalTaxInclusive),
    };
  });

  return {
    brNo: config.branchId,
    wrhsNo: '000',
    salesDt: formatDate(now),
    salesTyCd: 'N',
    rcptTyCd: 'S',
    pmtTyCd: getPaymentTypeCode(paymentMethod),
    salesSttsCd: 'S',
    totItemCnt: items.length,
    taxblAmtA: round2(taxBreakdown.taxableAmount),
    taxblAmtB: round2(taxBreakdown.zeroRatedAmount),
    taxblAmtC: round2(taxBreakdown.exemptAmount),
    taxblAmtD: 0,
    taxRtA: taxRateA,
    taxRtB: taxRateB,
    taxRtC: taxRateC,
    taxRtD: taxRateD,
    taxAmtA: round2(taxBreakdown.taxAmount),
    taxAmtB: 0,
    taxAmtC: 0,
    taxAmtD: 0,
    totSalesAmt: round2(items.reduce((sum, item) => sum + item.price * item.quantity, 0)),
    items: zraItems,
  };
}

/**
 * Test connection to VSDC server
 */
export async function testConnection(serverUrl: string): Promise<boolean> {
  try {
    const response = await fetch(serverUrl.replace(/\/+$/, ''), {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
