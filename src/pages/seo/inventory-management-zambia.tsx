import SeoPage, { SeoPageData } from "@/components/SeoPage";
import { Boxes, AlertTriangle, Building2, Download, ScanLine, RefreshCw } from "lucide-react";

const data: SeoPageData = {
  path: "/inventory-management-zambia",
  title: "Inventory & Stock Management Software Zambia | Sale Point",
  metaDescription:
    "Inventory management for Zambian shops: stock updates with every sale, low-stock alerts, CSV import/export, and multi-branch stock visibility. Free trial.",
  badge: "Stock That Counts Itself",
  h1: "Inventory & stock management for Zambia — know what you have, what's low, and what's selling",
  intro: [
    "The stock you cannot see is the money you cannot count. Without accurate stock, a shop over-buys slow movers, runs out of best-sellers on a Friday, and never notices the leakage between the shelf and the register.",
    "Sale Point treats stock as a first-class citizen: every sale subtracts stock automatically, products approaching zero flag themselves, and owners can see inventory across every branch from one dashboard — all in a system that works offline.",
  ],
  sections: [
    {
      heading: "Why stock control fails without software",
      body: [
        "Physical counts are useful, but they only tell you what left the shelves — not what should have been sold, or what leaked. When stock is only tracked by hand, a shop cannot answer the three questions that matter: what do I have? What do I need to reorder? What is actually selling?",
        "With Sale Point, every product knows its quantity, cost and price. Sales move stock in real time, so the count you see is the truth, not a monthly guess.",
      ],
    },
    {
      heading: "Multi-branch inventory from one screen",
      body: [
        "Running two or more shops means tracking stock in each branch without letting them drift apart. Sale Point keeps every branch's stock in one account, so the owner can see which branch is low on sugar or which sells the most of a product — and where to move stock before a shortage bites.",
      ],
    },
  ],
  features: [
    { title: "Stock Updates Itself", desc: "Every sale reduces inventory automatically.", icon: Boxes },
    { title: "Low-Stock Alerts", desc: "Products with almost nothing left flag themselves for reorder.", icon: AlertTriangle },
    { title: "Multi-Branch Visibility", desc: "See stock across each branch from one dashboard.", icon: Building2 },
    { title: "CSV Import & Export", desc: "Upload your whole product list and export reports anytime.", icon: Download },
    { title: "Barcode Ready", desc: "Generate and scan barcodes for faster checkout.", icon: ScanLine },
    { title: "Real-Time Sync", desc: "Offline changes merge automatically when you reconnect.", icon: RefreshCw },
  ],
  steps: [
    { title: "Add your products", desc: "Enter items by hand or import your existing CSV in one upload." },
    { title: "Set cost and selling price", desc: "Sale Point calculates your margin on every item." },
    { title: "Sell normally", desc: "Stock updates with every sale — nothing to count twice." },
    { title: "Watch the alerts", desc: "Reorder the moment something is running low, from your phone." },
  ],
  comparison: [
    { feature: "Stock accuracy", point: "Updates with every sale, per branch", other: "Only known after a physical count" },
    { feature: "Reorder decisions", point: "Alerts when stock runs low", other: "Found out when the shelf is empty" },
    { feature: "Multi-branch", point: "All branches in one dashboard", other: "Each shop counted separately" },
    { feature: "Setup effort", point: "CSV import in minutes", other: "Manual inventory spreadsheet upkeep" },
    { feature: "Offline", point: "Keeps tracking without internet", other: "Needs a stable connection" },
  ],
  faqs: [
    { q: "How accurate is the stock count?", a: "Stock adjusts automatically with every sale, so the count reflects reality — as long as checkouts use the system, which offline mode makes easy." },
    { q: "Can I import products from Excel or CSV?", a: "Yes. You can import your entire product list from a CSV in one go and export reports anytime." },
    { q: "Does it work for multiple branches?", a: "Yes. Each branch keeps its own stock within one account, and you can view all of them from a single dashboard." },
    { q: "What happens if I run out of a product?", a: "The product flags as low stock, and you can see it instantly on your phone and reorder before customers go elsewhere." },
    { q: "Is stock tracking included or extra?", a: "It is built into Sale Point — stock, sales, debts and reports work together in one system." },
  ],
  related: [
    { path: "/pos-system-zambia", label: "POS System Zambia" },
    { path: "/point-of-sale-software-zambia", label: "Point of Sale Software Zambia" },
    { path: "/free-offline-pos-zambia", label: "Free Offline POS Zambia" },
    { path: "/restaurant-pos-zambia", label: "Restaurant POS Zambia" },
    { path: "/debtors-credit-sales-zambia", label: "Debtors & Credit Sales Management" },
  ],
};

const InventoryManagementZambia = () => <SeoPage data={data} />;
export default InventoryManagementZambia;