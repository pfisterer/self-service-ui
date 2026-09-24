# Translations

One file per area and language: `en/projects.json` and `de/projects.json` hold
the same keys, and `i18n/index.js` merges them into one namespace, so a key is
addressed as `projects.budgetCard.managedBy` — the file name is the first
segment. Separate files because areas are translated (and reviewed) one at a
time; one big file per language would be a merge conflict on every branch.

## Keys

* Named after what the text MEANS, not after its English wording:
  `projects.offers.availableNow`, not `projects.offers.yoursRightAway`.
* Second segment is the component or screen it belongs to, so a key can be
  found from the file that renders it and an unused key is visible.
* Whole sentences. A sentence assembled from fragments cannot be translated —
  German puts the parts in another order. One key per case beats one key with
  clauses appended at runtime.
* Values that vary go in as placeholders: `"The budget ends on {{date}}"`.
* Counts use i18next plurals (`key_one` / `key_other`), never `s` appended in
  code. Where a count stands beside a label (`Selected records: 3`) no plural
  is needed at all, which is usually the better screen anyway.

## German

* Duzen ("deine Projekte"), the readers are mostly students.
* Terms that are the product's own or the protocol's stay untranslated: Budget,
  Projekt, Quota, Token, Zone, TSIG, AXFR, DNS, MCP, OpenStack, ArgoCD.
* Everything else is German, including "Anfrage" (request), "genehmigen"
  (approve), "freigeben" (release) and "verschieben" (move).

`i18n.test.js` enforces that both languages carry the same keys, the same
placeholders, and nothing empty.
