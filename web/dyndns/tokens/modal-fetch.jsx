import { useState } from 'react';
import { Button, Modal, TextInput, Stack, Group, Box, Text, CopyButton, Loader, Alert } from '@mantine/core';
import { AlertCircle, Copy, Check } from 'lucide-react';

export function FetchModal({ sdk, client, token, method = "GET" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const handleFetch = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      if (typeof sdk?.listZones !== 'function') {
        throw new Error('SDK method listZones is not available.');
      }
      const res = await sdk.listZones({ client });
      setResponse(res?.data ?? null);
    } catch (err) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const sdkCommand = `sdk.listZones({ client })`;

  return (
    <div>
      <Button onClick={() => setIsOpen(true)} color="blue">
        Open API Fetch Modal
      </Button>

      <Modal opened={isOpen} onClose={() => setIsOpen(false)} title="API Request" size="lg">
        <Stack gap="md">
          <TextInput label="Token" value={token} readOnly />
          <TextInput label="Method" value={method} readOnly />

          <Button onClick={handleFetch} disabled={loading} color="green">
            {loading ? <Loader size="xs" mr="xs" /> : ''}
            {loading ? "Fetching..." : "Fetch"}
          </Button>

          <Box style={{ maxHeight: '300px', overflowY: 'auto', backgroundColor: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
            {loading && <Loader size="sm" />}
            {error && <><Alert icon={<AlertCircle size="16" />} title="Error" color="red">{error}</Alert>{'}'}</>}

            <Stack gap="sm">
              <div>
                <Text size="sm" fw={600} mb="xs">SDK Call:</Text>
                <Group gap="xs">
                  <code style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '4px', flex: 1, fontSize: '12px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                    {sdkCommand}
                  </code>
                  <CopyButton value={sdkCommand}>
                    {({ copied }) => (
                      <Button size="xs" color={copied ? 'green' : 'blue'}>
                        {copied ? <Check size="14" /> : <Copy size="14" />}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
              </div>

              {response && (
                <div>
                  <Text size="sm" fw={600} mb="xs">Response:</Text>
                  <pre style={{ backgroundColor: '#fff', padding: '8px', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0 }}>
                    {JSON.stringify(response, null, 2)}
                  </pre>
                </div>
              )}
            </Stack>
          </Box>
        </Stack>
      </Modal>
    </div>
  );
}
