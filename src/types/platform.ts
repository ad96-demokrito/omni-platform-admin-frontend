export type PlatformRole = "super_admin" | "platform_dev" | "platform_tester" | "support_agent" | "finance";

export interface PlatformStaffUser {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  status: "active" | "suspended" | "deactivated";
  mfaEnabled: boolean;
  permissions?: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TenantMetadata {
  id: string;
  name: string;
  slug?: string;
  plan: string;
  planStatus: "active" | "suspended" | "trial" | "cancelled" | string;
  planExpiresAt: string | null;
  messageQuotaMonthly?: number;
  maxMonthlyMessages?: number;
  messagesSentCurrentPeriod?: number;
  maxChannels?: number;
  channelCount?: number;
  activeChannelCount?: number;
  maxUsers?: number;
  userCount?: number;
  maxContacts?: number;
  maxMonthlyAiQueries?: number;
  webhookSubscriptionCount?: number;
  /** Currency this workspace is billed in, and the country that decided it. */
  billingCurrency?: string;
  billingCountry?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTenantOverview {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  trialTenants: number;
  totalChannels: number;
  totalPlatformStaff: number;
}

export interface SystemHealthTelemetry {
  server: {
    nodeVersion: string;
    platform: string;
    architecture: string;
    uptimeSeconds: number;
    cpuCount: number;
    loadAverage: number[];
    freeMemoryMb: number;
    totalMemoryMb: number;
  };
  process: {
    pid: number;
    uptimeSeconds: number;
    memory: {
      rssMb: number;
      heapTotalMb: number;
      heapUsedMb: number;
      externalMb: number;
    };
  };
  database: {
    status: "healthy" | "degraded" | "down";
    pingLatencyMs: number;
    pool: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
    version?: string;
  };
  redis: {
    status: "healthy" | "degraded" | "disabled";
    pingLatencyMs: number;
    connected: boolean;
  };
  realtime: {
    activeConnections: number;
    activeTenants: number;
  };
  telemetryTimestamp: string;
}

export interface SyntheticWebhookResult {
  success: boolean;
  channelType: "whatsapp" | "telegram" | "web" | "custom";
  statusCode: number;
  durationMs: number;
  simulatedPayload: any;
  response: string;
}

export interface ChannelHealthPingResult {
  status: "ok" | "degraded" | "error";
  activeChannels: number;
  channelsByType: Record<string, number>;
  latencyMs: number;
}

export interface PlatformAuditLogItem {
  id: string;
  platformUserId: string | null;
  platformUserEmail: string;
  platformUserRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, any>;
  ipAddress: string | null;
  createdAt: string;
}

export interface PlatformLogEntry {
  level: "debug" | "info" | "warn" | "error" | string;
  message: string;
  timestamp: string;
  reqId?: string;
  tenantId?: string;
  userId?: string;
  module?: string;
  durationMs?: number;
  statusCode?: number;
  meta?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
  };
}

// ─────────────────────────────────────────────────────────────
// Dynamic SaaS Plans & Entitlements
// ─────────────────────────────────────────────────────────────
/** One currency's price list for a plan. */
export interface PlanPrice {
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  isActive: boolean;
}

export interface PlanPriceInput {
  currency: string;
  priceMonthly: number;
  priceYearly?: number;
  isActive?: boolean;
}

export interface PlatformPlanItem {
  id: string;
  name: string;
  description: string | null;
  /** Legacy single price (USD); the per-currency list in `prices` is authoritative. */
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  prices: PlanPrice[];
  maxChannels: number;
  maxContacts: number;
  maxMonthlyMessages: number;
  maxMonthlyAiQueries: number;
  features: string[];
  /** Gated features the plan includes. `features` above is display-only text. */
  featureFlags: PlanFeatureFlags;
  badgeText: string | null;
  isActive: boolean;
  isPublic: boolean;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Gated features a plan can include (plan/017 Phase 4); keys match the backend's PLAN_FEATURES. */
export interface PlanFeatureFlags {
  ai_copilot: boolean;
  api_keys: boolean;
  audit_compliance: boolean;
  teams_roles: boolean;
}

export const PLAN_FEATURE_DEFS: ReadonlyArray<{ key: keyof PlanFeatureFlags; label: string; hint: string }> = [
  { key: "ai_copilot", label: "AI Copilot & knowledge bases", hint: "Reply suggestions, summaries, RAG answers, AI Agent and Intent Router flow steps" },
  { key: "api_keys", label: "Developer API keys", hint: "Creating keys, and every request made with a key" },
  { key: "teams_roles", label: "Support teams & member roles", hint: "Teams and routing; inviting members with a role other than agent" },
  { key: "audit_compliance", label: "Audit trail & data-privacy tools", hint: "Viewing the audit log and the GDPR export/erasure tools (events are always recorded)" },
];

export interface CreatePlatformPlanDto {
  id: string;
  name: string;
  description?: string;
  prices: PlanPriceInput[];
  maxChannels: number;
  maxContacts: number;
  maxMonthlyMessages: number;
  maxMonthlyAiQueries: number;
  features?: string[];
  featureFlags?: PlanFeatureFlags;
  badgeText?: string;
  isActive?: boolean;
  isPublic?: boolean;
  isCustom?: boolean;
}

export interface UpdatePlatformPlanDto {
  name?: string;
  description?: string;
  /** Replaces the plan's whole price list. */
  prices?: PlanPriceInput[];
  maxChannels?: number;
  maxContacts?: number;
  maxMonthlyMessages?: number;
  maxMonthlyAiQueries?: number;
  features?: string[];
  featureFlags?: PlanFeatureFlags;
  badgeText?: string;
  isActive?: boolean;
  isPublic?: boolean;
  isCustom?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Workspace Subscriptions Lifecycle & Entitlements
// ─────────────────────────────────────────────────────────────
export interface WorkspaceSubscriptionItem {
  tenantId: string;
  tenantName: string;
  planId: string;
  planName: string;
  planStatus: "active" | "trial" | "suspended" | "cancelled" | "expired" | string;
  planExpiresAt: string | null;
  daysRemaining: number | null;
  isExpired: boolean;
  maxChannels: number;
  activeChannels: number;
  maxContacts: number;
  totalContacts: number;
  maxMonthlyMessages: number;
  maxMonthlyAiQueries: number;
  ownerEmail: string | null;
  ownerName: string | null;
  lastPaymentAt: string | null;
  lastInvoiceNumber: string | null;
  /** Currency this workspace is billed in (decides the plan price and gateway). */
  billingCurrency: string;
  billingCountry: string | null;
  /** The workspace's auto-renewing subscription; null for a prepaid plan that simply ends on its date. */
  renewal: { status: "active" | "past_due"; cancelAtPeriodEnd: boolean; gateway: string } | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// Subscription Payments Ledger
// ─────────────────────────────────────────────────────────────
export interface SubscriptionPaymentRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  billingCycle: "monthly" | "yearly" | "custom" | string;
  paymentMethod: "stripe" | "razorpay" | "bank_transfer" | "credit_card" | "manual" | "crypto" | string;
  transactionReference: string | null;
  status: "paid" | "pending" | "failed" | "refunded" | string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  notes: string | null;
  recordedByStaffId: string | null;
  recordedByName: string | null;
  /** Before tax. `amount` is the total charged (subtotal + taxAmount). */
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  taxLabel: string | null;
  buyerTaxId: string | null;
  sellerTaxId: string | null;
  /** The tax split (they add up to `taxAmount`). */
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  /** null = a legacy invoice issued before GST tax invoices (no seller/buyer snapshot). */
  supplyType: "b2b" | "b2c" | "export" | null;
  placeOfSupply: string | null;
  issuedAt: string | null;
  /** True once the invoice PDF has been created and stored. */
  hasPdf: boolean;
  emailStatus: "none" | "pending" | "sent" | "failed";
  emailedAt: string | null;
  createdAt: string;
}

/** A credit note: reduces an invoice (a refund, a correction, or the credit of an upgrade). */
export interface CreditNoteRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  creditNoteNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  appliedToInvoiceNumber: string | null;
  kind: "upgrade_credit" | "refund" | "cancellation" | "correction";
  reason: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  issuedBy: string;
  issuedAt: string;
  hasPdf: boolean;
  emailStatus: "none" | "pending" | "sent" | "failed";
}

// ─────────────────────────────────────────────────────────────
// Support & Helpdesk Ticketing System
// ─────────────────────────────────────────────────────────────
export interface SupportTicketItem {
  id: string;
  ticketNumber: string;
  tenantId: string;
  tenantName?: string;
  createdByUserId: string | null;
  createdByEmail: string;
  createdByName: string;
  subject: string;
  category: "billing" | "technical" | "channel_integration" | "account" | "feature_request" | "general" | string;
  priority: "low" | "medium" | "high" | "urgent" | string;
  status: "open" | "in_progress" | "pending_customer" | "resolved" | "closed" | string;
  assignedToStaffId: string | null;
  assignedToName: string | null;
  lastReplyAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  messageCount?: number;
  internalNoteCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketMessageItem {
  id: string;
  ticketId: string;
  senderType: "user" | "platform_staff";
  senderId: string | null;
  senderName: string;
  senderEmail: string;
  message: string;
  attachments: any[];
  isInternalNote: boolean;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicketItem {
  messages: SupportTicketMessageItem[];
}

export interface SupportTicketStats {
  open: number;
  inProgress: number;
  pendingCustomer: number;
  resolved: number;
  urgent: number;
  unassigned: number;
}

export interface RealtimeMessageEvent<T = any> {
  event: string;
  data: T;
  tenantId?: string;
  timestamp: string;
}
