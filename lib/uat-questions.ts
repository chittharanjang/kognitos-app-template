/**
 * UAT question bank — sourced from questions.csv (FT-DB Agent Testing).
 *
 * These questions are tagged `source: "uat"` and are ONLY triggered by the
 * UAT button on the Query Run Groups page. They are never mixed with the
 * general test-question library that powers the "Test" button on the flat
 * run-history page.
 *
 * To add or remove questions, edit this file. The UAT endpoint
 * (POST /api/query/uat) reads exclusively from this list.
 */

export interface UatQuestion {
  /** Numeric category from the CSV (1–16). */
  category: number;
  /** Human-readable category label. */
  categoryName: string;
  /** Natural-language question text sent to the SQL Query Generator. */
  question: string;
}

export const UAT_QUESTIONS: UatQuestion[] = [
  // ── Category 1: Yes/No — Single Table ───────────────────────────────────
  {
    category: 1,
    categoryName: "Yes/No — Single Table",
    question: 'Are there any clients with a last name of "Smith"?',
  },
  {
    category: 1,
    categoryName: "Yes/No — Single Table",
    question: "Is there a client with SSN last 4 digits 2242?",
  },
  {
    category: 1,
    categoryName: "Yes/No — Single Table",
    question: "Are there any clients born after 1995?",
  },

  // ── Category 2: Yes/No — Cross-Table (Client + Profile Status) ──────────
  {
    category: 2,
    categoryName: "Yes/No — Cross-Table (Client + Profile Status)",
    question: "Are there any active clients who are not registered on the portal?",
  },
  {
    category: 2,
    categoryName: "Yes/No — Cross-Table (Client + Profile Status)",
    question: "Do any inactive clients have online portal access?",
  },
  {
    category: 2,
    categoryName: "Yes/No — Cross-Table (Client + Profile Status)",
    question: "Are there any clients whose profile status is pending?",
  },

  // ── Category 3: Yes/No — Account Absence ────────────────────────────────
  {
    category: 3,
    categoryName: "Yes/No — Account Absence",
    question: "Are there any active clients who don't have any accounts?",
  },
  {
    category: 3,
    categoryName: "Yes/No — Account Absence",
    question: "Do any unregistered clients have no accounts?",
  },
  {
    category: 3,
    categoryName: "Yes/No — Account Absence",
    question: "Are there clients with no open accounts?",
  },
  {
    category: 3,
    categoryName: "Yes/No — Account Absence",
    question: "Are there clients without any IRA accounts?",
  },

  // ── Category 4: Yes/No — Account Presence ───────────────────────────────
  {
    category: 4,
    categoryName: "Yes/No — Account Presence",
    question: "Are there any active clients who have open accounts?",
  },
  {
    category: 4,
    categoryName: "Yes/No — Account Presence",
    question: "Do any inactive clients have closed accounts?",
  },
  {
    category: 4,
    categoryName: "Yes/No — Account Presence",
    question: "Are there clients with both IRA and non-IRA accounts?",
  },

  // ── Category 5: Direct Info — Specific Individual ───────────────────────
  {
    category: 5,
    categoryName: "Direct Info — Specific Individual",
    question: "What is the email address of Lucas Wright?",
  },
  {
    category: 5,
    categoryName: "Direct Info — Specific Individual",
    question: "What accounts does F1027 have?",
  },
  {
    category: 5,
    categoryName: "Direct Info — Specific Individual",
    question: "What is the profile status and phone number of Jane Doe?",
  },
  {
    category: 5,
    categoryName: "Direct Info — Specific Individual",
    question: "Show me all information available for fiduciary ID F1009?",
  },

  // ── Category 6: Direct Info — Filtered Columns ──────────────────────────
  {
    category: 6,
    categoryName: "Direct Info — Filtered Columns",
    question: "Give me the email and phone of all inactive clients with open accounts",
  },
  {
    category: 6,
    categoryName: "Direct Info — Filtered Columns",
    question: "What are the SSN last 4 digits and date of birth of unregistered active clients?",
  },
  {
    category: 6,
    categoryName: "Direct Info — Filtered Columns",
    question: "Give me the name and email and account type for clients who have IRA accounts",
  },

  // ── Category 7: Count / Aggregation ─────────────────────────────────────
  {
    category: 7,
    categoryName: "Count / Aggregation",
    question: "How many active clients are there?",
  },
  {
    category: 7,
    categoryName: "Count / Aggregation",
    question: "How many clients have open accounts?",
  },
  {
    category: 7,
    categoryName: "Count / Aggregation",
    question: "How many distinct account types exist?",
  },
  {
    category: 7,
    categoryName: "Count / Aggregation",
    question: "How many unregistered clients have an active profile?",
  },

  // ── Category 8: List / Report — Single Table ────────────────────────────
  {
    category: 8,
    categoryName: "List / Report — Single Table",
    question: "List all clients with their date of birth",
  },
  {
    category: 8,
    categoryName: "List / Report — Single Table",
    question: "Show me all clients who were born before 1980",
  },
  {
    category: 8,
    categoryName: "List / Report — Single Table",
    question: "List all clients who don't have an email address",
  },

  // ── Category 9: List / Report — Multi-Table ─────────────────────────────
  {
    category: 9,
    categoryName: "List / Report — Multi-Table",
    question: "List all active clients along with their account numbers and account status",
  },
  {
    category: 9,
    categoryName: "List / Report — Multi-Table",
    question: "Give me a report of all clients with their profile status and phone number",
  },
  {
    category: 9,
    categoryName: "List / Report — Multi-Table",
    question: "Show me all clients with open accounts including account type and market value",
  },

  // ── Category 10: List / Report — All Three Tables (Cross-Schema) ─────────
  {
    category: 10,
    categoryName: "List / Report — All Three Tables (Cross-Schema)",
    question: "List unregistered clients who have open accounts including their postal code",
  },
  {
    category: 10,
    categoryName: "List / Report — All Three Tables (Cross-Schema)",
    question: "Show active clients with closed accounts and their postal code",
  },
  {
    category: 10,
    categoryName: "List / Report — All Three Tables (Cross-Schema)",
    question: "Give me all inactive clients who have open IRA accounts along with their postal code",
  },

  // ── Category 11: Account Absence — Specific Type ─────────────────────────
  {
    category: 11,
    categoryName: "Account Absence — Specific Type",
    question: "Which clients have no open accounts?",
  },
  {
    category: 11,
    categoryName: "Account Absence — Specific Type",
    question: "List active clients who don't have any closed accounts",
  },
  {
    category: 11,
    categoryName: "Account Absence — Specific Type",
    question: "Are there any active clients without IRA accounts?",
  },

  // ── Category 12: Exclusive Account Filter ────────────────────────────────
  {
    category: 12,
    categoryName: "Exclusive Account Filter",
    question: "Which clients have only IRA accounts?",
  },
  {
    category: 12,
    categoryName: "Exclusive Account Filter",
    question: "List clients whose every account is closed",
  },
  {
    category: 12,
    categoryName: "Exclusive Account Filter",
    question: "Show clients that have exclusively open accounts",
  },

  // ── Category 13: Set Difference ──────────────────────────────────────────
  {
    category: 13,
    categoryName: "Set Difference",
    question: "Which fiduciary IDs are in accounts but not in clients?",
  },
  {
    category: 13,
    categoryName: "Set Difference",
    question: "Are there any accounts that don't have a matching client record?",
  },

  // ── Category 14: Orphan FID / Accounts-Only ──────────────────────────────
  {
    category: 14,
    categoryName: "Orphan FID / Accounts-Only",
    question: "What accounts does F1026 have?",
  },
  {
    category: 14,
    categoryName: "Orphan FID / Accounts-Only",
    question: "Show me the account status and type for F1026",
  },

  // ── Category 15: NULL / NOT NULL Checks ──────────────────────────────────
  {
    category: 15,
    categoryName: "NULL / NOT NULL Checks",
    question: "Which clients don't have an email address?",
  },
  {
    category: 15,
    categoryName: "NULL / NOT NULL Checks",
    question: "List clients who have a mobile phone number",
  },
  {
    category: 15,
    categoryName: "NULL / NOT NULL Checks",
    question: "Are there any clients with no SSN on file?",
  },

  // ── Category 16: Multi-Part / Compound Questions ─────────────────────────
  {
    category: 16,
    categoryName: "Multi-Part / Compound Questions",
    question: "How many active clients are there and do any of them lack portal access?",
  },
  {
    category: 16,
    categoryName: "Multi-Part / Compound Questions",
    question: "Are there any unregistered clients with open accounts and if so what are their names?",
  },
  {
    category: 16,
    categoryName: "Multi-Part / Compound Questions",
    question: "Which clients have both open and closed accounts?",
  },
];

/** All unique category numbers present in the UAT suite. */
export const UAT_CATEGORIES: { category: number; categoryName: string; count: number }[] =
  (() => {
    const map = new Map<number, { categoryName: string; count: number }>();
    for (const q of UAT_QUESTIONS) {
      const existing = map.get(q.category);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(q.category, { categoryName: q.categoryName, count: 1 });
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([category, { categoryName, count }]) => ({
        category,
        categoryName,
        count,
      }));
  })();
