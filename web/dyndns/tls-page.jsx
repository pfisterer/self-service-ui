import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Container, Select, Stack, Text, Title } from '@mantine/core';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { TlsCertificates } from '/dyndns/zones/tls-certificates.jsx';

// TlsCertificatesPage (/dyndns/tls, new layout): the certificates as a page of their own instead of only a tab in every zone. One picks a zone and gets the same prefilled snippets as on the zone's TLS tab (TlsCertificates), which stays where it is. The zone is part of the address (?zone=…), so a link from a guide can name one.
export function TlsCertificatesPage() {
    const { t } = useTranslation();
    const api = useZonesApi();
    const zonesQuery = useQuery({ queryKey: dyndnsKeys.zones(), queryFn: () => api.listZones(), enabled: !!api });
    const zones = useMemo(() => (zonesQuery.data ?? []).filter(z => z.exists !== false && z.name).map(z => z.name).sort(), [zonesQuery.data]);
    const fromUrl = new URLSearchParams(window.location.search).get('zone');
    const [picked, setPicked] = useState(fromUrl);
    const zoneName = picked && zones.includes(picked) ? picked : zones[0] ?? null;
    const zoneQuery = useQuery({ queryKey: dyndnsKeys.zone(zoneName), queryFn: () => api.getZone(zoneName), enabled: !!api && !!zoneName });

    return (
        <Container size="lg" py="md">
            <Stack>
                <div>
                    <Title order={3}>{t('dyndns.tlsPage.title')}</Title>
                    <Text size="sm" c="dimmed">{t('dyndns.tlsPage.intro')}</Text>
                </div>
                {zonesQuery.isPending && <Loading />}
                {zonesQuery.isError && <LoadError query={zonesQuery} />}
                {zonesQuery.isSuccess && zones.length === 0 && (
                    <Alert color="gray" variant="light">
                        {t('dyndns.tlsPage.noZones')} <Link href="/zones">{t('dyndns.tlsPage.toZones')}</Link>
                    </Alert>
                )}
                {zones.length > 0 && (
                    <Select label={t('dyndns.tlsPage.zone')} data={zones} value={zoneName} onChange={(v) => v && setPicked(v)}
                        allowDeselect={false} searchable maw={420} />
                )}
                {zoneName && zoneQuery.isPending && <Loading />}
                {zoneQuery.isError && <LoadError query={zoneQuery} />}
                {zoneQuery.data?.zoneData && <TlsCertificates key={zoneName} zone={zoneQuery.data.zoneData} />}
            </Stack>
        </Container>
    );
}
