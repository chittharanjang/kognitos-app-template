export interface QueryCategory {
  title: string;
  description: string;
  dbTags: string[];
  queries: string[];
}

export const QUERY_CATEGORIES: QueryCategory[] = [
  {
    title: "Yes/No Questions (Single DB)",
    description:
      "Concise Yes/No answer in email body. No file attachment.",
    dbTags: ["FIDO", "Profile Status"],
    queries: [
      "Is John registered in the system?",
      "Are there any clients in the database?",
      "Is F1005 a valid unregistered client?",
      "Is Sarah's profile currently active?",
      "Does the client with FIDUCIARY_ID F1010 exist?",
      "Is there any client with a locked profile?",
      "Are there any deactivated profiles in the system?",
    ],
  },
  {
    title: "Yes/No Questions (Cross-DB)",
    description:
      "Concise Yes/No answer requiring joins across databases.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Does John have any open accounts?",
      "Is the client F1005 an active client with an IRA account?",
      "Are there any clients with active profiles and Roth IRA accounts?",
      "Does Sarah have both an active profile and an open account?",
      "Is there any unregistered client who holds an Estate account?",
    ],
  },
  {
    title: "Direct Specific Information",
    description:
      "Return only the specific requested value in the email body. No extra columns. No attachment.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "What is John's email ID?",
      "Give me Sarah's phone number.",
      "What is the SSN of client F1005?",
      "What is the date of birth of client John Smith?",
      "What is the postal code for client F1010?",
      "What is the profile status of client F1005?",
      "What is the account number of John's account?",
    ],
  },
  {
    title: "Specific Column Requests",
    description:
      "Return only the requested columns in structured format. Exclude restricted columns (e.g., ONLINE_PORTAL_ACCESS) unless explicitly asked.",
    dbTags: ["FIDO"],
    queries: [
      "Share client details with phone number and email.",
      "Give me first name, last name, and SSN for all clients.",
      "Show me the name and email of all clients.",
      "List all clients with their first name, last name, and date of birth.",
      "Give me client names and their postal codes.",
      "Show me client names, phone numbers, and online portal access status.",
    ],
  },
  {
    title: "Full Table / List / File Requests",
    description:
      "Generate CSV file attachment for large datasets. Use standard business-safe columns if user doesn't specify. Exclude ONLINE_PORTAL_ACCESS unless explicitly requested.",
    dbTags: ["FIDO", "WealthX"],
    queries: [
      "Give me the list of all unregistered users.",
      "Share the file of registered clients.",
      "Export client data.",
      "Give me a list of all clients.",
      "Export all client details to a file.",
      "Share the complete list of clients with their account details.",
    ],
  },
  {
    title: "Single DB Queries - FIDO",
    description: "Query only the FIDO database (client personal/contact info).",
    dbTags: ["FIDO"],
    queries: [
      "Show me all clients whose last name is Smith.",
      "List all clients born before 1990.",
      "Give me the list of clients who have online portal access.",
      "How many clients are in the system?",
      "Show me clients from postal code 10001.",
      "List all client email addresses.",
    ],
  },
  {
    title: "Single DB Queries - WealthX",
    description:
      "Query only the WealthX database (account/financial info).",
    dbTags: ["WealthX"],
    queries: [
      "Show me all open accounts.",
      "How many IRA accounts are there?",
      "List all accounts of type Roth IRA.",
      "Give me the count of closed accounts.",
      "Show all account types available in the system.",
      "List all accounts for client F1005.",
      "How many Estate accounts are currently open?",
    ],
  },
  {
    title: "Single DB Queries - Profile Status",
    description:
      "Query only the Profile Status database (Azure SQL).",
    dbTags: ["Profile Status"],
    queries: [
      "How many active profiles are there?",
      "List all clients with locked profiles.",
      "Show me all deactivated users.",
      "What is the distribution of profile statuses?",
      "Give me the count of profiles by status.",
    ],
  },
  {
    title: "Cross-Database Joins (Two DBs)",
    description:
      "Dynamically join two databases using FIDUCIARY_ID.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Show clients with active accounts and their contact details.",
      "Give me the list of active clients who have IRA accounts.",
      "List all clients with their profile status and email.",
      "Show me clients with open accounts and their phone numbers.",
      "Give me clients with locked profiles and their account details.",
    ],
  },
  {
    title: "Cross-Database Joins (Three DBs)",
    description:
      "Dynamically join all three databases using FIDUCIARY_ID.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Give me the list of active users who have open accounts along with their contact details.",
      "Show clients with active profiles, IRA accounts, and their email addresses.",
      "List all clients with their profile status, account types, and contact information.",
      "Give me clients who have deactivated profiles but still have open accounts, along with their email and phone.",
    ],
  },
  {
    title: "IRA Account Type Handling",
    description:
      'Generic "IRA" returns all IRA variants. An exact type like "Roth IRA" returns only that type.',
    dbTags: ["WealthX"],
    queries: [
      "Give me the list of clients who have IRA accounts.",
      "List clients with Roth IRA accounts.",
      "Show me all clients with Traditional IRA accounts.",
      "Give me clients with Inherited Roth IRA accounts.",
      "How many clients have IRA accounts?",
      "How many clients have Roth IRA accounts specifically?",
    ],
  },
  {
    title: "Multiple Questions in Single Email",
    description:
      "Break into separate logical parts, process each independently, respond in structured numbered sections.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Is John registered? Also give me his email ID.",
      "How many active clients are there? And can you share the list of clients with Roth IRA accounts?",
      "What is Sarah's phone number? Is her profile active? Does she have any open accounts?",
      "Give me the count of all clients. Also, list all clients with locked profiles. And export all active client data to a file.",
      "Is F1005 a valid client? What accounts does F1005 hold? What is F1005's profile status?",
      "Are there any unregistered clients? If yes, give me their names and email addresses.",
    ],
  },
  {
    title: "Ambiguous / Poorly Structured Queries",
    description:
      "The system must infer intent from unclear or informal queries.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "john email?",
      "clients with ira",
      "anyone locked out?",
      "all data for F1005",
      "tell me about sarah",
      "who has roth",
      "active ones with accounts",
      "give me everything",
      "unregistered + ira",
      "whats johns status",
    ],
  },
  {
    title: "Long Paragraph Queries",
    description: "Parse intent from a verbose paragraph.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Hi, I need to check if we have a client named John Smith in our system, and if so, could you please share his email address and phone number? Also, I'd like to know if his profile is active or not. Thanks.",
      "I was wondering if you could pull up the list of all our clients who currently have IRA accounts and are still active in the system. If possible, please include their names and email addresses in the response.",
      "We are doing an audit and need to verify all clients whose profiles are currently locked. Please share their details including name, email, account numbers and account types.",
    ],
  },
  {
    title: "No Data Found Scenarios",
    description:
      'Respond professionally: "No records were found based on the provided criteria." Never leave blank, never expose SQL errors.',
    dbTags: ["FIDO", "WealthX"],
    queries: [
      'Show me clients with the last name "Xyzzynotexist".',
      "Is there a client with FIDUCIARY_ID F9999?",
      'List all clients with account type "Crypto Wallet".',
      'Give me details for client "NonexistentPerson".',
    ],
  },
  {
    title: "Data Governance / Security Edge Cases",
    description:
      "Exclude ONLINE_PORTAL_ACCESS unless explicitly requested. No schema names or SQL exposed.",
    dbTags: ["FIDO"],
    queries: [
      "Give me all details for client John.",
      "Export all client information.",
      "Show me client John's online portal access status.",
      "Share client details including their online portal access.",
    ],
  },
  {
    title: "Composite / Complex Business Queries",
    description:
      "Sample queries listed in the POC document itself.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Show clients with active accounts and contact details.",
      "Give me the list of active clients who have IRA accounts.",
      "Give me the list of active users who have open accounts.",
      "Give me the list of unregistered clients who have IRA accounts.",
      "Give me the list of clients who have both open IRA accounts and Investment accounts.",
    ],
  },
  {
    title: "Aggregation / Count Queries",
    description: "Queries requiring COUNT, GROUP BY, or summary aggregations.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "How many clients are registered in the system?",
      "What is the total number of open accounts?",
      "How many clients have more than one account?",
      "What is the breakdown of account types across all clients?",
    ],
  },
];

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "was", "one", "our",
  "has", "how", "may", "new", "now", "old", "see", "two", "who", "way", "use", "any",
  "did", "let", "what", "that", "with", "have", "this", "from", "they", "been", "were",
  "said", "each", "which", "their", "will", "about", "there", "could", "other", "than",
  "then", "them", "these", "some", "into", "more", "also", "only", "come", "made", "such",
  "here", "when", "your", "would", "like", "just", "over", "too", "very",
]);

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Random sample from the User Guide for empty-state starter chips. */
export function pickStarterSuggestions(count = 6): string[] {
  const all = QUERY_CATEGORIES.flatMap((c) => c.queries);
  return shuffleArray(all).slice(0, Math.min(count, all.length));
}

