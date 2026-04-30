# DB Agent Test Run

- Endpoint: `http://localhost:4001/api/ama-agent` (same routes the UI calls)
- Concurrency: 8
- Total: 100  •  Passed: 97  •  Failed: 3  •  Timed out: 0  •  Errored: 0
- Avg elapsed: 16.8s

## Pass/fail by category

| Category | Passed | Failed | Total | Pass % | Avg s |
|---|---:|---:|---:|---:|---:|
| AMB | 10 | 0 | 10 | 100% | 12.8 |
| B | 10 | 1 | 11 | 91% | 14.5 |
| COL | 6 | 0 | 6 | 100% | 13.4 |
| DSI | 7 | 0 | 7 | 100% | 12.4 |
| FIDO | 6 | 0 | 6 | 100% | 12.0 |
| GOV | 4 | 0 | 4 | 100% | 15.8 |
| IRA | 6 | 0 | 6 | 100% | 12.3 |
| J | 5 | 0 | 5 | 100% | 17.6 |
| LIST | 6 | 0 | 6 | 100% | 12.4 |
| MULTI | 4 | 2 | 6 | 67% | 29.8 |
| N | 4 | 0 | 4 | 100% | 12.0 |
| NDF | 4 | 0 | 4 | 100% | 16.3 |
| PARA | 3 | 0 | 3 | 100% | 19.4 |
| PS | 5 | 0 | 5 | 100% | 30.4 |
| Q | 5 | 0 | 5 | 100% | 22.8 |
| YN | 7 | 0 | 7 | 100% | 18.9 |
| YNX | 5 | 0 | 5 | 100% | 20.5 |

## Per-question results

