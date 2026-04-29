# DB Agent Test Run

- Endpoint: `http://localhost:4001/api/ama-agent` (same routes the UI calls)
- Concurrency: 5
- Total: 100  •  Passed: 98  •  Failed: 2  •  Timed out: 0  •  Errored: 0
- Avg elapsed: 13.9s

## Pass/fail by category

| Category | Passed | Failed | Total | Pass % | Avg s |
|---|---:|---:|---:|---:|---:|
| AMB | 9 | 1 | 10 | 90% | 10.8 |
| B | 11 | 0 | 11 | 100% | 11.2 |
| COL | 6 | 0 | 6 | 100% | 11.1 |
| DSI | 7 | 0 | 7 | 100% | 9.9 |
| FIDO | 6 | 0 | 6 | 100% | 8.7 |
| GOV | 4 | 0 | 4 | 100% | 10.2 |
| IRA | 6 | 0 | 6 | 100% | 8.0 |
| J | 5 | 0 | 5 | 100% | 12.9 |
| LIST | 6 | 0 | 6 | 100% | 9.8 |
| MULTI | 6 | 0 | 6 | 100% | 29.5 |
| N | 4 | 0 | 4 | 100% | 9.2 |
| NDF | 4 | 0 | 4 | 100% | 10.3 |
| PARA | 3 | 0 | 3 | 100% | 26.3 |
| PS | 4 | 1 | 5 | 80% | 15.5 |
| Q | 5 | 0 | 5 | 100% | 14.6 |
| YN | 7 | 0 | 7 | 100% | 24.5 |
| YNX | 5 | 0 | 5 | 100% | 21.2 |

## Per-question results

