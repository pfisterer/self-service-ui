import { Textarea } from '@mantine/core';

// REASON_MIN is how much a purpose or a reason has to say: every field of that
// kind asks the same, so the rule lives here and not in each dialog.
export const REASON_MIN = 5;

// reasonError is the check that goes with it: `message` when the text is
// shorter, else null — the shape a form's validate expects.
export function reasonError(value, message) {
    return (value || '').trim().length < REASON_MIN ? message : null;
}

// ReasonField is the text area for a purpose (what a project or budget is for)
// or a reason (why something is granted or refused): the same size everywhere,
// growing with what is typed.
export function ReasonField(props) {
    return <Textarea autosize minRows={2} maxRows={6} {...props} />;
}
