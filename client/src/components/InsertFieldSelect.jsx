// A plain dropdown that inserts a {{token}} at the cursor position of
// whichever field it's paired with, so someone editing an email template
// never has to know the {{...}} syntax exists — they just pick a field by
// its plain name and it's typed in for them (2026-09-16).
export default function InsertFieldSelect({ fields, onInsert }) {
  return (
    <select
      className="insert-field-select"
      value=""
      onChange={(e) => {
        if (e.target.value) onInsert(e.target.value);
        e.target.value = "";
      }}
    >
      <option value="">Insert field...</option>
      {fields.map((f) => <option key={f.token} value={f.token}>{f.label}</option>)}
    </select>
  );
}
