import SeoPage, { SeoPageData } from "@/components/SeoPage";
import { WifiOff, Smartphone, Zap, PiggyBank, CloudOff, Receipt } from "lucide-react";

const data: SeoPageData = {
  path: "/free-offline-pos-zambia",
  title: "Free Offline POS Software Zambia | Works Without Internet | Sale Point",
  metaDescription:
    "Run your shop with free offline POS software that works without internet. Record sales, track stock and debts on any phone in ZMW. Start free today.",
  badge: "Offline & Free to Start",
  h1: "Free offline POS software for Zambia — run your shop without internet",
  intro: [
    "Most POS software assumes you have a fast, always-on connection. In Zambia, that assumption fails every time the network drops, data runs out, or power cuts hit the area. The result: shops fall back to paper, and the paper book wins again.",
    "Sale Point is offline-first point of sale software you can start free. Every sale is saved on the device, so you keep selling through outages, and everything syncs automatically when the connection returns. There is nothing to install and no expensive hardware — it runs in the browser on any phone, tablet or laptop.",
  ],
  sections: [
    {
      heading: "What 'offline POS' really means",
      body: [
        "A true offline POS must let you record sales, look up products, and finish a customer before the network returns — not just display a cached menu. Sale Point keeps your products, prices and stock on the device, so checkout is instant even in the middle of an outage.",
        "When your phone reconnects, every sale made while offline uploads silently in the background. You never re-key data and nothing is lost.",
      ],
    },
    {
      heading: "Free to start, affordable to keep",
      body: [
        "You can sign up and sell for free during the trial — no card required. After that, you choose a simple subscription. There is no setup fee, no training package, and no 'per device' charge. Because it runs on phones you already own, the total cost stays a fraction of imported systems.",
      ],
    },
  ],
  features: [
    { title: "Offline-First", desc: "Sell through outages with zero interruptions.", icon: WifiOff },
    { title: "No App to Download", desc: "Runs in any browser on any device.", icon: Smartphone },
    { title: "Instant Checkout", desc: "Search, tap, paid — a sale in seconds.", icon: Zap },
    { title: "Free Trial, No Card", desc: "Start today with no payment details.", icon: PiggyBank },
    { title: "Auto-Sync When Online", desc: "Offline sales upload silently in the background.", icon: CloudOff },
    { title: "Digital Receipts", desc: "Share receipts on WhatsApp right after payment.", icon: Receipt },
  ],
  steps: [
    { title: "Open the free trial", desc: "Create your shop account — no card, no cost." },
    { title: "Add your products", desc: "Enter stock manually or import from CSV." },
    { title: "Sell even when offline", desc: "The system keeps working with or without internet." },
    { title: "Sync automatically", desc: "Every offline sale appears in your reports when you reconnect." },
  ],
  comparison: [
    { feature: "Internet required", point: "No — fully offline capable", other: "Most require constant connection" },
    { feature: "Installing equipment", point: "Just a browser", other: "Unboxing, installation fees" },
    { feature: "Free to start", point: "Yes — free trial, no card", other: "Often a big upfront payment" },
    { feature: "Hardware cost", point: "Use the phone you own", other: "Dedicated register + printer needed" },
    { feature: "Data loss on outage", point: "None — auto-sync on reconnect", other: "Sales made offline are usually lost" },
  ],
  faqs: [
    { q: "Can I really use it with no internet at all?", a: "Yes. Your products, prices and stock live on the device, so you can record sales entirely offline and sync them later." },
    { q: "Is the free trial really free?", a: "Completely. No card required, no hidden charges. After the trial you simply subscribe if you want to continue." },
    { q: "Which devices does it work on?", a: "Any modern smartphone, tablet, or computer with a browser — Android, iPhone, Windows and Mac." },
    { q: "What if the connection drops mid-sale?", a: "Nothing breaks. The sale is recorded on the device and uploads automatically once you're back online." },
    { q: "Do richer features need me to be online?", a: "No. Stock, debts, reports and checkout all work offline; sync keeps everything consistent when connected." },
  ],
  related: [
    { path: "/pos-system-zambia", label: "POS System Zambia" },
    { path: "/point-of-sale-software-zambia", label: "Point of Sale Software Zambia" },
    { path: "/restaurant-pos-zambia", label: "Restaurant POS Zambia" },
    { path: "/inventory-management-zambia", label: "Inventory Management Zambia" },
    { path: "/debtors-credit-sales-zambia", label: "Debtors & Credit Sales Management" },
  ],
};

const FreeOfflinePosZambia = () => <SeoPage data={data} />;
export default FreeOfflinePosZambia;