| Tag | Status | s | Type | Records | DBs | CSV | SQL | Sub-Q | Response snippet |
|---|---|---:|---|---:|---|:---:|:---:|---:|---|
| YN1 | completed | 17.8 | yes_no | 1 | snowflake | — | ✓ | — | Yes — John exists: John Doe. (Note: registration status is not available from the data source.) |
| YN2 | completed | 13.7 | yes_no | 22 | snowflake | — | ✓ | — | Yes — 22 matching records (F1005, F1006, F1007, F1008, F1009, F1010, F1011, F1012, F1013, F1014, F1015, F1016, F1017, F1018, F1019, F1020, F1021, F1022, F1023, F1024, F1030, F1031). |
| YN3 | completed | 15.6 | yes_no | 1 | snowflake | — | ✓ | — | Yes — client F1005 exists: Priya Nair. (Note: registration status is not available from the data source.) |
| YN4 | completed | 22.4 | yes_no | 0 | snowflake, mssql | — | ✓ | — | No — Sarah not found in the system. |
| YN5 | completed | 18.3 | yes_no | 1 | snowflake | — | ✓ | — | Yes — client F1010 exists: Liam Johnson. |
| YN6 | completed | 22.6 | yes_no | 0 | snowflake, mssql | — | ✓ | — | No — clients with locked profile not found in the system. |
| YN7 | completed | 21.8 | yes_no | 6 | snowflake, mssql | ✓ | ✓ | — | Yes — 6 clients with deactivated profile (F1005, F1007, F1010, F1015, F1019, F1023). |
| YNX-1 | completed | 19.8 | yes_no | 0 | snowflake, wealthx | — | ✓ | — | No — John not found in the system. |
| YNX-2 | completed | 17.6 | yes_no | 1 | snowflake, wealthx, mssql | — | ✓ | — | Yes — client F1005 exists: Priya Nair (profile: DEACTIVATED). |
| YNX-3 | completed | 36.3 | yes_no | 5 | snowflake, mssql, wealthx | ✓ | ✓ | 2 | 1. Are there any clients with active profiles? Yes — 4 clients with active profile (F1008, F1013, F1014, F1020). 2. Do any clients have Roth IRA accounts? Yes — 4 clients with active profile (F1008, F1013, F1014, F1020). |
| YNX-4 | completed | 15.6 | yes_no | 0 | snowflake, wealthx, mssql | — | ✓ | — | No — Sarah not found in the system. |
| YNX-5 | completed | 13.0 | yes_no | 5 | snowflake, wealthx | — | ✓ | — | Yes — 5 matching records (F1007, F1010, F1012, F1016, F1022). (Note: registration status is not available from the data source.) |
| DSI-1 | completed | 10.9 | single_value | 1 | snowflake | — | ✓ | — | John - primary email: john.doe@mail.com |
| DSI-2 | completed | 10.8 | single_value | 0 | snowflake | — | ✓ | — | No client named 'Sarah' was found in the system. |
| DSI-3 | completed | 12.7 | single_value | 1 | snowflake | — | ✓ | — | F1005 - ssn last4digits: 2211 |
| DSI-4 | completed | 13.2 | single_value | 0 | snowflake | — | ✓ | — | No client named 'John Smith' was found in the system. |
| DSI-5 | completed | 10.7 | single_value | 1 | snowflake | — | ✓ | — | F1010 - first name: Liam |
| DSI-6 | completed | 17.4 | single_value | 1 | snowflake, mssql | ✓ | ✓ | — | F1005 - profile status: DEACTIVATED |
| DSI-7 | completed | 11.1 | single_value | 22 | snowflake | — | ✓ | — | Count: 22 record(s) matching John |
| COL-1 | completed | 13.0 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Mobile Phone \| Primary Email \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair  |
| COL-2 | completed | 13.1 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Ssn Last4Digits \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \| 2211 \| \| \| \| F |
| COL-3 | completed | 17.2 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \| priya.nair@mail.com  |
| COL-4 | completed | 13.0 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \| 1992-04 |
| COL-5 | completed | 10.9 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Zip \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \| \| \| \| \| F1006 \| Michael \ |
| COL-6 | completed | 13.0 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Mobile Phone \| Online Portal Access \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \ |
| LIST-1 | completed | 13.1 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| LIST-2 | completed | 13.2 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| LIST-3 | completed | 8.9 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| LIST-4 | completed | 11.0 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| LIST-5 | completed | 10.9 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| LIST-6 | completed | 17.3 | data_retrieval | 39 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| FIDO-1 | completed | 11.0 | data_retrieval | 0 | snowflake | — | ✓ | — | No client named 'Smith' was found in the system. |
| FIDO-2 | completed | 10.8 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| FIDO-3 | completed | 11.0 | data_retrieval | 2 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| FIDO-4 | completed | 10.9 | count | 22 | snowflake | — | ✓ | — | Count: 22 record(s) |
| FIDO-5 | completed | 15.1 | data_retrieval | 0 | snowflake | — | ✓ | — | No records were found based on the provided criteria. |
| FIDO-6 | completed | 13.1 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Last Name \| First Name \| Fiduciary Id \| Primary Email \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- Nair \| Priya \| F1005 \| priya.nair@mail.com  |
| B3-1 | completed | 17.3 | data_retrieval | 24 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| B3-2 | completed | 10.7 | count | 23 | wealthx | — | ✓ | — | Count: 23 record(s) matching IRA |
| B3-3 | completed | 12.9 | data_retrieval | 11 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| B3-4 | completed | 6.6 | count | 13 | wealthx | — | ✓ | — | Count: 13 record(s) matching Closed |
| B3-5 | completed | 13.3 | data_retrieval | 6 | snowflake, wealthx | — | ✓ | — | Distinct Account Type values (6): - Estate (5) - Inherited Roth IRA (4) - Inherited Traditional IRA (4) - Investment Account (9) - Roth IRA (7) - Traditional IRA (8) |
| B3-6 | completed | 12.9 | data_retrieval | 3 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| B3-7 | completed | 13.0 | count | 5 | snowflake, wealthx | — | ✓ | — | Count: 5 record(s) matching Open + Estate |
| PS-1 | completed | 17.3 | count | 12 | snowflake, mssql | — | ✓ | — | Count: 12 record(s) matching ACTIVE |
| PS-2 | completed | 19.1 | data_retrieval | 0 | snowflake, mssql | — | ✓ | — | No records were found based on the provided criteria. |
| PS-3 | completed | 17.1 | data_retrieval | 6 | snowflake, mssql | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| PS-4 | completed | 17.3 | data_retrieval | 22 | snowflake, mssql | ✓ | ✓ | — | Breakdown by Account Status: - (unknown): 22 |
| PS-5 | completed | 81.1 | count | 22 | snowflake, mssql | — | ✓ | — | Count: 22 record(s) |
| J2-1 | completed | 17.1 | data_retrieval | 24 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1005  |
| J2-2 | completed | 21.4 | data_retrieval | 10 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| J2-3 | completed | 17.2 | data_retrieval | 22 | snowflake, mssql | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Status Name \| Primary Email \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \ |
| J2-4 | completed | 12.9 | data_retrieval | 24 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1005 \| Priya \| Nair \| 5552 |
| J2-5 | completed | 19.3 | data_retrieval | 0 | snowflake, wealthx, mssql | — | ✓ | — | No records were found based on the provided criteria. |
| B4-1 | completed | 19.2 | data_retrieval | 10 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1006  |
| B4-2 | completed | 17.0 | data_retrieval | 16 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| B4-3 | completed | 17.3 | data_retrieval | 39 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Account Type \| Status Name \| Account Id \| Account Status \| Market Value --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \ |
| B4-4 | awaiting_guidance | 19.5 | — | — | — | — | — | — | organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/jhbYt2-nM-NU-9TOU0yt6 |
| IRA-1 | completed | 10.7 | data_retrieval | 23 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| IRA-2 | completed | 13.0 | data_retrieval | 11 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| IRA-3 | completed | 11.0 | data_retrieval | 8 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| IRA-4 | completed | 13.0 | data_retrieval | 11 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| IRA-5 | completed | 12.9 | count | 23 | snowflake, wealthx | — | ✓ | — | Count: 23 record(s) matching IRA |
| IRA-6 | completed | 13.0 | count | 11 | snowflake, wealthx | — | ✓ | — | Count: 11 record(s) matching Roth |
| MULTI-1 | completed | 15.2 | yes_no | 0 | snowflake | — | ✓ | 2 | 1. Is John registered? Yes — John exists: John Doe. (Note: registration status is not available from the data source.) 2. Also give me his email ID. No client named 'X' was found in the system. |
| MULTI-2 | completed | 17.2 | count | 0 | snowflake, mssql | — | ✓ | — | Count: 0 record(s) matching ACTIVE + Roth |
| MULTI-3 | completed | 19.5 | data_retrieval | 0 | snowflake, wealthx, mssql | — | ✓ | — | No client named 'Sarah' was found in the system. |
| MULTI-4 | awaiting_guidance | 51.8 | — | — | — | — | — | — | organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/4hXrWU0Kw4Ssnf6i6L_VM |
| MULTI-5 | awaiting_guidance | 53.6 | — | — | — | — | — | — | organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/MFSTppWYbIpFmB1LoffX- |
| MULTI-6 | completed | 21.5 | yes_no | 22 | snowflake | — | ✓ | 2 | 1. Are there any unregistered clients? Yes — 22 matching records (F1005, F1006, F1007, F1008, F1009, F1010, F1011, F1012, F1013, F1014, F1015, F1016, F1017, F1018, F1019, F1020, F1021, F1022, F1023, F1024, F1030, F1031). |
| AMB-1 | completed | 11.0 | single_value | 1 | snowflake | — | ✓ | — | John - primary email: john.doe@mail.com |
| AMB-2 | completed | 17.4 | data_retrieval | 23 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| AMB-3 | completed | 10.7 | yes_no | 22 | snowflake | — | ✓ | — | Yes — 22 matching records (F1005, F1006, F1007, F1008, F1009, F1010, F1011, F1012, F1013, F1014, F1015, F1016, F1017, F1018, F1019, F1020, F1021, F1022, F1023, F1024, F1030, F1031). |
| AMB-4 | completed | 13.0 | data_retrieval | 1 | snowflake | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| AMB-5 | completed | 8.8 | data_retrieval | 0 | snowflake | — | ✓ | — | No client named 'sarah' was found in the system. |
| AMB-6 | completed | 12.9 | data_retrieval | 11 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| AMB-7 | completed | 15.2 | data_retrieval | 0 | snowflake, wealthx | — | ✓ | — | No client named 'active' was found in the system. |
| AMB-8 | completed | 10.8 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| AMB-9 | completed | 17.0 | data_retrieval | 23 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| AMB-10 | completed | 11.1 | single_value | 1 | snowflake | — | ✓ | — | John - last name: Doe |
| PARA-1 | completed | 15.1 | data_retrieval | 0 | snowflake, mssql | — | ✓ | — | No client named 'John Smith' was found in the system. |
| PARA-2 | completed | 19.4 | data_retrieval | 11 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1005 \| Priya \| Nair \| pri |
| PARA-3 | completed | 23.6 | data_retrieval | 39 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Account Id \| Account Type \| Account Status \| Market Value --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1005 \| Priya \| Nair \| pri |
| NDF-1 | completed | 15.2 | data_retrieval | 0 | snowflake | — | ✓ | — | No client named 'Xyzzynotexist' was found in the system. |
| NDF-2 | completed | 17.7 | yes_no | 0 | snowflake | — | ✓ | — | No — client F9999 not found in the system. |
| NDF-3 | completed | 17.2 | data_retrieval | 0 | snowflake, wealthx | — | ✓ | — | No records were found based on the provided criteria. |
| NDF-4 | completed | 15.0 | data_retrieval | 0 | snowflake | — | ✓ | — | No client named 'NonexistentPerson' was found in the system. |
| GOV-1 | completed | 10.9 | data_retrieval | 1 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| |
| GOV-2 | completed | 15.1 | data_retrieval | 22 | snowflake | ✓ | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair  |
| GOV-3 | completed | 21.7 | single_value | 1 | snowflake | — | ✓ | — | John - online portal access: False |
| GOV-4 | completed | 15.6 | data_retrieval | 22 | snowflake | — | ✓ | — | Fiduciary Id \| First Name \| Last Name \| Online Portal Access \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- F1005 \| Priya \| Nair \| False \| \| \ |
| Q1 | completed | 19.4 | data_retrieval | 24 | snowflake, wealthx | — | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| --- \| F1005  |
| Q2 | completed | 25.8 | data_retrieval | 10 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| Q3 | completed | 23.6 | data_retrieval | 10 | snowflake, wealthx, mssql | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| Q4 | completed | 23.6 | data_retrieval | 23 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| Q5 | completed | 21.4 | data_retrieval | 9 | snowflake, wealthx | ✓ | ✓ | — | Fid \| Fiduciary Id \| First Name \| Last Name \| Primary Email \| Mobile Phone \| Ssn Last4Digits \| Date Of Birth Or Inception \| Account Id \| Account Status \| Market Value \| Account Type --- \| --- \| --- \| --- \| |
| N1 | completed | 13.2 | count | 22 | snowflake | — | ✓ | — | Count: 22 record(s) (Note: registration status is not exposed by the data source; counted all FIDO clients.) |
| N2 | completed | 8.8 | count | 24 | wealthx | — | ✓ | — | Count: 24 record(s) matching Open |
| N3 | completed | 11.0 | count | 8 | wealthx | — | ✓ | — | Count: 8 client(s) with more than one account Clients: F1005, F1006, F1007, F1008, F1010, F1012, F1025, F1027 |
| N4 | completed | 15.1 | data_retrieval | 39 | snowflake, wealthx | — | ✓ | — | Breakdown by Account Type: - Investment Account: 9 - Traditional IRA: 8 - Roth IRA: 7 - Estate: 5 - Inherited Roth IRA: 4 - Inherited Traditional IRA: 4 - (unknown): 2 |

## Failures / timeouts / errors

- **[B4-4]** (awaiting_guidance, 19.5s): Give me clients who have deactivated profiles but still have open accounts, along with their email and phone.
  - error: organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/jhbYt2-nM-NU-9TOU0yt6
  - runId: `y1fhlszTC2aHSQ68xNVca`
- **[MULTI-4]** (awaiting_guidance, 51.8s): Give me the count of all clients. Also, list all clients with locked profiles. And export all active client data to a file.
  - error: organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/4hXrWU0Kw4Ssnf6i6L_VM
  - runId: `l95zwmb2uksPIllfqLjnd`
- **[MULTI-5]** (awaiting_guidance, 53.6s): Is F1005 a valid client? What accounts does F1005 hold? What is F1005's profile status?
  - error: organizations/xdk36l7E1GbrEvfvYWgdq/workspaces/nUZWArSuILf11eyIA2Hwr/exceptions/MFSTppWYbIpFmB1LoffX-
  - runId: `jdymgLYPNfqCxEFY9Nyu5`