/**
 * Score User Guide categories against the last exchange and return up to `maxCount`
 * example queries from the best-matching category (or shuffled guide queries if no match).
 */
export function suggestQueriesFromGuide(
  lastUser: string,
  assistantPreview: string,
  maxCount: number
): string[] {
  const ctxWords = new Set([
    ...tokenize(lastUser),
    ...tokenize(assistantPreview.slice(0, 2000)),
  ]);

  const normalizedUser = lastUser.trim().toLowerCase();

  let best: QueryCategory | null = null;
  let bestScore = -1;

  for (const cat of QUERY_CATEGORIES) {
    let score = 0;
    const blob = `${cat.title} ${cat.description} ${cat.queries.slice(0, 8).join(" ")}`;
    for (const w of tokenize(blob)) {
      if (ctxWords.has(w)) score += 2;
    }
    for (const tag of cat.dbTags) {
      const t = tag.toLowerCase();
      if (lastUser.toLowerCase().includes(t) || assistantPreview.toLowerCase().includes(t)) {
        score += 5;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  let pool: string[];
  if (!best || bestScore <= 0) {
    pool = shuffleArray(QUERY_CATEGORIES.flatMap((c) => c.queries));
  } else {
    pool = shuffleArray(
      best.queries.filter((q) => q.trim().toLowerCase() !== normalizedUser)
    );
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const q of pool) {
    const k = q.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q.trim());
    if (out.length >= maxCount) break;
  }
  return out;
}
