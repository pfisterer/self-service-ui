import { useMemo, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Checkbox, Group, Modal, ScrollArea, Select, Stack, Table, Text, Textarea } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { FileSpreadsheet, Trash2, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { COLOR, formatRoleLabel } from './util-project.jsx';
import { DIALOG_STYLES, DialogFooter } from './component-form-modal.jsx';
import {
    IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, buildImportRows, decodeImportFile, detectHeader,
    guessColumns, isTruncated, parseImportText,
} from './util-principal-import.js';

// What a CSV arrives as differs by browser and OS: Windows reports Excel's CSV
// as application/vnd.ms-excel, some browsers report nothing at all — the
// extensions are what react-dropzone falls back to then.
const ACCEPT = {
    'text/csv': ['.csv'],
    'text/plain': ['.txt'],
    'text/tab-separated-values': ['.tsv'],
    'application/vnd.ms-excel': ['.csv'],
};

const STATUS_COLOR = {
    new: COLOR.positive,
    existing: COLOR.identity,
    duplicate: COLOR.identity,
    invalid: COLOR.negative,
};

/**
 * PrincipalImportModal adds many user:/group: tokens at once, from pasted text
 * or a dropped/chosen CSV or text file. Step one takes the input, step two
 * previews every row with its status, lets the column be chosen and — when
 * `roles` is given — a role be set per row or for all of them.
 *
 * Nothing is left out silently: rows that cannot be added (invalid, duplicate,
 * already on the list) have to be removed in the preview before the import is
 * possible, so what is handed over is exactly what the table shows.
 *
 * It saves nothing itself: onImport hands the chosen entries to the form that
 * opened it, which saves them like anything else added there.
 *
 * Mount it only while open, so every opening starts empty.
 *
 * Props:
 *   onClose: () => void
 *   onImport: (entries: { token: string, role?: string }[]) => void
 *   existing: string[]      tokens already on the list, shown as such
 *   roles?: string[]        OpenStack roles; without them there is no role column
 *   defaultRole?: string    preset for rows when the input names no roles
 */
export function PrincipalImportModal({ onClose, onImport, existing = [], roles = null, defaultRole = 'member' }) {
    const { t } = useTranslation();
    const withRole = Array.isArray(roles) && roles.length > 0;
    const fallbackRole = withRole ? (roles.includes(defaultRole) ? defaultRole : roles[0]) : null;

    const [step, setStep] = useState('input');
    const [text, setText] = useState('');
    const [fileName, setFileName] = useState(null);
    const [inputError, setInputError] = useState(null);

    const [table, setTable] = useState(null);
    const [hasHeader, setHasHeader] = useState(false);
    const [tokenColumn, setTokenColumn] = useState(0);
    const [roleColumn, setRoleColumn] = useState(null);
    // Per-row choices, keyed by the row's line in the input, and cleared
    // whenever the column settings change what the rows are.
    const [removed, setRemoved] = useState(() => new Set());
    const [selected, setSelected] = useState(() => new Set());
    const [roleOverride, setRoleOverride] = useState({});
    const [bulkRole, setBulkRole] = useState(fallbackRole);

    const resetChoices = () => { setRemoved(new Set()); setSelected(new Set()); setRoleOverride({}); };

    const preview = (input) => {
        const parsed = parseImportText(input);
        if (parsed.rows.length === 0) { setInputError(t('projects.principalImport.empty')); return; }
        const header = detectHeader(parsed.rows);
        const guess = guessColumns(parsed.rows, header, roles);
        setTable(parsed);
        setHasHeader(header);
        setTokenColumn(guess.tokenColumn);
        setRoleColumn(withRole ? guess.roleColumn : null);
        resetChoices();
        setInputError(null);
        setStep('preview');
    };

    const readFile = async (files) => {
        const file = files[0];
        if (!file) return;
        const content = decodeImportFile(await file.arrayBuffer());
        setText(content);
        setFileName(file.name);
        preview(content);
    };

    const rejectFile = (rejections) => {
        const code = rejections[0]?.errors[0]?.code;
        setInputError(code === 'file-too-large'
            ? t('projects.principalImport.fileTooLarge', { size: IMPORT_MAX_BYTES / 1_000_000 })
            : t('projects.principalImport.fileType'));
    };

    const rows = useMemo(() => (table
        ? buildImportRows(table, { hasHeader, tokenColumn, roleColumn, roles, existing, removed })
        : []), [table, hasHeader, tokenColumn, roleColumn, roles, existing, removed]);

    // A role column that names no role for a row leaves it open, so the gap is
    // visible; without a role column every row starts on the default.
    const roleOf = (row) => roleOverride[row.line] ?? row.role ?? (roleColumn === null ? fallbackRole : null);
    const fresh = rows.filter(r => r.status === 'new');
    const blocked = rows.filter(r => r.status !== 'new');
    const missingRole = withRole && fresh.some(r => !roleOf(r));
    const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
    const canImport = rows.length > 0 && blocked.length === 0 && !missingRole;

    const selectedRows = rows.filter(r => selected.has(r.line));
    const allSelected = rows.length > 0 && selectedRows.length === rows.length;
    const toggle = (line) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(line)) next.delete(line); else next.add(line);
        return next;
    });
    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.line)));

    const remove = (lines) => {
        setRemoved(prev => new Set([...prev, ...lines]));
        setSelected(prev => new Set([...prev].filter(line => !lines.includes(line))));
    };

    const applyRole = (onlyMissing) => {
        if (!bulkRole) return;
        setRoleOverride(prev => {
            const next = { ...prev };
            for (const r of fresh) if (!onlyMissing || !roleOf(r)) next[r.line] = bulkRole;
            return next;
        });
    };

    const submit = () => {
        onImport(fresh.map(r => (withRole ? { token: r.token, role: roleOf(r) } : { token: r.token })));
        onClose();
    };

    const columnOptions = table ? [...Array(table.columns).keys()].map(i => {
        const sample = table.rows.slice(hasHeader ? 1 : 0).find(r => r[i])?.[i] ?? '';
        return {
            value: String(i),
            label: hasHeader && table.rows[0][i]
                ? table.rows[0][i]
                : t('projects.principalImport.columnN', { n: i + 1, sample: sample.slice(0, 30) }),
        };
    }) : [];
    const roleOptions = withRole ? roles.map(r => ({ value: r, label: formatRoleLabel(r) })) : [];

    const inputStep = (
        <Stack>
            <Dropzone
                onDrop={readFile}
                onReject={rejectFile}
                maxSize={IMPORT_MAX_BYTES}
                accept={ACCEPT}
                multiple={false}
            >
                <Group justify="center" gap="md" mih={96} style={{ pointerEvents: 'none' }}>
                    <Dropzone.Accept><Upload size={36} strokeWidth={1.5} /></Dropzone.Accept>
                    <Dropzone.Reject><X size={36} strokeWidth={1.5} /></Dropzone.Reject>
                    <Dropzone.Idle><FileSpreadsheet size={36} strokeWidth={1.5} /></Dropzone.Idle>
                    <div>
                        <Text size="md">{t('projects.principalImport.dropTitle')}</Text>
                        <Text size="xs" c="dimmed">{t('projects.principalImport.dropHint', { size: IMPORT_MAX_BYTES / 1_000_000 })}</Text>
                    </div>
                </Group>
            </Dropzone>

            <Textarea
                label={t('projects.principalImport.pasteLabel')}
                description={t('projects.principalImport.pasteHint')}
                placeholder={'max.muster@dhbw.de\nErika Musterfrau <erika@dhbw.de>\ngroup:wwi23seb'}
                autosize
                minRows={6}
                maxRows={14}
                value={text}
                onChange={(e) => { setText(e.currentTarget.value); setFileName(null); setInputError(null); }}
                styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-sm)' } }}
            />
            {inputError && <Text c="red" size="sm">{inputError}</Text>}
        </Stack>
    );

    const previewStep = table && (
        <Stack>
            {fileName && (
                <Group gap={6}>
                    <FileSpreadsheet size={16} />
                    <Text size="sm" fw={500}>{fileName}</Text>
                </Group>
            )}

            <Group align="flex-end" gap="md" wrap="wrap">
                <Select
                    label={t('projects.principalImport.tokenColumn')}
                    data={columnOptions}
                    value={String(tokenColumn)}
                    onChange={(v) => { if (v !== null) { setTokenColumn(Number(v)); resetChoices(); } }}
                    allowDeselect={false}
                    w={240}
                    comboboxProps={{ zIndex: 400 }}
                />
                {withRole && (
                    <Select
                        label={t('projects.principalImport.roleColumn')}
                        data={[{ value: '', label: t('projects.principalImport.noRoleColumn') }, ...columnOptions.filter(o => o.value !== String(tokenColumn))]}
                        value={roleColumn === null ? '' : String(roleColumn)}
                        onChange={(v) => { setRoleColumn(v ? Number(v) : null); resetChoices(); }}
                        allowDeselect={false}
                        w={240}
                        comboboxProps={{ zIndex: 400 }}
                    />
                )}
                {table.columns > 1 || hasHeader ? (
                    <Checkbox
                        label={t('projects.principalImport.hasHeader')}
                        checked={hasHeader}
                        onChange={(e) => { setHasHeader(e.currentTarget.checked); resetChoices(); }}
                        mb={8}
                    />
                ) : null}
            </Group>

            <Group gap="xs">
                <Badge color={STATUS_COLOR.new} variant="light">{t('projects.principalImport.countNew', { count: counts.new ?? 0 })}</Badge>
                {counts.existing > 0 && <Badge color={STATUS_COLOR.existing} variant="light">{t('projects.principalImport.countExisting', { count: counts.existing })}</Badge>}
                {counts.duplicate > 0 && <Badge color={STATUS_COLOR.duplicate} variant="light">{t('projects.principalImport.countDuplicate', { count: counts.duplicate })}</Badge>}
                {counts.invalid > 0 && <Badge color={STATUS_COLOR.invalid} variant="light">{t('projects.principalImport.countInvalid', { count: counts.invalid })}</Badge>}
            </Group>

            {(blocked.length > 0 || selectedRows.length > 0) && (
                <Group gap="xs">
                    {blocked.length > 0 && (
                        <Button size="xs" variant="light" color={COLOR.negative} leftSection={<Trash2 size={14} />} onClick={() => remove(blocked.map(r => r.line))}>
                            {t('projects.principalImport.removeBlocked', { count: blocked.length })}
                        </Button>
                    )}
                    {selectedRows.length > 0 && (
                        <Button size="xs" variant="default" leftSection={<Trash2 size={14} />} onClick={() => remove(selectedRows.map(r => r.line))}>
                            {t('projects.principalImport.removeSelected', { count: selectedRows.length })}
                        </Button>
                    )}
                </Group>
            )}

            {isTruncated(table, hasHeader) && (
                <Alert color={COLOR.attention} variant="light">
                    {t('projects.principalImport.truncated', { max: IMPORT_MAX_ROWS })}
                </Alert>
            )}

            {withRole && fresh.length > 0 && (
                <Group gap="xs" align="center">
                    <Text size="sm">{t('projects.principalImport.bulkRole')}</Text>
                    <Select
                        size="xs"
                        data={roleOptions}
                        value={bulkRole}
                        onChange={setBulkRole}
                        allowDeselect={false}
                        w={140}
                        comboboxProps={{ zIndex: 400 }}
                        aria-label={t('projects.principalImport.bulkRole')}
                    />
                    <Button size="xs" variant="light" onClick={() => applyRole(false)}>{t('projects.principalImport.applyAll')}</Button>
                    <Button size="xs" variant="default" onClick={() => applyRole(true)}>{t('projects.principalImport.applyMissing')}</Button>
                </Group>
            )}

            <ScrollArea.Autosize mah={360} type="auto">
                <Table striped highlightOnHover verticalSpacing={6} stickyHeader>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th w={36}>
                                <Checkbox
                                    size="xs"
                                    checked={allSelected}
                                    indeterminate={selectedRows.length > 0 && !allSelected}
                                    disabled={rows.length === 0}
                                    onChange={toggleAll}
                                    aria-label={t('projects.principalImport.selectAll')}
                                />
                            </Table.Th>
                            <Table.Th w={56}>{t('projects.principalImport.line')}</Table.Th>
                            <Table.Th>{t('projects.principalImport.entry')}</Table.Th>
                            <Table.Th>{t('projects.principalImport.status')}</Table.Th>
                            {withRole && <Table.Th w={170}>{t('projects.memberEditor.openstackRole')}</Table.Th>}
                            <Table.Th w={40} />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map(r => {
                            const isNew = r.status === 'new';
                            const role = roleOf(r);
                            return (
                                <Table.Tr key={r.line}>
                                    <Table.Td>
                                        <Checkbox
                                            size="xs"
                                            checked={selected.has(r.line)}
                                            onChange={() => toggle(r.line)}
                                            aria-label={r.token ?? r.raw}
                                        />
                                    </Table.Td>
                                    <Table.Td><Text size="xs" c="dimmed">{r.line}</Text></Table.Td>
                                    <Table.Td>
                                        <Text size="sm" style={{ wordBreak: 'break-all' }}>{r.token ?? r.raw}</Text>
                                        {r.token && r.raw !== r.token && r.raw.toLowerCase() !== r.token.replace(/^user:/, '') && (
                                            <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>{r.raw}</Text>
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge size="sm" variant="light" color={STATUS_COLOR[r.status]}>
                                            {t(`projects.principalImport.status_${r.status}`)}
                                        </Badge>
                                    </Table.Td>
                                    {withRole && (
                                        <Table.Td>
                                            {isNew && (
                                                <>
                                                    <Select
                                                        size="xs"
                                                        data={roleOptions}
                                                        value={role}
                                                        placeholder={t('projects.principalImport.chooseRole')}
                                                        onChange={(v) => setRoleOverride(prev => ({ ...prev, [r.line]: v }))}
                                                        error={!role}
                                                        comboboxProps={{ zIndex: 400 }}
                                                        aria-label={t('projects.memberEditor.openstackRole')}
                                                    />
                                                    {r.rawRole && !role && (
                                                        <Text size="xs" c={COLOR.attention}>
                                                            {t('projects.principalImport.roleUnknown', { value: r.rawRole })}
                                                        </Text>
                                                    )}
                                                </>
                                            )}
                                        </Table.Td>
                                    )}
                                    <Table.Td>
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            onClick={() => remove([r.line])}
                                            aria-label={t('projects.principalImport.removeRow', { entry: r.token ?? r.raw })}
                                        >
                                            <Trash2 size={16} />
                                        </ActionIcon>
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            </ScrollArea.Autosize>

            {rows.length === 0 && (
                <Text size="sm" c="dimmed">{t('projects.principalImport.allRemoved')}</Text>
            )}
            {blocked.length > 0 && (
                <Text size="sm" c={COLOR.attention}>{t('projects.principalImport.blockedHint')}</Text>
            )}
            {missingRole && (
                <Text size="sm" c={COLOR.attention}>{t('projects.principalImport.missingRole')}</Text>
            )}
        </Stack>
    );

    return (
        <Modal
            opened
            onClose={onClose}
            size="xl"
            zIndex={300}
            styles={DIALOG_STYLES}
            title={<Text fw={600}>{t('projects.principalImport.title')}</Text>}
        >
            <Stack>
                {step === 'input' ? inputStep : previewStep}

                <DialogFooter>
                    {step === 'preview' && (
                        <Button variant="subtle" mr="auto" onClick={() => setStep('input')}>{t('projects.principalImport.back')}</Button>
                    )}
                    <Button variant="default" onClick={onClose}>{t('projects.actions.cancel')}</Button>
                    {step === 'input'
                        ? <Button onClick={() => preview(text)} disabled={!text.trim()}>{t('projects.principalImport.toPreview')}</Button>
                        : (
                            <Button onClick={submit} disabled={!canImport}>
                                {t('projects.principalImport.submit', { count: fresh.length })}
                            </Button>
                        )}
                </DialogFooter>
            </Stack>
        </Modal>
    );
}
