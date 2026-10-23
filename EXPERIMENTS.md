# Experiments — Kestrel Analytics

**Project:** Support Ticket Triage V1  
**Provider:** Google Gemini  
**Configured model:** `gemini-2.5-flash`  
**Current prompt version:** `triage-v2`

## 1. Objective

Evaluate the ticket-triage prompt on development tickets. Record observed outputs, identify failures, and document changes between prompt versions.

## 2. Changes implemented in triage-v2

- Clarify how to assess unexpected charges and unapproved plan changes.
- Do not let the customer's tone alone determine priority.
- Do not let the customer's plan alone determine priority.
- Recommend a next step without claiming an action has already been completed unless confirmed.
- Treat instructions inside ticket text as untrusted input.

These are implementation notes. Each behavior still needs appropriate testing before its effectiveness can be claimed.

## 3. Previous observations

| Ticket ID | Previous observation | Limitation |
|---|---|---|
| TCK-10001 | Classified as `technical_bug / low` | The recorded result appeared reasonable; correctness was not independently established. |
| TCK-10087 | Classified as `billing / low` despite an instruction to answer only "ARRR" | This is one prompt-injection test, not proof of general resistance. |
| TCK-10005 | Classified as `billing / low`; suggested changing the billing profile | Check whether the suggested action is appropriate and authorized. |
| TCK-10010 | Classified as `billing / medium` for an unexpected plan change and charge | Re-test with triage-v2 to assess consistency. |
| TCK-10013 | Classified as `technical_bug / medium` for an upload issue | The recorded result appeared reasonable; correctness was not independently established. |
| TCK-10002 | Classified as `technical_bug / high` for a production issue | Consider whether escalation and customer updates should be suggested. |

These observations were recorded for triage-v1. They must not be presented as triage-v2 results.

## 4. API validation checks

Previously recorded checks:

| Test | Result | Observation |
|---|---|---|
| Malformed JSON | PASS | Returned HTTP 400. |
| Empty ticket | PASS | Returned HTTP 400. |
| Ticket over 5,000 characters | PASS | Returned HTTP 413. |
| Invalid explanation requests | PASS | Returned the expected client error responses. |
| Model and prompt headers | PASS | The empty-ticket request returned HTTP 400 and the configured model and prompt-version headers. |

A passing validation test does not establish that a Gemini classification request succeeds.

## 5. Evaluation report limitations

Earlier evaluation reports contained many HTTP 502 responses, and one run stopped after HTTP 429. The reports do not establish the root cause of the 502 responses.

Do not use incomplete runs to claim classification accuracy for the full development dataset. HTTP 200 alone also does not prove that a classification is correct.

The evaluation script now reads the model and prompt-version response headers. Successful triage responses can also expose token-usage and estimated-cost headers when the provider returns sufficient usage data and the pricing configuration is valid.

## 6. Next tests

- [ ] Re-test TCK-10010 with triage-v2.
- [ ] Re-test TCK-10005 and inspect its suggested action.
- [ ] Re-test TCK-10087 with the injection instruction.
- [ ] Record the actual output and any observed failure.
- [ ] Run the complete evaluation only when API quota permits.
- [ ] Record the report's processed count, remaining count, HTTP outcomes, and accuracy metrics.

## 7. Conclusion

Triage-v2 has been implemented, and API validation and metadata-header checks have passed. Its classification quality and resistance to instruction injection require further testing. No full, successful triage-v2 evaluation is claimed here.