import { platformDownload, platformRequest } from "./platform-client";
import {
  CreditNoteRecord,
  PlatformStaffUser,
  TenantMetadata,
  PlatformTenantOverview,
  SystemHealthTelemetry,
  SyntheticWebhookResult,
  ChannelHealthPingResult,
  PlatformAuditLogItem,
  PlatformLogEntry,
  PlatformRole,
  PlatformPlanItem,
  CreatePlatformPlanDto,
  UpdatePlatformPlanDto,
  WorkspaceSubscriptionItem,
  SubscriptionPaymentRecord,
  SupportTicketItem,
  SupportTicketDetail,
  SupportTicketMessageItem,
  SupportTicketStats,
} from "../types/platform";

export const platformApi = {
  // -------------------------------------------------------------
  // Platform Authentication
  // -------------------------------------------------------------
  auth: {
    login: (credentials: { email: string; password: string; mfaToken?: string }) =>
      platformRequest<{ token: string; user: PlatformStaffUser }>("/platform/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),

    getMe: () =>
      platformRequest<{ user: PlatformStaffUser }>("/platform/auth/me"),

    updateProfile: (data: { name?: string; currentPassword?: string; newPassword?: string }) =>
      platformRequest<{ user: PlatformStaffUser }>("/platform/auth/profile", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },

  // -------------------------------------------------------------
  // Dynamic SaaS Plans Management (Super Admin)
  // -------------------------------------------------------------
  plans: {
    list: (params?: { includeInactive?: boolean }) =>
      platformRequest<PlatformPlanItem[]>("/platform/plans", {
        params: params as any,
      }),

    getById: (id: string) =>
      platformRequest<PlatformPlanItem>(`/platform/plans/${id}`),

    create: (data: CreatePlatformPlanDto) =>
      platformRequest<PlatformPlanItem>("/platform/plans", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdatePlatformPlanDto) =>
      platformRequest<PlatformPlanItem>(`/platform/plans/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    deleteOrDeactivate: (id: string) =>
      platformRequest<{ deleted: boolean; deactivated: boolean; message: string }>(`/platform/plans/${id}`, {
        method: "DELETE",
      }),
  },

  // -------------------------------------------------------------
  // Workspace Subscriptions Lifecycle Management (Super Admin, Support)
  // -------------------------------------------------------------
  subscriptions: {
    list: (params?: {
      search?: string;
      status?: string;
      planId?: string;
      page?: number;
      limit?: number;
    }) =>
      platformRequest<{
        subscriptions: WorkspaceSubscriptionItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>("/platform/subscriptions", {
        params: params as any,
      }),

    updateLifecycle: (
      tenantId: string,
      data: {
        planId?: string;
        planStatus?: string;
        planExpiresAt?: string | null;
        maxChannels?: number;
        maxContacts?: number;
        maxMonthlyMessages?: number;
        maxMonthlyAiQueries?: number;
      }
    ) =>
      platformRequest<WorkspaceSubscriptionItem>(`/platform/subscriptions/${tenantId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    /** Super admin: change a workspace's billing country/currency (also after it locked). */
    setBillingCountry: (tenantId: string, data: { country: string; resetLock?: boolean }) =>
      platformRequest<{ billingCountry: string; billingCurrency: string; currencyLocked: boolean }>(
        `/platform/subscriptions/${tenantId}/billing`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        }
      ),

    quickRenew: (
      tenantId: string,
      data: {
        planId: string;
        amount: number;
        /** Defaults to the workspace's billing currency. */
        currency?: string;
        billingCycle?: string;
        paymentMethod?: string;
        sendReceipt?: boolean;
        notes?: string;
      }
    ) =>
      platformRequest<{ payment: SubscriptionPaymentRecord; subscription: WorkspaceSubscriptionItem }>(
        `/platform/subscriptions/${tenantId}/renew`,
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      ),
  },

  // -------------------------------------------------------------
  // Subscription Payment Ledger & Invoices
  // -------------------------------------------------------------
  payments: {
    list: (params?: {
      tenantId?: string;
      status?: string;
      search?: string;
      /** "YYYY-MM" (India time): only invoices issued in that month. */
      month?: string;
      page?: number;
      limit?: number;
    }) =>
      platformRequest<{
        payments: SubscriptionPaymentRecord[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        /** Paid revenue per currency (currencies are never summed together). */
        revenueByCurrency: Record<string, number>;
      }>("/platform/payments", {
        params: params as any,
      }),

    /** The monthly package for the accountant ("YYYY-MM", India time): a ZIP, or just the GST register as CSV. */
    exportMonth: (month: string, format: "zip" | "csv" = "zip") =>
      platformDownload(`/platform/payments/export?month=${encodeURIComponent(month)}&format=${format}`),

    listCreditNotes: (params?: { month?: string; tenantId?: string }) =>
      platformRequest<{ creditNotes: CreditNoteRecord[] }>("/platform/payments/credit-notes", { params: params as any }),

    /** Credit (part of) an invoice. Leave `total` out to credit what is left. The refund itself is paid in the gateway. */
    issueCreditNote: (
      paymentId: string,
      data: { kind: "refund" | "cancellation" | "correction"; reason: string; total?: number }
    ) =>
      platformRequest<{ creditNote: CreditNoteRecord }>(`/platform/payments/${paymentId}/credit-notes`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    downloadCreditNotePdf: (creditNoteId: string) => platformDownload(`/platform/payments/credit-notes/${creditNoteId}/pdf`),

    /** The invoice as a PDF file. */
    downloadInvoicePdf: (paymentId: string) => platformDownload(`/platform/payments/${paymentId}/invoice.pdf`),

    /** Emails the invoice to the workspace owner again; the outcome says whether it was sent. */
    resendInvoice: (paymentId: string) =>
      platformRequest<{ outcome: "sent" | "failed" | "disabled" | "no_recipient" | "not_configured" | "not_found" }>(
        `/platform/payments/${paymentId}/resend-invoice`,
        { method: "POST", body: JSON.stringify({}) }
      ),

    record: (data: {
      tenantId: string;
      planId: string;
      amount: number;
      currency?: string;
      billingCycle?: string;
      paymentMethod?: string;
      transactionReference?: string;
      periodStart?: string;
      periodEnd?: string;
      durationDays?: number;
      notes?: string;
      sendReceiptEmail?: boolean;
    }) =>
      platformRequest<{ payment: SubscriptionPaymentRecord; subscription: WorkspaceSubscriptionItem }>(
        "/platform/payments",
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      ),
  },

  // -------------------------------------------------------------
  // Platform Support & Helpdesk Ticketing System
  // -------------------------------------------------------------
  support: {
    getStats: () =>
      platformRequest<SupportTicketStats>("/platform/support/stats"),

    listTickets: (params?: {
      status?: string;
      priority?: string;
      category?: string;
      tenantId?: string;
      assignedToStaffId?: string;
      search?: string;
      page?: number;
      limit?: number;
    }) =>
      platformRequest<{
        tickets: SupportTicketItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>("/platform/support/tickets", {
        params: params as any,
      }),

    getTicketDetails: (ticketId: string) =>
      platformRequest<SupportTicketDetail>(`/platform/support/tickets/${ticketId}`),

    postMessage: (
      ticketId: string,
      data: {
        message: string;
        attachments?: any[];
        isInternalNote?: boolean;
      }
    ) =>
      platformRequest<SupportTicketMessageItem>(`/platform/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    updateTicket: (
      ticketId: string,
      data: {
        status?: string;
        priority?: string;
        category?: string;
        assignedToStaffId?: string | null;
        assignedToName?: string | null;
      }
    ) =>
      platformRequest<SupportTicketDetail>(`/platform/support/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  // -------------------------------------------------------------
  // Data-Blind Tenant Governance (Super Admin / Support)
  // -------------------------------------------------------------
  tenants: {
    getOverview: () =>
      platformRequest<PlatformTenantOverview>("/platform/tenants/overview"),

    listTenants: (params?: {
      search?: string;
      plan?: string;
      status?: string;
      page?: number;
      limit?: number;
    }) =>
      platformRequest<{
        tenants: TenantMetadata[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>("/platform/tenants", {
        params: params as any,
      }),

    getTenantById: (tenantId: string) =>
      platformRequest<TenantMetadata>(`/platform/tenants/${tenantId}`),

    updateGovernance: (
      tenantId: string,
      updates: {
        plan?: string;
        planStatus?: "active" | "suspended" | "trial" | "cancelled";
        messageQuotaMonthly?: number;
        maxChannels?: number;
        maxUsers?: number;
      }
    ) =>
      platformRequest<TenantMetadata>(`/platform/tenants/${tenantId}/governance`, {
        method: "PUT",
        body: JSON.stringify(updates),
      }),
  },

  // -------------------------------------------------------------
  // Infrastructure Telemetry & Node.js Health (Platform Dev, Super Admin, Support)
  // -------------------------------------------------------------
  telemetry: {
    getHealth: () =>
      platformRequest<SystemHealthTelemetry>("/platform/telemetry/health"),

    getErrors: () =>
      platformRequest<{
        webhookFailuresLast24h: number;
        recentAuditActionCounts: Array<{ action: string; count: number }>;
      }>("/platform/telemetry/errors"),

    getLogs: (params?: {
      level?: string;
      search?: string;
      module?: string;
      tenantId?: string;
      limit?: number;
    }) =>
      platformRequest<{
        total: number;
        limit: number;
        logs: PlatformLogEntry[];
      }>("/platform/telemetry/logs", {
        params: params as any,
      }),

    getSystemErrors: (params?: {
      search?: string;
      tenantId?: string;
      limit?: number;
    }) =>
      platformRequest<{
        total: number;
        limit: number;
        errors: PlatformLogEntry[];
      }>("/platform/telemetry/system-errors", {
        params: params as any,
      }),

    clearLogs: () =>
      platformRequest<{ success: boolean; message: string }>("/platform/telemetry/logs/clear", {
        method: "POST",
      }),

    getDownloadLogUrl: (type: "app" | "error") => `/api/platform/telemetry/logs/download?type=${type}`,
  },

  // -------------------------------------------------------------
  // Synthetic Testing Suite (Platform QA / Tester / Dev)
  // -------------------------------------------------------------
  testing: {
    dispatchSyntheticWebhook: (payload: {
      channelType: "whatsapp" | "telegram" | "web";
      mockSenderId?: string;
      mockText?: string;
    }) =>
      platformRequest<SyntheticWebhookResult>("/platform/testing/webhook-dispatch", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    getChannelPings: () =>
      platformRequest<ChannelHealthPingResult>("/platform/testing/channel-pings"),
  },

  // -------------------------------------------------------------
  // Platform Staff Administration (Super Admin)
  // -------------------------------------------------------------
  staff: {
    list: () =>
      platformRequest<PlatformStaffUser[]>("/platform/staff"),

    create: (data: {
      email: string;
      password: string;
      name: string;
      role: PlatformRole;
    }) =>
      platformRequest<PlatformStaffUser>("/platform/staff", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (
      staffId: string,
      data: {
        role?: PlatformRole;
        status?: "active" | "suspended" | "deactivated";
        name?: string;
      }
    ) =>
      platformRequest<PlatformStaffUser>(`/platform/staff/${staffId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    getAuditLogs: (params?: {
      action?: string;
      targetType?: string;
      tenantId?: string;
      limit?: number;
    }) =>
      platformRequest<PlatformAuditLogItem[]>("/platform/staff/audit-logs", {
        params: params as any,
      }),
  },
};