| Tag | Status | s | Type | Records | DBs | CSV | SQL | Sub-Q | Response snippet |
|---|---|---:|---|---:|---|:---:|:---:|---:|---|
| YN1 | completed | 21.0 | yes_no | 1 | snowflake | — | ✓ | — | Yes — John exists: John Doe. (Note: registration status is not available from the data source.) |
| YN2 | completed | 40.0 | yes_no | 39 | snowflake, wealthx, mssql | — | ✓ | — | Yes — 25 matching records (F1005, F1006, F1007, F1008, F1009, F1010, F1011, F1012, F1013, F1014, F1015, F1016, F1017, F1018, F1019, F1020, F1021, F1022, F1023, F1024, F1025, F1026, F1027, F1030, F1031). |
| YN3 | completed | 23.3 | yes_no | 1 | snowflake | — | ✓ | — | Yes — client F1005 exists: Priya Nair. (Note: registration status is not available from the data source.) |
| YN4 | completed | 29.5 | yes_no | 0 | snowflake, mssql | ✓ | ✓ | — | No — Sarah not found in the system. |
| YN5 | completed | 25.6 | yes_no | 1 | snowflake | — | ✓ | — | Yes — client F1010 exists: Liam Johnson. |
| YN6 | completed | 17.3 | yes_no | 0 | snowflake, mssql | — | ✓ | — | No — clients with locked profile not found in the system. |
| YN7 | completed | 15.0 | yes_no | 6 | snowflake, mssql | ✓ | ✓ | — | Yes — 6 clients with deactivated profile (F1005, F1007, F1010, F1015, F1019, F1023). |
| YNX-1 | completed | 12.9 | yes_no | 0 | snowflake, wealthx | — | ✓ | — | No — John not found in the system. |
| YNX-2 | completed | 17.8 | yes_no | 1 | snowflake, wealthx, mssql | — | ✓ | — | Yes — client F1005 exists: Priya Nair (profile: DEACTIVATED). |
| YNX-3 | completed | 34.6 | yes_no | 5 | snowflake, mssql, wealthx | ✓ | ✓ | 2 | 1. Are there any clients with active profiles? Yes — 4 clients with active profile (F1008, F1013, F1014, F1020). 2. Are there any clients with Roth IRA accounts? Yes — 4 clients with active profile (F1008, F1013, F1014,  |
| YNX-4 | completed | 21.4 | yes_no | 0 | snowflake, wealthx, mssql | — | ✓ | — | No — Sarah not found in the system. |
| YNX-5 | completed | 19.2 | yes_no | 5 | snowflake, wealthx | — | ✓ | — | Yes — 5 matching records (F1007, F1010, F1012, F1016, F1022). (Note: registration status is not available from the data source.) |
| DSI-1 | completed | 10.9 | data_retrieval | 1 | snowflake | — | ✓ | — | John - primary email: priya.nair@mail.com |
| DSI-2 | completed | 8.5 | single_value | 1 | snowflake | — | ✓ | — | Sarah - mobile phone: 5552011001 |
| DSI-3 | completed | 8.6 | single_value | 1 | snowflake | — | ✓ | — | F1005 - ssn last4digits: 2211 |
| DSI-4 | completed | 8.7 | single_value | 1 | snowflake | — | ✓ | — | John Smith - date of birth or inception: 1992-04-11 |
| DSI-5 | completed | 11.1 | data_retrieval | 1 | snowflake | — | ✓ | — | F1010 - primary email: liam.j@mail.com |
| DSI-6 | completed | 15.0 | single_value | 1 | snowflake, mssql | ✓ | ✓ | — | F1005 - profile status: DEACTIVATED |
| DSI-7 | completed | 6.7 | single_value | 37 | wealthx | — | ✓ | — | Count: 37 record(s) matching John |
| COL-1 | completed | 8.6 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Mobile Phone \| Primary Email \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair  |
| COL-2 | completed | 8.6 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Ssn Last4Digits \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \| 2211 \| \| \| \| F |
| COL-3 | completed | 4.5 | data_retrieval | 0 | — | — | — | — | No records were found based on the provided criteria. |
| COL-4 | completed | 10.9 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \| 1992-04 |
| COL-5 | completed | 19.3 | data_retrieval | 22 | snowflake, mssql | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Zip \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \| \| \| \| \| F1006 \| Michael \ |
| COL-6 | completed | 14.9 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Mobile Phone \| Online Portal Access \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \ |
| LIST-1 | completed | 13.1 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| LIST-2 | completed | 10.8 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| LIST-3 | completed | 11.1 | data_retrieval | 39 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Registration \| Profile Status Id \| Account Id \| Account Status \| Market Value \| Acc |
| LIST-4 | completed | 10.7 | data_retrieval | 39 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| LIST-5 | completed | 6.5 | data_retrieval | 0 | — | — | — | — | No records were found based on the provided criteria. |
| LIST-6 | completed | 6.7 | data_retrieval | 37 | wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| FIDO-1 | completed | 4.5 | data_retrieval | 0 | — | — | — | — | No records were found based on the provided criteria. |
| FIDO-2 | completed | 8.8 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| FIDO-3 | completed | 10.7 | data_retrieval | 2 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Date Of Birth Or Inception \| Online Portal Access \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| - |
| FIDO-4 | completed | 13.2 | count | 22 | snowflake | — | ✓ | — | Count: 22 record(s) |
| FIDO-5 | completed | 8.8 | data_retrieval | 0 | snowflake | — | ✓ | — | No records were found based on the provided criteria. |
| FIDO-6 | completed | 6.5 | data_retrieval | 0 | — | — | — | — | No records were found based on the provided criteria. |
| B3-1 | completed | 8.6 | data_retrieval | 24 | wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| B3-2 | completed | 6.6 | count | 23 | wealthx | — | ✓ | — | Count: 23 record(s) matching IRA |
| B3-3 | completed | 6.5 | data_retrieval | 7 | wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| B3-4 | completed | 6.7 | count | 13 | wealthx | — | ✓ | — | Count: 13 record(s) matching Closed |
| B3-5 | completed | 6.4 | data_retrieval | 6 | wealthx | — | ✓ | — | Distinct Account Type values (6): - Estate (5) - Inherited Roth IRA (4) - Inherited Traditional IRA (4) - Investment Account (9) - Roth IRA (7) - Traditional IRA (8) |
| B3-6 | completed | 6.5 | data_retrieval | 3 | wealthx | ✓ | ✓ | — | Fid \| Last Name \| First Name \| Fiduciary Id \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| \| \| F1005 \| \| Open \| \| Traditional IRA \| \| \| |
| B3-7 | completed | 6.7 | count | 5 | wealthx | — | ✓ | — | Count: 5 record(s) matching Open + Estate |
| PS-1 | completed | 15.1 | count | 12 | snowflake, mssql | — | ✓ | — | Count: 12 record(s) matching ACTIVE |
| PS-2 | completed | 15.1 | data_retrieval | 0 | snowflake, mssql | — | ✓ | — | No records were found based on the provided criteria. |
| PS-3 | completed | 15.1 | data_retrieval | 6 | snowflake, mssql | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| PS-4 | completed | 15.1 | data_retrieval | 22 | snowflake, mssql | ✓ | ✓ | — | Breakdown by Account Status: - (unknown): 22 |
| PS-5 | awaiting_guidance | 17.1 | — | — | — | — | — | — | organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/hgq8WGY1kV9aYFX0lu1So |
| J2-1 | completed | 6.5 | data_retrieval | 24 | wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1017  |
| J2-2 | completed | 17.0 | data_retrieval | 10 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| J2-3 | completed | 15.2 | data_retrieval | 22 | snowflake, mssql | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Status Name \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \ |
| J2-4 | completed | 6.4 | data_retrieval | 24 | wealthx | — | ✓ | — | Fid \| Last Name \| First Name \| Fiduciary Id \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| \| \| F1019 \| \| \| Open \| \ |
| J2-5 | completed | 19.2 | data_retrieval | 0 | snowflake, wealthx, mssql | — | ✓ | — | No records were found based on the provided criteria. |
| B4-1 | completed | 19.3 | data_retrieval | 10 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1006  |
| B4-2 | completed | 19.3 | data_retrieval | 10 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Last Name \| First Name \| Fiduciary Id \| Primary Email \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| Brown \| Michael \| F1006 \|  |
| B4-3 | completed | 19.2 | data_retrieval | 39 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Last Name \| First Name \| Fiduciary Id \| Primary Email \| Mobile Phone \| Status Name \| Account Type \| Account Id \| Account Status \| Market Value --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \ |
| B4-4 | completed | 17.2 | data_retrieval | 0 | snowflake, wealthx, mssql | — | ✓ | — | No records were found based on the provided criteria. |
| IRA-1 | completed | 10.7 | data_retrieval | 23 | wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| IRA-2 | completed | 6.6 | data_retrieval | 11 | wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| IRA-3 | completed | 8.7 | data_retrieval | 8 | wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| IRA-4 | completed | 6.7 | data_retrieval | 11 | wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| IRA-5 | completed | 8.5 | count | 23 | wealthx | — | ✓ | — | Count: 23 record(s) matching IRA |
| IRA-6 | completed | 6.5 | count | 11 | wealthx | — | ✓ | — | Count: 11 record(s) matching Roth |
| MULTI-1 | completed | 8.6 | yes_no | 1 | snowflake | — | ✓ | — | Yes — John exists: John Doe. (Note: registration status is not available from the data source.) |
| MULTI-2 | completed | 34.2 | count | 5 | snowflake, wealthx, mssql | — | ✓ | 2 | 1. How many active clients are there? Count: 5 record(s) matching ACTIVE + Roth 2. Can you share the list of clients with Roth IRA accounts? Count: 5 record(s) matching ACTIVE + Roth |
| MULTI-3 | completed | 17.4 | data_retrieval | 1 | snowflake, wealthx, mssql | ✓ | ✓ | — | Sarah - mobile phone: 5552011001 |
| MULTI-4 | completed | 46.9 | count | 16 | snowflake, mssql, wealthx | — | ✓ | 3 | 1. Give me the count of all clients. Count: 16 record(s) matching ACTIVE 2. List all clients with locked profiles. Count: 16 record(s) matching ACTIVE 3. Export all active client data to a file. Count: 16 record(s) match |
| MULTI-5 | completed | 48.9 | yes_no | 1 | snowflake, wealthx, mssql | ✓ | ✓ | 3 | 1. Is F1005 a valid client? Yes — client F1005 exists: Priya Nair (profile: DEACTIVATED). 2. What accounts does F1005 hold? Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digi |
| MULTI-6 | completed | 21.3 | yes_no | 39 | snowflake, wealthx, mssql | — | ✓ | 2 | 1. Are there any unregistered clients? Yes — 25 matching records (F1005, F1006, F1007, F1008, F1009, F1010, F1011, F1012, F1013, F1014, F1015, F1016, F1017, F1018, F1019, F1020, F1021, F1022, F1023, F1024, F1025, F1026,  |
| AMB-1 | completed | 10.7 | single_value | 1 | snowflake | — | ✓ | — | John - primary email: priya.nair@mail.com |
| AMB-2 | awaiting_guidance | 8.9 | — | — | — | — | — | — | organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/mK4XrSfZfaGNetRrPGDup |
| AMB-3 | completed | 15.2 | yes_no | 22 | snowflake, mssql | — | ✓ | — | Yes — 22 matching records (F1005, F1006, F1007, F1008, F1009, F1010, F1011, F1012, F1013, F1014, F1015, F1016, F1017, F1018, F1019, F1020, F1021, F1022, F1023, F1024, F1030, F1031). |
| AMB-4 | completed | 12.9 | data_retrieval | 3 | wealthx, mssql | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| AMB-5 | completed | 8.8 | data_retrieval | 1 | snowflake | — | ✓ | — | sarah - first name: Priya |
| AMB-6 | completed | 10.9 | data_retrieval | 11 | wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| AMB-7 | completed | 6.5 | data_retrieval | 24 | wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| AMB-8 | completed | 14.9 | data_retrieval | 37 | wealthx, mssql | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Registration \| Profile Status Id \| Address Line1 \| Address Line2 \| City \| State \|  |
| AMB-9 | completed | 8.8 | data_retrieval | 23 | wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| AMB-10 | completed | 11.0 | single_value | 0 | mssql | — | ✓ | — | No records were found based on the provided criteria. |
| PARA-1 | completed | 46.7 | yes_no | 0 | snowflake, mssql | ✓ | ✓ | 3 | 1. Do we have a client named John Smith in our system? No — John not found in the system. 2. If so, could you please share his email address and phone number? No records were found based on the provided criteria. 3. Is h |
| PARA-2 | completed | 8.7 | data_retrieval | 11 | wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1025 \| \| \| \| \| Open \|  |
| PARA-3 | completed | 23.6 | data_retrieval | 39 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Account Id \| Account Type \| Account Status \| Market Value --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1005 \| Priya \| Nair \| pri |
| NDF-1 | completed | 13.0 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| NDF-2 | completed | 13.0 | yes_no | 0 | snowflake | — | ✓ | — | No — client F9999 not found in the system. |
| NDF-3 | completed | 6.6 | data_retrieval | 0 | wealthx | — | ✓ | — | No records were found based on the provided criteria. |
| NDF-4 | completed | 8.5 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| GOV-1 | completed | 10.8 | data_retrieval | 39 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| GOV-2 | completed | 12.9 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Registration \| Profile Status Id \| Account Id \| Account Status \| Market Value \| Account Ty |
| GOV-3 | completed | 8.7 | single_value | 1 | snowflake | — | ✓ | — | John - online portal access: False |
| GOV-4 | completed | 8.6 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Online Portal Access \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- |
| Q1 | completed | 15.0 | data_retrieval | 24 | wealthx, mssql | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1022  |
| Q2 | completed | 17.3 | data_retrieval | 10 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| Q3 | completed | 21.3 | data_retrieval | 10 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| Q4 | completed | 8.6 | data_retrieval | 23 | wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| Q5 | completed | 10.8 | data_retrieval | 9 | wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| N1 | completed | 10.8 | count | 22 | snowflake | — | ✓ | — | Count: 22 record(s) (Note: registration status is not exposed by the data source; counted all FIDO clients.) |
| N2 | completed | 8.8 | count | 24 | wealthx | — | ✓ | — | Count: 24 record(s) matching Open |
| N3 | completed | 8.6 | count | 8 | wealthx | — | ✓ | — | Count: 8 client(s) with more than one account Clients: F1005, F1006, F1007, F1008, F1010, F1012, F1025, F1027 |
| N4 | completed | 8.7 | data_retrieval | 37 | wealthx | — | ✓ | — | Breakdown by Account Type: - Investment Account: 9 - Traditional IRA: 8 - Roth IRA: 7 - Estate: 5 - Inherited Roth IRA: 4 - Inherited Traditional IRA: 4 |

## Failures / timeouts / errors

- **[PS-5]** (awaiting_guidance, 17.1s): Give me the count of profiles by status.
  - error: organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/hgq8WGY1kV9aYFX0lu1So
  - runId: `FgIBWUn5trvehFmqI1qno`
- **[AMB-2]** (awaiting_guidance, 8.9s): clients with ira
  - error: organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/mK4XrSfZfaGNetRrPGDup
  - runId: `Olm6M6Bv0N9zk3WGq1Bkd`
