import SeoPage, { SeoPageData } from "@/components/SeoPage";
import { BarChart3, ShieldCheck, Boxes, FileText, Wallet, TrendingUp } from "lucide-react";

const data: SeoPageData = {
  path: "/point-of-sale-software-zambia",
  title: "Point of Sale Software for Zambian Businesses | Sale Point",
  metaDescription:
    "Compare point of sale software for Zambian businesses. See how Sale Point replaces manual books, stops leakage, and gives you live profit, stock and sales reports in Kwacha.",
  badge: "Business Software",
  h1: "Point of sale software for Zambian businesses — stop the leaks, know your numbers",
  intro: [
    "The biggest money leak in most Zambian shops is not theft at the door — it is the sales that are never recorded. Goods leave, cash changes hands, and the owner is told a number at the end of the day that cannot be verified anywhere.",
    "Point of sale software exists to make every Kwacha visible. The right system records every sale automatically, ties it to a cashier, updates stock, and produces reports you can actually trust. This page is a practical guide to what to look for — and why Sale Point is built around exactly those requirements.",
  ],
  sections: [
    {
      heading: "What to look for in POS software in Zambia",
      body: [
        "Offline capability comes first. If your software cannot work without internet, it will fail you on the busiest days. Next, check that it handles cash and mobile money, that it tracks creditors and partial payments, and that reports are in Zambian Kwacha. Finally, the cashier experience must be fast — if checkout takes more than a few taps, staff will find ways around it.",
        "Sale Point was designed against this exact checklist and tested in real shops across the country.",
      ],
    },
    {
      heading: "From the manual book to live reports",
      body: [
        "With a paper book you find out your numbers weeks too late. With Sale Point, the dashboard shows today's sales, today's profit, low stock and outstanding debts the moment you open the app on your phone — at the shop, at home, or on the road.",
        "Every cashier has their own login, so accountability is built in. Sales history, expenses, debtor payments and profit margins are a tap away, and you can export everything to CSV whenever you need it.",
      ],
    },
  ],
  features: [
    { title: "Live Profit Tracking", desc: "Know exactly what you made today, this week, or this month — not guesses.", icon: BarChart3 },
    { title: "Cashier Accountability", desc: "PIN-protected cashiers and a clear record of who sold what.", icon: ShieldCheck },
    { title: "Stock That Updates Itself", desc: "Every sale reduces stock automatically. Low-stock alerts flag reorders.", icon: Boxes },
    { title: "Pro Quotations & Documents", desc: "Send professional quotations, invoices and delivery notes to customers.", icon: FileText },
    { title: "Cash & Mobile Money", desc: "Take cash, mobile money or record credit — one system, no mismatch.", icon: Wallet },
    { title: "Reports You Can Export", desc: "Sales, expenses, debtors and top sellers, exportable to CSV any time.", icon: TrendingUp },
  ],
  steps: [
    { title: "Create your shop", desc: "Free account, set up in under a minute." },
    { title: "Import or enter stock", desc: "Add products by hand or upload a CSV in one go." },
    { title: "Train your cashiers", desc: "Each cashier gets a PIN. Selling takes seconds, so they'll use it." },
    { title: "Read the reports", desc: "Watch sales and margin from your phone, daily." },
  ],
  comparison: [
    { feature: "Sales recording", point: "Automatic, every sale tied to a cashier", other: "Manual — written in a book after the sale" },
    { feature: "When you see results", point: "Live, on your phone", other: "End of month, if the book is kept" },
    { feature: "Debtors", point: "Tracked and aged automatically", other: "Rely on memory and loose notes" },
    { feature: "Stock accuracy", point: "Updates with every sale", other: "Physical count only" },
    { feature: "Cost", point: "Free trial, simple subscription", other: "Expensive hardware, training and support fees" },
  ],
  faqs: [
    { q: "Is POS software expensive in Zambia?", a: "Imported systems often carry big hardware and licensing costs. Sale Point runs on phones you already own and starts with a free trial, so the barrier is much lower." },
    { q: "How long does it take to set up?", a: "Most shops are selling within minutes. Import your product list from CSV and you are done before the first customer walks in." },
    { q: "Can it handle mobile money payments?", a: "Yes. Record cash, mobile money or credit on every sale, and the totals always match." },
    { q: "Who can access the reports?", a: "The owner sees everything. Cashiers only see what they need for selling, keeping accountability in place." },
    { q: "What if I upgrade from a manual book later?", a: "No problem. Import your current stock list and start recording sales immediately; your history stays exportable." },
  ],
  related: [
    { path: "/pos-system-zambia", label: "POS System Zambia" },
    { path: "/free-offline-pos-zambia", label: "Free Offline POS Zambia" },
    { path: "/restaurant-pos-zambia", label: "Restaurant POS Zambia" },
    { path: "/inventory-management-zambia", label: "Inventory Management Zambia" },
    { path: "/debtors-credit-sales-zambia", label: "Debtors & Credit Sales Management" },
  ],
};

const PointOfSaleSoftwareZambia = () => <SeoPage data={data} />;
export default PointOfSaleSoftwareZambia;