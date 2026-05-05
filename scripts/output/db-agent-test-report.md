# DB Agent Test Run

- Endpoint: `http://localhost:4001/api/ama-agent` (same routes the UI calls)
- Concurrency: 5
- Total: 5  •  Passed: 5  •  Failed: 0  •  Timed out: 0  •  Errored: 0
- Avg elapsed: 40.7s

## Pass/fail by category

| Category | Passed | Failed | Total | Pass % | Avg s |
|---|---:|---:|---:|---:|---:|
| Q | 5 | 0 | 5 | 100% | 40.7 |

## Per-question results

| Tag | Status | s | Type | Records | DBs | CSV | SQL | Sub-Q | Response snippet |
|---|---|---:|---|---:|---|:---:|:---:|---:|---|
| Q1 | completed | 40.2 | data_retrieval | 24 | snowflake, wealthx, mssql | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair  |
| Q2 | completed | 42.3 | data_retrieval | 7 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| Q3 | completed | 40.1 | data_retrieval | 14 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| Q4 | completed | 40.3 | data_retrieval | 20 | snowflake, wealthx | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| Q5 | completed | 40.6 | data_retrieval | 9 | snowflake, wealthx | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
