import React, { useEffect, useState } from "react";
import { platformApi } from "../api/platform-api";
import {
  SubscriptionPaymentRecord,
  CreditNoteRecord,
  PlatformPlanItem,
  TenantMetadata,
} from "../types/platform";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import { BILLING_CURRENCIES, formatMoney, priceFor } from "../utils/money";
import {
  DollarSign,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Receipt,
  Layers,
  Calendar,
  CreditCard,
  Building,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Mail,
  X,
  FileText,
  ArrowUpRight,
} from "lucide-react";

const EMAIL_STATUS_LABEL: Record<SubscriptionPaymentRecord["emailStatus"], { text: string; className: string }> = {
  sent: { text: "EMAILED", className: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  pending: { text: "EMAIL PENDING", className: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  failed: { text: "EMAIL FAILED", className: "text-rose-400 border-rose-500/30 bg-rose-500/10" },
  none: { text: "NOT EMAILED", className: "text-slate-400 border-slate-600 bg-slate-800/60" },
};

const RESEND_OUTCOME_TEXT: Record<string, { kind: "ok" | "error"; text: string }> = {
  sent: { kind: "ok", text: "Invoice emailed to the workspace owner." },
  failed: { kind: "error", text: "Sending failed. It will be retried automatically; check the email settings." },
  disabled: { kind: "error", text: "Invoice emails are switched off (INVOICE_EMAIL_ENABLED=false)." },
  no_recipient: { kind: "error", text: "This workspace has no active owner email." },
  not_configured: { kind: "error", text: "Email is not configured on the server (SMTP_* is empty), nothing was sent." },
  not_found: { kind: "error", text: "Invoice not found." },
};

export const SubscriptionPaymentsPage: React.FC = () => {
  const { isSuperAdmin, canExportBilling } = usePlatformAuth();
  const [monthFilter, setMonthFilter] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [creditNotes, setCreditNotes] = useState<CreditNoteRecord[]>([]);
  const [creditTarget, setCreditTarget] = useState<SubscriptionPaymentRecord | null>(null);
  const [creditKind, setCreditKind] = useState<"refund" | "cancellation" | "correction">("refund");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditError, setCreditError] = useState<string | null>(null);
  const [isIssuingCredit, setIsIssuingCredit] = useState(false);

  const openCreditModal = (rec: SubscriptionPaymentRecord) => {
    setCreditTarget(rec);
    setCreditKind("refund");
    setCreditAmount("");
    setCreditReason("");
    setCreditError(null);
  };

  const handleIssueCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditTarget) return;
    const amountText = creditAmount.trim();
    const total = amountText === "" ? undefined : Number(amountText);
    if (total !== undefined && (!Number.isFinite(total) || total <= 0)) {
      setCreditError("Enter a positive amount, or leave it empty to credit the rest of the invoice.");
      return;
    }
    if (!creditReason.trim()) {
      setCreditError("A reason is required.");
      return;
    }
    setIsIssuingCredit(true);
    setCreditError(null);
    try {
      const { creditNote } = await platformApi.payments.issueCreditNote(creditTarget.id, {
        kind: creditKind,
        reason: creditReason.trim(),
        total,
      });
      setCreditTarget(null);
      setInvoiceNotice({
        kind: "ok",
        text: `Credit note ${creditNote.creditNoteNumber} issued. Pay the refund back in the Razorpay / Stripe dashboard.`,
      });
      await fetchPayments();
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : "Could not issue the credit note");
    } finally {
      setIsIssuingCredit(false);
    }
  };

  const handleDownloadCreditNote = async (note: CreditNoteRecord) => {
    setInvoiceNotice(null);
    try {
      const file = await platformApi.payments.downloadCreditNotePdf(note.id);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${note.creditNoteNumber.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setInvoiceNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not download the credit note" });
    }
  };

  const handleExport = async (format: "zip" | "csv") => {
    if (!monthFilter) return;
    setIsExporting(true);
    setInvoiceNotice(null);
    try {
      const file = await platformApi.payments.exportMonth(monthFilter, format);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = format === "zip" ? `gst-package-${monthFilter}.zip` : `gst-register-${monthFilter}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setInvoiceNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not create the export" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPdf = async (rec: SubscriptionPaymentRecord) => {
    setBusyInvoiceId(rec.id);
    setInvoiceNotice(null);
    try {
      const file = await platformApi.payments.downloadInvoicePdf(rec.id);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${rec.invoiceNumber.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setInvoiceNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not download the invoice" });
    } finally {
      setBusyInvoiceId(null);
    }
  };

  const handleResendInvoice = async (rec: SubscriptionPaymentRecord) => {
    setBusyInvoiceId(rec.id);
    setInvoiceNotice(null);
    try {
      const { outcome } = await platformApi.payments.resendInvoice(rec.id);
      setInvoiceNotice(RESEND_OUTCOME_TEXT[outcome] ?? { kind: "error", text: `Unexpected result: ${outcome}` });
      await fetchPayments();
    } catch (err) {
      setInvoiceNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not resend the invoice" });
    } finally {
      setBusyInvoiceId(null);
    }
  };

  const [payments, setPayments] = useState<SubscriptionPaymentRecord[]>([]);
  const [plans, setPlans] = useState<PlatformPlanItem[]>([]);
  const [tenants, setTenants] = useState<TenantMetadata[]>([]);
  const [revenueByCurrency, setRevenueByCurrency] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Record Payment Modal State
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState("INR");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [paymentMethod, setPaymentMethod] = useState("stripe");
  const [transactionRef, setTransactionRef] = useState("");
  const [durationDays, setDurationDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [sendReceiptEmail, setSendReceiptEmail] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [invoiceNotice, setInvoiceNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const fetchPlansAndTenants = async () => {
    try {
      const [plansRes, tenantsRes] = await Promise.all([
        platformApi.plans.list({ includeInactive: true }),
        platformApi.tenants.listTenants({ limit: 100 }),
      ]);
      setPlans(plansRes);
      setTenants(tenantsRes.tenants);
      if (plansRes.length > 0 && !selectedPlanId) {
        setSelectedPlanId(plansRes[0].id);
      }
      if (tenantsRes.tenants.length > 0 && !selectedTenantId) {
        setSelectedTenantId(tenantsRes.tenants[0].id);
      }
    } catch (err) {
      console.error("Failed to load plans or tenants:", err);
    }
  };

  const fetchPayments = async () => {
    setIsLoading(true);
    try {
      const res = await platformApi.payments.list({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        month: monthFilter || undefined,
        page,
        limit: 10,
      });
      setPayments(res.payments);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setRevenueByCurrency(res.revenueByCurrency);
      platformApi.payments
        .listCreditNotes({ month: monthFilter || undefined })
        .then((notes) => setCreditNotes(notes.creditNotes))
        .catch(() => setCreditNotes([]));
    } catch (err) {
      console.error("Failed to fetch payment ledger:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlansAndTenants();
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [page, statusFilter, monthFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchPayments();
  };

  // The amount follows the plan's price in the chosen currency; the admin can still override it.
  const fillAmount = (planId: string, cycle: string, cur: string) => {
    const plan = plans.find((p) => p.id === planId);
    const price = plan ? priceFor(plan, cur) : null;
    if (price) setAmount(cycle === "yearly" ? price.yearly : price.monthly);
  };

  const handlePlanChange = (planId: string) => {
    setSelectedPlanId(planId);
    fillAmount(planId, billingCycle, currency);
  };

  const handleCycleChange = (cycle: string) => {
    setBillingCycle(cycle);
    setDurationDays(cycle === "yearly" ? 365 : 30);
    fillAmount(selectedPlanId, cycle, currency);
  };

  const handleCurrencyChange = (cur: string) => {
    setCurrency(cur);
    fillAmount(selectedPlanId, billingCycle, cur);
  };

  // A workspace is billed in its own currency, so picking one switches the currency (and amount) with it.
  const handleTenantChange = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    const tenant = tenants.find((t) => t.id === tenantId);
    if (tenant?.billingCurrency) {
      setCurrency(tenant.billingCurrency);
      fillAmount(selectedPlanId, billingCycle, tenant.billingCurrency);
    }
  };

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !selectedPlanId) return;

    setIsRecording(true);
    setRecordError(null);

    try {
      await platformApi.payments.record({
        tenantId: selectedTenantId,
        planId: selectedPlanId,
        amount: Number(amount),
        currency,
        billingCycle,
        paymentMethod,
        transactionReference: transactionRef || undefined,
        durationDays: Number(durationDays),
        notes: notes || undefined,
        sendReceiptEmail,
      });

      setIsRecordModalOpen(false);
      setNotes("");
      setTransactionRef("");
      fetchPayments();
    } catch (err: any) {
      setRecordError(err.message || "Failed to record payment transaction");
    } finally {
      setIsRecording(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <span className="flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>PAID</span>
          </span>
        );
      case "pending":
        return (
          <span className="flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            <span>PENDING</span>
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" />
            <span>FAILED</span>
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Subscription Payments & Invoices Ledger
            </h1>
            <p className="text-xs text-slate-400">
              Audit SaaS billing revenue, manual bank wire records, and automated invoice dispatches.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={fetchPayments}
            disabled={isLoading}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg transition"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setIsRecordModalOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-emerald-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Record Payment Entry</span>
            </button>
          )}
        </div>
      </div>

      {/* Revenue Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
              Total SaaS Revenue
            </span>
            <span className="text-2xl font-bold text-white font-mono">
              {Object.keys(revenueByCurrency).length === 0
                ? formatMoney(0, "USD")
                : Object.entries(revenueByCurrency)
                    .map(([cur, total]) => formatMoney(total, cur))
                    .join(" + ")}
            </span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
              Invoices Recorded
            </span>
            <span className="text-2xl font-bold text-white font-mono">{total}</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center space-x-4">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block">
              Zero-PII Protection
            </span>
            <span className="text-xs font-semibold text-purple-300 block mt-1">
              Ledger Only (No Bank Cards / PII)
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number, workspace name, or transaction ref..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => {
              setMonthFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Month (India time)"
            title="Filter by invoice month (India time)"
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {canExportBilling && (
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-white">Monthly package for the accountant</p>
            <p className="text-[11px] text-slate-400">
              Pick a month above (India time). The ZIP has the GST register, tax summary, gateway reconciliation and every
              invoice PDF of that month.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!monthFilter || isExporting}
              onClick={() => handleExport("zip")}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 text-white disabled:opacity-40"
            >
              {isExporting ? "Preparing..." : "Download ZIP"}
            </button>
            <button
              type="button"
              disabled={!monthFilter || isExporting}
              onClick={() => handleExport("csv")}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-600 text-slate-200 hover:border-emerald-500 disabled:opacity-40"
            >
              Register CSV only
            </button>
          </div>
        </div>
      )}

      {invoiceNotice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs ${
            invoiceNotice.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          <span>{invoiceNotice.text}</span>
          <button type="button" onClick={() => setInvoiceNotice(null)} aria-label="Dismiss" className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Payments Ledger Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Workspace</th>
                <th className="py-3 px-4">Plan & Amount</th>
                <th className="py-3 px-4">Billing Period</th>
                <th className="py-3 px-4">Method & Ref</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Recorded Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                    Loading subscription payments ledger...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No payment records found.
                  </td>
                </tr>
              ) : (
                payments.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-800/40 transition">
                    {/* Invoice */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-emerald-400">{rec.invoiceNumber}</div>
                      <span className="text-[10px] font-mono text-slate-400 block truncate max-w-[130px]">
                        {rec.id}
                      </span>
                      {rec.amount > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyInvoiceId === rec.id}
                            onClick={() => handleDownloadPdf(rec)}
                            className="px-2 py-0.5 rounded border border-slate-600 text-[10px] font-mono text-slate-200 hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-50"
                          >
                            {busyInvoiceId === rec.id ? "..." : "PDF"}
                          </button>
                          {isSuperAdmin && rec.supplyType !== null && rec.status !== "refunded" && (
                            <button
                              type="button"
                              onClick={() => openCreditModal(rec)}
                              className="px-2 py-0.5 rounded border border-slate-600 text-[10px] font-mono text-slate-200 hover:border-amber-500 hover:text-amber-300"
                            >
                              Credit note
                            </button>
                          )}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              disabled={busyInvoiceId === rec.id}
                              onClick={() => handleResendInvoice(rec)}
                              className="px-2 py-0.5 rounded border border-slate-600 text-[10px] font-mono text-slate-200 hover:border-indigo-500 hover:text-indigo-300 disabled:opacity-50"
                            >
                              Resend
                            </button>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[9px] font-mono ${EMAIL_STATUS_LABEL[rec.emailStatus ?? "none"].className}`}
                          >
                            {EMAIL_STATUS_LABEL[rec.emailStatus ?? "none"].text}
                          </span>
                          {rec.supplyType === null && (
                            <span className="px-1.5 py-0.5 rounded border border-slate-600 text-[9px] font-mono text-slate-400">
                              LEGACY
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Workspace */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{rec.tenantName}</div>
                      <span className="text-[10px] font-mono text-slate-400 block truncate max-w-[160px]">
                        {rec.tenantId}
                      </span>
                    </td>

                    {/* Plan & Amount */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-white text-sm">
                        {formatMoney(rec.amount, rec.currency)}
                      </div>
                      {rec.taxAmount > 0 && (
                        <div className="text-[10px] text-slate-400">
                          incl. {rec.taxLabel ?? "tax"} {formatMoney(rec.taxAmount, rec.currency)} ({rec.taxRate}%)
                          {rec.cgstAmount > 0 && ` · CGST ${formatMoney(rec.cgstAmount, rec.currency)} + SGST ${formatMoney(rec.sgstAmount, rec.currency)}`}
                          {rec.igstAmount > 0 && ` · IGST ${formatMoney(rec.igstAmount, rec.currency)}`}
                        </div>
                      )}
                      {rec.supplyType === "export" && (
                        <div className="text-[10px] text-slate-400">Export of services (no GST)</div>
                      )}
                      <div className="text-[11px] text-indigo-400 font-medium">
                        {rec.planName} ({rec.billingCycle})
                      </div>
                    </td>

                    {/* Billing Period */}
                    <td className="py-3.5 px-4 text-[11px] text-slate-300">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>
                          {new Date(rec.periodStart).toLocaleDateString()} -{" "}
                          {new Date(rec.periodEnd).toLocaleDateString()}
                        </span>
                      </div>
                    </td>

                    {/* Method & Ref */}
                    <td className="py-3.5 px-4">
                      <div className="uppercase text-[11px] font-mono font-semibold text-slate-200">
                        {rec.paymentMethod}
                      </div>
                      {rec.transactionReference && (
                        <div className="text-[10px] font-mono text-slate-400 truncate max-w-[140px]">
                          Ref: {rec.transactionReference}
                        </div>
                      )}
                      {rec.notes && (
                        <div className="text-[10px] text-slate-400 italic truncate max-w-[160px]">
                          "{rec.notes}"
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">{getStatusBadge(rec.status)}</td>

                    {/* Recorded Date */}
                    <td className="py-3.5 px-4 text-right text-[11px]">
                      <div className="text-slate-200 font-medium">
                        {new Date(rec.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        By: {rec.recordedByName || "System"}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <span className="font-semibold text-white">{payments.length}</span> of{" "}
            <span className="font-semibold text-white">{total}</span> records
          </div>
          <div className="flex items-center space-x-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-40 transition"
            >
              Previous
            </button>
            <span className="font-mono text-slate-400">
              Page {page} / {totalPages || 1}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-40 transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {creditNotes.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <p className="text-xs font-semibold text-white">Credit notes{monthFilter ? ` (${monthFilter})` : ""}</p>
            <p className="text-[11px] text-slate-400">
              Refunds, corrections and the credit given on upgrades. They reduce the invoice they point to and appear as
              negative rows in the GST register.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Credit note #</th>
                  <th className="py-2.5 px-4">Against invoice</th>
                  <th className="py-2.5 px-4">Workspace</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Kind / reason</th>
                  <th className="py-2.5 px-4 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {creditNotes.map((note) => (
                  <tr key={note.id}>
                    <td className="py-2.5 px-4 font-mono font-bold text-amber-300">{note.creditNoteNumber}</td>
                    <td className="py-2.5 px-4 font-mono">
                      {note.invoiceNumber}
                      {note.appliedToInvoiceNumber && (
                        <div className="text-[10px] text-slate-400">applied to {note.appliedToInvoiceNumber}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4">{note.tenantName}</td>
                    <td className="py-2.5 px-4 font-mono">-{formatMoney(note.total, note.currency)}</td>
                    <td className="py-2.5 px-4">
                      <span className="uppercase text-[10px] font-mono text-slate-200">{note.kind.replace("_", " ")}</span>
                      <div className="text-[10px] text-slate-400 italic truncate max-w-[220px]" title={note.reason}>
                        {note.reason}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDownloadCreditNote(note)}
                        className="px-2 py-0.5 rounded border border-slate-600 text-[10px] font-mono text-slate-200 hover:border-emerald-500 hover:text-emerald-300"
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creditTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Issue credit note">
          <form onSubmit={handleIssueCredit} className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 text-xs">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Issue credit note</h3>
                <p className="text-[11px] text-slate-400">
                  Against <span className="font-mono text-emerald-400">{creditTarget.invoiceNumber}</span> (
                  {formatMoney(creditTarget.amount, creditTarget.currency)}). GST is reversed in proportion.
                </p>
              </div>
              <button type="button" onClick={() => setCreditTarget(null)} aria-label="Close" className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block">
              <span className="block text-slate-300 font-medium mb-1">Kind</span>
              <select
                value={creditKind}
                onChange={(e) => setCreditKind(e.target.value as typeof creditKind)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
              >
                <option value="refund">Refund</option>
                <option value="cancellation">Cancellation</option>
                <option value="correction">Correction of the invoice</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-slate-300 font-medium mb-1">Amount to credit, tax included ({creditTarget.currency})</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="Leave empty to credit what is left of the invoice"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              />
            </label>

            <label className="block">
              <span className="block text-slate-300 font-medium mb-1">Reason (printed on the credit note)</span>
              <textarea
                rows={2}
                maxLength={500}
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
              />
            </label>

            <p className="text-[11px] text-amber-300/90">
              This does not move any money. Pay the refund back from the Razorpay / Stripe dashboard. The customer is emailed
              the credit note (if invoice emails are switched on).
            </p>

            {creditError && <p className="text-rose-400">{creditError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCreditTarget(null)} className="px-3.5 py-2 rounded-lg border border-slate-600 text-slate-200">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isIssuingCredit}
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold disabled:opacity-50"
              >
                {isIssuingCredit ? "Issuing..." : "Issue credit note"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Payment Entry Modal */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Record Subscription Payment</h2>
                  <p className="text-[11px] text-slate-400">
                    Generate an official invoice entry and extend tenant subscription validity.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRecordModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordSubmit} className="p-6 space-y-4">
              {recordError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{recordError}</span>
                </div>
              )}

              {/* Workspace Tenant Select */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Target Workspace <span className="text-rose-400">*</span>
                </label>
                <select
                  required
                  value={selectedTenantId}
                  onChange={(e) => handleTenantChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Plan: {t.plan} | Status: {t.planStatus})
                    </option>
                  ))}
                </select>
              </div>

              {/* Plan Selection */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Subscription Tier <span className="text-rose-400">*</span>
                </label>
                <select
                  required
                  value={selectedPlanId}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (
                      {(p.prices ?? []).map((pr) => `${formatMoney(pr.priceMonthly, pr.currency)}/mo`).join(" | ") ||
                        "no prices"}
                      )
                    </option>
                  ))}
                </select>
              </div>

              {/* Billing Cycle & Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Cycle</label>
                  <select
                    value={billingCycle}
                    onChange={(e) => handleCycleChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="monthly">Monthly (+30 Days)</option>
                    <option value="yearly">Yearly (+365 Days)</option>
                    <option value="custom">Custom Duration</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Duration (Days) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={durationDays}
                    onChange={(e) => setDurationDays(parseInt(e.target.value) || 30)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Amount & Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Amount Paid <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Currency</label>
                  <select
                    required
                    value={currency}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  >
                    {BILLING_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Method & Reference */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="stripe">Stripe</option>
                    <option value="razorpay">Razorpay</option>
                    <option value="bank_transfer">Bank Wire / Transfer</option>
                    <option value="credit_card">Corporate Credit Card</option>
                    <option value="manual">Manual Cash / Override</option>
                    <option value="crypto">Cryptocurrency</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Transaction Ref</label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="e.g. WIRE-88392-NY"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Internal Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Annual enterprise contract invoice renewal"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Send Receipt Checkbox */}
              <label className="flex items-center space-x-2 bg-slate-950 border border-slate-800 p-3 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendReceiptEmail}
                  onChange={(e) => setSendReceiptEmail(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0"
                />
                <div className="flex items-center space-x-2">
                  <Mail className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs text-slate-200">
                    Send invoice receipt email to workspace owner immediately
                  </span>
                </div>
              </label>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecording}
                  className="px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                >
                  {isRecording ? "Recording..." : "Record & Issue Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
