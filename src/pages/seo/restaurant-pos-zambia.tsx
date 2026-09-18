import SeoPage, { SeoPageData } from "@/components/SeoPage";
import { ChefHat, Utensils, Boxes, ClipboardList, Timer, Tablet } from "lucide-react";

const data: SeoPageData = {
  path: "/restaurant-pos-zambia",
  title: "Restaurant POS System Zambia | Kitchen Ordering, Stock & Reports | Sale Point",
  metaDescription:
    "A restaurant POS system for Zambian restaurants, bars and takeaway spots. Send kitchen orders, track stock and drinks, manage tables, and see live sales on any phone or tablet.",
  badge: "Restaurants, Bars & Takeaways",
  h1: "Restaurant POS for Zambia — faster orders, tighter stock, live sales",
  intro: [
    "A busy restaurant loses money in three quiet places: orders that never reach the kitchen, ingredients that run out mid-service, and waiters who cannot remember who ordered what. Paper order pads make all three worse the moment the place fills up.",
    "Sale Point gives your restaurant a fast, offline-capable point of sale that sends orders straight through, tracks stock and drinks, and shows the owner live sales — cash, mobile money or credit — from anywhere.",
  ],
  sections: [
    {
      heading: "Built for the way Zambian food businesses actually run",
      body: [
        "From a takeaway shop to a full sit-down restaurant or a busy bar, service has to be fast and trust has to be automatic. Sale Point runs on phones and tablets your staff already use, so there is no expensive terminal setup and no steep learning curve.",
        "Orders go to the kitchen instantly, items with add-ons and notes stay clear, and tables can be tracked so nothing gets lost between order and collection.",
      ],
    },
    {
      heading: "Control the kitchen and the bar",
      body: [
        "Stock is the quiet killer in food businesses — portions served without being counted, drinks opened without being recorded. With Sale Point, every dish sold moves stock automatically, low-stock items flag before they run out, and you can see exactly which items earn the most.",
        "Cashiers and staff log in with their own PIN, so you always know who took which order — accountability that paper pads can never give you.",
      ],
    },
  ],
  features: [
    { title: "Kitchen-Fast Ordering", desc: "Items and notes reach the kitchen instantly, no shouting across the room.", icon: ChefHat },
    { title: "Tables & Service", desc: "Track orders per table from open to paid.", icon: Tablet },
    { title: "Menu Modifiers", desc: "Add-ons, spice levels and notes on every item.", icon: Utensils },
    { title: "Stock That Covers the Bar", desc: "Drinks and ingredients counted with every sale.", icon: Boxes },
    { title: "Live Sales & Margins", desc: "See revenue and top sellers at a glance, even when busy.", icon: ClipboardList },
    { title: "Fast Offline Checkout", desc: "Keep serving during outages; everything syncs later.", icon: Timer },
  ],
  steps: [
    { title: "Build your menu", desc: "Add dishes, add-ons and notes in minutes." },
    { title: "Set up tables and staff", desc: "Assign tables, give each staff member a PIN." },
    { title: "Take orders on a phone", desc: "Tap items, send to kitchen, take payment." },
    { title: "Track stock and sales", desc: "Watch margins and stock levels live from anywhere." },
  ],
  comparison: [
    { feature: "How orders reach the kitchen", point: "Instantly, on their screens", other: "Paper pad, or a shout over the counter" },
    { feature: "Stock of ingredients & drinks", point: "Updates with every sale", other: "Counted only by hand" },
    { feature: "Know which cashier took what", point: "Yes — PIN-based staff logins", other: "Relies on memory" },
    { feature: "Works with no internet", point: "Yes — offline-first", other: "Most stop without a connection" },
    { feature: "Equipment needed", point: "Phones/tablets you already own", other: "Costly kitchen terminals and printers" },
  ],
  faqs: [
    { q: "Does it really help the kitchen, or just the till?", a: "Both. Orders appear for the kitchen instantly with all notes, so nothing gets misread or forgotten between the counter and the chef." },
    { q: "Can it track bottles and drinks for a bar?", a: "Yes. Stock updates with every sale, so bars can see exactly what was consumed and when to reorder." },
    { q: "What about power cuts and bad network?", a: "Sale Point works offline. Sales made with no connection are stored on the device and sync automatically later." },
    { q: "Do I need to buy restaurant hardware?", a: "No. It runs in any browser on phones and tablets your team already has." },
    { q: "Can waiters open a table and order to it?", a: "Yes — tables, orders and checkout are built in, with an easy flow from open to paid." },
  ],
  related: [
    { path: "/pos-system-zambia", label: "POS System Zambia" },
    { path: "/point-of-sale-software-zambia", label: "Point of Sale Software Zambia" },
    { path: "/free-offline-pos-zambia", label: "Free Offline POS Zambia" },
    { path: "/inventory-management-zambia", label: "Inventory Management Zambia" },
    { path: "/debtors-credit-sales-zambia", label: "Debtors & Credit Sales Management" },
  ],
};

const RestaurantPosZambia = () => <SeoPage data={data} />;
export default RestaurantPosZambia;