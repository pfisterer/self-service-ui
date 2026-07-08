import { useState, useEffect } from 'react';
import { useAuth } from '/providers/auth.jsx';
import { useClient } from '/providers/client.jsx';
import { CodeBlock } from '/helper/codeblock.jsx';
import { Delayed } from '/helper/delayed.jsx';
import { Stack, Text, Alert, Anchor } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { TabIntro } from './tab-intro.jsx';

// ----------------------------------------
// External DNS config display
// ----------------------------------------
export function ExternalDnsConfig({ externalDnsValuesYaml, zone }) {
    const { user } = useAuth();
    const [token, setToken] = useState(null);
    const { client, sdk } = useClient('dyndns');

    useEffect(() => {
        (async () => {
            try {
                const res = await sdk.listTokens({ client });
                const tokens = res?.data?.tokens
                if (tokens && tokens.length > 0) {
                    const readOnlyToken = tokens.find(t => t.read_only === true);
                    setToken(readOnlyToken?.token_string || tokens[0].token_string);
                }
            } catch (e) {
                console.error("Failed to fetch tokens:", e);
            }
        })();
    }, [client, user]);

    const url = new URL(`v1/zones/${zone.zone}?format=external-dns&part=`, window.appconfig.dynamicZonesBaseUrl).toString();
    const helmAddRepoCommand = `helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/; helm repo update`;
    const helmCommand = `curl -H 'Authorization: Bearer ${token || "insert_your_token"}' '${url}values.yaml' | helm upgrade --install external-dns external-dns/external-dns -n external-dns -f -`;

    return (
        <Stack gap="lg">
            <TabIntro title={`Dynamic DNS (Kubernetes) for ${zone.zone}`}>
                Configure <Anchor href="https://github.com/kubernetes-sigs/external-dns" target="_blank">external-dns</Anchor>{' '}
                to automatically manage this zone's records from your Kubernetes resources (Services / Ingresses),
                using this zone's TSIG key.
            </TabIntro>

            <div>
                <Text component="p" mb="md" size="sm" c="dimmed">
                    Add the external-dns Helm repository first (only once):
                </Text>
                <CodeBlock code={helmAddRepoCommand} />
            </div>

            <div>
                <Text component="p" mb="md">
                    You can curl Helm's values.yaml directly using something like the following command:
                </Text>
                <CodeBlock code={helmCommand} />

                {!token ? (
                    <Delayed>
                        <Alert icon={<AlertCircle size="16" />} title="Authentication Required" color="red" mt="md">
                            You need a valid token to authenticate the request. Use the "API Tokens" section to create one.
                            This token should have read-only permissions. Once created, a token (preferably read-only)
                            will be automatically inserted into the command above.
                        </Alert>
                    </Delayed>
                ) : ''}
            </div>

            <div>
                <Text component="p" mb="md">
                    For a manual installation, use the following values.yaml content:
                </Text>
                <CodeBlock code={externalDnsValuesYaml} />
            </div>
        </Stack>
    );
}
