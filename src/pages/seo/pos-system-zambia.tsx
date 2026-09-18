import SeoPage, { SeoPageData } from "@/components/SeoPage";
import { WifiOff, Smartphone, Globe, Zap, Building2, Users } from "lucide-react";

const data: SeoPageData = {
  path: "/pos-system-zambia",
  title: "POS System Zambia | Offline Point of Sale for Local Shops | Sale Point",
  metaDescription:
    "A POS system made for Zambia. Works 100% offline, handles ZMW, tracks stock, debts and sales, and runs on any phone or tablet. Start your free trial today.",
  badge: "Zambia's Point of Sale",
  h1: "POS System Zambia — the offline point of sale built for local shops",
  intro: [
    "Many businesses in Zambia still run their sales on paper books, WhatsApp, or imported POS systems that were never designed for local conditions. Sales get forgotten, debts go uncollected, stock disappears, and you only discover the real numbers at the end of the month — if ever.",
    "Sale Point is a point of sale system built from the ground up for Zambian businesses. It turns any phone, tablet, or laptop into a full register that records every sale, tracks every debit, and gives you a live picture of your money and stock — even when the internet is down.",
  ],
  sections: [
    {
      heading: "Why an ordinary POS is not enough in Zambia",
      body: [
        "Imported POS software often assumes fast internet, expensive hardware, and foreign currency. That does not describe most shops in Zambia. Load-shedding, flaky mobile data, and the everyday reality of running a business on a phone mean a system that only works online simply will not survive a busy day.",
        "Sale Point is different: every sale is recorded on the device itself and syncs automatically when you reconnect. Whether your connection drops for ten minutes or two days, you keep selling, and nothing is lost.",
      ],
    },
    {
      heading: "What the Sale Point POS actually does",
      body: [
        "A complete sale in seconds — search a product, tap it, take payment by cash or mobile money, and share a receipt on WhatsApp. Stock levels update automatically, low-stock items flag themselves, and every cashier has their own PIN so you can see exactly who sold what.",
        "Credit sales are not an afterthought. Mark a sale as a debt, record partial payments as customers pay bit by bit, and get a clear list of who owes you and for how long. Multi-branch owners can watch every shop from one dashboard in real time.",
      ],
    },
  ],
  features: [
    { title: "100% Offline", desc: "Keep selling when the internet drops. Data syncs automatically when you're back online.", icon: WifiOff },
    { title: "Runs on Any Phone", desc: "No expensive register or equipment to buy. Use the phone you already have.", icon: Smartphone },
    { title: "Native ZMW", desc: "Prices, receipts and reports in Zambian Kwacha. No USD conversions.", icon: Globe },
    { title: "WhatsApp Receipts", desc: "Send clean digital receipts to customers instantly after every sale.", icon: Zap },
    { title: "Multi-Branch Sync", desc: "Monitor all your branches, sales and stock from a single dashboard.", icon: Building2 },
    { title: "Cashier Accountability", desc: "Every cashier has their own PIN. See who sold what, and prevent theft.", icon: Users },
  ],
  steps: [
    { title: "Sign up in 30 seconds", desc: "Create your shop account — all you need is a name, email and phone number." },
    { title: "Add your products", desc: "Enter your stock manually in minutes or import a CSV file." },
    { title: "Start selling", desc: "Tap products, take cash or mobile money, and send receipts on WhatsApp." },
    { title: "Track from anywhere", desc: "Watch sales, profit and stock live from your phone, wherever you are." },
  ],
  comparison: [
    { feature: "Works offline", point: "Yes — full offline mode", other: "Many stop working when the internet drops" },
    { feature: "Starting cost", point: "Free trial, no equipment needed", other: "Expensive hardware + installation fees" },
    { feature: "Currency", point: "Zambian Kwacha native", other: "US Dollar focused" },
    { feature: "Debtors tracking", point: "Built-in credit sales & partial payments", other: "Manual book or spreadsheet" },
    { feature: "Multi-branch", point: "All shops in one dashboard", other: "Separate systems per branch" },
  ],
  faqs: [
    { q: "Does Sale Point really work without internet?", a: "Yes. Every sale is stored on your phone or tablet and syncs to the cloud automatically when you reconnect. You never lose a sale." },
    { q: "Can I use it on a normal phone?", a: "Absolutely. It runs in any mobile browser on any smartphone, tablet or laptop — no app to download and no special equipment." },
    { q: "What happens to my data on the free trial?", a: "Your data stays yours permanently. After the trial you subscribe to keep access; if you ever stop, export your sales and reports as CSV files." },
    { q: "Can it handle credit sales and debtors?", a: "Yes. Record a sale as debt, log partial payments, and see exactly who owes you and how much at any time." },
    { q: "Does it work for more than one shop?", a: "Yes. Add multiple branches and monitor sales, stock and cashiers across all of them from one dashboard." },
  ],
  related: [
    { path: "/point-of-sale-software-zambia", label: "Point of Sale Software Zambia" },
    { path: "/free-offline-pos-zambia", label: "Free Offline POS Zambia" },
    { path: "/restaurant-pos-zambia", label: "Restaurant POS Zambia" },
    { path: "/inventory-management-zambia", label: "Inventory Management Zambia" },
    { path: "/debtors-credit-sales-zambia", label: "Debtors & Credit Sales Management" },
  ],
};

const PosSystemZambia = () => <SeoPage data={data} />;
export default PosSystemZambia;