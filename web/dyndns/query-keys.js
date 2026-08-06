// One place that names the cached server state of the dyndns section, so a
// write can invalidate exactly what it changed and two components asking the
// same question share one request.
//
// Keys are arrays so a prefix invalidates everything under it: invalidating
// `['dyndns','records']` drops the records of every zone, `records(zone)` only
// that zone's.
export const dyndnsKeys = {
    zones: () => ['dyndns', 'zones'],
    zone: (name) => ['dyndns', 'zone', name],
    tokens: () => ['dyndns', 'tokens'],
    policyRules: () => ['dyndns', 'policy-rules'],
    records: (zone) => ['dyndns', 'records', zone],
    delegations: () => ['dyndns', 'delegations'],
    orphanedZones: () => ['dyndns', 'orphaned-zones'],
};
