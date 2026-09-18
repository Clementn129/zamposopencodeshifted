import SeoPage, { SeoPageData } from "@/components/SeoPage";
import { Wallet, HandCoins, FileText, AlertTriangle, Receipt, TrendingDown } from "lucide-react";

const data: SeoPageData = {
  path: "/debtors-credit-sales-zambia",
  title: "Debtors & Credit Sales Management Zambia | Collect What You're Owed | Sale Point",
  metaDescription:
    "Track credit sales, record partial payments, and see who owes you in Zambia. Debtors management that shows every customer's balance — built into your POS.",
  badge: "Get Paid What You're Owed",
  h1: "Debtors & credit sales management — collect every Kwacha your customers owe",
  intro: [
    "Credit sales keep customers coming back — but only when the money actually comes in. In most Zambian shops, debts live in exercise books and memory. Customers pay a little at a time, nobody writes it down correctly, and by the end of the month the owner is owed money he cannot even put a figure on.",
    "Sale Point turns debtors from a guessing game into a live list. Every credit sale is recorded, every partial payment is logged, and you can open any customer's balance in seconds — on the shop floor or from your phone at home.",
  ],
  sections: [
    {
      heading: "Why debts disappear without a system",
      body: [
        "The problem is never that businesses don't want to collect. It's that a book-based system cannot keep up — receipts get misplaced, payments get forgotten, and 'it's on my list' is not a number you can chase. The moment you can see each customer's exact balance, collection becomes simple and polite.",
        "Sale Point also links debts to your normal checkout, so a returning customer's balance is visible the next time they buy.",
      ],
    },
    {
      heading: "Cashier-proof, owner-visible",
      body: [
        "Debts are recorded as part of the sale, so they cannot be quietly removed or forgotten by staff. The owner has a full picture of outstanding balances, while cashiers only handle what they need for serving customers.",
      ],
    },
  ],
  features: [
    { title: "One-Tap Credit Sale", desc: "Mark any sale as debt at checkout — it's tracked automatically.", icon: Wallet },
    { title: "Partial Payments", desc: "Log bits of payment as customers pay at their own pace.", icon: HandCoins },
    { title: "Customer Balances", desc: "Open any customer's balance in seconds.", icon: FileText },
    { title: "Debt Warnings", desc: "See clearly who owes, and for how long.", icon: AlertTriangle },
    { title: "Receipts on WhatsApp", desc: "Send a digital receipt the moment payment arrives.", icon: Receipt },
    { title: "Collect Without Havoc", desc: "Track what's owed without losing sales to customers who won't pay.", icon: TrendingDown },
  ],
  steps: [
    { title: "Record a credit sale", desc: "Choose 'credit' at checkout — the debt is saved automatically." },
    { title: "Log payments as they come", desc: "Each partial payment updates the customer's balance instantly." },
    { title: "Check balances anywhere", desc: "See every outstanding debt from your phone or the shop." },
    { title: "Export what you need", desc: "Download debt reports for follow-up or accounting." },
  ],
  comparison: [
    { feature: "Where debts are recorded", point: "Automatically, with every sale", other: "Exercise book and memory" },
    { feature: "Customer balance accuracy", point: "Live, correct at all times", other: "Depends on who remembers what" },
    { feature: "Partial payments", point: "Logged and visible instantly", other: "Often lost between visits" },
    { feature: "Owner visibility", point: "Full list from your phone", other: "Must ask staff on the shop floor" },
    { feature: "Live with checkout", point: "Debts are part of normal selling", other: "Separate records, easy to miss" },
  ],
  faqs: [
    { q: "How does a credit sale work?", a: "At checkout you mark the sale as a debt. The system stores the balance against the customer immediately — no extra paperwork." },
    { q: "Can a customer pay bit by bit?", a: "Yes. Log each partial payment and the balance updates automatically." },
    { q: "Can I see what every customer owes?", a: "Yes, from your phone — the full debtors list shows who owes and how much." },
    { q: "What stops staff from deleting debts?", a: "Debts are created as part of the sale and can't be silently edited; the owner keeps the full picture." },
    { q: "Does it work offline?", a: "Yes. Credit sales recorded offline sync automatically when you reconnect." },
  ],
  related: [
    { path: "/pos-system-zambia", label: "POS System Zambia" },
    { path: "/point-of-sale-software-zambia", label: "Point of Sale Software Zambia" },
    { path: "/free-offline-pos-zambia", label: "Free Offline POS Zambia" },
    { path: "/restaurant-pos-zambia", label: "Restaurant POS Zambia" },
    { path: "/inventory-management-zambia", label: "Inventory Management Zambia" },
  ],
};

const DebtorsCreditSalesZambia = () => <SeoPage data={data} />;
export default DebtorsCreditSalesZambia;