/** Dropdown UI for selecting a teacher (admin only) */
export function TeacherSelector({
  teacherId,
  teachers,
  onChange,
}: {
  teacherId: string | null;
  teachers: { id: string; name: string; slug: string }[];
  onChange: (id: string) => void;
}) {
  if (teachers.length === 0) return null;

  return (
    <select
      value={teacherId || ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
    >
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({t.slug})
        </option>
      ))}
    </select>
  );
}
