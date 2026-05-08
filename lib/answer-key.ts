/**
 * Ground Truth Answer Key — SQL Query Generator UAT
 *
 * 49 entries mapping 1-to-1 with UAT_QUESTIONS (index 0 = Q1).
 * Source: ground_truth_report.md (generated 2026-05-06 from the FT demo dataset).
 *
 * Used by /api/grade-run to auto-grade UAT run outputs via Claude.
 */

import { UAT_QUESTIONS } from "./uat-questions";

export interface AnswerKeyEntry {
  /** 1-based question number matching the ground truth report. */
  questionNumber: number;
  /** Exact question text (matches UAT_QUESTIONS[questionNumber - 1].question). */
  question: string;
  category: number;
  categoryName: string;
  /**
   * Full ground truth answer text as written in the report.
   * Used as context for LLM grading — not displayed verbatim in all UIs.
   */
  answerText: string;
}

export const ANSWER_KEY: AnswerKeyEntry[] = [
  // ── Category 1: Yes/No — Single Table ──────────────────────────────────
  {
    questionNumber: 1,
    question: UAT_QUESTIONS[0].question,
    category: 1,
    categoryName: "Yes/No — Single Table",
    answerText:
      'NO — no clients with last name "Smith" exist in the dataset.',
  },
  {
    questionNumber: 2,
    question: UAT_QUESTIONS[1].question,
    category: 1,
    categoryName: "Yes/No — Single Table",
    answerText:
      "YES — 2 clients have SSN last 4 digits 2242: F1030 (Jane Doe) and F1031 (John Doe).",
  },
  {
    questionNumber: 3,
    question: UAT_QUESTIONS[2].question,
    category: 1,
    categoryName: "Yes/No — Single Table",
    answerText:
      "YES — 4 clients born after 1995: F1009 Sophia Taylor (1999-06-09), F1016 Mia Thomas (1997-05-16), F1020 Benjamin Clark (1998-03-30), F1023 Amelia King (1996-10-02).",
  },

  // ── Category 2: Yes/No — Cross-Table ───────────────────────────────────
  {
    questionNumber: 4,
    question: UAT_QUESTIONS[3].question,
    category: 2,
    categoryName: "Yes/No — Cross-Table (Client + Profile Status)",
    answerText:
      "YES — 13 active clients (PROFILE_STATUS = ACTIVE AND online_portal_access = False): F1006 Michael Brown, F1008 David Wilson, F1009 Sophia Taylor, F1011 Aarav Sharma, F1013 Ethan Moore, F1014 Aisha Khan, F1016 Mia Thomas, F1018 James White, F1020 Benjamin Clark, F1022 Elijah Young, F1025 Amit Sharma, F1029 Sneha Iyer, F1030 Jane Doe.",
  },
  {
    questionNumber: 5,
    question: UAT_QUESTIONS[4].question,
    category: 2,
    categoryName: "Yes/No — Cross-Table (Client + Profile Status)",
    answerText:
      "YES — 2 clients (PROFILE_STATUS = INACTIVE AND online_portal_access = True): F1021 Harper Lewis and F1028 Rahul Mehta.",
  },
  {
    questionNumber: 6,
    question: UAT_QUESTIONS[5].question,
    category: 2,
    categoryName: "Yes/No — Cross-Table (Client + Profile Status)",
    answerText:
      "NO — only statuses present are ACTIVE, INACTIVE, and DEACTIVATED. No PENDING status exists in the dataset.",
  },

  // ── Category 3: Yes/No — Account Absence ───────────────────────────────
  {
    questionNumber: 7,
    question: UAT_QUESTIONS[6].question,
    category: 3,
    categoryName: "Yes/No — Account Absence",
    answerText:
      "NO — all active clients (PROFILE_STATUS = ACTIVE) have at least one account record.",
  },
  {
    questionNumber: 8,
    question: UAT_QUESTIONS[7].question,
    category: 3,
    categoryName: "Yes/No — Account Absence",
    answerText:
      "YES — 2 clients (online_portal_access = False AND no account records): F1030 Jane Doe and F1031 John Doe.",
  },
  {
    questionNumber: 9,
    question: UAT_QUESTIONS[8].question,
    category: 3,
    categoryName: "Yes/No — Account Absence",
    answerText:
      "YES — 9 clients with no open accounts: F1009 Sophia Taylor, F1015 Noah Anderson, F1018 James White, F1021 Harper Lewis, F1024 Lucas Wright, F1028 Rahul Mehta, F1029 Sneha Iyer, F1030 Jane Doe, F1031 John Doe.",
  },
  {
    questionNumber: 10,
    question: UAT_QUESTIONS[9].question,
    category: 3,
    categoryName: "Yes/No — Account Absence",
    answerText:
      "YES — 9 clients without any IRA accounts: F1011 Aarav Sharma, F1016 Mia Thomas, F1017 Isabella Jackson, F1022 Elijah Young, F1023 Amelia King, F1028 Rahul Mehta, F1029 Sneha Iyer, F1030 Jane Doe, F1031 John Doe.",
  },

  // ── Category 4: Yes/No — Account Presence ──────────────────────────────
  {
    questionNumber: 11,
    question: UAT_QUESTIONS[10].question,
    category: 4,
    categoryName: "Yes/No — Account Presence",
    answerText:
      "YES — 10 active clients with at least one open account (PROFILE_STATUS = ACTIVE per MSSQL): F1006 Michael Brown, F1008 David Wilson, F1011 Aarav Sharma, F1013 Ethan Moore, F1014 Aisha Khan, F1016 Mia Thomas, F1020 Benjamin Clark, F1022 Elijah Young, F1025 Amit Sharma, F1027 Neha Verma. Note: F1005 (DEACTIVATED), F1007 (DEACTIVATED), F1010 (DEACTIVATED), F1012 (INACTIVE) are excluded — their MSSQL status is not ACTIVE.",
  },
  {
    questionNumber: 12,
    question: UAT_QUESTIONS[11].question,
    category: 4,
    categoryName: "Yes/No — Account Presence",
    answerText:
      "YES — 2 inactive clients with at least one closed account (PROFILE_STATUS = INACTIVE): F1012 Olivia Martin and F1021 Harper Lewis.",
  },
  {
    questionNumber: 13,
    question: UAT_QUESTIONS[12].question,
    category: 4,
    categoryName: "Yes/No — Account Presence",
    answerText:
      "YES — 8 clients have both IRA and non-IRA accounts: F1005 Priya Nair, F1006 Michael Brown, F1007 Emily Davis, F1008 David Wilson, F1010 Liam Johnson, F1012 Olivia Martin, F1025 Amit Sharma, F1027 Neha Verma.",
  },

  // ── Category 5: Direct Info — Specific Individual ──────────────────────
  {
    questionNumber: 14,
    question: UAT_QUESTIONS[13].question,
    category: 5,
    categoryName: "Direct Info — Specific Individual",
    answerText: "The email address of Lucas Wright is lucas.w@mail.com.",
  },
  {
    questionNumber: 15,
    question: UAT_QUESTIONS[14].question,
    category: 5,
    categoryName: "Direct Info — Specific Individual",
    answerText:
      "F1027 (Neha Verma) has 3 accounts: 100019 Roth IRA (Open), 100020 Investment Account (Open), 100021 Inherited Roth IRA (Open).",
  },
  {
    questionNumber: 16,
    question: UAT_QUESTIONS[15].question,
    category: 5,
    categoryName: "Direct Info — Specific Individual",
    answerText:
      "Jane Doe (F1030): Profile Status = ACTIVE, Phone = 5552017001.",
  },
  {
    questionNumber: 17,
    question: UAT_QUESTIONS[16].question,
    category: 5,
    categoryName: "Direct Info — Specific Individual",
    answerText:
      "F1009 Sophia Taylor: Email = None, Phone = None, SSN last4 = 7788, DOB = 1999-06-09, Profile Status = ACTIVE, Portal Access = False. Accounts: all Traditional IRA, all Closed.",
  },

  // ── Category 6: Direct Info — Filtered Columns ─────────────────────────
  {
    questionNumber: 18,
    question: UAT_QUESTIONS[17].question,
    category: 6,
    categoryName: "Direct Info — Filtered Columns",
    answerText:
      "2 inactive clients with open accounts: Olivia Martin (email: olivia.m@mail.com, phone: None) and Isabella Jackson (email: bella.j@mail.com, phone: 5552011010).",
  },
  {
    questionNumber: 19,
    question: UAT_QUESTIONS[18].question,
    category: 6,
    categoryName: "Direct Info — Filtered Columns",
    answerText:
      "13 unregistered active clients (online_portal_access = False, PROFILE_STATUS = ACTIVE) with their SSN last4 and DOB: Michael Brown (SSN: None, DOB: 1983-09-22), David Wilson (SSN: 4499, DOB: 1977-02-05), Sophia Taylor (SSN: 7788, DOB: 1999-06-09), Aarav Sharma (SSN: 1122, DOB: 1993-03-11), Ethan Moore (SSN: 4411, DOB: 1990-07-15), Aisha Khan (SSN: None, DOB: 1994-11-10), Mia Thomas (SSN: 9981, DOB: 1997-05-16), James White (SSN: None, DOB: 1986-04-04), Benjamin Clark (SSN: 4554, DOB: 1998-03-30), Elijah Young (SSN: 6221, DOB: 1989-07-07), Amelia King (SSN: 1199, DOB: 1996-10-02), Sneha Iyer (SSN: 3311, DOB: 1991-08-27), Jane Doe (SSN: 5544, DOB: 2001-03-15).",
  },
  {
    questionNumber: 20,
    question: UAT_QUESTIONS[19].question,
    category: 6,
    categoryName: "Direct Info — Filtered Columns",
    answerText:
      "17 unique clients with at least one IRA account, including their name, email, and IRA account type. Key records: Amit Sharma (amit.sharma@mail.com, Roth IRA), Neha Verma (neha.verma@mail.com, Roth IRA), Emily Davis (None, Traditional IRA), David Wilson (david.wilson@mail.com, Inherited Roth IRA), Liam Johnson (liam.j@mail.com, Roth IRA), Priya Nair (priya.nair@mail.com, Traditional IRA), Michael Brown (michael.b@mail.com, Inherited Traditional IRA), Sophia Taylor (None, Traditional IRA), Olivia Martin (olivia.m@mail.com, Inherited Traditional IRA), Ethan Moore (ethan.moore@mail.com, Inherited Roth IRA), and 7 more (Aisha Khan, Noah Anderson, Charlotte Harris, James White, Harper Lewis, Benjamin Clark, Lucas Wright).",
  },

  // ── Category 7: Count / Aggregation ────────────────────────────────────
  {
    questionNumber: 21,
    question: UAT_QUESTIONS[20].question,
    category: 7,
    categoryName: "Count / Aggregation",
    answerText:
      "18 active clients (PROFILE_STATUS = ACTIVE in the PROFILE_STATUS table).",
  },
  {
    questionNumber: 22,
    question: UAT_QUESTIONS[21].question,
    category: 7,
    categoryName: "Count / Aggregation",
    answerText:
      "17 unique clients in CLIENTS_FIDO with at least one open account.",
  },
  {
    questionNumber: 23,
    question: UAT_QUESTIONS[22].question,
    category: 7,
    categoryName: "Count / Aggregation",
    answerText:
      "6 distinct account types: Investment Account, Roth IRA, Traditional IRA, Estate, Inherited Roth IRA, Inherited Traditional IRA.",
  },
  {
    questionNumber: 24,
    question: UAT_QUESTIONS[23].question,
    category: 7,
    categoryName: "Count / Aggregation",
    answerText:
      "13 unregistered clients have an active profile (online_portal_access = False AND PROFILE_STATUS = ACTIVE).",
  },

  // ── Category 8: List / Report — Single Table ────────────────────────────
  {
    questionNumber: 25,
    question: UAT_QUESTIONS[24].question,
    category: 8,
    categoryName: "List / Report — Single Table",
    answerText:
      "26 clients total with their DOB. Sample: Priya Nair (1992-04-11), Michael Brown (1983-09-22), Emily Davis (1995-12-17), David Wilson (1977-02-05), Charlotte Harris (1979-02-14), and 21 more. The response must include all 26 clients.",
  },
  {
    questionNumber: 26,
    question: UAT_QUESTIONS[25].question,
    category: 8,
    categoryName: "List / Report — Single Table",
    answerText:
      "2 clients born before 1980: David Wilson (1977-02-05) and Charlotte Harris (1979-02-14).",
  },
  {
    questionNumber: 27,
    question: UAT_QUESTIONS[26].question,
    category: 8,
    categoryName: "List / Report — Single Table",
    answerText:
      "4 clients with no email address (WHERE primary_email IS NULL): F1007 Emily Davis, F1009 Sophia Taylor, F1015 Noah Anderson, F1020 Benjamin Clark.",
  },

  // ── Category 9: List / Report — Multi-Table ─────────────────────────────
  {
    questionNumber: 28,
    question: UAT_QUESTIONS[27].question,
    category: 9,
    categoryName: "List / Report — Multi-Table",
    answerText:
      "18 active clients with their account numbers and account statuses (multiple rows per client where applicable). All account rows for PROFILE_STATUS = ACTIVE clients must be included.",
  },
  {
    questionNumber: 29,
    question: UAT_QUESTIONS[28].question,
    category: 9,
    categoryName: "List / Report — Multi-Table",
    answerText:
      "26 clients — all CLIENTS_FIDO rows joined to PROFILE_STATUS, showing each client's name, profile status, and phone number.",
  },
  {
    questionNumber: 30,
    question: UAT_QUESTIONS[29].question,
    category: 9,
    categoryName: "List / Report — Multi-Table",
    answerText:
      "All clients with open accounts, joined to show account type. Multiple rows per client where they have multiple open accounts. Note: the dataset does not include a market value column; the response should show available fields (name, account number, account type, account status = Open).",
  },

  // ── Category 10: List / Report — All Three Tables ───────────────────────
  {
    questionNumber: 31,
    question: UAT_QUESTIONS[30].question,
    category: 10,
    categoryName: "List / Report — All Three Tables (Cross-Schema)",
    answerText:
      "15 unregistered clients (online_portal_access = False) with open accounts and their postal codes: Priya Nair (F1005, 10001), Michael Brown (F1006, 90001), Emily Davis (F1007, 75201), David Wilson (F1008, 33101), Aarav Sharma (F1011, 77001), Olivia Martin (F1012, 85001), Ethan Moore (F1013, 94101), Aisha Khan (F1014, 30301), Mia Thomas (F1016, 48201), Isabella Jackson (F1017, 15201), Liam Johnson (F1010, 60601), Benjamin Clark (F1020, None), Elijah Young (F1022, 80201), Amelia King (F1023, 20001), Sneha Iyer (F1029, N/A).",
  },
  {
    questionNumber: 32,
    question: UAT_QUESTIONS[31].question,
    category: 10,
    categoryName: "List / Report — All Three Tables (Cross-Schema)",
    answerText:
      "6 active clients with closed accounts and their postal codes: Michael Brown (F1006, 90001), David Wilson (F1008, 33101), Sophia Taylor (F1009, None), James White (F1018, 37201), Lucas Wright (F1024, 99501), Neha Verma (F1027, N/A).",
  },
  {
    questionNumber: 33,
    question: UAT_QUESTIONS[32].question,
    category: 10,
    categoryName: "List / Report — All Three Tables (Cross-Schema)",
    answerText:
      "0 results — no INACTIVE clients have open IRA accounts in the dataset. The correct answer is an empty result set.",
  },

  // ── Category 11: Account Absence — Specific Type ────────────────────────
  {
    questionNumber: 34,
    question: UAT_QUESTIONS[33].question,
    category: 11,
    categoryName: "Account Absence — Specific Type",
    answerText:
      "9 clients with no open accounts (includes clients with no accounts at all): F1009 Sophia Taylor, F1015 Noah Anderson, F1018 James White, F1021 Harper Lewis, F1024 Lucas Wright, F1028 Rahul Mehta, F1029 Sneha Iyer, F1030 Jane Doe, F1031 John Doe.",
  },
  {
    questionNumber: 35,
    question: UAT_QUESTIONS[34].question,
    category: 11,
    categoryName: "Account Absence — Specific Type",
    answerText:
      "9 active clients with no closed accounts (PROFILE_STATUS = ACTIVE AND no closed account records): F1011 Aarav Sharma, F1013 Ethan Moore, F1014 Aisha Khan, F1016 Mia Thomas, F1020 Benjamin Clark, F1022 Elijah Young, F1025 Amit Sharma, F1029 Sneha Iyer, F1030 Jane Doe.",
  },
  {
    questionNumber: 36,
    question: UAT_QUESTIONS[35].question,
    category: 11,
    categoryName: "Account Absence — Specific Type",
    answerText:
      "YES — 5 active clients without any IRA accounts (PROFILE_STATUS = ACTIVE AND no IRA account): F1011 Aarav Sharma, F1016 Mia Thomas, F1022 Elijah Young, F1029 Sneha Iyer, F1030 Jane Doe.",
  },

  // ── Category 12: Exclusive Account Filter ───────────────────────────────
  {
    questionNumber: 37,
    question: UAT_QUESTIONS[36].question,
    category: 12,
    categoryName: "Exclusive Account Filter",
    answerText:
      "9 clients whose every account is an IRA type: F1009 Sophia Taylor, F1013 Ethan Moore, F1014 Aisha Khan, F1015 Noah Anderson, F1018 James White, F1019 Charlotte Harris, F1020 Benjamin Clark, F1021 Harper Lewis, F1024 Lucas Wright.",
  },
  {
    questionNumber: 38,
    question: UAT_QUESTIONS[37].question,
    category: 12,
    categoryName: "Exclusive Account Filter",
    answerText:
      "5 clients whose every account is closed: F1009 Sophia Taylor, F1015 Noah Anderson, F1018 James White, F1021 Harper Lewis, F1024 Lucas Wright.",
  },
  {
    questionNumber: 39,
    question: UAT_QUESTIONS[38].question,
    category: 12,
    categoryName: "Exclusive Account Filter",
    answerText:
      "11 clients with exclusively open accounts: F1010 Liam Johnson, F1011 Aarav Sharma, F1013 Ethan Moore, F1014 Aisha Khan, F1016 Mia Thomas, F1017 Isabella Jackson, F1019 Charlotte Harris, F1020 Benjamin Clark, F1022 Elijah Young, F1023 Amelia King, F1025 Amit Sharma.",
  },

  // ── Category 13: Set Difference ─────────────────────────────────────────
  {
    questionNumber: 40,
    question: UAT_QUESTIONS[39].question,
    category: 13,
    categoryName: "Set Difference",
    answerText:
      "1 orphan FID: F1026 — exists in ACCOUNTS table but has no record in CLIENTS_FIDO.",
  },
  {
    questionNumber: 41,
    question: UAT_QUESTIONS[40].question,
    category: 13,
    categoryName: "Set Difference",
    answerText:
      "YES — F1026 has 1 account (account 100023, Traditional IRA, Closed) with no corresponding client record in CLIENTS_FIDO.",
  },

  // ── Category 14: Orphan FID / Accounts-Only ─────────────────────────────
  {
    questionNumber: 42,
    question: UAT_QUESTIONS[41].question,
    category: 14,
    categoryName: "Orphan FID / Accounts-Only",
    answerText:
      "F1026 has 1 account: account 100023, Traditional IRA, Closed. F1026 exists only in ACCOUNTS, not in CLIENTS_FIDO.",
  },
  {
    questionNumber: 43,
    question: UAT_QUESTIONS[42].question,
    category: 14,
    categoryName: "Orphan FID / Accounts-Only",
    answerText:
      "F1026 account: account_type = Traditional IRA, account_status = Closed.",
  },

  // ── Category 15: NULL / NOT NULL Checks ─────────────────────────────────
  {
    questionNumber: 44,
    question: UAT_QUESTIONS[43].question,
    category: 15,
    categoryName: "NULL / NOT NULL Checks",
    answerText:
      "4 clients with no email address (WHERE primary_email IS NULL): F1007 Emily Davis, F1009 Sophia Taylor, F1015 Noah Anderson, F1020 Benjamin Clark.",
  },
  {
    questionNumber: 45,
    question: UAT_QUESTIONS[44].question,
    category: 15,
    categoryName: "NULL / NOT NULL Checks",
    answerText:
      "21 clients have a mobile phone number (WHERE mobile_phone IS NOT NULL).",
  },
  {
    questionNumber: 46,
    question: UAT_QUESTIONS[45].question,
    category: 15,
    categoryName: "NULL / NOT NULL Checks",
    answerText:
      "YES — 4 clients have no SSN on file (WHERE ssn_last4digits IS NULL): F1006 Michael Brown, F1014 Aisha Khan, F1018 James White, F1027 Neha Verma.",
  },

  // ── Category 16: Multi-Part / Compound Questions ─────────────────────────
  {
    questionNumber: 47,
    question: UAT_QUESTIONS[46].question,
    category: 16,
    categoryName: "Multi-Part / Compound Questions",
    answerText:
      "There are 18 active clients (PROFILE_STATUS = ACTIVE in PROFILE_STATUS table). Of those matched to CLIENTS_FIDO, 13 lack portal access (online_portal_access = False). Both parts of the question must be answered: total active count and the portal-access breakdown.",
  },
  {
    questionNumber: 48,
    question: UAT_QUESTIONS[47].question,
    category: 16,
    categoryName: "Multi-Part / Compound Questions",
    answerText:
      "YES — 15 unregistered clients (online_portal_access = False) have open accounts. Names: Priya Nair, Michael Brown, Emily Davis, David Wilson, Aarav Sharma, Olivia Martin, Ethan Moore, Aisha Khan, Mia Thomas, Isabella Jackson, Liam Johnson, Benjamin Clark, Elijah Young, Amelia King, Sneha Iyer.",
  },
  {
    questionNumber: 49,
    question: UAT_QUESTIONS[48].question,
    category: 16,
    categoryName: "Multi-Part / Compound Questions",
    answerText:
      "6 clients have both open and closed accounts: F1005 Priya Nair, F1006 Michael Brown, F1007 Emily Davis, F1008 David Wilson, F1012 Olivia Martin, F1027 Neha Verma.",
  },
];

/** Normalize question text for fuzzy lookup (same as normQ in page components). */
function normQ(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Lookup map: normalized question text → answer key entry. */
export const ANSWER_KEY_MAP = new Map<string, AnswerKeyEntry>(
  ANSWER_KEY.map((e) => [normQ(e.question), e]),
);

/**
 * Find the ground truth answer for a question.
 * Returns undefined if the question isn't in the UAT set.
 */
export function findAnswerKeyEntry(
  questionText: string,
): AnswerKeyEntry | undefined {
  return ANSWER_KEY_MAP.get(normQ(questionText));
}
