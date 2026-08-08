import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { timezoneGroups, timezoneOffset } from '@/lib/timezones';

interface TimezoneSelectProps {
  /** IANA id, or '' when the teacher has never had one set. */
  value: string;
  onChange: (value: string) => void;
}

/** `Asia/Ho_Chi_Minh` → `Ho Chi Minh (GMT+07:00)`. */
function describe(zone: string): string {
  const city = (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
  const offset = timezoneOffset(zone);
  return offset ? `${city} (${offset})` : city;
}

/**
 * Timezone picker for the teacher profile forms.
 *
 * Offsets are shown next to each city because the id alone is not something a
 * teacher can sanity-check — `Asia/Ho_Chi_Minh` and `Asia/Bangkok` look
 * unrelated but are the same wall clock, and picking the wrong one shifts every
 * lesson they will ever teach.
 */
export function TimezoneSelect({ value, onChange }: TimezoneSelectProps) {
  const { t } = useTranslation('admin');
  // Offsets are read from the runtime per option, so build the list once.
  const { common, others } = useMemo(() => timezoneGroups(value), [value]);

  return (
    <Select value={value} onValueChange={(next) => onChange(String(next))}>
      <SelectTrigger className="h-11 w-full rounded-xl">
        <SelectValue>
          {(selected) =>
            selected
              ? describe(String(selected))
              : t('teachers.timezonePlaceholder', 'Select a timezone')
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectGroup>
          <SelectLabel>{t('teachers.timezoneCommon', 'Common')}</SelectLabel>
          {common.map((zone) => (
            <SelectItem key={zone.value} value={zone.value}>
              {zone.city} ({zone.offset})
            </SelectItem>
          ))}
        </SelectGroup>
        {others.length > 0 && (
          <SelectGroup>
            <SelectLabel>{t('teachers.timezoneAll', 'All timezones')}</SelectLabel>
            {others.map((zone) => (
              <SelectItem key={zone.value} value={zone.value}>
                {zone.value} ({zone.offset})
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
