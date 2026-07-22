import { forwardRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireOwner from "@/components/RequireOwner";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import Dashboard from "./pages/Dashboard";
import Pos from "./pages/Pos";
import Products from "./pages/Products";
import Subscription from "./pages/Subscription";
import SalesHistory from "./pages/SalesHistory";
import Settings from "./pages/Settings";
import Debtors from "./pages/Debtors";
import Affiliate from "./pages/Affiliate";
import AffiliateAuth from "./pages/AffiliateAuth";
import Reports from "./pages/Reports";
import CashierActivity from "./pages/CashierActivity";
import AuditLog from "./pages/AuditLog";
import NotFound from "./pages/NotFound";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { AppSyncManager } from "@/components/AppSyncManager";

const queryClient = new QueryClient();

const App = forwardRef<HTMLDivElement>((_, ref) => (
  <div ref={ref}>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <PWAUpdatePrompt />
            <AppSyncManager />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin-login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/dashboard" element={<RequireOwner><Dashboard /></RequireOwner>} />
                <Route path="/pos" element={<Pos />} />
                <Route path="/products" element={<RequireOwner><Products /></RequireOwner>} />
                <Route path="/subscription" element={<RequireOwner><Subscription /></RequireOwner>} />
                <Route path="/sales" element={<RequireOwner><SalesHistory /></RequireOwner>} />
                <Route path="/reports" element={<RequireOwner><Reports /></RequireOwner>} />
                <Route path="/cashier-activity" element={<RequireOwner><CashierActivity /></RequireOwner>} />
                <Route path="/audit-log" element={<RequireOwner><AuditLog /></RequireOwner>} />
                <Route path="/debtors" element={<RequireOwner><Debtors /></RequireOwner>} />
                <Route path="/settings" element={<RequireOwner><Settings /></RequireOwner>} />
                <Route path="/affiliate" element={<Affiliate />} />
                <Route path="/affiliate-auth" element={<AffiliateAuth />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </div>
));

App.displayName = "App";

export default App;
