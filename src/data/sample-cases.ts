import type { Answers, Intake, ModelReport, Question } from "@/lib/schemas";

export type SampleCase = {
  id: string;
  name: string;
  tagline: string;
  intake: Intake;
  questions: Question[];
  answers: Answers;
  report: ModelReport;
};

export const sampleCases: SampleCase[] = [
  {
    id: "booking-double-reservations",
    name: "The Booking App With Double Reservations",
    tagline: "Duplicate bookings appear when two users grab the same slot at once.",
    intake: {
      title: "Duplicate bookings created for the same time slot",
      purpose:
        "We run a small booking application that lets users reserve time slots. Over the past week we have seen several cases where two different users end up with a confirmed booking for the exact same slot. The second booking should have been rejected because the slot was already taken, but instead both are accepted and both users receive a confirmation. We need to understand why the slot availability check is not preventing the second reservation and how to make the reservation step atomic so only one booking can ever win a given slot.",
      stack: [
        "Node.js backend with Express",
        "PostgreSQL database",
        "Redis cache for slot availability",
        "React frontend",
        "Docker containers",
        "AWS RDS for the database",
      ],
      working: [
        "Users browse available slots and click reserve",
        "Backend checks Redis for slot availability",
        "If available, a row is inserted into the bookings table",
        "A confirmation email is sent to the user",
        "The slot is marked as reserved in Redis",
      ],
      symptoms:
        "Two users can reserve the same slot within a short window of each other. Both receive a confirmation and both see the booking in their account. The database ends up with two rows for the same slot and time. This happens more often during peak hours when many users are booking at the same time.",
      error:
        "ERROR: duplicate key value violates unique constraint \"bookings_slot_time_key\"\nDETAIL: Key (slot_id, start_time)=(42, 2024-01-15 10:00:00) already exists.\nCONTEXT: reservation insert failed after availability check passed\nERROR: query timeout on booking transaction after 5000ms",
    },
    questions: [
      {
        id: "q1",
        text: "How are you checking whether a slot is available before inserting a booking?",
        why: "We need to know if the availability check and the insert happen in the same transaction or as separate steps.",
      },
      {
        id: "q2",
        text: "Do you have a unique constraint or index on the slot and time columns in the bookings table?",
        why: "A unique constraint is the last line of defense against duplicate reservations even if the application-level check races.",
      },
      {
        id: "q3",
        text: "What isolation level and transaction handling do you use for the reservation flow?",
        why: "The transaction isolation level determines whether concurrent inserts can interleave and cause duplicate bookings.",
      },
    ],
    answers: [
      {
        questionId: "q1",
        text: "We check Redis for availability first, then insert into PostgreSQL. These are two separate steps with no transaction wrapping both.",
      },
      {
        questionId: "q2",
        text: "We do not have a unique constraint on the slot and time columns. We rely entirely on the Redis check.",
      },
      {
        questionId: "q3",
        text: "We use the default read committed isolation level and commit after the insert. There is no explicit locking on the slot.",
      },
    ],
    report: {
      summary:
        "Based on what you reported, the likeliest explanation is a race between the availability check and the booking insert, so two concurrent requests could both pass the check. This is a hypothesis: no code or database constraints were inspected, and it needs reproducing in staging.",
      assessmentStatus: "provisional",
      observations: [
        {
          text: "The availability check and the booking insert are not atomic.",
          evidenceIds: ["answer:q1"],
        },
        {
          text: "There is no unique constraint on the slot and time columns to prevent duplicate inserts.",
          evidenceIds: ["answer:q2"],
        },
        {
          text: "The error log shows a duplicate key violation on the bookings table.",
          evidenceIds: ["error:L1"],
        },
      ],
      hypotheses: [
        {
          text: "A race condition allows two concurrent requests to both pass the availability check and insert a booking.",
          explanation:
            "When two users request the same slot at nearly the same time, both requests check Redis, find the slot available, and proceed to insert. Without a transaction or unique constraint, both inserts succeed.",
          evidenceIds: ["answer:q1", "answer:q3"],
          confidence: "high",
          verification:
            "Reproduce by sending two overlapping reservation requests for the same slot concurrently in staging.",
        },
      ],
      missingInformation: [
        "Whether the Redis availability check uses a distributed lock.",
        "The exact retry logic when a booking insert fails.",
      ],
      recoveryTasks: [
        {
          title: "Reproduce the race condition and verify atomic reservation enforcement",
          priority: "P1",
          rationale:
            "A non-atomic availability check and insert would explain the reported duplicates. Confirm the race exists first, then check whether a unique constraint or transaction enforces one booking per slot.",
          evidenceIds: ["answer:q1", "answer:q2"],
          verification:
            "In staging, submit two overlapping reservations for the same slot concurrently. Exactly one is accepted; the other receives a clear conflict response. Confirm that only one reservation is persisted.",
          acceptanceCriteria: [
            "In staging, submit two overlapping reservations for the same slot concurrently. Exactly one is accepted; the other receives a clear conflict response. Confirm that only one reservation is persisted.",
            "Add a unique constraint on the slot_id and start_time columns in the bookings table.",
            "Wrap the availability check and insert in a single transaction with appropriate locking.",
          ],
        },
        {
          title: "Add a unique constraint to the bookings table",
          priority: "P1",
          rationale:
            "A unique constraint on slot_id and start_time is the database-level safeguard that prevents duplicate bookings even if the application-level check races.",
          evidenceIds: ["answer:q2", "error:L1"],
          verification:
            "Deploy the migration to staging and confirm that a second insert for the same slot returns a duplicate key error.",
          acceptanceCriteria: [
            "Create a migration adding a unique constraint on bookings(slot_id, start_time).",
            "Verify the constraint blocks duplicate inserts in staging.",
          ],
        },
      ],
      limitations: [
        "The application code was not inspected for the exact reservation flow implementation.",
        "The database schema was not reviewed for existing constraints or indexes.",
        "No load testing was performed to measure the frequency of the race condition.",
      ],
    },
  },
  {
    id: "storefront-payment-state",
    name: "The Storefront With Uncertain Payment State",
    tagline: "Order statuses flip between paid and unpaid after payment.",
    intake: {
      title: "Order payment status is inconsistent after checkout",
      purpose:
        "We operate an online storefront where customers place orders and pay via a third-party payment provider. After a customer completes payment, the order status sometimes shows as paid and sometimes as unpaid, even though the payment was successful. The webhook that updates the order status may be arriving out of order or being processed multiple times. We need to understand why the order status is not reliably reflecting the payment state and how to make the webhook handling idempotent.",
      stack: [
        "PHP backend with Laravel",
        "MySQL database",
        "Stripe as the payment provider",
        "Vue.js frontend",
        "Laravel queues for webhook processing",
      ],
      working: [
        "Customer places an order and is redirected to Stripe Checkout",
        "Stripe sends a webhook to our endpoint when payment succeeds",
        "The webhook handler updates the order status to paid",
        "The customer is redirected back to the storefront order page",
      ],
      symptoms:
        "After a successful payment, some orders show as unpaid on the order page. The payment is confirmed in the Stripe dashboard but our system does not reflect it. This happens intermittently and seems more common when the customer refreshes the page quickly after returning from Stripe.",
      error:
        "Webhook processing failed: duplicate event id evt_1234567890\nOrder status update skipped: event already processed\nWarning: received webhook out of order, expected evt_1234567891 but got evt_1234567889",
    },
    questions: [
      {
        id: "q1",
        text: "How do you handle duplicate webhook events from Stripe?",
        why: "Stripe may send the same event multiple times, and the handler must be idempotent to avoid inconsistent state.",
      },
      {
        id: "q2",
        text: "Do you process webhooks in order, and what happens if they arrive out of order?",
        why: "Out-of-order webhooks can cause a later event to be processed before an earlier one, leading to incorrect order status.",
      },
      {
        id: "q3",
        text: "Can you provide redacted webhook payloads for a few affected orders?",
        why: "Seeing the actual event data will help us understand the sequence and content of the webhooks that caused the inconsistency.",
      },
    ],
    answers: [
      {
        questionId: "q1",
        text: "We store the event id in the database and skip processing if we have already seen it. However, we do not use a distributed lock, so two concurrent webhooks for the same event can both pass the check before either is recorded.",
      },
      {
        questionId: "q2",
        text: "Webhooks are processed by Laravel queues, but we do not guarantee ordering. If a later event arrives first, it may update the status before the earlier event is processed.",
      },
      {
        questionId: "q3",
        text: "We can provide redacted webhook payloads. The event ids are evt_1234567890 and evt_1234567891 for two affected orders.",
      },
    ],
    report: {
      summary:
        "Duplicate or out-of-order webhook events are a plausible explanation for the inconsistent order status you reported, but this is unconfirmed. Redacted webhook evidence is needed, and an engineer should manually review the payment flow.",
      assessmentStatus: "provisional",
      observations: [
        {
          text: "The webhook deduplication check is not protected against concurrent duplicate events.",
          evidenceIds: ["answer:q1"],
        },
        {
          text: "Webhooks are processed without guaranteed ordering, allowing out-of-order updates.",
          evidenceIds: ["answer:q2"],
        },
        {
          text: "The error log shows duplicate event ids and out-of-order webhook warnings.",
          evidenceIds: ["error:L1", "error:L3"],
        },
      ],
      hypotheses: [
        {
          text: "Concurrent duplicate webhooks bypass the deduplication check and update the order status inconsistently.",
          explanation:
            "When two identical webhook events arrive at the same time, both check the database for the event id, find it absent, and both proceed to update the order. This can leave the status in an unexpected state.",
          evidenceIds: ["answer:q1", "error:L1"],
          confidence: "medium",
          verification:
            "Send two identical webhook events concurrently in staging and check that the order status is updated exactly once.",
        },
        {
          text: "Out-of-order webhook processing causes a later event to be applied before an earlier one.",
          explanation:
            "If a payment succeeded event arrives after a payment failed event due to queue ordering, the order may end up marked as unpaid even though the payment succeeded.",
          evidenceIds: ["answer:q2", "error:L3"],
          confidence: "medium",
          verification:
            "Send webhooks out of order in staging and verify the final order status reflects the latest event by timestamp.",
        },
      ],
      missingInformation: [
        "The exact retry behavior of the webhook endpoint when processing fails.",
        "Whether the payment provider guarantees at-least-once or at-most-once delivery.",
      ],
      recoveryTasks: [
        {
          title: "Test webhook idempotency and out-of-order handling in staging",
          priority: "P1",
          rationale:
            "Before changing the webhook handler, we need to confirm the current behavior by replaying redacted webhook payloads in staging. This will show whether duplicates and out-of-order events cause the inconsistency.",
          evidenceIds: ["answer:q3", "answer:q1"],
          verification:
            "Replay redacted webhook payloads for affected orders in staging and observe the resulting order status.",
          acceptanceCriteria: [
            "Replay redacted webhook payloads for at least two affected orders in staging.",
            "Confirm that duplicate events do not cause inconsistent order status.",
            "Confirm that out-of-order events are handled correctly or flagged for manual review.",
          ],
        },
        {
          title: "Make webhook handling idempotent with a database lock",
          priority: "P1",
          rationale:
            "The deduplication check must be atomic to prevent concurrent duplicate events from both passing. A database-level lock or unique constraint on the event id will ensure only one processing attempt succeeds.",
          evidenceIds: ["answer:q1", "error:L1"],
          verification:
            "Deploy the idempotent handler to staging and send duplicate webhooks concurrently.",
          acceptanceCriteria: [
            "Add a unique constraint or lock on the webhook event id in the database.",
            "Verify that concurrent duplicate webhooks result in exactly one status update.",
          ],
        },
      ],
      limitations: [
        "The webhook handler source code was not inspected for the exact deduplication logic.",
        "The Stripe webhook delivery configuration was not reviewed.",
        "No production webhook logs were analyzed beyond the provided error excerpt.",
      ],
    },
  },
  {
    id: "saas-portal-access",
    name: "The SaaS Portal With Confusing Access",
    tagline: "A user sees another tenant's records in their portal.",
    intake: {
      title: "Tenant data isolation concern in the SaaS portal",
      purpose:
        "We provide a multi-tenant SaaS portal where each customer has their own tenant account. One of our customers reported that a user in their tenant was able to see records belonging to a different tenant. This is a serious data isolation issue. The user should only ever see records from their own tenant, but somehow records from another tenant are appearing in their view. We need to understand how the tenant scoping is failing and how to prevent cross-tenant data access.",
      stack: [
        "Python backend with Django",
        "PostgreSQL database",
        "React frontend",
        "Nginx reverse proxy",
        "Docker containers",
        "AWS RDS for the database",
      ],
      working: [
        "Users log in and are assigned to a tenant based on their account",
        "All database queries are scoped to the current tenant",
        "The frontend requests data from the API with the tenant context",
        "The API returns only records belonging to the requesting tenant",
      ],
      symptoms:
        "A user in tenant A reported seeing records that belong to tenant B in their portal. The records include customer names and order details from the other tenant. This is a critical data isolation issue that could expose sensitive information across tenants.",
      error:
        "Permission denied for table tenant_b_records\nCross-tenant query detected: SELECT * FROM orders WHERE tenant_id = 'tenant_b'\nWarning: tenant context not set for request from tenant_a",
    },
    questions: [
      {
        id: "q1",
        text: "How is the tenant context determined for each request?",
        why: "The tenant context must be reliably set for every request to ensure queries are scoped to the correct tenant.",
      },
      {
        id: "q2",
        text: "Do all database queries include a tenant_id filter, or are some queries missing the filter?",
        why: "A missing tenant_id filter in any query can expose records from other tenants.",
      },
      {
        id: "q3",
        text: "What authentication and authorization checks are in place for tenant access?",
        why: "Authorization checks must verify that the user has access to the requested tenant before returning any data.",
      },
    ],
    answers: [
      {
        questionId: "q1",
        text: "The tenant context is set from the user's session, but there is a code path where the context is not set before a query runs, causing the query to use a default or empty tenant context.",
      },
      {
        questionId: "q2",
        text: "Most queries include a tenant_id filter, but we found one query in the orders endpoint that does not filter by tenant_id when a specific parameter is passed.",
      },
      {
        questionId: "q3",
        text: "We check that the user belongs to the tenant on login, but we do not re-verify the tenant on every API request. The authorization check is only done once at login.",
      },
    ],
    report: {
      summary:
        "You reported that one account can see another tenant's records. If accurate, this is urgent, so the plan starts by pausing the affected access. A missing tenant filter or a per-request authorisation gap are possibilities, not findings: no code was inspected, and an engineer must verify authorisation.",
      assessmentStatus: "provisional",
      observations: [
        {
          text: "The tenant context is not set in one code path before a query runs.",
          evidenceIds: ["answer:q1"],
        },
        {
          text: "A query in the orders endpoint does not filter by tenant_id.",
          evidenceIds: ["answer:q2"],
        },
        {
          text: "Authorization is only checked at login, not on every API request.",
          evidenceIds: ["answer:q3"],
        },
        {
          text: "The error log shows a cross-tenant query and a missing tenant context warning.",
          evidenceIds: ["error:L2", "error:L3"],
        },
      ],
      hypotheses: [
        {
          text: "A missing tenant context causes queries to return records from the wrong tenant.",
          explanation:
            "When the tenant context is not set, the query may default to an empty or shared context, returning records that do not belong to the requesting tenant. This is compounded by a query that does not filter by tenant_id.",
          evidenceIds: ["answer:q1", "answer:q2", "error:L2"],
          confidence: "high",
          verification:
            "Review the code path where the tenant context is not set and add a guard to ensure it is always set before any query runs.",
        },
      ],
      missingInformation: [
        "The full list of queries that may be missing a tenant_id filter.",
        "Whether any other endpoints have the same missing tenant context issue.",
      ],
      recoveryTasks: [
        {
          title: "Pause affected tenant access and verify authorization",
          priority: "P0",
          rationale:
            "P0 because you reported one tenant seeing another's records, which is unverified here. Pause the affected access first, then have an engineer verify that tenant scoping and authorisation are enforced on every request.",
          evidenceIds: ["answer:q1", "answer:q3", "error:L3"],
          verification:
            "An engineer reviews the authorization middleware and confirms tenant context is set on every request.",
          acceptanceCriteria: [
            "Pause access for the affected tenant until the fix is verified.",
            "Have an engineer review and fix the authorization middleware to set tenant context on every request.",
            "Add a tenant_id filter to the orders endpoint query that is currently missing it.",
          ],
        },
        {
          title: "Add tenant context guard and query filter audit",
          priority: "P1",
          rationale:
            "To prevent recurrence, we need to ensure the tenant context is always set before any database query and audit all queries for a tenant_id filter. This should be done in staging first with reversible checks.",
          evidenceIds: ["answer:q2", "error:L2"],
          verification:
            "Deploy the tenant context guard to staging and run a query audit to confirm all queries filter by tenant_id.",
          acceptanceCriteria: [
            "Add a middleware guard that raises an error if the tenant context is not set before any query.",
            "Audit all database queries and add a tenant_id filter where missing.",
            "Verify in staging that no cross-tenant queries are possible.",
          ],
        },
      ],
      limitations: [
        "The application source code was not inspected for all query paths.",
        "The authentication and authorization middleware was not reviewed in full.",
        "No audit of all API endpoints was performed to find other missing tenant filters.",
      ],
    },
  },
];
